# Auction Announcement Generator — MVP Spec

## Overview

A Next.js app that pulls auction data from the AuctionMethod API and generates marketing-ready announcement graphics via Canva. The auctioneer selects an auction, optionally picks featured lots, and the app generates social media posts, flyers, or announcement graphics — ready to download and share.

This is a proof-of-concept for AuctionMethod clients. It demonstrates how their auction data can flow directly into polished marketing materials without manual copy-paste or design work.

---

## Stack

- **Framework:** Next.js (App Router)
- **Hosting:** Vercel
- **Language:** TypeScript
- **AI:** Anthropic API (Claude Sonnet 4) with Canva MCP server attached
- **APIs:** AuctionMethod REST API, Canva via MCP
- **Styling:** Tailwind CSS

---

## Architecture

```
┌──────────────────────────────────┐
│         Next.js Frontend         │
│  (auction selector, preview UI)  │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│      Next.js API Routes          │
│                                  │
│  /api/auctions     → AM API     │
│  /api/items         → AM API     │
│  /api/generate      → Anthropic  │
│                        + Canva   │
└──────────┬──────────┬────────────┘
           │          │
           ▼          ▼
      AM API     Anthropic API
                  (w/ Canva MCP)
```

The key insight: the `/api/generate` route calls the Anthropic API with the Canva MCP server attached. Claude acts as the creative director — it receives the auction data as context, writes compelling marketing copy, and calls Canva's `generate-design` tool to produce the actual graphics.

---

## AuctionMethod API Reference

### Authentication

```
POST https://{domain}/amapi/auth
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "..."
}

→ { "status": "success", "token": "...", "data": { ... } }
```

All subsequent requests require `Authorization: Bearer {token}`.

### Get Auctions

```
GET https://{domain}/amapi/admin/auctions?offset=0&limit=25

→ { "status": "...", "message": "...", "auctions": [...] }
```

Each auction object includes:
- `id` (int) — auction ID
- `title` (string)
- `description` (string)
- `start_time`, `end_time` — Unix timestamps
- `starts`, `ends` — ISO 8601 strings
- `status` (string)
- `published` (0|1)
- `address`, `city`, `state`, `zip`, `country_id` — location fields
- `timezone` (string)
- `buyer_premium` (float)
- `terms` (string)
- `announcement` (string)
- `header_text` (string)
- `preview_info`, `payment_info`, `removal_info` (strings)
- `youtube_videos` (string)
- `created_date`, `updated_date`

### Get Items for an Auction

```
GET https://{domain}/amapi/admin/items?auction={auction_id}&offset=0&limit=50

→ { "status": "...", "items": [...] }
```

Each item object includes:
- `id` (int) — item ID
- `title` (string)
- `lot_number` (string)
- `description` (string, may contain HTML)
- `starting_bid` (float)
- `reserve_price` (float)
- `quantity` (int)
- `featured` (0|1)
- `buy_now` ("0" | price string)
- `category` (int)
- `consignor_id` (int)
- `videos` (string, comma-separated YouTube IDs)
- `documents` (array of `{ title, url }`)
- Image URLs (check response for image fields — typically in an `images` array)

### Pagination

Both endpoints support `offset` and `limit` query params. Default offset is 0. Paginate until the returned array length is less than the limit.

### Environment Variables

```env
AM_DOMAIN=test2.auctionmethod.com
AM_EMAIL=api+admin@auctionmethod.com
AM_PASSWORD=...
ANTHROPIC_API_KEY=...
```

### AM API Client Utility (`lib/amapi.ts`)

```typescript
const AM_DOMAIN = process.env.AM_DOMAIN!;

export async function amAuth(): Promise<string> {
  const res = await fetch(`https://${AM_DOMAIN}/amapi/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: process.env.AM_EMAIL,
      password: process.env.AM_PASSWORD,
    }),
  });
  const data = await res.json();
  if (data.status !== 'success') throw new Error(data.message);
  return data.token;
}

