import { NextRequest } from 'next/server';
import { buildClaudeOnlyPrompt } from '@/lib/prompts';
import type { Auction, Item } from '@/lib/types';

export const maxDuration = 30;

/**
 * Step 1: Claude generates marketing copy + a visual design brief.
 * Fast call (~5-10 s), returns { copy, designBrief }.
 */
export async function POST(request: NextRequest) {
  try {
    const { auction, items, designType }: { auction: Auction; items: Item[]; designType: string } =
      await request.json();

    if (!auction || !items || !designType) {
      return Response.json({ error: 'auction, items, and designType are required' }, { status: 400 });
    }

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
    const rawText: string =
      claudeData.content
        ?.filter((b: { type: string }) => b.type === 'text')
        .map((b: { text: string }) => b.text)
        .join('') ?? '';

    let copy = '';
    let designBrief = '';
    try {
      const cleaned = rawText.replace(/^```(?:json)?\s*/m, '').replace(/```\s*$/m, '').trim();
      const parsed = JSON.parse(cleaned);
      copy = parsed.copy ?? rawText;
      designBrief = parsed.design_brief ?? '';
    } catch {
      copy = rawText;
    }

    return Response.json({ copy, designBrief });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
