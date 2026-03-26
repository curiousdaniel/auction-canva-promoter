import { Redis } from '@upstash/redis';

const KV_KEY = 'canva_refresh_token';

function getRedis(): Redis | null {
  // Support both Upstash-native env var names and Vercel's KV_REST_API_* names
  const url =
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN;

  if (!url || !token) return null;

  try {
    return new Redis({ url, token });
  } catch {
    return null;
  }
}

/**
 * Reads the current refresh token — Redis first, env var as fallback.
 */
async function getStoredRefreshToken(): Promise<string> {
  try {
    const redis = getRedis();
    if (redis) {
      const stored = await redis.get<string>(KV_KEY);
      if (stored) return stored;
    }
  } catch {
    // Redis not available (e.g. local dev without env vars)
  }

  const envToken = process.env.CANVA_REFRESH_TOKEN;
  if (envToken) return envToken;

  throw new Error(
    'Canva is not connected. Visit /setup to authorize Canva.'
  );
}

/**
 * Persists a new refresh token to KV (Canva issues a new one on every exchange).
 */
async function storeRefreshToken(token: string): Promise<void> {
  try {
    const redis = getRedis();
    if (redis) {
      await redis.set(KV_KEY, token);
    } else {
      console.warn('Canva: Redis not available, could not persist new refresh token');
    }
  } catch {
    console.warn('Canva: could not persist new refresh token to Redis');
  }
}

/**
 * Exchanges the stored refresh token for a fresh Canva access token,
 * then saves the new refresh token that Canva returns.
 */
export async function getCanvaAccessToken(): Promise<string> {
  const clientId = process.env.CANVA_CLIENT_ID;
  const clientSecret = process.env.CANVA_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      'CANVA_CLIENT_ID and CANVA_CLIENT_SECRET must be set in environment variables.'
    );
  }

  const refreshToken = await getStoredRefreshToken();
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

  // Canva rotates the refresh token on every exchange — persist the new one
  if (data.refresh_token) {
    await storeRefreshToken(data.refresh_token);
  }

  return data.access_token as string;
}

/**
 * Stores a brand-new refresh token (called from the OAuth callback after first authorization).
 */
export async function saveInitialRefreshToken(token: string): Promise<void> {
  await storeRefreshToken(token);
}
