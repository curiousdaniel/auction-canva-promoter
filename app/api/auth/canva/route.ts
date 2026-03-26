import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { registerMcpClient, getMcpClientCredentials, MCP_AUTHORIZE_URL } from '@/lib/canva';

/**
 * Kicks off the Canva MCP OAuth 2.0 + PKCE flow.
 * Auto-registers this app via DCR if not already registered.
 */
export async function GET(request: NextRequest) {
  const appUrl = process.env.APP_URL;
  if (!appUrl) {
    return new Response('APP_URL environment variable is not set', { status: 500 });
  }

  const redirectUri = `${appUrl}/api/auth/canva/callback`;

  // Auto-register with the Canva MCP server if we don't have credentials yet
  let clientId: string;
  try {
    ({ clientId } = await getMcpClientCredentials());
  } catch {
    try {
      ({ clientId } = await registerMcpClient(redirectUri));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return new Response(`Canva MCP registration failed: ${msg}`, { status: 500 });
    }
  }

  const codeVerifier = crypto.randomBytes(96).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  const state = crypto.randomBytes(32).toString('base64url');

  const params = new URLSearchParams({
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    response_type: 'code',
    client_id: clientId,
    state,
    redirect_uri: redirectUri,
  });

  const authUrl = `${MCP_AUTHORIZE_URL}?${params.toString()}`;

  const response = NextResponse.redirect(authUrl);

  const cookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: 'lax' as const,
    maxAge: 60 * 30,
    path: '/',
  };
  response.cookies.set('canva_code_verifier', codeVerifier, cookieOptions);
  response.cookies.set('canva_state', state, cookieOptions);

  return response;
}
