export interface Auction {
  id: number;
  title: string;
  description: string;
  start_time: number;
  end_time: number;
  starts: string;
  ends: string;
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

export interface CanvaDesignResult {
  edit_url: string;
  view_url: string;
  design_id: string;
  title: string;
}

export interface GenerateResponse {
  copy: string;
  canvaEditUrl: string | null;
  canvaError?: string;
}
