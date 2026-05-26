import { useState } from 'react'
import { cleanDataset } from '../services/api'

/**
 * CleaningPanel
 * Lets the user trigger dataset cleaning with a single button click.
 * Displays a step-by-step cleaning log and before/after row counts.
 */
export default function CleaningPanel({ fileId }) {
  const [result,  setResult]  = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  async function handleClean() {
    setLoading(true)
    setError(null)
    try {
      const res = await cleanDataset(fileId)
      setResult(res.data.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Cleaning failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Trigger card (shown before cleaning) ── */}
      {!result && (
        <div className="bg-white rounded-2xl p-8 sm:p-10 shadow-sm border border-gray-100 text-center">
          <div className="text-5xl mb-4">🧹</div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">Clean Your Dataset</h3>
          <p className="text-gray-500 text-sm mb-6 max-w-md mx-auto">
            Automatically removes duplicates, fills missing values (median / mode),
            standardizes column names to snake_case, and converts numeric strings.
          </p>
          <button
            onClick={handleClean}
            disabled={loading}
            className="px-8 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-60 transition-colors"
          >
            {loading ? 'Cleaning…' : 'Start Cleaning'}
          </button>
          {loading && (
            <div className="mt-6 flex justify-center">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* ── Results ── */}
      {result && (
        <div className="space-y-5">
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {[
              { label: 'Original Rows', value: result.original_shape.rows.toLocaleString() },
              { label: 'Cleaned Rows',  value: result.cleaned_shape.rows.toLocaleString() },
              { label: 'Rows Removed',  value: result.rows_removed },
            ].map((c) => (
              <div key={c.label} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                <div className="text-2xl font-bold text-blue-600">{c.value}</div>
                <div className="text-sm text-gray-500 mt-1">{c.label}</div>
              </div>
            ))}
          </div>

          {/* Cleaning log */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
              <span className="text-green-500 text-lg">✓</span>
              <h3 className="font-semibold text-gray-800">Cleaning Log</h3>
              <span className="ml-auto text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                {result.engine}
              </span>
            </div>
            <div className="p-4 space-y-1.5">
              {result.cleaning_log.length === 0 ? (
                <p className="text-gray-400 text-sm py-4 text-center">
                  ✅ Dataset was already clean — no actions needed.
                </p>
              ) : (
                result.cleaning_log.map((entry, i) => (
                  <div key={i} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                    <span className="text-green-500 mt-0.5 flex-shrink-0">✓</span>
                    <span className="text-sm text-gray-700">{entry}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Re-clean button */}
          <button
            onClick={() => { setResult(null); setError(null) }}
            className="text-sm text-blue-600 hover:underline"
          >
            Run cleaning again
          </button>
        </div>
      )}
    </div>
  )
}
