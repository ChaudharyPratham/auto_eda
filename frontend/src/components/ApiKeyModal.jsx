import { useState } from 'react'

export default function ApiKeyModal({ apiKey, fileId, onClose }) {
  const [copied, setCopied] = useState(false)

  function copy() {
    navigator.clipboard.writeText(apiKey).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-lg w-full">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-3xl">🔑</span>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Your Dataset API Key</h2>
            <p className="text-xs text-gray-400">Generated uniquely for this upload</p>
          </div>
        </div>

        <div className="mb-4 p-3 bg-amber-50 border border-amber-300 rounded-xl text-sm text-amber-800">
          ⚠️ <strong>Save this key now</strong> — it won't be shown again. It's required to access your data via the API.
        </div>

        <div className="flex gap-2 mb-4">
          <code className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono text-gray-800 break-all select-all">
            {apiKey}
          </code>
          <button
            onClick={copy}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors flex-shrink-0
              ${copied ? 'bg-green-100 text-green-700' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>

        <div className="mb-5 p-3 bg-gray-50 rounded-xl text-xs font-mono text-gray-500 space-y-1">
          <p className="font-semibold text-gray-600 mb-1 font-sans text-[11px]">Access your data externally:</p>
          <p>GET /api/data/{fileId || '<file_id>'}</p>
          <p>{'  '}Header: <span className="text-blue-600">X-API-Key: {apiKey}</span></p>
          <p className="mt-1">Optional params: ?page=1&amp;page_size=100&amp;columns=col1,col2</p>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm transition-colors"
        >
          I've saved my key — Continue →
        </button>
      </div>
    </div>
  )
}
