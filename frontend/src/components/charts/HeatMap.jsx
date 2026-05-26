import Plot from 'react-plotly.js'

/** Correlation heatmap (RdBu colour scale, range –1 to +1). */
export default function HeatMap({ data }) {
  return (
    <Plot
      data={[{
        z:            data.z,
        x:            data.x,
        y:            data.y,
        type:         'heatmap',
        colorscale:   'RdBu',
        zmid:          0,
        zmin:         -1,
        zmax:          1,
        text:          data.z.map(row => row.map(v => (v != null ? v.toFixed(2) : ''))),
        texttemplate: '%{text}',
        showscale:     true,
        hoverongaps:   false,
      }]}
      layout={{
        title:         { text: 'Correlation Heatmap', font: { size: 14, color: '#1f2937' } },
        margin:        { t: 50, r: 20, b: 100, l: 100 },
        paper_bgcolor: 'transparent',
        height:        460,
        xaxis:         { tickangle: -45 },
      }}
      config={{ responsive: true, displayModeBar: false }}
      style={{ width: '100%' }}
    />
  )
}
