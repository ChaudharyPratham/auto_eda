import { useEffect, useRef, useState } from 'react'
import Plotly from 'plotly.js/dist/plotly'
import { getVisualizations } from '../services/api'
import Histogram     from './charts/Histogram'
import BoxPlot       from './charts/BoxPlot'
import BarChart      from './charts/BarChart'
import PieChart      from './charts/PieChart'
import HeatMap       from './charts/HeatMap'
import ScatterPlot   from './charts/ScatterPlot'
import { Spinner, ErrorBox } from './AnalysisPanel'

/**
 * VisualizationPanel
 * Fetches chart data from the API and renders interactive Plotly charts.
 * Section tabs let the user switch between chart types.
 */
export default function VisualizationPanel({ fileId }) {
  const [viz,     setViz]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [section, setSection] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await getVisualizations(fileId)
        const data = res.data.data
        if (!cancelled) {
          setViz(data)
          // Default to the first section that has data
          const first = sections(data).find(s => s.count > 0)
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

  const tabs = sections(viz).filter(s => s.count > 0)

  return (
    <div className="space-y-6">
      {/* ── Section tabs ── */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((s) => (
          <button
            key={s.key}
            onClick={() => setSection(s.key)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors border ${
              section === s.key
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600'
            }`}
          >
            {s.label}
            <span className="ml-1 opacity-70">({s.count})</span>
          </button>
        ))}
      </div>

      {/* ── Charts ── */}
      <div className={section === 'correlation' ? '' : 'grid grid-cols-1 md:grid-cols-2 gap-5'}>
        {section === 'histograms' && viz.histograms.map((d) => (
          <ChartCard key={d.column} title={`histogram_${d.column}`} fullWidth={false}>
            <Histogram data={d} />
          </ChartCard>
        ))}
        {section === 'boxplots' && viz.boxplots.map((d) => (
          <ChartCard key={d.column} title={`boxplot_${d.column}`} fullWidth={false}>
            <BoxPlot data={d} />
          </ChartCard>
        ))}
        {section === 'bar_charts' && viz.bar_charts.map((d) => (
          <ChartCard key={d.column} title={`bar_${d.column}`} fullWidth={false}>
            <BarChart data={d} />
          </ChartCard>
        ))}
        {section === 'pie_charts' && viz.pie_charts.map((d) => (
          <ChartCard key={d.column} title={`pie_${d.column}`} fullWidth={false}>
            <PieChart data={d} />
          </ChartCard>
        ))}
        {section === 'scatter_plots' && viz.scatter_plots.map((d, i) => (
          <ChartCard key={i} title={`scatter_${d.x_col}_vs_${d.y_col}`} fullWidth={false}>
            <ScatterPlot data={d} />
          </ChartCard>
        ))}
        {section === 'correlation' && viz.correlation_heatmap && (
          <ChartCard title="correlation_heatmap" fullWidth>
            <HeatMap data={viz.correlation_heatmap} />
          </ChartCard>
        )}
      </div>
    </div>
  )
}

/* ── Helpers ── */

function sections(viz) {
  return [
    { key: 'histograms',   label: 'Histograms',    count: viz.histograms?.length    ?? 0 },
    { key: 'boxplots',     label: 'Box Plots',     count: viz.boxplots?.length      ?? 0 },
    { key: 'bar_charts',   label: 'Bar Charts',    count: viz.bar_charts?.length    ?? 0 },
    { key: 'pie_charts',   label: 'Pie Charts',    count: viz.pie_charts?.length    ?? 0 },
    { key: 'scatter_plots',label: 'Scatter Plots', count: viz.scatter_plots?.length ?? 0 },
    { key: 'correlation',  label: 'Correlation',   count: viz.correlation_heatmap ? 1 : 0 },
  ]
}

function ChartCard({ children, title = 'chart', fullWidth = false }) {
  const cardRef = useRef(null)

  function handleDownload() {
    if (!cardRef.current) return
    const plotDiv = cardRef.current.querySelector('.js-plotly-plot')
    if (!plotDiv) return
    Plotly.downloadImage(plotDiv, {
      format:   'png',
      filename:  title,
      height:    500,
      width:     900,
      scale:     2,
    })
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

      {/* Download button – appears on hover */}
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
