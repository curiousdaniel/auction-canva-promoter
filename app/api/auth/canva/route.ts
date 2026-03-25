import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Kicks off the Canva OAuth 2.0 + PKCE flow.
 * Generates code_verifier + code_challenge, stores verifier in a cookie,
 * then redirects the user to Canva's authorization page.
 */
export async function GET(request: NextRequest) {
  const clientId = process.env.CANVA_CLIENT_ID;
  const appUrl = process.env.APP_URL;

  if (!clientId) {
    return new Response('CANVA_CLIENT_ID is not set', { status: 500 });
  }
  if (!appUrl) {
    return new Response('APP_URL is not set', { status: 500 });
  }

  const codeVerifier = crypto.randomBytes(96).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  const state = crypto.randomBytes(32).toString('base64url');

  const redirectUri = `${appUrl}/api/auth/canva/callback`;

  const params = new URLSearchParams({
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    scope: 'design:content:read design:content:write design:meta:read',
    response_type: 'code',
    client_id: clientId,
    state,
    redirect_uri: redirectUri,
  });

  const authUrl = `https://www.canva.com/api/oauth/authorize?${params.toString()}`;

  const response = NextResponse.redirect(authUrl);

  // Store verifier + state in httpOnly cookies (30-minute expiry)
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
