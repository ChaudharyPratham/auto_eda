import { useNavigate } from 'react-router-dom'
import FileUpload from '../components/FileUpload'
import FolderUpload from '../components/FolderUpload'
import DataFolderUpload from '../components/DataFolderUpload'

const FEATURES = [
  { icon: '📊', title: 'Auto Analysis', desc: 'Shape, dtypes, missing values, stats, outliers' },
  { icon: '🧹', title: 'Auto Cleaning', desc: 'Duplicates, nulls, type standardization' },
  { icon: '📈', title: 'Visualizations', desc: 'Histograms, box plots, heatmaps & more' },
  { icon: '⬇️', title: 'Download', desc: 'Export cleaned data and analysis report' },
]

export default function Home() {
  const navigate = useNavigate()

  function handleUploadSuccess(fileData) {
    navigate(`/dashboard/${fileData.file_id}`, { state: { fileData } })
  }

  function handleImageUploadSuccess(folderData) {
    navigate(`/image-dashboard/${folderData.folder_id}`, { state: { folderData } })
  }

  function handleDataFolderSuccess(data) {
    navigate('/multi-dashboard', { state: { files: data.files } })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex flex-col">
      {/* ── Header ── */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shadow-sm">
            <span className="text-white text-xs font-extrabold tracking-tight">EDA</span>
          </div>
          <span className="text-xl font-bold text-gray-900">Auto EDA</span>
          <span className="hidden sm:block text-gray-400 text-sm">
            Automated Exploratory Data Analysis
          </span>
        </div>
      </header>

      {/* ── Hero ── */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="text-center mb-10 max-w-2xl">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 leading-tight mb-4">
            Analyze your data{' '}
            <span className="text-blue-600">instantly</span>
          </h1>
          <p className="text-lg text-gray-500">
            Upload any dataset and get automatic analysis, smart cleaning, and
            beautiful visualizations — no code required.
          </p>
        </div>

        {/* ── Upload cards ── */}
        <div className="w-full max-w-2xl space-y-4">
          <FileUpload onSuccess={handleUploadSuccess} />
          <div className="flex items-center gap-3 text-gray-300">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400 font-medium">or upload a folder</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>
          <DataFolderUpload onSuccess={handleDataFolderSuccess} />
          <div className="flex items-center gap-3 text-gray-300">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400 font-medium">or upload an image dataset</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>
          <FolderUpload onSuccess={handleImageUploadSuccess} />
        </div>

        {/* ── Feature grid ── */}
        <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-5 max-w-4xl w-full">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 text-center hover:shadow-md transition-shadow"
            >
              <div className="text-3xl mb-2">{f.icon}</div>
              <div className="font-semibold text-gray-800 text-sm">{f.title}</div>
              <div className="text-gray-400 text-xs mt-1 leading-snug">{f.desc}</div>
            </div>
          ))}
        </div>

        {/* ── Supported formats ── */}
        <div className="mt-8 flex flex-wrap gap-2 justify-center">
          {['CSV', 'JSON', 'Excel (.xlsx)', 'TXT', 'Parquet', 'Avro', 'Jupyter (.ipynb)'].map((fmt) => (
            <span
              key={fmt}
              className="px-3 py-1 bg-white border border-gray-200 text-gray-500 rounded-full text-xs font-medium"
            >
              {fmt}
            </span>
          ))}
        </div>
      </main>

      <footer className="text-center py-4 text-xs text-gray-400">
        Auto EDA — open-source data analytics platform
      </footer>
    </div>
  )
}
