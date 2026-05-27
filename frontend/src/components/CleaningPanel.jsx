import { useEffect, useState } from 'react'
import axios from 'axios'

const SEVERITY_STYLE = {
  error:   'bg-red-50 border-red-200 text-red-700',
  warning: 'bg-amber-50 border-amber-200 text-amber-700',
  info:    'bg-blue-50 border-blue-200 text-blue-700',
}
const SEVERITY_DOT = {
  error:   'bg-red-500',
  warning: 'bg-amber-400',
  info:    'bg-blue-400',
}

export default function CleaningPanel({ fileId }) {
  const [options,  setOptions]  = useState(null)   // list of ops from backend
  const [selected, setSelected] = useState(new Set())
  const [loading,  setLoading]  = useState(true)
  const [applying, setApplying] = useState(false)
  const [result,   setResult]   = useState(null)
  const [error,    setError]    = useState(null)

  // Load options on mount
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await axios.get(`/api/clean/${fileId}/options`)
        const opts = res.data.data.options
        if (!cancelled) {
          setOptions(opts)
          // Pre-select all error + warning severity by default
          setSelected(new Set(
            opts.filter(o => o.severity !== 'info').map(o => o.id)
          ))
        }
      } catch (e) {
        if (!cancelled) setError(e.response?.data?.detail || 'Could not load cleaning options.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [fileId])

  function toggle(id) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll(ids, value) {
    setSelected(prev => {
      const next = new Set(prev)
      ids.forEach(id => value ? next.add(id) : next.delete(id))
      return next
    })
  }

  async function applySelected() {
    if (selected.size === 0) return
    setApplying(true)
    setError(null)
    try {
      const res = await axios.post(`/api/clean/${fileId}`, {
        selected: [...selected],
      })
      setResult(res.data.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Cleaning failed.')
    } finally {
      setApplying(false)
    }
  }

  // Group options by their `group` field
  const groups = options
    ? [...new Set(options.map(o => o.group))].map(g => ({
        name: g,
        items: options.filter(o => o.group === g),
      }))
    : []

  if (loading) return (
    <div className="flex items-center gap-3 py-12 justify-center text-gray-400">
      <div className="w-6 h-6 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      <span>Scanning dataset for issues…</span>
    </div>
  )

  if (result) return <CleaningResult result={result} onReset={() => { setResult(null); setError(null) }} />

  return (
    <div className="space-y-5">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          <strong>Error:</strong> {error}
        </div>
      )}

      {options && options.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center shadow-sm border border-gray-100">
          <div className="text-5xl mb-3">✅</div>
          <h3 className="text-lg font-bold text-gray-900 mb-1">Dataset looks clean!</h3>
          <p className="text-gray-400 text-sm">No duplicates, missing values, or type issues detected.</p>
        </div>
      ) : (
        <>
          {/* Header row */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-gray-900 text-base">Select Cleaning Operations</h3>
              <p className="text-gray-400 text-xs mt-0.5">
                {options.length} issue{options.length !== 1 ? 's' : ''} detected · {selected.size} selected
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => toggleAll(options.map(o => o.id), true)}
                className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors"
              >
                Select all
              </button>
              <button
                onClick={() => setSelected(new Set())}
                className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Grouped checklist */}
          <div className="space-y-4">
            {groups.map(group => {
              const groupIds = group.items.map(o => o.id)
              const allChecked = groupIds.every(id => selected.has(id))
              const someChecked = groupIds.some(id => selected.has(id))
              return (
                <div key={group.name} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                  {/* Group header */}
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={allChecked}
                        ref={el => { if (el) el.indeterminate = someChecked && !allChecked }}
                        onChange={e => toggleAll(groupIds, e.target.checked)}
                        className="w-4 h-4 accent-blue-600 cursor-pointer"
                      />
                      <span className="font-semibold text-gray-800 text-sm">{group.name}</span>
                      <span className="text-xs text-gray-400">({group.items.length})</span>
                    </label>
                  </div>

                  {/* Items */}
                  <div className="divide-y divide-gray-50">
                    {group.items.map(opt => (
                      <label
                        key={opt.id}
                        className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors select-none"
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(opt.id)}
                          onChange={() => toggle(opt.id)}
                          className="mt-0.5 w-4 h-4 accent-blue-600 cursor-pointer flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-gray-700">{opt.label}</span>
                        </div>
                        <span className={`flex-shrink-0 flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${SEVERITY_STYLE[opt.severity]}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${SEVERITY_DOT[opt.severity]}`} />
                          {opt.severity}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Apply button */}
          <div className="sticky bottom-4">
            <button
              onClick={applySelected}
              disabled={applying || selected.size === 0}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition-colors shadow-md"
            >
              {applying
                ? 'Applying…'
                : `Apply ${selected.size} selected operation${selected.size !== 1 ? 's' : ''}`}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function CleaningResult({ result, onReset }) {
  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {[
          { label: 'Original Rows', value: result.original_shape.rows.toLocaleString(), color: 'text-gray-700' },
          { label: 'Cleaned Rows',  value: result.cleaned_shape.rows.toLocaleString(),  color: 'text-green-600' },
          { label: 'Rows Removed',  value: result.rows_removed.toLocaleString(),         color: 'text-red-500' },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
            <div className="text-sm text-gray-400 mt-1">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Log */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <span className="text-green-500">✓</span>
          <span className="font-semibold text-gray-800 text-sm">Cleaning Log</span>
          <span className="ml-auto text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{result.engine}</span>
        </div>
        <div className="p-4 space-y-1">
          {result.cleaning_log.length === 0 ? (
            <p className="text-gray-400 text-sm py-4 text-center">No changes applied.</p>
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

      <div className="flex items-center gap-4">
        <button onClick={onReset} className="text-sm text-blue-600 hover:underline">
          ← Choose different operations
        </button>
        <p className="text-xs text-gray-400">Cleaned file is ready in the Download tab.</p>
      </div>
    </div>
  )
}
