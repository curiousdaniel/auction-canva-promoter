'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Auction } from '@/lib/types';

type StatusFilter = 'all' | 'active' | 'closed' | 'draft';

function statusBadge(status: string) {
  const s = status?.toLowerCase();
  if (s === 'active' || s === 'open')
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
        Active
      </span>
    );
  if (s === 'closed' || s === 'ended')
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
        Closed
      </span>
    );
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
      Draft
    </span>
  );
}

function formatDate(iso: string) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export default function HomePage() {
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/auctions?limit=50');
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setAuctions(data.auctions || []);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load auctions');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filtered = auctions.filter((a) => {
    const matchesSearch =
      !search ||
      a.title?.toLowerCase().includes(search.toLowerCase()) ||
      a.city?.toLowerCase().includes(search.toLowerCase());

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' &&
        (a.status?.toLowerCase() === 'active' || a.status?.toLowerCase() === 'open')) ||
      (statusFilter === 'closed' &&
        (a.status?.toLowerCase() === 'closed' || a.status?.toLowerCase() === 'ended')) ||
      (statusFilter === 'draft' &&
        a.status?.toLowerCase() !== 'active' &&
        a.status?.toLowerCase() !== 'open' &&
        a.status?.toLowerCase() !== 'closed' &&
        a.status?.toLowerCase() !== 'ended');

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Auction Announcement Generator</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Select an auction to generate marketing materials
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <input
            type="text"
            placeholder="Search auctions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <div className="flex gap-2">
            {(['all', 'active', 'closed', 'draft'] as StatusFilter[]).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-4 py-2.5 rounded-lg text-sm font-medium capitalize transition-colors ${
                  statusFilter === s
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-24 text-gray-400">
            <svg className="animate-spin h-6 w-6 mr-3" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Loading auctions...
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-red-700 text-sm">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Empty */}
        {!loading && !error && filtered.length === 0 && (
          <div className="text-center py-24 text-gray-400">
            <p className="text-lg font-medium">No auctions found</p>
            <p className="text-sm mt-1">Try adjusting your filters.</p>
          </div>
        )}

        {/* Auction grid */}
        {!loading && !error && filtered.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((auction) => (
              <Link
                key={auction.id}
                href={`/auction/${auction.id}`}
                className="group bg-white rounded-xl border border-gray-200 p-5 hover:border-blue-400 hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <h2 className="text-base font-semibold text-gray-900 group-hover:text-blue-700 leading-snug flex-1 mr-2">
                    {auction.title || 'Untitled Auction'}
                  </h2>
                  {statusBadge(auction.status)}
                </div>

                <div className="space-y-1 text-sm text-gray-500">
                  <div className="flex items-center gap-1.5">
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span>
                      {formatDate(auction.starts)}
                      {auction.ends ? ` – ${formatDate(auction.ends)}` : ''}
                    </span>
                  </div>
                  {(auction.city || auction.state) && (
                    <div className="flex items-center gap-1.5">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span>
                        {[auction.city, auction.state].filter(Boolean).join(', ')}
                      </span>
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
                  <span>ID #{auction.id}</span>
                  <span className="text-blue-600 font-medium group-hover:underline">
                    Generate →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
