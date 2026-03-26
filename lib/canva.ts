import { Redis } from '@upstash/redis';

// Uses the Canva Connect API (not the MCP server)
const CONNECT_TOKEN_URL = 'https://api.canva.com/rest/v1/oauth/token';
const CONNECT_DESIGNS_URL = 'https://api.canva.com/rest/v1/designs';
const CONNECT_AUTHORIZE_URL = 'https://www.canva.com/api/oauth/authorize';

export { CONNECT_AUTHORIZE_URL };

// Redis key for the rotating Connect API refresh token
const KEY_REFRESH_TOKEN = 'canva_refresh_token';

// Pixel dimensions for each design type (must be between 40–8000)
const DESIGN_DIMENSIONS: Record<string, { width: number; height: number }> = {
  instagram_post: { width: 1080, height: 1080 },
  facebook_post:  { width: 1200, height: 628 },
  twitter_post:   { width: 1600, height: 900 },
  your_story:     { width: 1080, height: 1920 },
  flyer:          { width: 794,  height: 1123 },
  poster:         { width: 1414, height: 2000 },
  facebook_cover: { width: 820,  height: 312 },
};

function getRedis(): Redis | null {
  const url   = process.env.UPSTASH_REDIS_REST_URL  || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  try {
    return new Redis({ url, token });
  } catch {
    return null;
  }
}

function getConnectCredentials(): { clientId: string; clientSecret: string } {
  const clientId     = process.env.CANVA_CLIENT_ID;
  const clientSecret = process.env.CANVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      'CANVA_CLIENT_ID and CANVA_CLIENT_SECRET must be set. Visit /setup for instructions.'
    );
  }
  return { clientId, clientSecret };
}

/**
 * Stores a fresh refresh token in Redis after the OAuth callback.
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
 * Exchanges the stored refresh token for a fresh Canva Connect API access token.
 * Automatically rotates and saves the new refresh token Canva returns.
 */
export async function getCanvaAccessToken(): Promise<string> {
  const redis = getRedis();

  let refreshToken: string | null = null;
  if (redis) {
    refreshToken = await redis.get<string>(KEY_REFRESH_TOKEN);
  }
  if (!refreshToken) {
    refreshToken = process.env.CANVA_REFRESH_TOKEN || null;
  }
  if (!refreshToken) {
    throw new Error('Canva is not connected. Visit /setup to authorize Canva.');
  }

  const { clientId, clientSecret } = getConnectCredentials();
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await fetch(CONNECT_TOKEN_URL, {
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
    throw new Error(`Failed to refresh Canva token: ${await res.text()}`);
  }

  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`Canva token refresh returned no access_token: ${JSON.stringify(data)}`);
  }

  if (data.refresh_token && redis) {
    await redis.set(KEY_REFRESH_TOKEN, data.refresh_token);
  }

  return data.access_token as string;
}

// ─── Canva MCP OAuth (separate from Connect API) ─────────────────────────────

const MCP_TOKEN_URL = 'https://mcp.canva.com/token';
const KEY_MCP_REFRESH = 'canva_mcp_refresh_token';

/**
 * Exchanges the stored Canva MCP refresh token for a fresh access token.
 * Credentials come from env vars populated by scripts/extract-mcp-creds.mjs.
 * Rotates the refresh token in Redis after each successful exchange.
 */
export async function getCanvaMcpAccessToken(): Promise<string> {
  const clientId     = process.env.CANVA_MCP_CLIENT_ID;
  const clientSecret = process.env.CANVA_MCP_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      'CANVA_MCP_CLIENT_ID and CANVA_MCP_CLIENT_SECRET are not set. ' +
        'Run scripts/extract-mcp-creds.mjs and add the values to Vercel.'
    );
  }

  const redis = getRedis();
  let refreshToken: string | null = null;
  if (redis) refreshToken = await redis.get<string>(KEY_MCP_REFRESH);
  if (!refreshToken) refreshToken = process.env.CANVA_MCP_REFRESH_TOKEN ?? null;
  if (!refreshToken) {
    throw new Error(
      'CANVA_MCP_REFRESH_TOKEN is not set. ' +
        'Run scripts/extract-mcp-creds.mjs and add the value to Vercel.'
    );
  }

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
    throw new Error(`Canva MCP token refresh failed: ${await res.text()}`);
  }

  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`Canva MCP token refresh returned no access_token: ${JSON.stringify(data)}`);
  }

  if (data.refresh_token && redis) {
    await redis.set(KEY_MCP_REFRESH, data.refresh_token);
  }

  return data.access_token as string;
}

// ─── Connect API design types ─────────────────────────────────────────────────

export interface CanvaDesignResult {
  edit_url: string;
  view_url: string;
  design_id: string;
  title: string;
}

/**
 * Creates a blank Canva design of the right dimensions for the given design type.
 * Returns the direct edit URL (valid 30 days).
 */
export async function createCanvaDesign(
  accessToken: string,
  designType: string,
  title: string
): Promise<CanvaDesignResult> {
  const dims = DESIGN_DIMENSIONS[designType] ?? { width: 1080, height: 1080 };

  const res = await fetch(CONNECT_DESIGNS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      design_type: {
        type: 'custom',
        width: dims.width,
        height: dims.height,
      },
      title: title.slice(0, 255),
    }),
  });

  if (!res.ok) {
    throw new Error(`Canva design creation failed: ${await res.text()}`);
  }

  const data = await res.json();
  const design = data.design;

  return {
    edit_url:  design.urls.edit_url,
    view_url:  design.urls.view_url,
    design_id: design.id,
    title:     design.title,
  };
}
