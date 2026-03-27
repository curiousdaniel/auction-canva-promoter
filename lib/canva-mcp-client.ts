/**
 * Minimal direct client for the Canva MCP server using StreamableHTTP transport.
 * Bypasses Anthropic's MCP orchestration layer to avoid the 60s serverless timeout.
 */

const MCP_URL = 'https://mcp.canva.com/mcp';

interface McpResponse {
  jsonrpc: '2.0';
  id?: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

/** Low-level: POST one JSON-RPC message, handle both JSON and SSE responses. */
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

  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const newSessionId = res.headers.get('mcp-session-id') ?? sessionId;
  const contentType = res.headers.get('content-type') ?? '';
  const text = await res.text();

  if (!res.ok && !contentType.includes('text/event-stream')) {
    throw new Error(`Canva MCP HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  // StreamableHTTP can respond with SSE
  if (contentType.includes('text/event-stream')) {
    const reqBody = body as { id?: number };
    const targetId = reqBody.id;
    for (const line of text.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (!raw || raw === '[DONE]') continue;
      let parsed: McpResponse;
      try {
        parsed = JSON.parse(raw);
      } catch {
        continue;
      }
      if (targetId === undefined || parsed.id === targetId) {
        if (parsed.error) {
          throw new Error(`Canva MCP error: ${parsed.error.message}`);
        }
        return { result: parsed.result, sessionId: newSessionId };
      }
    }
    throw new Error(`No matching response (id=${targetId}) found in SSE stream. Raw: ${text.slice(0, 500)}`);
  }

  // Regular JSON response
  let parsed: McpResponse;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Canva MCP returned non-JSON: ${text.slice(0, 200)}`);
  }
  if (parsed.error) {
    throw new Error(`Canva MCP error: ${parsed.error.message}`);
  }
  return { result: parsed.result, sessionId: newSessionId };
}

/** Opens an MCP session and returns the session ID (may be null for stateless servers). */
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

  // Send the required "initialized" notification (fire-and-forget, ignore errors)
  try {
    await mcpPost(token, sessionId, {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });
  } catch {
    // notifications are one-way; ignore response errors
  }

  return sessionId;
}

/** Calls a single Canva MCP tool and returns its result. */
async function callTool(
  token: string,
  sessionId: string | null,
  toolName: string,
  args: Record<string, unknown>
): Promise<{ toolResult: unknown; sessionId: string | null }> {
  const { result, sessionId: newSid } = await mcpPost(token, sessionId, {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: { name: toolName, arguments: args },
  });
  return { toolResult: result, sessionId: newSid };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface CanvaGeneratedDesign {
  edit_url: string;
  view_url?: string;
  design_id?: string;
  title?: string;
}

/**
 * Generates a Canva design from a text description using the MCP server's
 * generate-design and create-design-from-candidate tools.
 *
 * Returns the direct edit URL for the finished design.
 */
export async function generateCanvaDesign(
  accessToken: string,
  designPrompt: string
): Promise<CanvaGeneratedDesign> {
  const sessionId = await initSession(accessToken);

  // Step 1: generate design candidates
  const { toolResult: genResult, sessionId: sid2 } = await callTool(
    accessToken,
    sessionId,
    'generate-design',
    { query: designPrompt }
  );

  // Extract the first candidate ID from the result.
  // The result shape is: { content: [{ type:'text', text: JSON }] } or similar.
  const candidates = extractCandidates(genResult);
  if (!candidates.length) {
    throw new Error(
      `generate-design returned no candidates. Raw result: ${JSON.stringify(genResult).slice(0, 300)}`
    );
  }

  const firstCandidate = candidates[0];

  // Step 2: create the design from the chosen candidate
  const { toolResult: createResult } = await callTool(
    accessToken,
    sid2,
    'create-design-from-candidate',
    { candidate_id: firstCandidate.id ?? firstCandidate }
  );

  return extractDesignUrls(createResult, genResult);
}

// ─── Helpers for extracting nested data from MCP tool results ─────────────────

function extractCandidates(result: unknown): { id: string }[] {
  if (!result || typeof result !== 'object') return [];

  // Common shape: { content: [{ type: 'text', text: '{"candidates": [...]}' }] }
  const r = result as Record<string, unknown>;

  if (Array.isArray(r.content)) {
    for (const block of r.content as { type?: string; text?: string }[]) {
      if (block.type === 'text' && block.text) {
        try {
          const parsed = JSON.parse(block.text);
          if (Array.isArray(parsed.candidates)) return parsed.candidates;
          if (Array.isArray(parsed)) return parsed;
        } catch {
          // try next block
        }
      }
    }
  }

  if (Array.isArray(r.candidates)) return r.candidates as { id: string }[];
  if (typeof r.candidate_id === 'string') return [{ id: r.candidate_id }];

  // Fallback: if result itself is an array or has an id
  if (Array.isArray(result)) return result as { id: string }[];
  if (typeof r.id === 'string') return [{ id: r.id }];

  return [];
}

function extractDesignUrls(
  createResult: unknown,
  fallback: unknown
): CanvaGeneratedDesign {
  for (const raw of [createResult, fallback]) {
    const url = findUrlInResult(raw);
    if (url) return url;
  }
  throw new Error(
    `Could not extract design URL from result: ${JSON.stringify(createResult).slice(0, 400)}`
  );
}

function findUrlInResult(raw: unknown): CanvaGeneratedDesign | null {
  if (!raw || typeof raw !== 'object') return null;

  // Recursive search for edit_url
  const str = JSON.stringify(raw);
  const editMatch = str.match(/"edit_url"\s*:\s*"(https:\/\/[^"]+)"/);
  const viewMatch = str.match(/"view_url"\s*:\s*"(https:\/\/[^"]+)"/);
  const idMatch   = str.match(/"(?:design_id|id)"\s*:\s*"([^"]+)"/);
  const titleMatch = str.match(/"title"\s*:\s*"([^"]+)"/);

  if (editMatch) {
    return {
      edit_url:  editMatch[1],
      view_url:  viewMatch?.[1],
      design_id: idMatch?.[1],
      title:     titleMatch?.[1],
    };
  }

  // Also check for canva.com URLs in text blocks
  const urlMatch = str.match(/https:\/\/www\.canva\.com\/design\/[^"\\]+/);
  if (urlMatch) {
    return { edit_url: urlMatch[0] };
  }

  return null;
}
