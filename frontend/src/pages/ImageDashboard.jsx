import { useParams, useLocation } from 'react-router-dom'
import ImageAnalysisPanel from '../components/ImageAnalysisPanel'

export default function ImageDashboard() {
  const { folderId } = useParams()
  const { state } = useLocation()
  const meta = state?.folderData || {}

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-purple-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="w-full max-w-screen-2xl mx-auto px-4 sm:px-8 py-3 flex items-center gap-3">
          <a href="/" className="w-9 h-9 bg-purple-600 rounded-xl flex items-center justify-center shadow-sm hover:bg-purple-700 transition-colors">
            <span className="text-white text-xs font-extrabold tracking-tight">EDA</span>
          </a>
          <span className="text-xl font-bold text-gray-900">Auto EDA</span>
          <span className="text-gray-300">·</span>
          <span className="text-gray-500 text-sm">Image Dataset</span>
          <div className="ml-auto flex items-center gap-2 text-xs text-gray-400">
            {meta.file_count != null && (
              <span className="px-2 py-1 bg-purple-50 border border-purple-100 rounded-full text-purple-600 font-medium">
                {meta.file_count} images uploaded
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 w-full max-w-screen-2xl mx-auto px-4 sm:px-8 py-6">
        <ImageAnalysisPanel folderId={folderId} />
      </main>

      <footer className="text-center py-3 text-xs text-gray-400">
        Auto EDA — open-source data analytics platform
      </footer>
    </div>
  )
}
