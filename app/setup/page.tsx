'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function SetupContent() {
  const searchParams = useSearchParams();
  const connected = searchParams.get('connected') === 'true';
  const error     = searchParams.get('error');

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center pt-16 px-4">
      <div className="w-full max-w-2xl space-y-6 pb-16">

        <div>
          <h1 className="text-2xl font-bold text-gray-900">Setup</h1>
          <p className="mt-1 text-sm text-gray-500">
            Two one-time steps: connect Canva, then connect Canva MCP so Claude can design graphics.
          </p>
        </div>

        {connected && (
          <div className="rounded-xl bg-green-50 border border-green-200 p-5">
            <p className="font-semibold text-green-800">Canva Connect API authorized!</p>
            <p className="text-sm text-green-700 mt-1">
              Step 1 is done. Continue to Step 2 below to enable AI graphic generation.
            </p>
          </div>
        )}
        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-5">
            <p className="font-semibold text-red-800">Authorization failed</p>
            <p className="text-sm text-red-700 mt-1 break-all">{decodeURIComponent(error)}</p>
          </div>
        )}

        {/* ── Step 1: Canva Connect API ───────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">1</span>
            <h2 className="font-semibold text-gray-900">Authorize Canva Connect API</h2>
          </div>

          <p className="text-sm text-gray-600 pl-10">
            Make sure <code className="bg-gray-100 px-1 rounded">CANVA_CLIENT_ID</code>,{' '}
            <code className="bg-gray-100 px-1 rounded">CANVA_CLIENT_SECRET</code>, and{' '}
            <code className="bg-gray-100 px-1 rounded">APP_URL</code> are set in Vercel, then click:
          </p>

          <div className="pl-10">
            <a
              href="/api/auth/canva"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#7D2AE8] hover:bg-[#6a24c7] text-white text-sm font-semibold rounded-lg transition-colors"
            >
              Authorize with Canva
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        </div>

        {/* ── Step 2: Canva MCP ───────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <div className="flex items-center gap-3">
            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">2</span>
            <h2 className="font-semibold text-gray-900">Connect Canva MCP (enables AI design generation)</h2>
          </div>

          <p className="text-sm text-gray-600 pl-10">
            Canva&apos;s MCP server only allows <code className="bg-gray-100 px-1 rounded">localhost</code>{' '}
            as a redirect URI. You authorize it once from your Mac using{' '}
            <code className="bg-gray-100 px-1 rounded">mcp-remote</code>, then extract the
            credentials and paste them into Vercel. This lets the server refresh the token
            indefinitely.
          </p>

          <ol className="pl-10 space-y-4 text-sm text-gray-700">
            <li>
              <p className="font-medium text-gray-900">2a — Authenticate (run in Terminal)</p>
              <pre className="mt-1.5 bg-gray-900 text-green-400 rounded-lg px-4 py-3 text-xs overflow-x-auto leading-relaxed">
                {`npx mcp-remote@latest https://mcp.canva.com/mcp`}
              </pre>
              <p className="mt-1.5 text-gray-500 text-xs">
                A browser tab opens. Log in with Canva and click Allow. Come back to the terminal
                and press Ctrl-C once you see a connection message.
              </p>
            </li>

            <li>
              <p className="font-medium text-gray-900">2b — Extract credentials (same Terminal)</p>
              <pre className="mt-1.5 bg-gray-900 text-green-400 rounded-lg px-4 py-3 text-xs overflow-x-auto leading-relaxed">
                {`cd /path/to/auction-announcement-generator
node scripts/extract-mcp-creds.mjs`}
              </pre>
              <p className="mt-1.5 text-gray-500 text-xs">
                This prints three lines like{' '}
                <code className="bg-gray-100 px-1 rounded">CANVA_MCP_CLIENT_ID=...</code>
              </p>
            </li>

            <li>
              <p className="font-medium text-gray-900">2c — Add to Vercel</p>
              <p className="mt-1 text-gray-600">
                In Vercel → Settings → Environment Variables, add all three values:{' '}
                <code className="bg-gray-100 px-1 rounded">CANVA_MCP_CLIENT_ID</code>,{' '}
                <code className="bg-gray-100 px-1 rounded">CANVA_MCP_CLIENT_SECRET</code>, and{' '}
                <code className="bg-gray-100 px-1 rounded">CANVA_MCP_REFRESH_TOKEN</code>.
                Then redeploy.
              </p>
            </li>
          </ol>

          <div className="pl-10 bg-blue-50 rounded-lg p-4 text-sm text-blue-800 space-y-1">
            <p className="font-medium">How it works after setup</p>
            <p>
              The app refreshes the Canva MCP access token automatically on each generate
              request using the stored refresh token. You only run the mcp-remote step once —
              unless the refresh token is invalidated (e.g. you revoke access in Canva).
            </p>
          </div>
        </div>

        <div className="text-center">
          <a href="/" className="text-sm text-gray-500 hover:text-gray-800 underline">
            ← Back to auctions
          </a>
        </div>
      </div>
    </div>
  );
}

export default function SetupPage() {
  return (
    <Suspense>
      <SetupContent />
    </Suspense>
  );
}
