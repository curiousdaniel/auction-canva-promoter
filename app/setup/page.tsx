'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import Link from 'next/link';

function SetupContent() {
  const searchParams = useSearchParams();
  const connected = searchParams.get('connected') === 'true';
  const error = searchParams.get('error');

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-6 py-5 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Canva Setup</h1>
            <p className="text-sm text-gray-500 mt-0.5">One-time connection to your Canva account</p>
          </div>
          <Link href="/" className="text-sm text-blue-600 hover:underline">
            ← Back to auctions
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10 space-y-6">

        {/* Error state */}
        {error && !connected && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-5">
            <p className="font-semibold text-red-700 mb-1">Authorization failed</p>
            <p className="text-sm text-red-600 font-mono break-all">{decodeURIComponent(error)}</p>
            <a href="/api/auth/canva" className="mt-4 inline-block text-sm text-red-700 underline">
              Try again
            </a>
          </div>
        )}

        {/* Success */}
        {connected && (
          <div className="rounded-xl bg-green-50 border border-green-200 p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex-shrink-0 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-green-800">Canva connected successfully!</p>
                <p className="text-sm text-green-700 mt-1">
                  Your refresh token has been saved automatically. The app will keep it up to date — you don&apos;t need to do anything else.
                </p>
              </div>
            </div>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-green-300 text-green-800 text-sm font-medium rounded-lg hover:bg-green-50 transition-colors"
            >
              ← Go generate announcements
            </Link>
          </div>
        )}

        {/* Default: not yet connected */}
        {!connected && !error && (
          <>
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
              <h2 className="font-semibold text-gray-900">Connect your Canva account</h2>
              <p className="text-sm text-gray-600 leading-relaxed">
                This app uses Canva to generate announcement graphics. You only need to do this
                once. Your credentials will be stored securely and refreshed automatically.
              </p>

              <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
                <p className="font-semibold mb-1">Before you click — verify these are set in Vercel:</p>
                <ul className="list-disc list-inside space-y-0.5 text-amber-700">
                  <li><code className="font-mono">CANVA_CLIENT_ID</code></li>
                  <li><code className="font-mono">CANVA_CLIENT_SECRET</code></li>
                  <li>
                    <code className="font-mono">APP_URL</code> — e.g.{' '}
                    <code className="font-mono">https://auction-canva-promoter.vercel.app</code>
                  </li>
                </ul>
                <p className="mt-2">
                  Also make sure{' '}
                  <code className="font-mono text-xs">APP_URL/api/auth/canva/callback</code> is
                  registered as a redirect URI in your Canva Developer Portal app.
                </p>
              </div>

              <a
                href="/api/auth/canva"
                className="inline-flex items-center gap-2 px-5 py-3 bg-[#7D2AE8] hover:bg-[#6a24c7] text-white text-sm font-semibold rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18a8 8 0 100-16 8 8 0 000 16z" opacity=".3"/>
                  <path d="M12 6a6 6 0 100 12A6 6 0 0012 6z"/>
                </svg>
                Authorize with Canva
              </a>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="font-semibold text-gray-900 mb-3 text-sm">
                Where to get your Canva credentials
              </h3>
              <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600">
                <li>
                  Go to the{' '}
                  <a href="https://www.canva.com/developers/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                    Canva Developer Portal
                  </a>.
                </li>
                <li>Create or open an integration under <strong>Canva Connect</strong>.</li>
                <li>Copy the <strong>Client ID</strong> → save as <code className="font-mono bg-gray-100 px-1 rounded">CANVA_CLIENT_ID</code>.</li>
                <li>Generate a <strong>Client Secret</strong> → save as <code className="font-mono bg-gray-100 px-1 rounded">CANVA_CLIENT_SECRET</code>.</li>
                <li>
                  Under <strong>Authentication → Redirect URLs</strong>, add:{' '}
                  <code className="font-mono bg-gray-100 px-1 rounded text-xs">
                    https://auction-canva-promoter.vercel.app/api/auth/canva/callback
                  </code>
                </li>
                <li>Set <code className="font-mono bg-gray-100 px-1 rounded">APP_URL</code> in Vercel to your deployment URL.</li>
              </ol>
            </div>
          </>
        )}
      </main>
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
