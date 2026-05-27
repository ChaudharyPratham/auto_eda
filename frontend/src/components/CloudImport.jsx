import { useState } from 'react'

const PROVIDERS = [
  {
    id: 'azure',
    label: 'Azure Blob',
    icon: '☁️',
    color: 'blue',
    placeholder: 'https://<account>.blob.core.windows.net/<container>/<blob>\nor  az://<container>/<blob>',
    folderPlaceholder: 'az://<container>/<prefix>/\ne.g.  az://my-container/datasets/sales-2024/',
    envVars: ['AZURE_STORAGE_CONNECTION_STRING', 'AZURE_STORAGE_ACCOUNT_NAME + KEY'],
  },
  {
    id: 'aws',
    label: 'AWS S3',
    icon: '🟠',
    color: 'orange',
    placeholder: 's3://<bucket>/<key>',
    folderPlaceholder: 's3://<bucket>/<prefix>/\ne.g.  s3://my-bucket/datasets/monthly/',
    envVars: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION'],
  },
  {
    id: 'gcp',
    label: 'GCP Storage',
    icon: '🔵',
    color: 'green',
    placeholder: 'gs://<bucket>/<object>',
    folderPlaceholder: 'gs://<bucket>/<prefix>/\ne.g.  gs://my-bucket/datasets/q1-2024/',
    envVars: ['GCP_PROJECT_ID', 'GCP_CREDENTIALS_JSON'],
  },
  {
    id: 'databricks',
    label: 'Databricks',
    icon: '⚡',
    color: 'red',
    placeholder: 'dbfs:/FileStore/datasets/file.parquet\nor  /Volumes/catalog/schema/volume/file.csv',
    folderPlaceholder: 'dbfs:/FileStore/datasets/my-folder/\nor  /Volumes/catalog/schema/volume/my-folder/',
    envVars: ['DATABRICKS_HOST', 'DATABRICKS_TOKEN'],
  },
]

const COLOR = {
  blue:   { tab: 'bg-blue-600',   ring: 'ring-blue-300',   badge: 'bg-blue-50 text-blue-700 border-blue-100' },
  orange: { tab: 'bg-orange-500', ring: 'ring-orange-300', badge: 'bg-orange-50 text-orange-700 border-orange-100' },
  green:  { tab: 'bg-green-600',  ring: 'ring-green-300',  badge: 'bg-green-50 text-green-700 border-green-100' },
  red:    { tab: 'bg-red-600',    ring: 'ring-red-300',    badge: 'bg-red-50 text-red-700 border-red-100' },
}

export default function CloudImport({ onSuccess }) {
  const [activeProvider, setActiveProvider] = useState('azure')
  const [importType, setImportType] = useState('file')  // 'file' | 'folder'
  const [uri, setUri] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const provider = PROVIDERS.find((p) => p.id === activeProvider)

  async function handleImport() {
    if (!uri.trim()) { setError('Enter a URI first.'); return }
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/cloud/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: activeProvider, uri: uri.trim(), import_type: importType }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.detail || 'Import failed')
      onSuccess(json.data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">☁️</span>
        <div>
          <h2 className="font-bold text-gray-900 text-lg">Import from Cloud</h2>
          <p className="text-gray-400 text-xs">Azure Blob · AWS S3 · GCP Storage · Databricks — credentials from server .env</p>
        </div>
      </div>

      {/* Import type toggle */}
      <div className="flex gap-2 mb-4">
        {[
          { value: 'file',   label: '📄 Single File',     desc: 'One file → normal analysis' },
          { value: 'folder', label: '📁 Folder / Prefix', desc: 'Images → Image Dashboard · Data → Multi-file' },
        ].map((opt) => (
          <label key={opt.value}
            className={`flex-1 flex gap-2 p-2.5 border-2 rounded-xl cursor-pointer text-xs transition-colors select-none
              ${importType === opt.value ? 'border-gray-700 bg-gray-50' : 'border-gray-200 hover:border-gray-400'}`}>
            <input type="radio" name="cloud-import-type" value={opt.value}
              checked={importType === opt.value} onChange={() => setImportType(opt.value)}
              className="mt-0.5 accent-gray-700" />
            <div>
              <div className="font-semibold text-gray-800">{opt.label}</div>
              <div className="text-gray-400">{opt.desc}</div>
            </div>
          </label>
        ))}
      </div>

      {/* Provider tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-5 w-fit flex-wrap">
        {PROVIDERS.map((p) => (
          <button
            key={p.id}
            onClick={() => { setActiveProvider(p.id); setUri(''); setError(null) }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
              ${activeProvider === p.id
                ? `${COLOR[p.color].tab} text-white shadow-sm`
                : 'text-gray-500 hover:text-gray-700'}`}
          >
            <span>{p.icon}</span>{p.label}
          </button>
        ))}
      </div>

      {/* URI input */}
      <div className="mb-3">
        <label className="block text-xs font-medium text-gray-500 mb-1">
          {importType === 'folder' ? 'Folder / Prefix URI' : 'File URI'}
        </label>
        <textarea
          rows={2}
          value={uri}
          onChange={(e) => setUri(e.target.value)}
          placeholder={importType === 'folder' ? provider.folderPlaceholder : provider.placeholder}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono text-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-blue-300 placeholder-gray-300"
        />
        {importType === 'folder' && (
          <p className="mt-1 text-xs text-gray-400">
            Supports .csv, .json, .xlsx, .parquet, .avro, .txt and image files — all files under the prefix are downloaded.
          </p>
        )}
      </div>

      {/* Env vars hint */}
      <div className={`text-xs rounded-lg p-2 mb-4 border ${COLOR[provider.color].badge}`}>
        <span className="font-semibold">Required env vars: </span>
        {provider.envVars.join(' · ')}
        <span className="ml-1 opacity-60">(set in backend .env)</span>
      </div>

      <button
        onClick={handleImport}
        disabled={loading || !uri.trim()}
        className="px-5 py-2 bg-gray-900 hover:bg-gray-700 disabled:bg-gray-300 text-white font-semibold rounded-lg text-sm transition-colors"
      >
        {loading ? 'Importing…' : importType === 'folder' ? '📁 Import Folder' : '⬆ Import File'}
      </button>

      {error && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}
    </div>
  )
}
