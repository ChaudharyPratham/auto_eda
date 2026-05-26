import { getCleanedDownloadUrl, getReportDownloadUrl } from '../services/api'

/**
 * DownloadPanel
 * Provides download buttons for the cleaned dataset (CSV) and the
 * analysis report (JSON).
 */
export default function DownloadPanel({ fileId, fileData }) {
  function triggerDownload(url, filename) {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {/* ── Cleaned dataset ── */}
        <DownloadCard
          icon="📊"
          title="Cleaned Dataset"
          description="Download the auto-cleaned dataset as a CSV file. Run the Cleaning tab first."
          buttonLabel="Download Cleaned CSV"
          buttonClass="bg-blue-600 hover:bg-blue-700"
          onClick={() => triggerDownload(getCleanedDownloadUrl(fileId), `cleaned_${fileId}.csv`)}
        />

        {/* ── Analysis report ── */}
        <DownloadCard
          icon="📋"
          title="Analysis Report"
          description="Download the full analysis results (shape, stats, outliers, correlations) as JSON."
          buttonLabel="Download Report JSON"
          buttonClass="bg-indigo-600 hover:bg-indigo-700"
          onClick={() => triggerDownload(getReportDownloadUrl(fileId), `report_${fileId}.json`)}
        />
      </div>

      {/* ── File info strip ── */}
      {fileData && (
        <div className="bg-blue-50 border border-blue-100 rounded-2xl px-5 py-4">
          <h4 className="text-sm font-semibold text-blue-800 mb-3">Uploaded File</h4>
          <div className="flex flex-wrap gap-6 text-sm">
            <InfoItem label="Name"   value={fileData.filename} />
            <InfoItem label="Size"   value={`${fileData.size_mb} MB`} />
            <InfoItem label="Format" value={fileData.extension} />
            <InfoItem label="Engine" value={fileData.engine} />
          </div>
        </div>
      )}
    </div>
  )
}

function DownloadCard({ icon, title, description, buttonLabel, buttonClass, onClick }) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col">
      <div className="text-4xl mb-3">{icon}</div>
      <h3 className="font-bold text-gray-900 mb-1">{title}</h3>
      <p className="text-gray-500 text-sm mb-6 flex-1">{description}</p>
      <button
        onClick={onClick}
        className={`w-full py-2.5 rounded-xl text-white font-semibold text-sm transition-colors ${buttonClass}`}
      >
        {buttonLabel}
      </button>
    </div>
  )
}

function InfoItem({ label, value }) {
  return (
    <div>
      <span className="text-blue-600 font-medium">{label}:</span>{' '}
      <span className="text-gray-700">{value}</span>
    </div>
  )
}
