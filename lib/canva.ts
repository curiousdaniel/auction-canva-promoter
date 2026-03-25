/**
 * Exchanges the stored refresh token for a fresh Canva access token.
 * Called before every /api/generate request.
 *
 * Requires env vars:
 *   CANVA_CLIENT_ID
 *   CANVA_CLIENT_SECRET
 *   CANVA_REFRESH_TOKEN
 */
export async function getCanvaAccessToken(): Promise<string> {
  const refreshToken = process.env.CANVA_REFRESH_TOKEN;
  const clientId = process.env.CANVA_CLIENT_ID;
  const clientSecret = process.env.CANVA_CLIENT_SECRET;

  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error(
      'Canva is not configured. Set CANVA_CLIENT_ID, CANVA_CLIENT_SECRET, and CANVA_REFRESH_TOKEN in your environment variables. Visit /setup to connect Canva.'
    );
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await fetch('https://api.canva.com/rest/v1/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to refresh Canva token: ${err}`);
  }

  const data = await res.json();

  if (!data.access_token) {
    throw new Error(`Canva token refresh returned no access_token: ${JSON.stringify(data)}`);
  }

  return data.access_token as string;
}
