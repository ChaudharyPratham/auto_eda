import { useState } from 'react'
import { useLocation, Link } from 'react-router-dom'
import AnalysisPanel from '../components/AnalysisPanel'
import CleaningPanel from '../components/CleaningPanel'
import VisualizationPanel from '../components/VisualizationPanel'
import DownloadPanel from '../components/DownloadPanel'

const TABS = [
  { key: 'analysis',       label: '📊 Analysis' },
  { key: 'cleaning',       label: '🧹 Cleaning' },
  { key: 'visualizations', label: '📈 Visualizations' },
  { key: 'download',       label: '⬇️ Download' },
]

const EXT_COLORS = {
  csv:     'bg-green-100 text-green-700',
  json:    'bg-yellow-100 text-yellow-700',
  xlsx:    'bg-blue-100 text-blue-700',
  xls:     'bg-blue-100 text-blue-700',
  parquet: 'bg-purple-100 text-purple-700',
  avro:    'bg-orange-100 text-orange-700',
  txt:     'bg-gray-100 text-gray-600',
  ipynb:   'bg-pink-100 text-pink-700',
}

function extBadge(ext) {
  const key = ext.replace('.', '')
  const cls = EXT_COLORS[key] || 'bg-gray-100 text-gray-600'
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${cls}`}>
      {key}
    </span>
  )
}

export default function MultiDashboard() {
  const { state } = useLocation()
  const files = state?.files || []

  const [selectedIdx, setSelectedIdx] = useState(0)
  const [activeTab, setActiveTab] = useState('analysis')

  const selected = files[selectedIdx]

  if (!files.length) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-500 mb-4">No files found. Please upload a folder first.</p>
          <Link to="/" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            ← Back to Upload
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="w-full max-w-screen-2xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2 flex-shrink-0">
            <div className="w-8 h-8 bg-teal-600 rounded-xl flex items-center justify-center shadow-sm">
              <span className="text-white text-xs font-extrabold">EDA</span>
            </div>
            <span className="font-bold text-gray-900">Auto EDA</span>
          </Link>
          <span className="text-gray-300">/</span>
          <span className="text-gray-600 text-sm font-medium">Data Folder</span>
          <span className="ml-1 px-2 py-0.5 bg-teal-50 border border-teal-100 text-teal-700 rounded-full text-xs font-medium">
            {files.length} file{files.length !== 1 ? 's' : ''}
          </span>
          <Link to="/" className="ml-auto text-sm text-teal-600 hover:text-teal-700 font-medium whitespace-nowrap">
            + New upload
          </Link>
        </div>
      </header>

      {/* Mobile: horizontal file scroller | lg+: sidebar + content side-by-side */}
      <div className="w-full max-w-screen-2xl mx-auto px-4 sm:px-6 py-4 lg:py-6">

        {/* ── Mobile/tablet file picker (hidden on lg+) ── */}
        <div className="lg:hidden mb-4">
          <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide mb-2">Files</p>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {files.map((f, i) => (
              <button
                key={f.file_id}
                onClick={() => { setSelectedIdx(i); setActiveTab('analysis') }}
                className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs font-medium border transition-colors
                  ${selectedIdx === i
                    ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-teal-400'}`}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  {extBadge(f.extension)}
                </div>
                <span className="block max-w-[120px] truncate" title={f.filename}>{f.filename}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-5">
        {/* ── Desktop sidebar (hidden on mobile) ── */}
        <aside className="hidden lg:block w-56 xl:w-64 flex-shrink-0">
          <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide mb-2 px-1">Files</p>
          <ul className="space-y-1">
            {files.map((f, i) => (
              <li key={f.file_id}>
                <button
                  onClick={() => { setSelectedIdx(i); setActiveTab('analysis') }}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-colors
                    ${selectedIdx === i
                      ? 'bg-teal-600 text-white shadow-sm'
                      : 'hover:bg-gray-100 text-gray-700'}`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    {extBadge(f.extension)}
                    <span className={`text-xs ${selectedIdx === i ? 'text-teal-100' : 'text-gray-400'}`}>
                      {f.size_mb} MB
                    </span>
                  </div>
                  <span className="block truncate font-medium" title={f.filename}>
                    {f.filename}
                  </span>
                  <span className={`text-xs ${selectedIdx === i ? 'text-teal-200' : 'text-gray-400'}`}>
                    {f.rows.toLocaleString()} rows · {f.columns} cols
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* ── Analysis pane ── */}
        <div className="flex-1 min-w-0">
          {/* File title */}
          <div className="flex items-center gap-2 mb-4">
            {extBadge(selected.extension)}
            <h2 className="text-lg font-bold text-gray-900 truncate">{selected.filename}</h2>
            <span className="text-xs text-gray-400">{selected.rows.toLocaleString()} rows · {selected.columns} cols</span>
          </div>

          {/* Tab bar */}
          <div className="flex gap-1 bg-white rounded-xl p-1 border border-gray-200 shadow-sm mb-6 overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.key
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Panels — key on file_id forces remount when file changes */}
          {activeTab === 'analysis'       && <AnalysisPanel      key={selected.file_id} fileId={selected.file_id} />}
          {activeTab === 'cleaning'       && <CleaningPanel      key={selected.file_id} fileId={selected.file_id} />}
          {activeTab === 'visualizations' && <VisualizationPanel key={selected.file_id} fileId={selected.file_id} />}
          {activeTab === 'download'       && <DownloadPanel      key={selected.file_id} fileId={selected.file_id} fileData={selected} />}
        </div>
        </div>
      </div>
    </div>
  )
}
