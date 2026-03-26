import { NextRequest } from 'next/server';
import { buildDesignPrompt } from '@/lib/prompts';
import { getCanvaAccessToken } from '@/lib/canva';
import type { Auction, Item } from '@/lib/types';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const { auction, items, designType }: { auction: Auction; items: Item[]; designType: string } =
      await request.json();

    if (!auction || !items || !designType) {
      return Response.json({ error: 'auction, items, and designType are required' }, { status: 400 });
    }

    const prompt = buildDesignPrompt(auction, items, designType);

    const canvaToken = await getCanvaAccessToken();
    const mcpServer: Record<string, string> = {
      type: 'url',
      url: 'https://mcp.canva.com/mcp',
      name: 'canva-mcp',
      authorization_token: canvaToken,
    };

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
        mcp_servers: [mcpServer],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return Response.json({ error: `Anthropic API error: ${errText}` }, { status: response.status });
    }

    const data = await response.json();

    const textBlocks: string[] =
      data.content
        ?.filter((b: { type: string }) => b.type === 'text')
        .map((b: { text: string }) => b.text) || [];

    const toolResults =
      data.content
        ?.filter((b: { type: string }) => b.type === 'mcp_tool_result')
        .map((b: { content?: { text: string }[] }) => {
          try {
            return JSON.parse(b.content?.[0]?.text || '{}');
          } catch {
            return { raw: b.content?.[0]?.text };
          }
        }) || [];

    const toolCalls =
      data.content
        ?.filter((b: { type: string }) => b.type === 'mcp_tool_use')
        .map((b: { name: string; input: Record<string, unknown> }) => ({
          name: b.name,
          input: b.input,
        })) || [];

    return Response.json({
      copy: textBlocks.join('\n'),
      designs: toolResults,
      toolCalls,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
