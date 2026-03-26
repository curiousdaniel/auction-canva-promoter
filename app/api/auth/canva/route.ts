import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { CONNECT_AUTHORIZE_URL } from '@/lib/canva';

/**
 * Kicks off the Canva Connect API OAuth 2.0 + PKCE flow.
 */
export async function GET(request: NextRequest) {
  const clientId = process.env.CANVA_CLIENT_ID;
  const appUrl   = process.env.APP_URL;

  if (!clientId) {
    return new Response('CANVA_CLIENT_ID is not set in environment variables.', { status: 500 });
  }
  if (!appUrl) {
    return new Response('APP_URL is not set in environment variables.', { status: 500 });
  }

  const codeVerifier  = crypto.randomBytes(96).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  const state         = crypto.randomBytes(32).toString('base64url');
  const redirectUri   = `${appUrl}/api/auth/canva/callback`;

  const params = new URLSearchParams({
    code_challenge:        codeChallenge,
    code_challenge_method: 'S256',
    scope:                 'design:content:read design:content:write design:meta:read',
    response_type:         'code',
    client_id:             clientId,
    state,
    redirect_uri:          redirectUri,
  });

  const response = NextResponse.redirect(`${CONNECT_AUTHORIZE_URL}?${params.toString()}`);

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
