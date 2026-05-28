import { useEffect, useState } from 'react'
import Plot from 'react-plotly.js'
import {
  getImageAnalysis,
  getImageSamples,
  cleanImageFolder,
  getImageDownloadUrl,
} from '../services/api'

// ── tiny helpers ──────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color = 'blue' }) {
  const colors = {
    blue:   'bg-blue-50 border-blue-100 text-blue-700',
    green:  'bg-green-50 border-green-100 text-green-700',
    red:    'bg-red-50 border-red-100 text-red-700',
    purple: 'bg-purple-50 border-purple-100 text-purple-700',
    yellow: 'bg-yellow-50 border-yellow-100 text-yellow-700',
  }
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <div className="text-2xl font-bold">{value ?? '—'}</div>
      <div className="text-sm font-medium mt-0.5">{label}</div>
      {sub && <div className="text-xs opacity-70 mt-1">{sub}</div>}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="mb-8">
      <h3 className="text-base font-semibold text-gray-700 mb-3 pb-1 border-b border-gray-100">{title}</h3>
      {children}
    </div>
  )
}

const PLOTLY_LAYOUT = {
  paper_bgcolor: 'transparent',
  plot_bgcolor: 'transparent',
  margin: { t: 10, b: 40, l: 50, r: 10 },
  font: { size: 11, color: '#374151' },
}

