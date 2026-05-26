import { useState } from 'react'
import { useParams, useLocation, Link } from 'react-router-dom'
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

export default function Dashboard() {
  const { fileId } = useParams()
  const { state } = useLocation()
  const fileData = state?.fileData

  const [activeTab, setActiveTab] = useState('analysis')

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Sticky header ── */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center gap-3">
          {/* Logo / back link */}
          <Link to="/" className="flex items-center gap-2 flex-shrink-0">
            <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center shadow-sm">
              <span className="text-white text-xs font-extrabold">EDA</span>
            </div>
            <span className="font-bold text-gray-900">Auto EDA</span>
          </Link>

          <span className="text-gray-300">/</span>

          {/* File info badges */}
          {fileData && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-gray-700 text-sm font-medium truncate max-w-xs">
                {fileData.filename}
              </span>
              <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">
                {fileData.size_mb} MB
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  fileData.engine === 'spark'
                    ? 'bg-orange-100 text-orange-700'
                    : 'bg-green-100 text-green-700'
                }`}
              >
                {fileData.engine}
              </span>
            </div>
          )}

          <Link
            to="/"
            className="ml-auto text-sm text-blue-600 hover:text-blue-700 font-medium whitespace-nowrap"
          >
            + New upload
          </Link>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* ── Tab bar ── */}
        <div className="flex gap-1 bg-white rounded-xl p-1 border border-gray-200 shadow-sm mb-8 w-fit overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.key
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Tab panels ── */}
        {activeTab === 'analysis'       && <AnalysisPanel       fileId={fileId} />}
        {activeTab === 'cleaning'       && <CleaningPanel       fileId={fileId} />}
        {activeTab === 'visualizations' && <VisualizationPanel  fileId={fileId} />}
        {activeTab === 'download'       && <DownloadPanel       fileId={fileId} fileData={fileData} />}
      </div>
    </div>
  )
}
