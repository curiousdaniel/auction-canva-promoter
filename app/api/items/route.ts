import { amAuth, amFetch } from '@/lib/amapi';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const auctionId = searchParams.get('auction');
    const offset = searchParams.get('offset') || '0';
    const limit = searchParams.get('limit') || '50';

    if (!auctionId) {
      return Response.json({ error: 'auction parameter required' }, { status: 400 });
    }

    const token = await amAuth();
    const data = await amFetch(
      `/amapi/admin/items?auction=${auctionId}&offset=${offset}&limit=${limit}`,
      token
    );
    return Response.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
