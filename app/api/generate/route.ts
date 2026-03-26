import { NextRequest } from 'next/server';
import { buildDesignPrompt } from '@/lib/prompts';
import { getCanvaMcpAccessToken } from '@/lib/canva';
import type { Auction, Item } from '@/lib/types';

export const maxDuration = 60;

// Extracts all canva.com/... URLs Claude mentions in its text
function extractCanvaUrls(text: string): string[] {
  const pattern = /https:\/\/www\.canva\.com\/(?:design\/[^\s"'<>)\]]+|[^\s"'<>)\]]+)/g;
  return [...new Set(text.match(pattern) ?? [])];
}

// Looks for the explicit CANVA_URL: marker we asked Claude to include
function extractMarkedUrl(text: string): string | null {
  const m = text.match(/CANVA_URL:\s*(https:\/\/[^\s"'<>)\]]+)/);
  return m ? m[1] : null;
}

export async function POST(request: NextRequest) {
  try {
    const { auction, items, designType }: { auction: Auction; items: Item[]; designType: string } =
      await request.json();

    if (!auction || !items || !designType) {
      return Response.json({ error: 'auction, items, and designType are required' }, { status: 400 });
    }

    const prompt = buildDesignPrompt(auction, items, designType);

    // Get a fresh Canva MCP access token (rotating refresh token stored in Redis)
    let canvaToken: string;
    try {
      canvaToken = await getCanvaMcpAccessToken();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return Response.json(
        { error: `Canva MCP not configured: ${msg}` },
        { status: 503 }
      );
    }

    // Call Claude with the Canva MCP server attached.
    // Anthropic orchestrates all tool calls internally; we get the final result.
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'mcp-client-2025-11-20',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
        mcp_servers: [
          {
            type: 'url',
            url: 'https://mcp.canva.com/mcp',
            name: 'canva',
            authorization_token: canvaToken,
          },
        ],
        tools: [{ type: 'mcp_toolset', mcp_server_name: 'canva' }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      return Response.json(
        { error: `Anthropic API error: ${errText}` },
        { status: anthropicRes.status }
      );
    }

    const data = await anthropicRes.json();

    // Collect all text blocks from the response
    const fullText: string = (data.content ?? [])
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('\n');

    // Extract the Canva design URL Claude embedded in its response
    const canvaEditUrl = extractMarkedUrl(fullText) ?? extractCanvaUrls(fullText)[0] ?? null;

    // Split copy from any URL marker line
    const copy = fullText.replace(/CANVA_URL:\s*https?:\/\/[^\s]+/g, '').trim();

    return Response.json({ copy, canvaEditUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
