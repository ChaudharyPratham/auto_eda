import { useRef, useState } from 'react'

const DATA_EXTS = new Set([
  'csv', 'json', 'xlsx', 'xls', 'txt', 'parquet', 'ipynb', 'avro',
])

function isDataFile(file) {
  const ext = file.name.split('.').pop()?.toLowerCase()
  return DATA_EXTS.has(ext)
}

export default function DataFolderUpload({ onSuccess }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState(null)
  const [fileCount, setFileCount] = useState(0)
  const [mode, setMode] = useState('separate') // 'separate' | 'combined'

  async function uploadFiles(rawFiles) {
    setError(null)
    const dataFiles = Array.from(rawFiles).filter(isDataFile)
    if (dataFiles.length === 0) {
      setError('No supported data files found. Accepted: CSV, JSON, Excel, TXT, Parquet, Avro, Jupyter')
      return
    }
    setFileCount(dataFiles.length)
    setUploading(true)
    setProgress(0)

    const form = new FormData()
    for (const f of dataFiles) {
      const relativePath = f.webkitRelativePath || f.name
      form.append('files', f, relativePath)
    }

    try {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', `/api/multi/upload?mode=${mode}`)
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100))
      }
      const result = await new Promise((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText))
          } else {
            try {
              reject(new Error(JSON.parse(xhr.responseText).detail || 'Upload failed'))
            } catch {
              reject(new Error(`Upload failed (${xhr.status})`))
            }
          }
        }
        xhr.onerror = () => reject(new Error('Network error during upload'))
        xhr.send(form)
      })
      onSuccess(result.data)
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  function onDrop(e) {
    e.preventDefault()
    setDragging(false)
    const items = e.dataTransfer.items
    if (items) {
      const files = []
      let pending = items.length
      if (pending === 0) return
      for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry?.()
        if (entry) {
          traverseEntry(entry, files, () => {
            pending--
            if (pending === 0 && files.length > 0) uploadFiles(files)
          })
        } else {
          pending--
        }
      }
    } else {
      uploadFiles(e.dataTransfer.files)
    }
  }

  function traverseEntry(entry, files, done) {
    if (entry.isFile) {
      entry.file((f) => { files.push(f); done() })
    } else if (entry.isDirectory) {
      const reader = entry.createReader()
      reader.readEntries((entries) => {
        let p = entries.length
        if (p === 0) { done(); return }
        for (const e of entries) {
          traverseEntry(e, files, () => { p--; if (p === 0) done() })
        }
      })
    } else {
      done()
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">🗂️</span>
        <div>
          <h2 className="font-bold text-gray-900 text-lg">Data Folder</h2>
          <p className="text-gray-400 text-xs">Upload a folder of CSV, JSON, Excel, Parquet, Avro, or TXT files</p>
        </div>
      </div>

      {/* ── Mode picker ── */}
      <div className="flex gap-3 mb-4">
        {[
          {
            value: 'separate',
            label: 'Analyze Separately',
            desc: 'Each file gets its own full analysis dashboard',
            icon: '📂',
          },
          {
            value: 'combined',
            label: 'Combine & Analyze',
            desc: 'Schema staging → fuzzy value mapping → 3NF merge → one dataset',
            icon: '🔗',
          },
        ].map((opt) => (
          <label
            key={opt.value}
            className={`flex-1 flex gap-2 p-3 border-2 rounded-xl cursor-pointer transition-colors select-none
              ${mode === opt.value
                ? 'border-teal-500 bg-teal-50'
                : 'border-gray-200 hover:border-teal-300'}`}
          >
            <input
              type="radio"
              name="folder-mode"
              value={opt.value}
              checked={mode === opt.value}
              onChange={() => setMode(opt.value)}
              className="mt-0.5 accent-teal-600"
            />
            <div>
              <div className="text-sm font-semibold text-gray-800">{opt.icon} {opt.label}</div>
              <div className="text-xs text-gray-400 mt-0.5">{opt.desc}</div>
            </div>
          </label>
        ))}
      </div>

      {/* Combined mode info */}
      {mode === 'combined' && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 space-y-0.5">
          <p className="font-semibold">Combined pipeline steps:</p>
          <p>① Schema normalisation (snake_case columns, type casting)</p>
          <p>② Fuzzy value mapping (e.g. "ind / india / bharat" → "india")</p>
          <p>③ Outer concat — no row or column dropped; corrupted cells get median/mode defaults</p>
          <p>④ 3NF decomposition — low-cardinality columns split into dimension tables</p>
        </div>
      )}

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !uploading && inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors
          ${dragging ? 'border-teal-400 bg-teal-50' : 'border-gray-200 hover:border-teal-300 hover:bg-teal-50/40'}
          ${uploading ? 'pointer-events-none opacity-60' : ''}`}
      >
        <input
          ref={inputRef}
          type="file"
          {...{ webkitdirectory: '', directory: '', multiple: true }}
          className="hidden"
          onChange={(e) => uploadFiles(e.target.files)}
        />

        {uploading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-teal-700 font-semibold">
              Uploading {fileCount} file{fileCount !== 1 ? 's' : ''}… {progress}%
            </p>
            <div className="w-48 bg-gray-200 rounded-full h-2">
              <div className="bg-teal-500 h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-gray-400">
            <span className="text-5xl">📁</span>
            <p className="font-medium text-gray-600">Drop a data folder here or click to browse</p>
            <p className="text-xs">All files will be combined into a single dataset for analysis</p>
            <p className="text-xs mt-1 text-teal-500 font-medium">
              Tip: Files with the same columns are perfectly combined, mismatched columns get NaN fill
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {['CSV', 'JSON', 'Excel', 'Parquet', 'Avro', 'TXT', 'Jupyter'].map((f) => (
          <span key={f} className="px-2 py-0.5 bg-teal-50 border border-teal-100 text-teal-600 rounded-full text-xs font-medium">
            {f}
          </span>
        ))}
      </div>
    </div>
  )
}
