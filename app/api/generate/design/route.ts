import { NextRequest } from 'next/server';
import { getCanvaMcpAccessToken } from '@/lib/canva';
import { generateCanvaDesign } from '@/lib/canva-mcp-client';

export const maxDuration = 55;

/**
 * Step 2: Calls the Canva MCP server directly to generate a real design.
 * Receives { designBrief } and returns { canvaEditUrl }.
 */
export async function POST(request: NextRequest) {
  try {
    const { designBrief }: { designBrief: string } = await request.json();

    if (!designBrief) {
      return Response.json({ error: 'designBrief is required' }, { status: 400 });
    }

    let accessToken: string;
    try {
      accessToken = await getCanvaMcpAccessToken();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return Response.json({ error: `Canva MCP not configured: ${msg}` }, { status: 503 });
    }

    const design = await generateCanvaDesign(accessToken, designBrief);
    return Response.json({ canvaEditUrl: design.edit_url });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
