import { NextRequest, NextResponse } from 'next/server';
import { saveInitialRefreshToken } from '@/lib/canva';

const CONNECT_TOKEN_URL = 'https://api.canva.com/rest/v1/oauth/token';

/**
 * Canva Connect API OAuth callback.
 * Exchanges the authorization code for tokens and stores the refresh token in Redis.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code          = searchParams.get('code');
  const returnedState = searchParams.get('state');
  const error         = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(
      new URL(`/setup?error=${encodeURIComponent(error)}`, request.url)
    );
  }
  if (!code) {
    return NextResponse.redirect(new URL('/setup?error=no_code', request.url));
  }

  const storedState   = request.cookies.get('canva_state')?.value;
  const codeVerifier  = request.cookies.get('canva_code_verifier')?.value;

  if (!storedState || returnedState !== storedState) {
    return NextResponse.redirect(new URL('/setup?error=state_mismatch', request.url));
  }
  if (!codeVerifier) {
    return NextResponse.redirect(new URL('/setup?error=no_verifier', request.url));
  }

  const clientId     = process.env.CANVA_CLIENT_ID!;
  const clientSecret = process.env.CANVA_CLIENT_SECRET!;
  const appUrl       = process.env.APP_URL!;
  const redirectUri  = `${appUrl}/api/auth/canva/callback`;
  const credentials  = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const tokenRes = await fetch(CONNECT_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type:    'authorization_code',
      code,
      code_verifier: codeVerifier,
      redirect_uri:  redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    return NextResponse.redirect(
      new URL(`/setup?error=${encodeURIComponent(`token_exchange_failed: ${errText}`)}`, request.url)
    );
  }

  const tokens = await tokenRes.json();
  if (!tokens.refresh_token) {
    return NextResponse.redirect(new URL('/setup?error=no_refresh_token', request.url));
  }

  await saveInitialRefreshToken(tokens.refresh_token);

  const response = NextResponse.redirect(new URL('/setup?connected=true', request.url));
  response.cookies.delete('canva_code_verifier');
  response.cookies.delete('canva_state');
  return response;
}
