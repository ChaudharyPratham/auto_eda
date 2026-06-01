/**
 * Streaming Analytics Dashboard
 * ==============================
 * Polls /api/stream/latest every 5 seconds for live KPI cards + alerts.
 * Polls /api/stream/metrics for line chart history (last 60 windows = ~1 hour).
 * Polls /api/stream/events every 5 seconds for the raw event viewer.
 * Includes API key management and an example curl snippet.
 */

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Plot from 'react-plotly.js'
import {
  getStreamLatest,
  getStreamMetrics,
  getStreamEvents,
  getApiKeys,
  createApiKey,
  deleteApiKey,
} from '../services/api'

const SERVICES = ['api', 'auth', 'payment', 'parking', 'sensor']

// ── Tiny helpers ──────────────────────────────────────────────────────────────

/**
 * KpiCard — single metric tile shown at the top of the dashboard.
 *
 * Props:
 *   label  — display name shown below the value (e.g. "Error Rate")
 *   value  — numeric or string value to display; shows '—' when null/undefined
 *   unit   — optional suffix rendered smaller next to the value (e.g. "%", "ms")
 *   color  — palette key: blue | green | red | yellow
 *   alert  — when true, adds a red ring around the card to signal a threshold breach
 */

function KpiCard({ label, value, unit = '', color = 'blue', alert = false }) {
  const palette = {
    blue:   'bg-blue-50   border-blue-100   text-blue-700',
    green:  'bg-green-50  border-green-100  text-green-700',
    red:    'bg-red-50    border-red-100    text-red-700',
    yellow: 'bg-yellow-50 border-yellow-100 text-yellow-700',
  }
  return (
    <div className={`rounded-xl border p-5 ${palette[color]} ${alert ? 'ring-2 ring-red-400' : ''}`}>
      <div className="text-3xl font-bold">
        {value ?? '—'}{unit && <span className="text-lg font-medium ml-1">{unit}</span>}
      </div>
      <div className="text-sm font-medium mt-1 opacity-80">{label}</div>
    </div>
  )
}

/**
 * AlertBanner — renders a stack of alert cards when anomaly alerts are active.
 *
 * Each alert comes from the stream_alerts PostgreSQL table (written by the
 * Spark consumer when error_rate > 30% or avg_response_time > 1000 ms).
 * The list is refreshed every 5 s via the /api/stream/latest endpoint.
 * Returns null (renders nothing) when there are no active alerts.
 */
