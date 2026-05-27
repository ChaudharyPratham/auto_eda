import { useState } from 'react'
import { getCleanedDownloadUrl, getReportDownloadUrl } from '../services/api'

export default function DownloadPanel({ fileId, fileData }) {
  const [apiKey, setApiKey]   = useState(null)
  const [genLoad, setGenLoad] = useState(false)
  const [copied,  setCopied]  = useState(false)

  function triggerDownload(url, filename) {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  async function generateKey() {
    setGenLoad(true)
    try {
      const res = await fetch(`/api/key/${fileId}/regenerate`, { method: 'POST' })
      const json = await res.json()
      setApiKey(json.data?.api_key || json.api_key)
    } catch {
      setApiKey(null)
    } finally {
      setGenLoad(false)
    }
  }

  function copyKey() {
    if (!apiKey) return
    navigator.clipboard.writeText(apiKey).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-5">
      {/* ── 2-per-row card grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {/* Cleaned dataset */}
        <DownloadCard
          icon="📊"
          title="Cleaned Dataset"
          description="Download the auto-cleaned dataset as a CSV file. Run the Cleaning tab first."
          buttonLabel="Download Cleaned CSV"
          buttonClass="bg-blue-600 hover:bg-blue-700"
          onClick={() => triggerDownload(getCleanedDownloadUrl(fileId), `cleaned_${fileId}.csv`)}
        />

        {/* Analysis report */}
        <DownloadCard
          icon="📋"
          title="Analysis Report"
          description="Download the full analysis results (shape, stats, outliers, correlations) as JSON."
          buttonLabel="Download Report JSON"
          buttonClass="bg-indigo-600 hover:bg-indigo-700"
          onClick={() => triggerDownload(getReportDownloadUrl(fileId), `report_${fileId}.json`)}
        />

        {/* API key card */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col col-span-1 sm:col-span-2 lg:col-span-1">
          <div className="text-4xl mb-3">🔑</div>
          <h3 className="font-bold text-gray-900 mb-1">Dataset API Key</h3>
          <p className="text-gray-500 text-sm mb-4 flex-1">
            Generate an API key to access this dataset externally via{' '}
            <code className="bg-gray-100 px-1 rounded text-xs">GET /api/data/{fileId}</code>.
          </p>

          {/* Key display */}
          {apiKey ? (
            <div className="mb-3 space-y-2">
              <div className="flex gap-2">
                <code className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-mono text-gray-800 break-all select-all">
                  {apiKey}
                </code>
                <button
                  onClick={copyKey}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors flex-shrink-0
                    ${copied ? 'bg-green-100 text-green-700' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
                >
                  {copied ? '✓' : 'Copy'}
                </button>
              </div>
              <p className="text-[11px] text-amber-600">
                ⚠️ Save this key — it won't be shown again after you leave this page.
              </p>
              <p className="text-[11px] text-gray-400 font-mono">
                Header: <span className="text-blue-600">X-API-Key: {apiKey}</span>
              </p>
            </div>
          ) : null}

          <button
            onClick={generateKey}
            disabled={genLoad}
            className="w-full py-2.5 rounded-xl text-white font-semibold text-sm transition-colors bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60"
          >
            {genLoad ? 'Generating…' : apiKey ? 'Regenerate Key' : 'Generate API Key'}
          </button>
        </div>
      </div>

      {/* ── File info strip ── */}
      {fileData && (
        <div className="bg-blue-50 border border-blue-100 rounded-2xl px-5 py-4">
          <h4 className="text-sm font-semibold text-blue-800 mb-3">Uploaded File</h4>
          <div className="flex flex-wrap gap-6 text-sm">
            <InfoItem label="Name"   value={fileData.filename} />
            <InfoItem label="Size"   value={`${fileData.size_mb} MB`} />
            <InfoItem label="Format" value={fileData.extension} />
            <InfoItem label="Engine" value={fileData.engine} />
          </div>
        </div>
      )}
    </div>
  )
}

function DownloadCard({ icon, title, description, buttonLabel, buttonClass, onClick }) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col">
      <div className="text-4xl mb-3">{icon}</div>
      <h3 className="font-bold text-gray-900 mb-1">{title}</h3>
      <p className="text-gray-500 text-sm mb-6 flex-1">{description}</p>
      <button
        onClick={onClick}
        className={`w-full py-2.5 rounded-xl text-white font-semibold text-sm transition-colors ${buttonClass}`}
      >
        {buttonLabel}
      </button>
    </div>
  )
}

function InfoItem({ label, value }) {
  return (
    <div>
      <span className="text-blue-600 font-medium">{label}:</span>{' '}
      <span className="text-gray-700">{value}</span>
    </div>
  )
}
