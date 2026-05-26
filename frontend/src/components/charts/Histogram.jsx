import Plot from 'react-plotly.js'

/** Histogram for a single numerical column. */
export default function Histogram({ data }) {
  return (
    <Plot
      data={[{
        x:      data.x,
        type:   'histogram',
        marker: { color: '#3b82f6', opacity: 0.85 },
        name:   data.column,
      }]}
      layout={{
        title:        { text: data.column, font: { size: 14, color: '#1f2937' } },
        margin:       { t: 40, r: 16, b: 48, l: 48 },
        xaxis:        { title: { text: data.column, font: { size: 11 } } },
        yaxis:        { title: { text: 'Count',     font: { size: 11 } } },
        paper_bgcolor: 'transparent',
        plot_bgcolor:  '#f9fafb',
        height:        300,
        bargap:        0.05,
      }}
      config={{ responsive: true, displayModeBar: false }}
      style={{ width: '100%' }}
    />
  )
}
