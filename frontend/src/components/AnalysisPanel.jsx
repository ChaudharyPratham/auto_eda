import { useEffect, useState } from 'react'
import { getAnalysis } from '../services/api'
import { missingColor } from '../utils/helpers'

/**
 * AnalysisPanel
 * Fetches and displays full dataset analysis: shape, column info,
 * descriptive statistics, outlier counts, and missing-value heatmap.
 */
export default function AnalysisPanel({ fileId }) {
  const [analysis, setAnalysis] = useState(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await getAnalysis(fileId)
        if (!cancelled) setAnalysis(res.data.data)
      } catch (e) {
        if (!cancelled) setError(e.response?.data?.detail || 'Analysis failed')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [fileId])

  if (loading) return <Spinner text="Analyzing dataset…" />
  if (error)   return <ErrorBox msg={error} />

  const { shape, column_types, missing_values, duplicate_rows, statistics, outliers, engine } = analysis

  return (
    <div className="space-y-6">
      {/* ── Overview cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Rows',       value: shape.rows.toLocaleString() },
          { label: 'Columns',    value: shape.columns },
          { label: 'Duplicates', value: duplicate_rows },
          { label: 'Engine',     value: engine.toUpperCase() },
        ].map((c) => (
          <div key={c.label} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="text-2xl font-bold text-blue-600">{c.value}</div>
            <div className="text-sm text-gray-500 mt-1">{c.label}</div>
          </div>
        ))}
      </div>

      {/* ── Column details table ── */}
      <Section title="Column Details">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 font-medium text-xs uppercase tracking-wider">
              <tr>
                <Th>Column</Th>
                <Th>Type</Th>
                <Th>Missing</Th>
                <Th>Missing %</Th>
                <Th>Outliers</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {Object.entries(column_types).map(([col, dtype]) => {
                const miss = missing_values[col] ?? { count: 0, percentage: 0 }
                const out  = outliers[col]
                return (
                  <tr key={col} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-800 max-w-[160px] truncate">{col}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-mono">
                        {dtype}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{miss.count}</td>
                    <td className={`px-4 py-3 font-semibold ${missingColor(miss.percentage)}`}>
                      {miss.percentage}%
                    </td>
                    <td className="px-4 py-3 text-gray-600">{out?.count ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ── Descriptive statistics ── */}
      {Object.keys(statistics).length > 0 && (
        <Section title="Descriptive Statistics">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 font-medium text-xs uppercase tracking-wider">
                <tr>
                  <Th>Statistic</Th>
                  {Object.keys(statistics).map((col) => <Th key={col}>{col}</Th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {Object.keys(Object.values(statistics)[0] || {}).map((stat) => (
                  <tr key={stat} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-700 capitalize">{stat}</td>
                    {Object.values(statistics).map((vals, i) => (
                      <td key={i} className="px-4 py-3 text-gray-600 font-mono text-xs">
                        {vals[stat] ?? '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  )
}

/* ── Small reusable sub-components ── */
function Section({ title, children }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h3 className="font-semibold text-gray-800">{title}</h3>
      </div>
      <div>{children}</div>
    </div>
  )
}

function Th({ children }) {
  return <th className="px-4 py-3 text-left whitespace-nowrap">{children}</th>
}

export function Spinner({ text = 'Loading…' }) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
      <p className="text-gray-400 text-sm">{text}</p>
    </div>
  )
}

export function ErrorBox({ msg }) {
  return (
    <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-2xl text-sm">
      <strong>Error:</strong> {msg}
    </div>
  )
}
