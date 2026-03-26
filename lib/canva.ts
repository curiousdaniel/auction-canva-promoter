import { Redis } from '@upstash/redis';

// Redis keys
const KEY_CLIENT_ID = 'canva_mcp_client_id';
const KEY_CLIENT_SECRET = 'canva_mcp_client_secret';
const KEY_REFRESH_TOKEN = 'canva_mcp_refresh_token';

// Canva MCP-specific OAuth endpoints (separate from the Connect API)
const MCP_REGISTER_URL = 'https://mcp.canva.com/register';
const MCP_TOKEN_URL = 'https://mcp.canva.com/token';

export const MCP_AUTHORIZE_URL = 'https://mcp.canva.com/authorize';

function getRedis(): Redis | null {
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
 * Returns the stored MCP client credentials (client_id + client_secret).
 * These come from a one-time Dynamic Client Registration call to mcp.canva.com/register.
 */
export async function getMcpClientCredentials(): Promise<{
  clientId: string;
  clientSecret: string;
}> {
  const redis = getRedis();
  if (redis) {
    const [clientId, clientSecret] = await Promise.all([
      redis.get<string>(KEY_CLIENT_ID),
      redis.get<string>(KEY_CLIENT_SECRET),
    ]);
    if (clientId && clientSecret) return { clientId, clientSecret };
  }
  throw new Error(
    'Canva MCP client not registered. Visit /setup to connect Canva.'
  );
}

/**
 * Registers this app with the Canva MCP server via Dynamic Client Registration.
 * Stores the resulting client_id and client_secret in Redis.
 * Only needs to run once.
 */
export async function registerMcpClient(
  redirectUri: string
): Promise<{ clientId: string; clientSecret: string }> {
  const res = await fetch(MCP_REGISTER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Auction Announcement Generator',
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code'],
    }),
  });

  if (!res.ok) {
    throw new Error(`Canva MCP registration failed: ${await res.text()}`);
  }

  const data = await res.json();
  const clientId: string = data.client_id;
  const clientSecret: string = data.client_secret;

  if (!clientId || !clientSecret) {
    throw new Error(`Canva MCP registration returned incomplete credentials: ${JSON.stringify(data)}`);
  }

  const redis = getRedis();
  if (redis) {
    await Promise.all([
      redis.set(KEY_CLIENT_ID, clientId),
      redis.set(KEY_CLIENT_SECRET, clientSecret),
    ]);
  }

  return { clientId, clientSecret };
}

/**
 * Saves the initial refresh token to Redis after the OAuth callback.
 */
export async function saveInitialRefreshToken(token: string): Promise<void> {
  const redis = getRedis();
  if (redis) {
    await redis.set(KEY_REFRESH_TOKEN, token);
  } else {
    console.warn('Canva: Redis not available, could not persist refresh token');
  }
}

/**
 * Exchanges the stored refresh token for a fresh access token via the Canva MCP OAuth server.
 * Automatically rotates and saves the new refresh token.
 */
export async function getCanvaAccessToken(): Promise<string> {
  const redis = getRedis();

  let refreshToken: string | null = null;
  if (redis) {
    refreshToken = await redis.get<string>(KEY_REFRESH_TOKEN);
  }
  if (!refreshToken) {
    // Fall back to env var (for first run before /setup is used)
    refreshToken = process.env.CANVA_REFRESH_TOKEN || null;
  }
  if (!refreshToken) {
    throw new Error(
      'Canva is not connected. Visit /setup to authorize Canva.'
    );
  }

  const { clientId, clientSecret } = await getMcpClientCredentials();
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await fetch(MCP_TOKEN_URL, {
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
    throw new Error(`Failed to refresh Canva MCP token: ${err}`);
  }

  const data = await res.json();

  if (!data.access_token) {
    throw new Error(`Canva token refresh returned no access_token: ${JSON.stringify(data)}`);
  }

  // Rotate: persist the new refresh token
  if (data.refresh_token && redis) {
    await redis.set(KEY_REFRESH_TOKEN, data.refresh_token);
  }

  return data.access_token as string;
}
