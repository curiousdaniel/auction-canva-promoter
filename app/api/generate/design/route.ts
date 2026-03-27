import { NextRequest } from 'next/server';
import { getCanvaMcpAccessToken, getCanvaAccessToken, createCanvaDesign } from '@/lib/canva';
import { generateCanvaDesign } from '@/lib/canva-mcp-client';

export const maxDuration = 55;

// Canva's generate-design AI tool only supports digital/social-media formats.
// Print formats (flyer, poster) and some banners cause a "feature_not_available"
// error. Those types fall back to a blank canvas via the Connect API instead.
const CONNECT_API_FALLBACK_TYPES = new Set(['flyer', 'poster', 'facebook_cover']);

/**
 * Step 2: Creates a Canva design.
 * - Social media types → Canva MCP generate-design (AI-designed graphic)
 * - Print / banner types → Canva Connect API blank canvas at correct dimensions
 *
 * Receives { designBrief, designType, designTitle } and returns { canvaEditUrl }.
 */
export async function POST(request: NextRequest) {
  try {
    const {
      designBrief,
      designType,
      designTitle,
    }: { designBrief: string; designType?: string; designTitle?: string } = await request.json();

    if (!designBrief) {
      return Response.json({ error: 'designBrief is required' }, { status: 400 });
    }

    // ── Print / banner types: blank canvas via Connect API ───────────────────
    if (designType && CONNECT_API_FALLBACK_TYPES.has(designType)) {
      let connectToken: string;
      try {
        connectToken = await getCanvaAccessToken();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return Response.json({ error: `Canva not connected: ${msg}` }, { status: 503 });
      }
      const title = designTitle ?? `Auction ${designType}`;
      const design = await createCanvaDesign(connectToken, designType, title);
      return Response.json({ canvaEditUrl: design.edit_url });
    }

    // ── Social media types: AI design via Canva MCP ──────────────────────────
    let mcpToken: string;
    try {
      mcpToken = await getCanvaMcpAccessToken();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return Response.json({ error: `Canva MCP not configured: ${msg}` }, { status: 503 });
    }

    const design = await generateCanvaDesign(mcpToken, designBrief);
    return Response.json({ canvaEditUrl: design.edit_url });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
