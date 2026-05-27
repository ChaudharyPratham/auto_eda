import { useCallback, useEffect, useRef, useState } from 'react'
import Plotly from 'plotly.js/dist/plotly'
import { getVisualizations, getColumnInfo, buildCustomChart } from '../services/api'
import Histogram   from './charts/Histogram'
import BoxPlot     from './charts/BoxPlot'
import BarChart    from './charts/BarChart'
import PieChart    from './charts/PieChart'
import HeatMap     from './charts/HeatMap'
import ScatterPlot from './charts/ScatterPlot'
import { Spinner, ErrorBox } from './AnalysisPanel'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const CHART_TYPES = [
  { id: 'bar',       label: 'Bar',       icon: '📊' },
  { id: 'histogram', label: 'Histogram', icon: '📈' },
  { id: 'scatter',   label: 'Scatter',   icon: '⚬⚬' },
  { id: 'pie',       label: 'Pie',       icon: '🥧' },
]

const AGG_OPTIONS = [
  { id: 'sum',    label: 'Sum'    },
  { id: 'mean',   label: 'Mean'   },
  { id: 'count',  label: 'Count'  },
  { id: 'median', label: 'Median' },
  { id: 'min',    label: 'Min'    },
  { id: 'max',    label: 'Max'    },
]

