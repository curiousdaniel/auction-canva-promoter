import { amAuth, amFetch } from '@/lib/amapi';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const offset = searchParams.get('offset') || '0';
    const limit = searchParams.get('limit') || '25';
    const auctionId = searchParams.get('auction');

    const token = await amAuth();
    let path = `/amapi/admin/auctions?offset=${offset}&limit=${limit}`;
    if (auctionId) path += `&auction=${auctionId}`;

    const data = await amFetch(path, token);
    return Response.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