// ── Image grid ────────────────────────────────────────────────────────────────
function ImageGrid({ folderId }) {
  const [samples, setSamples] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getImageSamples(folderId, 16)
      .then((r) => setSamples(r.data.data.samples || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [folderId])

  if (loading) return <p className="text-gray-400 text-sm">Loading previews…</p>
  if (!samples.length) return <p className="text-gray-400 text-sm">No previews available.</p>

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
      {samples.map((s, i) => (
        <div key={i} className="relative group rounded-lg overflow-hidden bg-gray-100 aspect-square">
          <img src={s.data} alt={s.filename} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-1">
            <span className="text-white text-xs font-semibold truncate w-full text-center">{s.label}</span>
            <span className="text-gray-300 text-[10px]">{s.size_kb} KB</span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Cleaning panel ────────────────────────────────────────────────────────────
function CleaningPanel({ folderId }) {
  const [removeCorrupted, setRemoveCorrupted] = useState(true)
  const [removeDuplicates, setRemoveDuplicates] = useState(true)
  const [cleaning, setCleaning] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  async function handleClean() {
    setCleaning(true)
    setError(null)
    setResult(null)
    try {
      const r = await cleanImageFolder(folderId, removeCorrupted, removeDuplicates)
      setResult(r.data.data)
    } catch (e) {
      setError(e.response?.data?.detail || e.message)
    } finally {
      setCleaning(false)
    }
  }

  return (
    <div className="bg-gray-50 rounded-xl p-5 border border-gray-200">
      <p className="text-sm text-gray-500 mb-4">
        Removes corrupted files and exact pixel-level duplicates. Cleaned images are saved server-side and can be downloaded as a ZIP.
      </p>
      <div className="flex flex-wrap gap-4 mb-4">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={removeCorrupted} onChange={(e) => setRemoveCorrupted(e.target.checked)}
            className="w-4 h-4 accent-purple-600" />
          <span className="text-sm font-medium text-gray-700">Remove corrupted images</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={removeDuplicates} onChange={(e) => setRemoveDuplicates(e.target.checked)}
            className="w-4 h-4 accent-purple-600" />
          <span className="text-sm font-medium text-gray-700">Remove duplicate images</span>
        </label>
      </div>
      <button
        onClick={handleClean}
        disabled={cleaning}
        className="px-5 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white font-semibold rounded-lg text-sm transition-colors"
      >
        {cleaning ? 'Cleaning…' : '🧹 Clean Dataset'}
      </button>

      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      {result && (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Images Kept"        value={result.kept}                color="green" />
            <StatCard label="Corrupted Removed"  value={result.removed_corrupted}   color="red" />
            <StatCard label="Duplicates Removed" value={result.removed_duplicates}  color="yellow" />
          </div>
          <a
            href={getImageDownloadUrl(folderId)}
            download="cleaned_images.zip"
            className="inline-flex items-center gap-2 px-5 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg text-sm transition-colors"
          >
            ⬇ Download Cleaned ZIP
          </a>
        </div>
      )}
    </div>
  )
}

// ── Main dashboard ─────────────────────────────────────────────────────────────
export default function ImageAnalysisPanel({ folderId }) {
  const [analysis, setAnalysis] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => {
    getImageAnalysis(folderId)
      .then((r) => setAnalysis(r.data.data))
      .catch((e) => setError(e.response?.data?.detail || e.message))
      .finally(() => setLoading(false))
  }, [folderId])

  if (loading) return (
    <div className="flex items-center justify-center h-48 gap-3">
      <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
      <span className="text-gray-500">Analyzing images…</span>
    </div>
  )

  if (error) return (
    <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">{error}</div>
  )

  if (!analysis) return null

  const a = analysis
  const tabs = ['overview', 'samples', 'charts', 'clean']

  return (
    <div>
      {/* Tab strip */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors
              ${activeTab === t ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {t === 'overview' ? '📊 Overview' :
             t === 'samples'  ? '🖼️ Preview' :
             t === 'charts'   ? '📈 Charts' : '🧹 Clean'}
          </button>
        ))}
      </div>

      {/* ── Overview ── */}
      {activeTab === 'overview' && (
        <>
          <Section title="Dataset Summary">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <StatCard label="Total Images"    value={a.total_images}                 color="blue" />
              <StatCard label="Valid Images"    value={a.valid_images}                 color="green" />
              <StatCard label="Classes"         value={a.class_count}  sub={a.is_structured ? 'from subdirs' : 'flat folder'} color="purple" />
              <StatCard label="Corrupted"       value={a.corrupted_count}              color="red" />
              <StatCard label="Duplicates"      value={a.duplicate_count}              color="yellow" />
            </div>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm text-gray-600">
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                <span className="font-medium">Total Size</span>
                <div className="text-gray-800 font-semibold">{a.total_size_mb} MB</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                <span className="font-medium">Avg Width</span>
                <div className="text-gray-800 font-semibold">{a.dimensions.width_mean}px</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                <span className="font-medium">Avg Height</span>
                <div className="text-gray-800 font-semibold">{a.dimensions.height_mean}px</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                <span className="font-medium">Formats</span>
                <div className="text-gray-800 font-semibold">{Object.keys(a.formats).join(', ')}</div>
              </div>
            </div>
          </Section>

          {a.is_structured && (
            <Section title="Class Distribution">
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                      <th className="text-left py-2 px-3 rounded-l">Class</th>
                      <th className="text-right py-2 px-3">Count</th>
                      <th className="text-right py-2 px-3 rounded-r">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(a.classes).sort((x, y) => y[1] - x[1]).map(([cls, cnt]) => (
                      <tr key={cls} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="py-2 px-3 font-mono text-gray-700">{cls}</td>
                        <td className="py-2 px-3 text-right">{cnt}</td>
                        <td className="py-2 px-3 text-right text-gray-400">
                          {((cnt / a.total_images) * 100).toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {a.corrupted_count > 0 && (
            <Section title="Corrupted Files (sample)">
              <ul className="text-xs font-mono text-red-600 space-y-0.5">
                {a.corrupted_files.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            </Section>
          )}
        </>
      )}

      {/* ── Preview ── */}
      {activeTab === 'samples' && (
        <Section title="Image Sample (up to 16)">
          <ImageGrid folderId={folderId} />
        </Section>
      )}

      {/* ── Charts ── */}
      {activeTab === 'charts' && (
        <>
          {a.is_structured && (
            <Section title="Class Balance">
              <Plot
                data={[{
                  type: 'bar',
                  x: Object.keys(a.classes),
                  y: Object.values(a.classes),
                  marker: { color: '#7c3aed' },
                }]}
                layout={{ ...PLOTLY_LAYOUT, height: 280, xaxis: { title: 'Class' }, yaxis: { title: 'Images' } }}
                config={{ responsive: true, displayModeBar: 'hover' }}
                style={{ width: '100%' }}
              />
            </Section>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Section title="Width Distribution">
              <Plot
                data={[{
                  type: 'bar',
                  x: a.width_histogram.bins,
                  y: a.width_histogram.counts,
                  marker: { color: '#3b82f6' },
                }]}
                layout={{ ...PLOTLY_LAYOUT, height: 230, xaxis: { title: 'Width (px)' }, yaxis: { title: 'Count' } }}
                config={{ responsive: true, displayModeBar: 'hover' }}
                style={{ width: '100%' }}
              />
            </Section>

            <Section title="Height Distribution">
              <Plot
                data={[{
                  type: 'bar',
                  x: a.height_histogram.bins,
                  y: a.height_histogram.counts,
                  marker: { color: '#10b981' },
                }]}
                layout={{ ...PLOTLY_LAYOUT, height: 230, xaxis: { title: 'Height (px)' }, yaxis: { title: 'Count' } }}
                config={{ responsive: true, displayModeBar: 'hover' }}
                style={{ width: '100%' }}
              />
            </Section>

            <Section title="Color Channels">
              <Plot
                data={[{
                  type: 'pie',
                  labels: Object.keys(a.channels),
                  values: Object.values(a.channels),
                  marker: { colors: ['#6b7280', '#3b82f6', '#06b6d4', '#f59e0b'] },
                  textinfo: 'label+percent',
                }]}
                layout={{ ...PLOTLY_LAYOUT, height: 230, margin: { t: 10, b: 10, l: 10, r: 10 } }}
                config={{ responsive: true, displayModeBar: 'hover' }}
                style={{ width: '100%' }}
              />
            </Section>

            <Section title="File Formats">
              <Plot
                data={[{
                  type: 'pie',
                  labels: Object.keys(a.formats),
                  values: Object.values(a.formats),
                  marker: { colors: ['#7c3aed', '#db2777', '#d97706', '#065f46'] },
                  textinfo: 'label+percent',
                }]}
                layout={{ ...PLOTLY_LAYOUT, height: 230, margin: { t: 10, b: 10, l: 10, r: 10 } }}
                config={{ responsive: true, displayModeBar: 'hover' }}
                style={{ width: '100%' }}
              />
            </Section>
          </div>
        </>
      )}

      {/* ── Clean ── */}
      {activeTab === 'clean' && (
        <Section title="Clean Dataset">
          <CleaningPanel folderId={folderId} />
        </Section>
      )}
    </div>
  )
}
