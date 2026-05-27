import { useNavigate } from 'react-router-dom'
import FileUpload from '../components/FileUpload'
import FolderUpload from '../components/FolderUpload'
import DataFolderUpload from '../components/DataFolderUpload'
import CloudImport from '../components/CloudImport'

const FEATURES = [
  { icon: '📊', title: 'Auto Analysis', desc: 'Shape, dtypes, missing values, stats, outliers' },
  { icon: '🧹', title: 'Auto Cleaning', desc: 'Duplicates, nulls, type standardization' },
  { icon: '📈', title: 'Visualizations', desc: 'Histograms, box plots, heatmaps & more' },
  { icon: '⬇️', title: 'Download', desc: 'Export cleaned data and analysis report' },
]

function Divider({ label }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-px bg-gray-200" />
      <span className="text-xs text-gray-400 font-medium whitespace-nowrap">{label}</span>
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  )
}

export default function Home() {
  const navigate = useNavigate()

  function handleUploadSuccess(fileData) {
    navigate(`/dashboard/${fileData.file_id}`, { state: { fileData } })
  }

  function handleImageUploadSuccess(folderData) {
    navigate(`/image-dashboard/${folderData.folder_id}`, { state: { folderData } })
  }

  function handleDataFolderSuccess(data) {
    if (data.mode === 'combined') {
      navigate(`/dashboard/${data.file_id}`, { state: { fileData: data } })
    } else {
      navigate('/multi-dashboard', { state: { files: data.files } })
    }
  }

  function handleCloudSuccess(data) {
    if (data.import_mode === 'image_folder') {
      navigate(`/image-dashboard/${data.folder_id}`, { state: { folderData: data } })
    } else if (data.import_mode === 'data_folder') {
      navigate('/multi-dashboard', { state: { files: [] } })
    } else {
      navigate(`/dashboard/${data.file_id}`, { state: { fileData: data } })
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex flex-col">

      {/* ── Header ── */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="w-full max-w-screen-2xl mx-auto px-4 sm:px-8 py-3 flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shadow-sm flex-shrink-0">
            <span className="text-white text-xs font-extrabold tracking-tight">EDA</span>
          </div>
          <span className="text-xl font-bold text-gray-900">Auto EDA</span>
          <span className="hidden sm:block text-gray-400 text-sm">— Automated Exploratory Data Analysis</span>
        </div>
      </header>

      {/* ── Two-column layout on lg+; single column below ── */}
      <main className="flex-1 w-full max-w-screen-2xl mx-auto px-4 sm:px-8 py-8 lg:py-12">
        <div className="flex flex-col lg:flex-row gap-10 xl:gap-16 items-start">

          {/* ── LEFT: hero + feature cards ── */}
          <div className="lg:sticky lg:top-20 lg:w-[42%] xl:w-[38%] flex-shrink-0 space-y-8">
            <div>
              <h1 className="text-3xl sm:text-4xl xl:text-5xl font-extrabold text-gray-900 leading-tight mb-4">
                Analyze your data{' '}
                <span className="text-blue-600">instantly</span>
              </h1>
              <p className="text-base sm:text-lg text-gray-500 leading-relaxed">
                Upload any dataset and get automatic analysis, smart cleaning,
                and beautiful visualizations — no code required.
              </p>
            </div>

            {/* Feature grid */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              {FEATURES.map((f) => (
                <div
                  key={f.title}
                  className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
                >
                  <div className="text-2xl mb-1.5">{f.icon}</div>
                  <div className="font-semibold text-gray-800 text-sm">{f.title}</div>
                  <div className="text-gray-400 text-xs mt-0.5 leading-snug">{f.desc}</div>
                </div>
              ))}
            </div>

            {/* Supported formats */}
            <div className="flex flex-wrap gap-2">
              {['CSV', 'JSON', 'Excel', 'TXT', 'Parquet', 'Avro', 'Jupyter (.ipynb)'].map((fmt) => (
                <span
                  key={fmt}
                  className="px-2.5 py-1 bg-white border border-gray-200 text-gray-400 rounded-full text-xs font-medium"
                >
                  {fmt}
                </span>
              ))}
            </div>
          </div>

          {/* ── RIGHT: upload forms ── */}
          <div className="flex-1 min-w-0 w-full space-y-4">
            <FileUpload onSuccess={handleUploadSuccess} />

            <Divider label="or upload a data folder" />
            <DataFolderUpload onSuccess={handleDataFolderSuccess} />

            <Divider label="or upload an image dataset" />
            <FolderUpload onSuccess={handleImageUploadSuccess} />

            <Divider label="or import from cloud" />
            <CloudImport onSuccess={handleCloudSuccess} />
          </div>

        </div>
      </main>

      <footer className="text-center py-4 text-xs text-gray-400 border-t border-gray-100">
        Auto EDA — open-source data analytics platform
      </footer>
    </div>
  )
}
