import { NextRequest, NextResponse } from 'next/server';
import { getMcpClientCredentials, saveInitialRefreshToken } from '@/lib/canva';

const MCP_TOKEN_URL = 'https://mcp.canva.com/token';

/**
 * Canva MCP OAuth callback.
 * Exchanges the authorization code for MCP tokens and stores the refresh token in Redis.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const returnedState = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(
      new URL(`/setup?error=${encodeURIComponent(error)}`, request.url)
    );
  }

  if (!code) {
    return NextResponse.redirect(new URL('/setup?error=no_code', request.url));
  }

  const storedState = request.cookies.get('canva_state')?.value;
  const codeVerifier = request.cookies.get('canva_code_verifier')?.value;

  if (!storedState || returnedState !== storedState) {
    return NextResponse.redirect(new URL('/setup?error=state_mismatch', request.url));
  }

  if (!codeVerifier) {
    return NextResponse.redirect(new URL('/setup?error=no_verifier', request.url));
  }

  const appUrl = process.env.APP_URL!;
  const redirectUri = `${appUrl}/api/auth/canva/callback`;

  let clientId: string;
  let clientSecret: string;
  try {
    ({ clientId, clientSecret } = await getMcpClientCredentials());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.redirect(
      new URL(`/setup?error=${encodeURIComponent(`no_client_credentials: ${msg}`)}`, request.url)
    );
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const tokenRes = await fetch(MCP_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    return NextResponse.redirect(
      new URL(
        `/setup?error=${encodeURIComponent(`token_exchange_failed: ${errText}`)}`,
        request.url
      )
    );
  }

  const tokens = await tokenRes.json();
  const refreshToken: string = tokens.refresh_token;

  if (!refreshToken) {
    return NextResponse.redirect(new URL('/setup?error=no_refresh_token', request.url));
  }

  await saveInitialRefreshToken(refreshToken);

  const response = NextResponse.redirect(new URL('/setup?connected=true', request.url));
  response.cookies.delete('canva_code_verifier');
  response.cookies.delete('canva_state');

  return response;
}