const FILTER_OPS = [
  { id: 'eq',       label: '= equals'     },
  { id: 'ne',       label: '≠ not equals' },
  { id: 'contains', label: '∋ contains'   },
  { id: 'gt',       label: '> greater'    },
  { id: 'gte',      label: '≥ ≥'          },
  { id: 'lt',       label: '< less'       },
  { id: 'lte',      label: '≤ ≤'          },
]

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
export default function VisualizationPanel({ fileId }) {
  const [mode, setMode] = useState('auto')   // 'auto' | 'builder'

  return (
    <div>
      {/* Mode toggle */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {[
          { id: 'auto',    label: '⚡ Auto Charts',   desc: 'AI-generated for all columns' },
          { id: 'builder', label: '🛠 Chart Builder', desc: 'Power BI-style interactive builder' },
        ].map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={`flex items-center gap-3 px-5 py-3 rounded-xl border-2 text-sm font-semibold transition-all
              ${mode === m.id
                ? 'bg-blue-600 border-blue-600 text-white shadow-md'
                : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300'}`}
          >
            <span>{m.label}</span>
            <span className={`text-xs font-normal hidden sm:inline ${mode === m.id ? 'text-blue-200' : 'text-gray-400'}`}>
              {m.desc}
            </span>
          </button>
        ))}
      </div>

      {mode === 'auto'    && <AutoCharts   fileId={fileId} />}
      {mode === 'builder' && <ChartBuilder fileId={fileId} />}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto Charts (existing behaviour — unchanged)
// ─────────────────────────────────────────────────────────────────────────────
function AutoCharts({ fileId }) {
  const [viz,     setViz]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [section, setSection] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res  = await getVisualizations(fileId)
        const data = res.data.data
        if (!cancelled) {
          setViz(data)
          const first = autoSections(data).find(s => s.count > 0)
          if (first) setSection(first.key)
        }
      } catch (e) {
        if (!cancelled) setError(e.response?.data?.detail || 'Visualization failed')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [fileId])

  if (loading) return <Spinner text="Generating visualizations…" />
  if (error)   return <ErrorBox msg={error} />
  if (!viz)    return null

  const tabs = autoSections(viz).filter(s => s.count > 0)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {tabs.map((s) => (
          <button
            key={s.key}
            onClick={() => setSection(s.key)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors border
              ${section === s.key
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600'}`}
          >
            {s.label} <span className="opacity-60">({s.count})</span>
          </button>
        ))}
      </div>

      <div className={section === 'correlation' ? '' : 'grid grid-cols-1 md:grid-cols-2 gap-5'}>
        {section === 'histograms'    && viz.histograms.map((d)       => <ChartCard key={d.column} title={`histogram_${d.column}`}          ><Histogram   data={d} /></ChartCard>)}
        {section === 'boxplots'      && viz.boxplots.map((d)         => <ChartCard key={d.column} title={`boxplot_${d.column}`}            ><BoxPlot     data={d} /></ChartCard>)}
        {section === 'bar_charts'    && viz.bar_charts.map((d)       => <ChartCard key={d.column} title={`bar_${d.column}`}                ><BarChart    data={d} /></ChartCard>)}
        {section === 'pie_charts'    && viz.pie_charts.map((d)       => <ChartCard key={d.column} title={`pie_${d.column}`}                ><PieChart    data={d} /></ChartCard>)}
        {section === 'scatter_plots' && viz.scatter_plots.map((d, i) => <ChartCard key={i}        title={`scatter_${d.x_col}_vs_${d.y_col}`}><ScatterPlot data={d} /></ChartCard>)}
        {section === 'correlation'   && viz.correlation_heatmap      && <ChartCard title="correlation_heatmap" fullWidth><HeatMap data={viz.correlation_heatmap} /></ChartCard>}
      </div>
    </div>
  )
}

function autoSections(viz) {
  return [
    { key: 'histograms',    label: 'Histograms',    count: viz.histograms?.length      ?? 0 },
    { key: 'boxplots',      label: 'Box Plots',     count: viz.boxplots?.length        ?? 0 },
    { key: 'bar_charts',    label: 'Bar Charts',    count: viz.bar_charts?.length      ?? 0 },
    { key: 'pie_charts',    label: 'Pie Charts',    count: viz.pie_charts?.length      ?? 0 },
    { key: 'scatter_plots', label: 'Scatter Plots', count: viz.scatter_plots?.length   ?? 0 },
    { key: 'correlation',   label: 'Correlation',   count: viz.correlation_heatmap ? 1 : 0  },
  ]
}

// ─────────────────────────────────────────────────────────────────────────────
// Chart Builder — Power BI-style interactive builder
// ─────────────────────────────────────────────────────────────────────────────
function ChartBuilder({ fileId }) {
  const [columns,     setColumns]     = useState([])
  const [colsLoading, setColsLoading] = useState(true)
  const [colsError,   setColsError]   = useState(null)

  const [chartType, setChartType] = useState('bar')
  const [xCol,      setXCol]      = useState(null)
  const [yCols,     setYCols]     = useState([])
  const [agg,       setAgg]       = useState('sum')
  const [filters,   setFilters]   = useState([])

  const [chartData,    setChartData]    = useState(null)
  const [chartLoading, setChartLoading] = useState(false)
  const [chartError,   setChartError]   = useState(null)
  const plotRef     = useRef(null)
  const debounceRef = useRef(null)

  // ── Fetch column metadata once ─────────────────────────────────────────────
  useEffect(() => {
    ;(async () => {
      try {
        const res  = await getColumnInfo(fileId)
        const cols = res.data.data.columns
        setColumns(cols)
        const firstCat = cols.find(c => c.type === 'categorical')
        const firstNum = cols.find(c => c.type === 'numeric')
        if (firstCat) setXCol(firstCat.name)
        if (firstNum) setYCols([firstNum.name])
      } catch (e) {
        setColsError(e.response?.data?.detail || 'Failed to load column info')
      } finally {
        setColsLoading(false)
      }
    })()
  }, [fileId])

  // ── Rebuild chart (debounced 350 ms) ──────────────────────────────────────
  const fetchChart = useCallback(async (cfg) => {
    setChartLoading(true)
    setChartError(null)
    try {
      const res = await buildCustomChart(fileId, cfg)
      setChartData(res.data.data)
    } catch (e) {
      setChartError(e.response?.data?.detail || 'Chart build failed')
    } finally {
      setChartLoading(false)
    }
  }, [fileId])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetchChart({ chart_type: chartType, x_col: xCol, y_cols: yCols, agg, filters })
    }, 350)
    return () => clearTimeout(debounceRef.current)
  }, [chartType, xCol, yCols, agg, filters, fetchChart])

  // ── Render into Plotly div ─────────────────────────────────────────────────
  useEffect(() => {
    if (!plotRef.current || !chartData) return
    const { traces = [], layout = {} } = chartData
    Plotly.react(plotRef.current, traces, { ...layout, autosize: true, height: 420 }, {
      responsive: true,
      displayModeBar: true,
      modeBarButtonsToRemove: ['lasso2d', 'select2d', 'autoScale2d'],
      displaylogo: false,
    })
  }, [chartData])

  // ── Filter helpers ─────────────────────────────────────────────────────────
  function addFilter() {
    setFilters(f => [...f, { id: Date.now(), col: columns[0]?.name ?? '', op: 'eq', value: '' }])
  }
  function updateFilter(id, patch) { setFilters(f => f.map(x => x.id === id ? { ...x, ...patch } : x)) }
  function removeFilter(id)        { setFilters(f => f.filter(x => x.id !== id)) }

  function handleDownload() {
    if (!plotRef.current) return
    Plotly.downloadImage(plotRef.current, {
      format: 'png', filename: `chart_${chartType}`, height: 520, width: 1000, scale: 2,
    })
  }

  if (colsLoading) return <Spinner text="Loading column info…" />
  if (colsError)   return <ErrorBox msg={colsError} />

  const numericCols = columns.filter(c => c.type === 'numeric')
  const showAgg     = ['bar', 'pie'].includes(chartType)
  const showX       = chartType !== 'histogram'
  const xAxisCols   = chartType === 'scatter' ? numericCols : columns

  return (
    <div className="space-y-4">

      {/* ── Controls bar ──────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-wrap items-start gap-6">
        <div>
          <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Chart Type</div>
          <div className="flex gap-1.5">
            {CHART_TYPES.map(ct => (
              <button
                key={ct.id}
                onClick={() => setChartType(ct.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1.5
                  ${chartType === ct.id
                    ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300'}`}
              >
                <span>{ct.icon}</span>{ct.label}
              </button>
            ))}
          </div>
        </div>

        {showAgg && (
          <div>
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Aggregation</div>
            <div className="flex gap-1 flex-wrap">
              {AGG_OPTIONS.map(a => (
                <button
                  key={a.id}
                  onClick={() => setAgg(a.id)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all
                    ${agg === a.id
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'bg-white border-gray-200 text-gray-500 hover:border-indigo-300'}`}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Three-column layout: Y | Chart | X ──────────────────────────── */}
      <div className="grid gap-3" style={{ gridTemplateColumns: '190px 1fr 190px' }}>

        {/* Y-Axis panel */}
        <AxisPanel
          title="Y — Values"
          subtitle={chartType === 'histogram' ? 'Distribution columns' : 'Numeric · multi-select'}
          color="blue"
        >
          {numericCols.length === 0
            ? <p className="text-xs text-gray-400 p-3 text-center">No numeric columns</p>
            : numericCols.map(col => {
                const checked = yCols.includes(col.name)
                return (
                  <label
                    key={col.name}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-xs transition-colors
                      ${checked ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50 border border-transparent'}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => setYCols(prev => checked ? prev.filter(c => c !== col.name) : [...prev, col.name])}
                      className="accent-blue-600 flex-shrink-0"
                    />
                    <span className={`font-medium truncate flex-1 ${checked ? 'text-blue-700' : 'text-gray-700'}`}>
                      {col.name}
                    </span>
                  </label>
                )
              })}
          <div className="border-t border-gray-100 px-3 py-2 flex gap-2 mt-1">
            <button onClick={() => setYCols(numericCols.map(c => c.name))} className="text-xs text-blue-600 hover:underline">All</button>
            <span className="text-gray-200">|</span>
            <button onClick={() => setYCols([])} className="text-xs text-gray-500 hover:underline">Clear</button>
          </div>
        </AxisPanel>

        {/* Chart area */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-700 truncate">
              {yCols.length > 0 || xCol
                ? `${CHART_TYPES.find(c => c.id === chartType)?.label} Chart`
                : 'Select columns to build your chart'}
            </span>
            <div className="flex items-center gap-2 flex-shrink-0">
              {chartLoading && (
                <svg className="animate-spin h-4 w-4 text-blue-500" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
              )}
              <button
                onClick={handleDownload}
                className="flex items-center gap-1.5 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5
                           text-gray-600 hover:border-blue-300 hover:text-blue-600 transition-colors"
              >
                ⬇ PNG
              </button>
            </div>
          </div>

          {chartError && (
            <div className="mx-4 mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs">{chartError}</div>
          )}

          {!chartError && (!chartData || chartData.traces?.length === 0) && !chartLoading && (
            <div className="flex flex-col items-center justify-center h-[380px] text-gray-300">
              <div className="text-6xl mb-4">📊</div>
              <div className="text-sm font-medium text-center px-8">Select Y-Axis columns (left) and an X-Axis column (right)</div>
              <div className="text-xs mt-1 text-gray-300">Use filters below to scope the data</div>
            </div>
          )}

          <div ref={plotRef} className="w-full" />
        </div>

        {/* X-Axis panel */}
        {showX ? (
          <AxisPanel
            title="X — Axis"
            subtitle={chartType === 'pie' ? 'Slice labels · single' : 'Group by · single select'}
            color="green"
          >
            {xAxisCols.length === 0
              ? <p className="text-xs text-gray-400 p-3 text-center">No columns</p>
              : xAxisCols.map(col => (
                  <label
                    key={col.name}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-xs transition-colors
                      ${xCol === col.name ? 'bg-emerald-50 border border-emerald-200' : 'hover:bg-gray-50 border border-transparent'}`}
                  >
                    <input
                      type="radio"
                      name="x-col"
                      checked={xCol === col.name}
                      onChange={() => setXCol(col.name)}
                      className="accent-emerald-600 flex-shrink-0"
                    />
                    <span className={`font-medium truncate flex-1 ${xCol === col.name ? 'text-emerald-700' : 'text-gray-700'}`}>
                      {col.name}
                    </span>
                    <span className={`text-xs px-1 py-0.5 rounded font-bold flex-shrink-0
                      ${col.type === 'numeric' ? 'bg-blue-100 text-blue-500' : 'bg-orange-100 text-orange-500'}`}>
                      {col.type === 'numeric' ? '#' : 'A'}
                    </span>
                  </label>
                ))}
          </AxisPanel>
        ) : (
          <div className="bg-gray-50 border border-dashed border-gray-200 rounded-2xl flex items-center justify-center p-6 text-center">
            <div>
              <div className="text-3xl mb-2">📈</div>
              <div className="text-xs text-gray-400 font-medium">Histogram uses<br/>Y-Axis only</div>
            </div>
          </div>
        )}
      </div>

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-gray-700">🔍 Filters</span>
            {filters.length > 0 && (
              <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full">
                {filters.length}
              </span>
            )}
          </div>
          <button
            onClick={addFilter}
            className="flex items-center gap-1.5 text-xs border border-blue-200 text-blue-600
                       rounded-lg px-3 py-1.5 hover:bg-blue-50 font-semibold transition-colors"
          >
            + Add Filter
          </button>
        </div>

        {filters.length === 0 && (
          <p className="text-xs text-gray-400 italic">
            No filters — showing all rows. Example: add Country = India to show only India rows.
          </p>
        )}

        <div className="space-y-2.5">
          {filters.map(f => {
            const filterCol = columns.find(c => c.name === f.col)
            return (
              <div key={f.id} className="flex flex-wrap items-center gap-2">
                {/* Column */}
                <select
                  value={f.col}
                  onChange={e => updateFilter(f.id, { col: e.target.value, value: '' })}
                  className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:ring-1 focus:ring-blue-300 focus:outline-none"
                >
                  {columns.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>

                {/* Operator */}
                <select
                  value={f.op}
                  onChange={e => updateFilter(f.id, { op: e.target.value })}
                  className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:ring-1 focus:ring-blue-300 focus:outline-none"
                >
                  {FILTER_OPS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>

                {/* Value — dropdown for categorical, text input for numeric */}
                {filterCol?.sample_values?.length > 0 ? (
                  <select
                    value={f.value}
                    onChange={e => updateFilter(f.id, { value: e.target.value })}
                    className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:ring-1 focus:ring-blue-300 focus:outline-none min-w-[130px]"
                  >
                    <option value="">— select —</option>
                    {filterCol.sample_values.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={f.value}
                    placeholder="value…"
                    onChange={e => updateFilter(f.id, { value: e.target.value })}
                    className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-blue-300 focus:outline-none w-28"
                  />
                )}

                <button
                  onClick={() => removeFilter(f.id)}
                  className="text-gray-300 hover:text-red-500 text-base leading-none transition-colors px-1"
                >✕</button>

                {f.value && (
                  <span className="bg-blue-50 border border-blue-200 text-blue-700 text-xs px-2.5 py-1 rounded-full font-medium">
                    {f.col} {FILTER_OPS.find(o => o.id === f.op)?.label?.split(' ')[0] ?? f.op} {f.value}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Shared axis panel wrapper ─────────────────────────────────────────────────
function AxisPanel({ title, subtitle, color, children }) {
  const header = color === 'blue'
    ? 'bg-gradient-to-r from-indigo-600 to-blue-600'
    : 'bg-gradient-to-r from-emerald-600 to-teal-600'
  const sub = color === 'blue' ? 'text-indigo-200' : 'text-emerald-200'

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden flex flex-col">
      <div className={`${header} px-4 py-3 flex-shrink-0`}>
        <div className="text-white font-bold text-sm">{title}</div>
        <div className={`${sub} text-xs mt-0.5`}>{subtitle}</div>
      </div>
      <div className="flex-1 overflow-y-auto max-h-[420px] p-2">
        {children}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ChartCard (used by AutoCharts)
// ─────────────────────────────────────────────────────────────────────────────
function ChartCard({ children, title = 'chart', fullWidth = false }) {
  const cardRef = useRef(null)

  function handleDownload() {
    if (!cardRef.current) return
    const plotDiv = cardRef.current.querySelector('.js-plotly-plot')
    if (!plotDiv) return
    Plotly.downloadImage(plotDiv, { format: 'png', filename: title, height: 500, width: 900, scale: 2 })
  }

  return (
    <div
      ref={cardRef}
      className={[
        'bg-white rounded-2xl shadow-sm border border-gray-100 p-4 relative group',
        fullWidth ? 'col-span-full' : '',
      ].join(' ')}
    >
      {children}
      <button
        onClick={handleDownload}
        title="Download as PNG"
        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity
                   bg-white border border-gray-200 shadow-sm rounded-lg px-2.5 py-1
                   text-xs text-gray-600 hover:bg-gray-50 hover:border-blue-300 hover:text-blue-600
                   flex items-center gap-1.5 font-medium"
      >
        ⬇ PNG
      </button>
    </div>
  )
}
