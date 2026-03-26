import type { Auction, Item } from './types';

export const DESIGN_TYPES: { value: string; label: string; dimensions: string }[] = [
  { value: 'instagram_post',   label: 'Instagram Post',          dimensions: '1080×1080 px (square)' },
  { value: 'facebook_post',    label: 'Facebook Post',           dimensions: '1200×628 px (landscape)' },
  { value: 'twitter_post',     label: 'Twitter/X Post',          dimensions: '1600×900 px (landscape)' },
  { value: 'your_story',       label: 'Instagram/Facebook Story',dimensions: '1080×1920 px (vertical)' },
  { value: 'flyer',            label: 'Flyer',                   dimensions: 'US Letter (portrait)' },
  { value: 'poster',           label: 'Poster',                  dimensions: 'A3 (portrait)' },
  { value: 'facebook_cover',   label: 'Facebook Cover',          dimensions: '820×312 px (wide banner)' },
];

export function buildDesignPrompt(auction: Auction, items: Item[], designType: string): string {
  const typeInfo = DESIGN_TYPES.find((d) => d.value === designType);
  const typeLabel = typeInfo?.label ?? designType;
  const typeDimensions = typeInfo?.dimensions ?? '';

  const featured = items.filter((i) => i.featured === 1).slice(0, 6);
  const showcase = (featured.length > 0 ? featured : items.slice(0, 6)).map(
    (i) => `• ${i.title}${i.starting_bid > 0 ? ` (starting $${i.starting_bid})` : ''}`
  );

  const location = [auction.city, auction.state].filter(Boolean).join(', ') || 'Online';

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
      });
    } catch {
      return iso;
    }
  };

  const dateRange =
    auction.ends
      ? `${formatDate(auction.starts)} – ${formatDate(auction.ends)}`
      : formatDate(auction.starts);

  return `You are an expert auction marketing designer. Your job is to:
1. Write compelling marketing copy for the auction below
2. Create an ACTUAL Canva design using the generate-design tool

AUCTION DETAILS:
- Title: ${auction.title}
- Dates: ${dateRange}
- Location: ${location}
- Items: ${items.length} total lots
- Buyer Premium: ${auction.buyer_premium > 0 ? `${auction.buyer_premium}%` : 'None'}

ITEMS TO HIGHLIGHT:
${showcase.join('\n')}

DESIGN SPECS:
- Format: ${typeLabel} (${typeDimensions})

STEP 1 — Write the marketing copy:
Produce a punchy headline, 2-3 sentence body copy, and a clear call-to-action for this auction. Keep it energetic and persuasive.

STEP 2 — Create the Canva design:
Use the generate-design tool to produce a ${typeLabel} graphic. Your design prompt to Canva should be detailed and visual, describing:
- A bold auction title / headline
- The auction dates and location
- 2-3 standout items with their starting bids
- A strong call-to-action ("Bid Now", "Register to Bid", etc.)
- Suggested mood: energetic, professional, trustworthy
- Color palette suggestion based on the auction theme
- Layout guidance appropriate for a ${typeLabel}

After generating the design, use create-design-from-candidate to finalize it.

In your final response, include:
- The marketing copy
- The Canva edit URL in this exact format: CANVA_URL: <url>`;
}
