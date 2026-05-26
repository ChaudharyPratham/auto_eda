import Plot from 'react-plotly.js'

/** Box plot for a single numerical column, showing outliers. */
export default function BoxPlot({ data }) {
  return (
    <Plot
      data={[{
        y:         data.y,
        type:      'box',
        name:      data.name,
        boxpoints: 'outliers',
        marker:    { color: '#8b5cf6', outliercolor: '#ef4444', size: 4 },
        line:      { color: '#7c3aed' },
        fillcolor: '#ede9fe',
      }]}
      layout={{
        title:         { text: data.column, font: { size: 14, color: '#1f2937' } },
        margin:        { t: 40, r: 16, b: 40, l: 48 },
        paper_bgcolor: 'transparent',
        plot_bgcolor:  '#f9fafb',
        height:        300,
        showlegend:    false,
      }}
      config={{ responsive: true, displayModeBar: false }}
      style={{ width: '100%' }}
    />
  )
}
