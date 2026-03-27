import { NextRequest } from 'next/server';
import { buildClaudeOnlyPrompt } from '@/lib/prompts';
import { getCanvaMcpAccessToken } from '@/lib/canva';
import { generateCanvaDesign } from '@/lib/canva-mcp-client';
import type { Auction, Item } from '@/lib/types';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const { auction, items, designType }: { auction: Auction; items: Item[]; designType: string } =
      await request.json();

    if (!auction || !items || !designType) {
      return Response.json({ error: 'auction, items, and designType are required' }, { status: 400 });
    }

    // ── Step 1: Claude generates copy + Canva design brief (~5-10s) ────────────
    const prompt = buildClaudeOnlyPrompt(auction, items, designType);

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!claudeRes.ok) {
      return Response.json(
        { error: `Anthropic API error: ${await claudeRes.text()}` },
        { status: claudeRes.status }
      );
    }

    const claudeData = await claudeRes.json();
    const claudeText: string =
      claudeData.content
        ?.filter((b: { type: string }) => b.type === 'text')
        .map((b: { text: string }) => b.text)
        .join('') ?? '';

    // Parse JSON response from Claude
    let copy = '';
    let designBrief = '';
    try {
      // Strip potential markdown code fences
      const cleaned = claudeText.replace(/^```(?:json)?\s*/m, '').replace(/```\s*$/m, '').trim();
      const parsed = JSON.parse(cleaned);
      copy = parsed.copy ?? claudeText;
      designBrief = parsed.design_brief ?? '';
    } catch {
      copy = claudeText; // fallback: treat full text as copy
    }

    // ── Step 2: Canva MCP generates the actual design (~15-25s) ───────────────
    let canvaEditUrl: string | null = null;

    if (designBrief) {
      try {
        const accessToken = await getCanvaMcpAccessToken();
        const design = await generateCanvaDesign(accessToken, designBrief);
        canvaEditUrl = design.edit_url;
      } catch (canvaErr) {
        // Don't fail the whole request — copy is still valuable
        console.error('Canva design generation error:', canvaErr);
        const errMsg = canvaErr instanceof Error ? canvaErr.message : String(canvaErr);
        return Response.json({ copy, canvaEditUrl: null, canvaError: errMsg });
      }
    }

    return Response.json({ copy, canvaEditUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
