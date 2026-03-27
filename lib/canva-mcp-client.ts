/**
 * Minimal direct client for the Canva MCP server (StreamableHTTP transport).
 *
 * Key design decision: SSE responses are read line-by-line and the fetch is
 * aborted as soon as the matching JSON-RPC response arrives.  Waiting for
 * res.text() on a live SSE stream means waiting for the server to close it,
 * which can take forever — that was the root cause of the 60 s timeout.
 */

const MCP_URL = 'https://mcp.canva.com/mcp';

interface McpResponse {
  jsonrpc: '2.0';
  id?: number;
  result?: unknown;
  error?: { code: number; message: string };
}

/**
 * POST one JSON-RPC message to the Canva MCP server.
 * Handles both regular JSON and SSE (text/event-stream) responses.
 * For SSE, reads line-by-line and aborts the stream the moment the
 * matching response arrives — avoids blocking until stream close.
 */
async function mcpPost(
  token: string,
  sessionId: string | null,
  body: object
): Promise<{ result: unknown; sessionId: string | null }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };
  if (sessionId) headers['mcp-session-id'] = sessionId;

  const controller = new AbortController();

  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: controller.signal,
  });

  const newSessionId = res.headers.get('mcp-session-id') ?? sessionId;
  const contentType = res.headers.get('content-type') ?? '';

  // ── SSE stream ────────────────────────────────────────────────────────────
  if (contentType.includes('text/event-stream')) {
    const targetId = (body as { id?: number }).id;
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        // Process all complete lines
        const lines = buf.split('\n');
        buf = lines.pop() ?? ''; // last partial line stays in buf

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw || raw === '[DONE]') continue;

          let parsed: McpResponse;
          try { parsed = JSON.parse(raw); } catch { continue; }

          if (targetId === undefined || parsed.id === targetId) {
            controller.abort(); // stop reading — we have our answer
            if (parsed.error) throw new Error(`Canva MCP: ${parsed.error.message}`);
            return { result: parsed.result, sessionId: newSessionId };
          }
        }
      }
    } finally {
      try { reader.releaseLock(); } catch { /* ignore */ }
    }

    throw new Error('No matching response found in SSE stream');
  }

  // ── Regular JSON response ─────────────────────────────────────────────────
  const text = await res.text();
  controller.abort();

  if (!res.ok) throw new Error(`Canva MCP HTTP ${res.status}: ${text.slice(0, 200)}`);

  let parsed: McpResponse;
  try { parsed = JSON.parse(text); } catch {
    throw new Error(`Canva MCP non-JSON response: ${text.slice(0, 200)}`);
  }
  if (parsed.error) throw new Error(`Canva MCP: ${parsed.error.message}`);
  return { result: parsed.result, sessionId: newSessionId };
}

/** Opens a session (initialize + initialized notification). Returns session ID. */
async function initSession(token: string): Promise<string | null> {
  const { sessionId } = await mcpPost(token, null, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'auction-announcement-generator', version: '1.0.0' },
    },
  });

  // Fire-and-forget notification (no id = no response expected)
  try {
    await mcpPost(token, sessionId, {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });
  } catch { /* notifications are one-way */ }

  return sessionId;
}

/** Calls a Canva MCP tool and returns its raw result. */
async function callTool(
  token: string,
  sessionId: string | null,
  toolName: string,
  args: Record<string, unknown>
): Promise<{ toolResult: unknown; sessionId: string | null }> {
  const { result, sessionId: sid } = await mcpPost(token, sessionId, {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: { name: toolName, arguments: args },
  });
  return { toolResult: result, sessionId: sid };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface CanvaGeneratedDesign {
  edit_url: string;
  view_url?: string;
  design_id?: string;
  title?: string;
}

/**
 * Runs generate-design → create-design-from-candidate via the Canva MCP server.
 * Returns the direct edit URL for the finished design.
 */
export async function generateCanvaDesign(
  accessToken: string,
  designPrompt: string
): Promise<CanvaGeneratedDesign> {
  const sessionId = await initSession(accessToken);

  // Step 1: generate candidates
  const { toolResult: genResult, sessionId: sid2 } = await callTool(
    accessToken,
    sessionId,
    'generate-design',
    { query: designPrompt }
  );

  const candidates = extractCandidates(genResult);
  if (!candidates.length) {
    throw new Error(
      `generate-design returned no candidates. Raw: ${JSON.stringify(genResult).slice(0, 400)}`
    );
  }

  const first = candidates[0];
  const candidateId = first.candidate_id ?? first.id;

  // Step 2: create design from the first candidate
  const { toolResult: createResult } = await callTool(
    accessToken,
    sid2,
    'create-design-from-candidate',
    { candidate_id: candidateId }
  );

  // Try to extract a Canva URL from the create result first, then the candidate URL
  const fromCreate = findEditUrl(createResult);
  if (fromCreate) return fromCreate;
  if (first.url) return { edit_url: first.url };

  return extractDesignUrls(createResult, genResult);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface Candidate {
  id?: string;
  candidate_id?: string;
  url?: string;
}

function extractCandidates(result: unknown): Candidate[] {
  if (!result || typeof result !== 'object') return [];
  const r = result as Record<string, unknown>;

  // Unwrap MCP text content blocks
  if (Array.isArray(r.content)) {
    for (const block of r.content as { type?: string; text?: string }[]) {
      if (block.type === 'text' && block.text) {
        try {
          const p = JSON.parse(block.text);
          // Actual Canva format: { job: { result: { generated_designs: [...] } } }
          const generated = p?.job?.result?.generated_designs;
          if (Array.isArray(generated)) {
            return generated.map((d: { candidate_id?: string; url?: string }) => ({
              id: d.candidate_id,
              candidate_id: d.candidate_id,
              url: d.url,
            }));
          }
          if (Array.isArray(p.candidates)) return p.candidates;
          if (Array.isArray(p)) return p;
        } catch { /* try next */ }
      }
    }
  }

  if (Array.isArray(r.candidates)) return r.candidates as Candidate[];
  if (typeof r.candidate_id === 'string') return [{ id: r.candidate_id, candidate_id: r.candidate_id }];
  if (Array.isArray(result)) return result as Candidate[];
  if (typeof r.id === 'string') return [{ id: r.id }];
  return [];
}

function extractDesignUrls(
  createResult: unknown,
  fallback: unknown
): CanvaGeneratedDesign {
  for (const raw of [createResult, fallback]) {
    const found = findEditUrl(raw);
    if (found) return found;
  }
  throw new Error(
    `Could not find a Canva edit URL. create-design-from-candidate returned: ${JSON.stringify(createResult).slice(0, 400)}`
  );
}

function findEditUrl(raw: unknown): CanvaGeneratedDesign | null {
  if (!raw) return null;
  const str = JSON.stringify(raw);

  const editMatch  = str.match(/"edit_url"\s*:\s*"(https:\/\/[^"]+)"/);
  const viewMatch  = str.match(/"view_url"\s*:\s*"(https:\/\/[^"]+)"/);
  const idMatch    = str.match(/"(?:design_id|id)"\s*:\s*"([^"]{4,})"/);
  const titleMatch = str.match(/"title"\s*:\s*"([^"]+)"/);
  const urlMatch   = str.match(/https:\/\/www\.canva\.com\/design\/[^\s"\\]+/);

  if (editMatch) {
    return {
      edit_url:  editMatch[1],
      view_url:  viewMatch?.[1],
      design_id: idMatch?.[1],
      title:     titleMatch?.[1],
    };
  }
  if (urlMatch) return { edit_url: urlMatch[0] };
  return null;
}
