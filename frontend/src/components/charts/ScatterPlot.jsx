import Plot from 'react-plotly.js'

/** Scatter plot for two numerical columns. */
export default function ScatterPlot({ data }) {
  return (
    <Plot
      data={[{
        x:      data.x,
        y:      data.y,
        type:   'scatter',
        mode:   'markers',
        marker: { color: '#f59e0b', opacity: 0.65, size: 5 },
        name:   `${data.x_col} vs ${data.y_col}`,
      }]}
      layout={{
        title:         { text: `${data.x_col} vs ${data.y_col}`, font: { size: 14, color: '#1f2937' } },
        margin:        { t: 40, r: 16, b: 56, l: 56 },
        xaxis:         { title: { text: data.x_col, font: { size: 11 } } },
        yaxis:         { title: { text: data.y_col, font: { size: 11 } } },
        paper_bgcolor: 'transparent',
        plot_bgcolor:  '#f9fafb',
        height:        320,
      }}
      config={{ responsive: true, displayModeBar: false }}
      style={{ width: '100%' }}
    />
  )
}
