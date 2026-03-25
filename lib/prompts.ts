import type { Auction, Item } from './types';

export const DESIGN_TYPES: { value: string; label: string }[] = [
  { value: 'instagram_post', label: 'Instagram Post' },
  { value: 'facebook_post', label: 'Facebook Post' },
  { value: 'twitter_post', label: 'Twitter/X Post' },
  { value: 'your_story', label: 'Instagram/Facebook Story' },
  { value: 'flyer', label: 'Flyer' },
  { value: 'poster', label: 'Poster' },
  { value: 'facebook_cover', label: 'Facebook Cover' },
];

export function buildDesignPrompt(auction: Auction, items: Item[], designType: string): string {
  const featuredItems = items.filter((i) => i.featured === 1).slice(0, 5);
  const itemSummary =
    featuredItems.length > 0
      ? featuredItems.map((i) => `- ${i.title} (Starting bid: $${i.starting_bid})`).join('\n')
      : items.slice(0, 5).map((i) => `- ${i.title}`).join('\n');

  const location = [auction.address, auction.city, auction.state, auction.zip]
    .filter(Boolean)
    .join(', ');

  return `You are a marketing designer for an auction company. Generate a ${designType} design in Canva for the following auction:

AUCTION DETAILS:
- Title: ${auction.title}
- Date: ${auction.starts} to ${auction.ends}
- Location: ${location || 'Online'}
- Description: ${auction.description || 'Not provided'}
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
