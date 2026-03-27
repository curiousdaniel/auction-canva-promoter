'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { Auction, Item, GenerateResponse } from '@/lib/types';
import { DESIGN_TYPES } from '@/lib/prompts';

function formatDate(iso: string) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function stripHtml(html: string) {
  return html?.replace(/<[^>]*>/g, '') || '';
}

export default function AuctionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [auction, setAuction] = useState<Auction | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [designType, setDesignType] = useState('instagram_post');

  const [generating, setGenerating] = useState(false);
  const [generatingDesign, setGeneratingDesign] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const loadData = useCallback(async () => {
    setLoadingData(true);
    setDataError(null);
    try {
      const [auctionRes, itemsRes] = await Promise.all([
        fetch(`/api/auctions?auction=${id}`),
        fetch(`/api/items?auction=${id}&limit=100`),
      ]);

      const auctionData = await auctionRes.json();
      const itemsData = await itemsRes.json();

      if (auctionData.error) throw new Error(auctionData.error);
      if (itemsData.error) throw new Error(itemsData.error);

      const auctionObj: Auction = Array.isArray(auctionData.auctions)
        ? auctionData.auctions[0]
        : auctionData.auction || auctionData;

      // API nests items under data.items; normalize field names to match our types
      const rawItems: Record<string, unknown>[] =
        itemsData.data?.items || itemsData.items || [];
      const itemList: Item[] = rawItems.map((i) => ({
        ...(i as unknown as Item),
        id: Number(i.id),
        starting_bid: Number(i.starting_bid ?? i.minimum_bid ?? 0),
        featured: Number(i.featured ?? 0),
        quantity: Number(i.quantity ?? 1),
        reserve_price: Number(i.reserve_price ?? 0),
      }));

      setAuction(auctionObj);
      setItems(itemList);

      // Pre-select featured items
      const featuredIds = new Set(
        itemList.filter((i) => i.featured === 1).map((i) => i.id)
      );
      setSelectedItems(featuredIds.size > 0 ? featuredIds : new Set(itemList.slice(0, 5).map((i) => i.id)));
    } catch (e) {
      setDataError(e instanceof Error ? e.message : 'Failed to load auction data');
    } finally {
      setLoadingData(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function toggleItem(itemId: number) {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function selectAll() {
    setSelectedItems(new Set(items.map((i) => i.id)));
  }

  function selectFeatured() {
    const featured = items.filter((i) => i.featured === 1);
    if (featured.length > 0) setSelectedItems(new Set(featured.map((i) => i.id)));
  }

  function clearAll() {
    setSelectedItems(new Set());
  }

  async function handleGenerate() {
    if (!auction || selectedItems.size === 0) return;
    setGenerating(true);
    setGeneratingDesign(false);
    setGenerateError(null);
    setResult(null);

    try {
      const selectedItemList = items.filter((i) => selectedItems.has(i.id));

      // Step 1: Claude generates copy + design brief (~8s)
      const copyRes = await fetch('/api/generate/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auction, items: selectedItemList, designType }),
      });

      let copyData: { copy?: string; designBrief?: string; error?: string };
      try {
        copyData = await copyRes.json();
      } catch {
        throw new Error(`Server error (${copyRes.status}): timeout or unexpected response`);
      }
      if (copyData.error) throw new Error(copyData.error);

      // Show copy immediately
      setResult({ copy: copyData.copy ?? '', canvaEditUrl: null });
      setGenerating(false);

      // Step 2: Canva MCP generates the real design (~30s)
      if (copyData.designBrief) {
        setGeneratingDesign(true);
        try {
          const designRes = await fetch('/api/generate/design', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              designBrief: copyData.designBrief,
              designType,
              designTitle: auction?.title,
            }),
          });

          let designData: { canvaEditUrl?: string; error?: string };
          try {
            designData = await designRes.json();
          } catch {
            designData = { error: `Design server error (${designRes.status}): timeout or unexpected response` };
          }

          setResult((prev) => ({
            copy: prev?.copy ?? '',
            canvaEditUrl: designData.canvaEditUrl ?? null,
            canvaError: designData.error,
          }));
        } finally {
          setGeneratingDesign(false);
        }
      }
    } catch (e) {
      setGenerateError(e instanceof Error ? e.message : 'Generation failed');
      setGenerating(false);
      setGeneratingDesign(false);
    }
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  }

  if (loadingData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">
        <svg className="animate-spin h-6 w-6 mr-3" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        Loading auction...
      </div>
    );
  }

  if (dataError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="rounded-lg bg-red-50 border border-red-200 p-6 text-red-700 max-w-md">
            <p className="font-semibold mb-1">Error loading auction</p>
            <p className="text-sm">{dataError}</p>
          </div>
          <button
            onClick={() => router.push('/')}
            className="mt-4 text-sm text-blue-600 hover:underline"
          >
            ← Back to auctions
          </button>
        </div>
      </div>
    );
  }

  if (!auction) return null;

  const location = [auction.address, auction.city, auction.state, auction.zip]
    .filter(Boolean)
    .join(', ');
  const featuredCount = items.filter((i) => i.featured === 1).length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => router.push('/')}
            className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            All Auctions
          </button>
          <span className="text-gray-300">/</span>
          <h1 className="text-base font-semibold text-gray-900 truncate">{auction.title}</h1>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column: auction info + items */}
          <div className="lg:col-span-2 space-y-6">
            {/* Auction Summary */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">{auction.title}</h2>
              <div className="grid grid-cols-2 gap-y-3 text-sm">
                <div>
                  <span className="text-gray-400 text-xs uppercase tracking-wide">Start</span>
                  <p className="text-gray-800 font-medium mt-0.5">{formatDate(auction.starts)}</p>
                </div>
                <div>
                  <span className="text-gray-400 text-xs uppercase tracking-wide">End</span>
                  <p className="text-gray-800 font-medium mt-0.5">{formatDate(auction.ends)}</p>
                </div>
                {location && (
                  <div className="col-span-2">
                    <span className="text-gray-400 text-xs uppercase tracking-wide">Location</span>
                    <p className="text-gray-800 font-medium mt-0.5">{location}</p>
                  </div>
                )}
                <div>
                  <span className="text-gray-400 text-xs uppercase tracking-wide">Total Items</span>
                  <p className="text-gray-800 font-medium mt-0.5">{items.length}</p>
                </div>
                <div>
                  <span className="text-gray-400 text-xs uppercase tracking-wide">Featured Items</span>
                  <p className="text-gray-800 font-medium mt-0.5">{featuredCount}</p>
                </div>
                {auction.buyer_premium > 0 && (
                  <div>
                    <span className="text-gray-400 text-xs uppercase tracking-wide">Buyer Premium</span>
                    <p className="text-gray-800 font-medium mt-0.5">{auction.buyer_premium}%</p>
                  </div>
                )}
              </div>
              {auction.description && (
                <p className="mt-4 text-sm text-gray-600 leading-relaxed border-t border-gray-100 pt-4">
                  {stripHtml(auction.description).slice(0, 300)}
                  {auction.description.length > 300 ? '…' : ''}
                </p>
              )}
            </div>

            {/* Item List */}
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">
                  Items{' '}
                  <span className="text-gray-400 font-normal text-sm">
                    ({selectedItems.size} selected)
                  </span>
                </h3>
                <div className="flex gap-2 text-xs">
                  {featuredCount > 0 && (
                    <button
                      onClick={selectFeatured}
                      className="text-blue-600 hover:underline"
                    >
                      Featured only
                    </button>
                  )}
                  <button onClick={selectAll} className="text-blue-600 hover:underline">
                    All
                  </button>
                  <button onClick={clearAll} className="text-gray-400 hover:underline">
                    None
                  </button>
                </div>
              </div>

              {items.length === 0 ? (
                <p className="px-6 py-8 text-center text-sm text-gray-400">
                  No items in this auction.
                </p>
              ) : (
                <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
                  {items.map((item) => (
                    <label
                      key={item.id}
                      className="flex items-start gap-3 px-6 py-3 hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedItems.has(item.id)}
                        onChange={() => toggleItem(item.id)}
                        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900 truncate">
                            {item.lot_number ? `Lot ${item.lot_number}: ` : ''}
                            {item.title}
                          </span>
                          {item.featured === 1 && (
                            <span className="inline-flex items-center px-1.5 py-0 rounded text-xs font-medium bg-blue-50 text-blue-700">
                              Featured
                            </span>
                          )}
                        </div>
                        {item.starting_bid > 0 && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            Starting bid: ${item.starting_bid.toLocaleString()}
                          </p>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right column: Generate controls + results */}
          <div className="space-y-6">
            {/* Generate Panel */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Generate Announcement</h3>

              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  Design Type
                </label>
                <div className="space-y-1.5">
                  {DESIGN_TYPES.map((dt) => (
                    <label
                      key={dt.value}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                        designType === dt.value
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="designType"
                        value={dt.value}
                        checked={designType === dt.value}
                        onChange={() => setDesignType(dt.value)}
                        className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-800">{dt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {selectedItems.size === 0 && (
                <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mb-3">
                  Select at least one item to include in the announcement.
                </p>
              )}

              <button
                onClick={handleGenerate}
                disabled={generating || generatingDesign || selectedItems.size === 0}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {generating ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Writing copy…
                  </>
                ) : (
                  'Generate Announcement'
                )}
              </button>

              {generating && (
                <p className="text-xs text-gray-400 text-center mt-2">
                  Step 1 of 2 — writing marketing copy (~10 s)
                </p>
              )}
              {generatingDesign && (
                <div className="mt-3 flex items-center gap-2 text-xs text-purple-600">
                  <svg className="animate-spin h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Step 2 of 2 — creating Canva design (~30 s)…
                </div>
              )}
            </div>

            {/* Generate Error */}
            {generateError && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-red-700 text-sm">
                <p className="font-semibold mb-1">Generation failed</p>
                <p>{generateError}</p>
              </div>
            )}
          </div>
        </div>

        {/* Results */}
        {result && (
          <div className="mt-8 space-y-6">
            <h3 className="text-lg font-bold text-gray-900">Generated Announcement</h3>

            {/* Marketing Copy */}
            {result.copy && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-gray-900 text-sm">Marketing Copy</h4>
                  <button
                    onClick={() => copyToClipboard(result.copy)}
                    className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 transition-colors"
                  >
                    {copied ? (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Copied!
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Copy text
                      </>
                    )}
                  </button>
                </div>
                <pre className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed font-sans bg-gray-50 rounded-lg p-4">
                  {result.copy}
                </pre>
              </div>
            )}

            {/* Canva Design */}
            {generatingDesign && (
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-5 flex items-center gap-3 text-sm text-purple-700">
                <svg className="animate-spin h-5 w-5 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Creating your Canva design — this takes up to 30 seconds…
              </div>
            )}

            {!generatingDesign && result.canvaEditUrl ? (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h4 className="font-semibold text-gray-900 text-sm mb-1">Canva Design Created</h4>
                <p className="text-xs text-gray-500 mb-4">
                  Claude designed this graphic in your Canva account using the details above.
                  Click to open and make any final tweaks.
                </p>
                <a
                  href={result.canvaEditUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#7D2AE8] hover:bg-[#6a24c7] text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  Open design in Canva
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            ) : !generatingDesign && result.canvaError ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
                <p className="font-medium">Canva design failed</p>
                <p className="mt-2 font-mono text-xs text-amber-700 break-all">{result.canvaError}</p>
              </div>
            ) : !generatingDesign && result.copy ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
                <p className="font-medium">Canva design not created</p>
                <p className="mt-1 text-amber-700">
                  The Canva MCP credentials may not be configured yet. Visit{' '}
                  <a href="/setup" className="underline font-medium">/setup</a>{' '}
                  for instructions, then try again.
                </p>
              </div>
            ) : null}

          </div>
        )}
      </main>
    </div>
  );
}
