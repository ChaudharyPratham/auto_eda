import Plot from 'react-plotly.js'

/** Bar chart showing value counts for a categorical column. */
export default function BarChart({ data }) {
  return (
    <Plot
      data={[{
        x:      data.x,
        y:      data.y,
        type:   'bar',
        marker: { color: '#10b981', opacity: 0.9 },
        name:   data.column,
      }]}
      layout={{
        title:         { text: data.column, font: { size: 14, color: '#1f2937' } },
        margin:        { t: 40, r: 16, b: 90, l: 48 },
        xaxis:         { tickangle: -40 },
        yaxis:         { title: { text: 'Count', font: { size: 11 } } },
        paper_bgcolor: 'transparent',
        plot_bgcolor:  '#f9fafb',
        height:        320,
      }}
      config={{ responsive: true, displayModeBar: false }}
      style={{ width: '100%' }}
    />
  )
}