function AlertBanner({ alerts }) {
  if (!alerts || alerts.length === 0) return null
  return (
    <div className="space-y-2 mb-6">
      {alerts.map((a) => (
        <div
          key={a.id}
          className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3"
        >
          <span className="text-red-500 text-lg mt-0.5">⚠</span>
          <div>
            <span className="font-semibold text-red-700 text-sm">{a.alert_type.replace(/_/g, ' ')}</span>
            <p className="text-red-600 text-sm mt-0.5">{a.message}</p>
            <p className="text-red-400 text-xs mt-0.5">
              {new Date(a.created_at).toLocaleTimeString()}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * LevelBadge — small pill showing the log level with semantic colour coding.
 *
 * ERROR   → red background
 * WARNING → yellow background
 * INFO    → green background
 * unknown → neutral grey
 */
function LevelBadge({ level }) {
  const map = {
    ERROR:   'bg-red-100 text-red-700',
    WARNING: 'bg-yellow-100 text-yellow-700',
    INFO:    'bg-green-100 text-green-700',
  }
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${map[level] ?? 'bg-gray-100 text-gray-600'}`}>
      {level}
    </span>
  )
}

// Common Plotly layout defaults
const baseLayout = {
  paper_bgcolor: 'transparent',
  plot_bgcolor:  'transparent',
  margin:        { t: 10, b: 50, l: 55, r: 10 },
  font:          { size: 11, color: '#374151' },
  xaxis:         { gridcolor: '#f3f4f6', tickangle: -30 },
  yaxis:         { gridcolor: '#f3f4f6' },
}

// ── Main dashboard ────────────────────────────────────────────────────────────

export default function StreamingDashboard() {
  const [latest,   setLatest]   = useState(null)
  const [alerts,   setAlerts]   = useState([])
  const [metrics,  setMetrics]  = useState([])
  const [error,    setError]    = useState(null)
  const [lastTick, setLastTick] = useState(null)

  const [serviceFilter, setServiceFilter] = useState('')
  const [events,        setEvents]        = useState([])

  const [apiKeys,      setApiKeys]      = useState([])
  const [newKeyName,   setNewKeyName]   = useState('')
  const [generatedKey, setGeneratedKey] = useState(null)
  const [keyLoading,   setKeyLoading]   = useState(false)
  const [copied,       setCopied]       = useState(false)

  // ── Fetch aggregate metrics every 30 s ─────────────────────────────────────
  // Uses /api/stream/metrics which returns pre-aggregated 1-minute windows.
  // Re-runs whenever `serviceFilter` changes so the chart reflects the new filter.
  // 30-second interval is a balance between freshness and backend load.
  useEffect(() => {
    function fetchHistory() {
      getStreamMetrics(60, serviceFilter)
        .then((r) => setMetrics(r.data.data || []))
        .catch(() => {})
    }
    fetchHistory()
    const id = setInterval(fetchHistory, 30_000)
    return () => clearInterval(id)
  }, [serviceFilter])

  // ── Fetch latest KPI + alerts every 5 s ─────────────────────────────────────
  // Polls /api/stream/latest which returns:
  //   { latest: <most recent metric row>, alerts: [unresolved alert rows] }
  // 5-second interval keeps KPI cards near real-time without hammering the DB.
  // On error, stores the message in `error` state so a warning banner appears.
  useEffect(() => {
    function fetchLatest() {
      getStreamLatest()
        .then((r) => {
          setLatest(r.data.data.latest)
          setAlerts(r.data.data.alerts || [])
          setLastTick(new Date())
          setError(null)
        })
        .catch((e) => setError(e.response?.data?.message || e.message))
    }
    fetchLatest()
    const id = setInterval(fetchLatest, 5_000)
    return () => clearInterval(id)
  }, [])

  // ── Fetch raw events every 5 s ───────────────────────────────────────────────
  // Only shows events ingested via POST /api/stream/ingest (not mock producer).
  // Re-runs on service filter change so the events table updates immediately.
  useEffect(() => {
    function fetchEvents() {
      getStreamEvents(100, serviceFilter)
        .then((r) => setEvents(r.data.data || []))
        .catch(() => {})
    }
    fetchEvents()
    const id = setInterval(fetchEvents, 5_000)
    return () => clearInterval(id)
  }, [serviceFilter])

  // ── Load API keys once on mount ──────────────────────────────────────────────
  // Keys are fetched once (not polled) because they change only on user action.
  // The list is updated optimistically in handleGenerateKey / handleDeleteKey
  // without re-fetching from the server.
  useEffect(() => {
    getApiKeys()
      .then((r) => setApiKeys(r.data.data || []))
      .catch(() => {})
  }, [])

  function handleGenerateKey(e) {
    e.preventDefault()
    if (!newKeyName.trim()) return
    setKeyLoading(true)
    createApiKey(newKeyName.trim())
      .then((r) => {
        const result = r.data.data
        setGeneratedKey(result.key)
        setNewKeyName('')
        setApiKeys((prev) => [result, ...prev])
      })
      .catch((err) => alert(err.response?.data?.detail || 'Failed to create key'))
      .finally(() => setKeyLoading(false))
  }

  function handleDeleteKey(id) {
    if (!window.confirm('Revoke this API key? Any applications using it will stop working.')) return
    deleteApiKey(id)
      .then(() => setApiKeys((prev) => prev.filter((k) => k.id !== id)))
      .catch((err) => alert(err.response?.data?.detail || 'Failed to revoke key'))
  }

  function handleCopy(text) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const xLabels          = metrics.map((m) => new Date(m.window_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
  const totalReqSeries   = metrics.map((m) => m.total_requests)
  const errorCountSeries = metrics.map((m) => m.error_count)
  const errorRateSeries  = metrics.map((m) => parseFloat(Number(m.error_rate).toFixed(1)))
  const respTimeSeries   = metrics.map((m) => parseFloat(Number(m.avg_response_time).toFixed(0)))

  const hasData   = metrics.length > 0
  const hasEvents = events.length > 0
  const curlExample = `curl -X POST http://localhost:8000/api/stream/ingest \\
  -H "X-API-Key: ${generatedKey ?? '<YOUR_KEY>'}" \\
  -H "Content-Type: application/json" \\
  -d '{"service":"api","level":"INFO","response_time":120}'`

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 flex flex-col">

      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="w-full max-w-screen-2xl mx-auto px-4 sm:px-8 py-3 flex items-center gap-3">
          <Link to="/" className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center shadow-sm hover:bg-indigo-700 transition-colors">
            <span className="text-white text-xs font-extrabold tracking-tight">EDA</span>
          </Link>
          <span className="text-xl font-bold text-gray-900">Auto EDA</span>
          <span className="text-gray-300">·</span>
          <span className="text-gray-600 font-medium text-sm">⚡ Streaming Analytics</span>
          <div className="ml-auto flex items-center gap-3 text-xs text-gray-400">
            {lastTick && (
              <span>Last update: <span className="text-gray-600 font-medium">{lastTick.toLocaleTimeString()}</span></span>
            )}
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" title="Live" />
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-screen-2xl mx-auto px-4 sm:px-8 py-8 space-y-8">

        {/* Error notice */}
        {error && (
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl text-yellow-700 text-sm">
            ⚠ Could not reach streaming API: <span className="font-mono">{error}</span>.
            Make sure the backend is running and the Spark consumer has written at least one metric window.
          </div>
        )}

        {/* Active alerts */}
        <AlertBanner alerts={alerts} />

        {/* KPI cards */}
        <section>
          <h2 className="text-base font-semibold text-gray-600 mb-3">Latest 1-minute window</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <KpiCard label="Total Requests"    value={latest?.total_requests ?? '—'} color="blue" />
            <KpiCard label="Error Count"       value={latest?.error_count ?? '—'}    color={latest?.error_count > 0 ? 'red' : 'green'} alert={latest?.error_rate > 30} />
            <KpiCard label="Error Rate"        value={latest ? Number(latest.error_rate).toFixed(1) : '—'} unit="%" color={latest?.error_rate > 30 ? 'red' : 'green'} alert={latest?.error_rate > 30} />
            <KpiCard label="Avg Response Time" value={latest ? Math.round(latest.avg_response_time) : '—'} unit="ms" color={latest?.avg_response_time > 1000 ? 'red' : 'blue'} alert={latest?.avg_response_time > 1000} />
          </div>
        </section>

        {/* Service filter */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-gray-600">Filter by service:</span>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setServiceFilter('')}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${serviceFilter === '' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-400'}`}
            >
              All
            </button>
            {SERVICES.map((s) => (
              <button
                key={s}
                onClick={() => setServiceFilter(s)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${serviceFilter === s ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-400'}`}
              >
                {s}
              </button>
            ))}
          </div>
          {serviceFilter && (
            <span className="text-xs text-indigo-500 italic">
              Filtered to <strong>{serviceFilter}</strong> — charts use REST-ingested events when a service is selected
            </span>
          )}
        </div>

        {/* Line charts */}
        {hasData ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Requests per minute</h3>
              <Plot
                data={[{ type: 'scatter', mode: 'lines+markers', x: xLabels, y: totalReqSeries, line: { color: '#6366f1', width: 2 }, marker: { size: 4 }, name: 'Requests' }]}
                layout={{ ...baseLayout, height: 260, yaxis: { ...baseLayout.yaxis, title: 'count' } }}
                config={{ responsive: true, displayModeBar: 'hover' }}
                style={{ width: '100%' }}
              />
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Errors per minute</h3>
              <Plot
                data={[{ type: 'scatter', mode: 'lines+markers', x: xLabels, y: errorCountSeries, line: { color: '#ef4444', width: 2 }, marker: { size: 4 }, name: 'Errors', fill: 'tozeroy', fillcolor: 'rgba(239,68,68,0.08)' }]}
                layout={{ ...baseLayout, height: 260, yaxis: { ...baseLayout.yaxis, title: 'count' } }}
                config={{ responsive: true, displayModeBar: 'hover' }}
                style={{ width: '100%' }}
              />
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                Error rate % <span className="text-red-400 font-normal">(threshold 30%)</span>
              </h3>
              <Plot
                data={[
                  { type: 'scatter', mode: 'lines+markers', x: xLabels, y: errorRateSeries, line: { color: '#f59e0b', width: 2 }, marker: { size: 4 }, name: 'Error rate' },
                  { type: 'scatter', mode: 'lines', x: [xLabels[0], xLabels[xLabels.length - 1]], y: [30, 30], line: { color: '#ef4444', width: 1, dash: 'dash' }, name: 'Threshold' },
                ]}
                layout={{ ...baseLayout, height: 260, yaxis: { ...baseLayout.yaxis, title: '%' } }}
                config={{ responsive: true, displayModeBar: 'hover' }}
                style={{ width: '100%' }}
              />
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                Avg response time <span className="text-red-400 font-normal">(threshold 1000ms)</span>
              </h3>
              <Plot
                data={[
                  { type: 'scatter', mode: 'lines+markers', x: xLabels, y: respTimeSeries, line: { color: '#10b981', width: 2 }, marker: { size: 4 }, name: 'Avg resp time' },
                  { type: 'scatter', mode: 'lines', x: [xLabels[0], xLabels[xLabels.length - 1]], y: [1000, 1000], line: { color: '#ef4444', width: 1, dash: 'dash' }, name: 'Threshold' },
                ]}
                layout={{ ...baseLayout, height: 260, yaxis: { ...baseLayout.yaxis, title: 'ms' } }}
                config={{ responsive: true, displayModeBar: 'hover' }}
                style={{ width: '100%' }}
              />
            </div>
          </div>
        ) : (
          !error && (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
              <div className="w-10 h-10 border-4 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm">Waiting for the first metric window from the Spark consumer…</p>
              <p className="text-xs text-gray-300">
                Windows are computed every minute. Data should appear within ~90 seconds of starting the pipeline.
              </p>
            </div>
          )
        )}

        {/* Recent windows table */}
        {hasData && (
          <section>
            <h2 className="text-base font-semibold text-gray-600 mb-3">Recent windows</h2>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-400 text-xs uppercase">
                    <th className="text-left py-2.5 px-4 rounded-tl-2xl">Window</th>
                    <th className="text-right py-2.5 px-4">Requests</th>
                    <th className="text-right py-2.5 px-4">Errors</th>
                    <th className="text-right py-2.5 px-4">Error %</th>
                    <th className="text-right py-2.5 px-4 rounded-tr-2xl">Avg resp (ms)</th>
                  </tr>
                </thead>
                <tbody>
                  {[...metrics].reverse().slice(0, 20).map((m, i) => (
                    <tr key={m.id ?? i} className="border-t border-gray-50 hover:bg-gray-50">
                      <td className="py-2 px-4 font-mono text-xs text-gray-500">
                        {new Date(m.window_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {' – '}
                        {new Date(m.window_end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-2 px-4 text-right">{m.total_requests}</td>
                      <td className="py-2 px-4 text-right text-red-500">{m.error_count}</td>
                      <td className={`py-2 px-4 text-right font-medium ${m.error_rate > 30 ? 'text-red-600' : 'text-gray-700'}`}>
                        {Number(m.error_rate).toFixed(1)}%
                      </td>
                      <td className={`py-2 px-4 text-right ${m.avg_response_time > 1000 ? 'text-red-600 font-medium' : 'text-gray-700'}`}>
                        {Math.round(m.avg_response_time)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Raw Event Viewer */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-600">
              Raw Events
              <span className="ml-2 text-xs text-gray-400 font-normal">
                (REST-ingested via POST /api/stream/ingest · auto-refreshes every 5 s)
              </span>
            </h2>
            {hasEvents && <span className="text-xs text-gray-400">{events.length} events</span>}
          </div>
          {hasEvents ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-auto max-h-80">
              <table className="w-full text-sm">
                <thead className="sticky top-0">
                  <tr className="bg-gray-50 text-gray-400 text-xs uppercase">
                    <th className="text-left py-2.5 px-4 rounded-tl-2xl">Timestamp</th>
                    <th className="text-left py-2.5 px-4">Service</th>
                    <th className="text-left py-2.5 px-4">Level</th>
                    <th className="text-right py-2.5 px-4 rounded-tr-2xl">Response Time (ms)</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((ev) => (
                    <tr key={ev.id} className="border-t border-gray-50 hover:bg-gray-50">
                      <td className="py-2 px-4 font-mono text-xs text-gray-500">
                        {new Date(ev.received_at).toLocaleTimeString()}
                      </td>
                      <td className="py-2 px-4 text-gray-700 font-medium">{ev.service}</td>
                      <td className="py-2 px-4"><LevelBadge level={ev.level} /></td>
                      <td className={`py-2 px-4 text-right ${ev.response_time > 1000 ? 'text-red-600 font-medium' : 'text-gray-700'}`}>
                        {ev.response_time}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-gray-400 text-sm">
              No events yet. Send events using the ingest API below to see them here.
            </div>
          )}
        </section>

        {/* API Integration */}
        <section>
          <h2 className="text-base font-semibold text-gray-600 mb-4">API Integration</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Key management */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
              <h3 className="text-sm font-semibold text-gray-700">API Keys</h3>

              {generatedKey && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                  <p className="text-xs font-semibold text-green-700 mb-1">
                    ✓ Key created — copy it now, it won't be shown again
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-white border border-green-200 rounded px-3 py-1.5 text-xs font-mono text-green-800 break-all">
                      {generatedKey}
                    </code>
                    <button
                      onClick={() => handleCopy(generatedKey)}
                      className="shrink-0 px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 transition-colors"
                    >
                      {copied ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              )}

              <form onSubmit={handleGenerateKey} className="flex gap-2">
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="Key name (e.g. my-app)"
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
                <button
                  type="submit"
                  disabled={keyLoading || !newKeyName.trim()}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {keyLoading ? '…' : 'Generate'}
                </button>
              </form>

              {apiKeys.length > 0 ? (
                <ul className="space-y-2">
                  {apiKeys.map((k) => (
                    <li key={k.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
                      <div>
                        <span className="text-sm font-medium text-gray-800">{k.name}</span>
                        <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${k.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
                          {k.is_active ? 'active' : 'revoked'}
                        </span>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Created {new Date(k.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      {k.is_active && (
                        <button
                          onClick={() => handleDeleteKey(k.id)}
                          className="text-xs text-red-500 hover:text-red-700 transition-colors"
                        >
                          Revoke
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-gray-400">No API keys yet. Generate one above.</p>
              )}
            </div>

            {/* Code examples */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
              <h3 className="text-sm font-semibold text-gray-700">Example Request</h3>
              <p className="text-xs text-gray-500">
                Send events to the ingest endpoint from any application. The event is stored
                in the raw events table and forwarded to Kafka for Spark aggregation.
              </p>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">curl</span>
                  <button onClick={() => handleCopy(curlExample)} className="text-xs text-indigo-500 hover:text-indigo-700">
                    {copied ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
                <pre className="bg-gray-900 text-green-400 text-xs rounded-xl p-4 overflow-x-auto whitespace-pre-wrap">
{curlExample}
                </pre>
              </div>

              <div>
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Python</span>
                <pre className="mt-1 bg-gray-900 text-blue-300 text-xs rounded-xl p-4 overflow-x-auto whitespace-pre">
{`import requests

requests.post(
    "http://localhost:8000/api/stream/ingest",
    headers={"X-API-Key": "${generatedKey ?? '<YOUR_KEY>'}"},
    json={"service": "payment", "level": "ERROR",
          "response_time": 1200}
)`}
                </pre>
              </div>

              <p className="text-xs text-gray-400">
                Valid <code className="font-mono">level</code>: <code className="font-mono">INFO</code>, <code className="font-mono">WARNING</code>, <code className="font-mono">ERROR</code>.{' '}
                Valid <code className="font-mono">service</code>: {SERVICES.join(', ')}.
              </p>
            </div>

          </div>
        </section>

      </main>

      <footer className="text-center py-3 text-xs text-gray-400 border-t border-gray-100">
        Auto EDA — Streaming Analytics · refreshes every 5 s
      </footer>
    </div>
  )
}
