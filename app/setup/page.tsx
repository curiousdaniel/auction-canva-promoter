'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function SetupContent() {
  const searchParams = useSearchParams();
  const connected = searchParams.get('connected') === 'true';
  const error     = searchParams.get('error');

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center pt-20 px-4">
      <div className="w-full max-w-lg space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Canva Setup</h1>
          <p className="mt-1 text-sm text-gray-500">
            Connect your Canva account so the app can create blank designs automatically.
          </p>
        </div>

        {/* Success */}
        {connected && (
          <div className="rounded-xl bg-green-50 border border-green-200 p-5">
            <p className="font-semibold text-green-800">Canva connected!</p>
            <p className="text-sm text-green-700 mt-1">
              Your Canva account is now linked. Generating an announcement will produce
              marketing copy <em>and</em> open a ready-to-edit Canva design at the right
              dimensions for your chosen format.
            </p>
            <a
              href="/"
              className="mt-3 inline-block text-sm text-green-800 underline font-medium"
            >
              ← Back to auctions
            </a>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-5">
            <p className="font-semibold text-red-800">Authorization failed</p>
            <p className="text-sm text-red-700 mt-1 break-all">{decodeURIComponent(error)}</p>
          </div>
        )}

        {/* Step 1 — Canva App credentials */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">
              1
            </span>
            <h2 className="font-semibold text-gray-900">Set Canva credentials in Vercel</h2>
          </div>
          <p className="text-sm text-gray-600 pl-10">
            In your{' '}
            <a
              href="https://www.canva.com/developers/apps"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline"
            >
              Canva Developer Portal
            </a>
            , find your integration and copy the <strong>Client ID</strong> and{' '}
            <strong>Client Secret</strong>. Add them to your Vercel project as:
          </p>
          <ul className="pl-10 text-sm space-y-1 font-mono text-gray-700 list-disc list-inside">
            <li>CANVA_CLIENT_ID</li>
            <li>CANVA_CLIENT_SECRET</li>
          </ul>
          <p className="text-sm text-gray-600 pl-10">
            Also confirm <code className="bg-gray-100 px-1 rounded">APP_URL</code> is set to{' '}
            <code className="bg-gray-100 px-1 rounded">https://auction-canva-promoter.vercel.app</code>{' '}
            and that your Canva app&apos;s allowed redirect URL includes:{' '}
            <code className="bg-gray-100 px-1 rounded text-xs">
              https://auction-canva-promoter.vercel.app/api/auth/canva/callback
            </code>
          </p>
        </div>

        {/* Step 2 — Authorize */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">
              2
            </span>
            <h2 className="font-semibold text-gray-900">Authorize with Canva</h2>
          </div>
          <p className="text-sm text-gray-600 pl-10">
            Click below to log in with Canva and grant the app permission to create designs
            on your behalf. You only need to do this once (tokens are stored and rotated
            automatically).
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

        {/* Note about automated design generation */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-800 space-y-2">
          <p className="font-semibold">About automated design generation</p>
          <p>
            Currently the app generates <strong>marketing copy</strong> with Claude and creates a
            <strong> blank Canva canvas</strong> at the right dimensions for your chosen format.
            You paste the copy into the design in Canva.
          </p>
          <p>
            Full AI-driven design generation (where Claude lays out the graphic inside Canva) requires
            the <strong>Canva MCP server</strong>, which needs Canva to allowlist your production domain.
            Submit the{' '}
            <a
              href="https://docs.google.com/forms/d/1jgC4vAA2-5LqaNzVhnP8ygSknF4Vysc1UzAWJukzcp0/viewform"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-medium"
            >
              Canva intake form
            </a>{' '}
            to request approval (5–7 business days).
          </p>
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
