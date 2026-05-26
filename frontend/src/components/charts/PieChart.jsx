import Plot from 'react-plotly.js'

/** Donut pie chart showing category distribution. */
export default function PieChart({ data }) {
  return (
    <Plot
      data={[{
        labels:    data.labels,
        values:    data.values,
        type:      'pie',
        hole:      0.4,
        name:      data.column,
        textinfo:  'percent+label',
        hoverinfo: 'label+value+percent',
      }]}
      layout={{
        title:         { text: data.column, font: { size: 14, color: '#1f2937' } },
        margin:        { t: 40, r: 20, b: 20, l: 20 },
        paper_bgcolor: 'transparent',
        height:        320,
        showlegend:    false,
      }}
      config={{ responsive: true, displayModeBar: false }}
      style={{ width: '100%' }}
    />
  )
}
