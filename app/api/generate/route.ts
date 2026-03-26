import { NextRequest } from 'next/server';
import { buildDesignPrompt } from '@/lib/prompts';
import { getCanvaAccessToken, createCanvaDesign } from '@/lib/canva';
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

    // Step 1: Generate marketing copy via Claude (no MCP needed)
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      return Response.json(
        { error: `Anthropic API error: ${errText}` },
        { status: claudeRes.status }
      );
    }

    const claudeData = await claudeRes.json();
    const copy: string =
      claudeData.content
        ?.filter((b: { type: string }) => b.type === 'text')
        .map((b: { text: string }) => b.text)
        .join('\n') || '';

    // Step 2: Create a blank Canva design of the right dimensions
    const designTitle = `${auction.title} — ${designType.replace(/_/g, ' ')}`.slice(0, 255);
    let canvaDesign = null;

    try {
      const accessToken = await getCanvaAccessToken();
      canvaDesign = await createCanvaDesign(accessToken, designType, designTitle);
    } catch (canvaErr) {
      // Don't fail the whole request if Canva creation fails
      console.error('Canva design creation failed:', canvaErr);
    }

    return Response.json({ copy, canvaDesign });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