export async function amFetch(path: string, token: string, options: RequestInit = {}) {
  const res = await fetch(`https://${AM_DOMAIN}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  return res.json();
}
```

---

## Canva Integration via Anthropic API + MCP

The app does NOT call Canva directly. Instead, it calls the Anthropic Messages API with the Canva MCP server attached. Claude generates the design brief and invokes Canva's tools.

### How to call the Anthropic API with Canva MCP

```typescript
const response = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": process.env.ANTHROPIC_API_KEY!,
    "anthropic-version": "2023-06-01",
  },
  body: JSON.stringify({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: designPrompt, // see below
      },
    ],
    mcp_servers: [
      {
        type: "url",
        url: "https://mcp.canva.com/mcp",
        name: "canva-mcp",
      },
    ],
  }),
});
```

### Processing the MCP response

The response `data.content` will contain multiple block types. Extract them by type:

```typescript
const data = await response.json();

// Get Canva tool results (design candidates, URLs, thumbnails)
const toolResults = data.content
  .filter((item: any) => item.type === "mcp_tool_result")
  .map((item: any) => item.content?.[0]?.text || "")
  .join("\n");

// Get Claude's text responses (copy, rationale)
const textResponses = data.content
  .filter((item: any) => item.type === "text")
  .map((item: any) => item.text)
  .join("\n");

// Get tool invocations (what Claude asked Canva to do)
const toolCalls = data.content
  .filter((item: any) => item.type === "mcp_tool_use")
  .map((item: any) => ({ name: item.name, input: item.input }));
```

### Canva design types to use

The `generate-design` tool supports these relevant types:
- `instagram_post` — square social post
- `facebook_post` — Facebook-optimized post
- `twitter_post` — Twitter/X optimized post
- `flyer` — single-page print flyer
- `poster` — large format print
- `your_story` — vertical Instagram/Facebook Story
- `facebook_cover` — Facebook page banner

### What to send Claude in the design prompt

Build a prompt that includes the auction data and tells Claude what to generate:

```typescript
function buildDesignPrompt(auction: AuctionData, items: ItemData[], designType: string): string {
  const featuredItems = items.filter(i => i.featured === 1).slice(0, 5);
  const itemSummary = featuredItems.length > 0
    ? featuredItems.map(i => `- ${i.title} (Starting bid: $${i.starting_bid})`).join("\n")
    : items.slice(0, 5).map(i => `- ${i.title}`).join("\n");

  return `You are a marketing designer for an auction company. Generate a ${designType} design in Canva for the following auction:

AUCTION DETAILS:
- Title: ${auction.title}
- Date: ${auction.starts} to ${auction.ends}
- Location: ${[auction.address, auction.city, auction.state, auction.zip].filter(Boolean).join(", ")}
- Description: ${auction.description || "Not provided"}
- Buyer Premium: ${auction.buyer_premium}%
- Total Items: ${items.length}

FEATURED ITEMS:
${itemSummary}

INSTRUCTIONS:
1. Write compelling, concise marketing copy for this auction.
2. Use the Canva generate-design tool to create a ${designType} design.
3. The design should be eye-catching, professional, and include:
   - Auction title prominently displayed
   - Date and time
   - Location (if applicable)
   - A call to action ("Bid Now", "Register Today", etc.)
   - Featured item highlights if space allows
4. Make the query to Canva detailed and specific — describe colors, layout, mood.
5. Return the generated design candidates.`;
}
```

---

## App Pages & Routes

### Page: `/` — Auction Selector (Home)

1. On load, call `/api/auctions` to fetch the auction list.
2. Display auctions as selectable cards showing title, date range, status, item count.
3. Filter/sort controls: status (active/closed/draft), date range.
4. Clicking an auction navigates to `/auction/[id]`.

### Page: `/auction/[id]` — Auction Detail + Generate

1. Fetch auction details and items from `/api/auctions?auction={id}` and `/api/items?auction={id}`.
2. Show auction summary: title, dates, location, description, item count, featured item count.
3. Show a scrollable item list with checkboxes. Pre-select items flagged as `featured: 1`.
4. **Design type selector** — choose what to generate:
   - Instagram Post
   - Facebook Post
   - Twitter/X Post
   - Instagram/Facebook Story
   - Flyer
   - Poster
   - Facebook Cover
5. **"Generate Announcement" button** — calls `/api/generate` with the auction data, selected items, and design type.
6. **Results panel** — displays:
   - Generated marketing copy (Claude's text)
   - Canva design candidate thumbnails and preview URLs
   - "Open in Canva" links for each candidate

### API Route: `/api/auctions` — GET

```typescript
// Proxy to AM API, returns auction list
import { amAuth, amFetch } from '@/lib/amapi';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const offset = searchParams.get('offset') || '0';
  const limit = searchParams.get('limit') || '25';
  const auctionId = searchParams.get('auction');

  const token = await amAuth();
  let path = `/amapi/admin/auctions?offset=${offset}&limit=${limit}`;
  if (auctionId) path += `&auction=${auctionId}`;

  const data = await amFetch(path, token);
  return Response.json(data);
}
```

### API Route: `/api/items` — GET

```typescript
// Proxy to AM API, returns items for an auction
import { amAuth, amFetch } from '@/lib/amapi';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const auctionId = searchParams.get('auction');
  const offset = searchParams.get('offset') || '0';
  const limit = searchParams.get('limit') || '50';

  if (!auctionId) {
    return Response.json({ error: 'auction parameter required' }, { status: 400 });
  }

  const token = await amAuth();
  const data = await amFetch(
    `/amapi/admin/items?auction=${auctionId}&offset=${offset}&limit=${limit}`,
    token
  );
  return Response.json(data);
}
```

### API Route: `/api/generate` — POST

This is the core route. It receives auction data + design preferences, calls the Anthropic API with the Canva MCP server, and returns the results.

```typescript
import { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  const { auction, items, designType } = await request.json();

  const prompt = buildDesignPrompt(auction, items, designType);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
      mcp_servers: [
        {
          type: "url",
          url: "https://mcp.canva.com/mcp",
          name: "canva-mcp",
        },
      ],
    }),
  });

  const data = await response.json();

  // Parse the multi-block response
  const textBlocks = data.content
    ?.filter((b: any) => b.type === "text")
    .map((b: any) => b.text) || [];

  const toolResults = data.content
    ?.filter((b: any) => b.type === "mcp_tool_result")
    .map((b: any) => {
      try {
        return JSON.parse(b.content?.[0]?.text || "{}");
      } catch {
        return { raw: b.content?.[0]?.text };
      }
    }) || [];

  const toolCalls = data.content
    ?.filter((b: any) => b.type === "mcp_tool_use")
    .map((b: any) => ({ name: b.name, input: b.input })) || [];

  return Response.json({
    copy: textBlocks.join("\n"),
    designs: toolResults,
    toolCalls,
  });
}
```

---

## UI Design Notes

- Clean, minimal UI. No clutter.
- Auction cards should show a status badge (Active = green, Closed = gray, Draft = yellow).
- The generate page should feel like a simple wizard: select items → pick format → generate → preview results.
- Show a loading state with a message like "Generating your announcement..." while waiting for the Anthropic + Canva response (this can take 10-20 seconds).
- Design candidate thumbnails should be displayed in a grid with "Open in Canva" buttons beneath each.
- The generated marketing copy should be displayed in a copyable text block above the design previews.

---

## MVP Scope — What to Build First

1. **Phase 1:** Auction list page + auction detail page with item list. Pure AM API integration, no Canva yet. Verify data flows correctly.
2. **Phase 2:** Add the `/api/generate` route and the design type selector. Wire up the Anthropic + Canva MCP call. Display results.
3. **Phase 3:** Polish — loading states, error handling, copy-to-clipboard for the marketing text, "Open in Canva" deep links.

### Out of Scope for MVP
- User auth / multi-tenant (hardcode to one AM site via env vars)
- Canva brand kit selection (can add later)
- Batch generation (one auction at a time)
- Saving/history of generated designs
- Item image passthrough to Canva (Canva generates its own visuals; item photos would require asset upload which is a Phase 2 feature)

---

## Error Handling

- **AM API auth failure:** Re-authenticate on 401. Show user-friendly error if credentials are wrong.
- **AM API empty responses:** Handle gracefully — "No auctions found" / "No items in this auction."
- **Anthropic API errors:** Catch and display. Common issues: rate limits (429), context too long (reduce item count).
- **Canva MCP failures:** The tool result block may contain error text. Parse and surface to the user. Common: auth issues with Canva connector.
- **Timeouts:** The generate call may take 15-30 seconds. Use streaming or a generous timeout (60s). Show progress indicator.

---

## File Structure

```
app/
  page.tsx                    # Auction list (home)
  auction/
    [id]/
      page.tsx                # Auction detail + generate
  api/
    auctions/
      route.ts                # AM API proxy — auctions
    items/
      route.ts                # AM API proxy — items
    generate/
      route.ts                # Anthropic + Canva MCP call
lib/
  amapi.ts                    # AM API auth + fetch utility
  types.ts                    # TypeScript interfaces for Auction, Item, etc.
  prompts.ts                  # buildDesignPrompt and related functions
```

---

## TypeScript Interfaces (`lib/types.ts`)

```typescript
export interface Auction {
  id: number;
  title: string;
  description: string;
  start_time: number;
  end_time: number;
  starts: string;  // ISO 8601
  ends: string;    // ISO 8601
  status: string;
  published: number;
  address: string;
  city: string;
  state: string;
  zip: string;
  timezone: string;
  buyer_premium: number;
  announcement: string;
  terms: string;
  created_date: string;
  updated_date: string;
}

export interface Item {
  id: number;
  title: string;
  lot_number: string;
  description: string;
  starting_bid: number;
  reserve_price: number;
  quantity: number;
  featured: number;
  buy_now: string;
  category: number;
  videos: string;
  documents: { title: string; url: string }[];
}

export interface GenerateRequest {
  auction: Auction;
  items: Item[];
  designType: string;
}

export interface GenerateResponse {
  copy: string;
  designs: any[];
  toolCalls: { name: string; input: any }[];
}
```
