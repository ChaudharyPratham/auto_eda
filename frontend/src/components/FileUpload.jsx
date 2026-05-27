import { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { useFileUpload } from '../hooks/useFileUpload'

const ACCEPTED_TYPES = {
  'text/csv':                                                               ['.csv'],
  'application/json':                                                       ['.json'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':     ['.xlsx'],
  'application/vnd.ms-excel':                                              ['.xls'],
  'text/plain':                                                             ['.txt'],
  'application/octet-stream':                                              ['.parquet'],
  'application/x-ipynb+json':                                              ['.ipynb'],
}

/**
 * FileUpload
 * Drag-and-drop (or click-to-browse) upload widget.
 * Calls `onSuccess(fileData)` after a successful upload.
 */
export default function FileUpload({ onSuccess }) {
  const { upload, uploading, progress, error } = useFileUpload()

  const onDrop = useCallback(async (accepted) => {
    if (accepted.length === 0) return
    const data = await upload(accepted[0])
    if (data) onSuccess(data)
  }, [upload, onSuccess])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxFiles: 1,
    disabled: uploading,
  })

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        className={[
          'border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center cursor-pointer',
          'transition-all duration-200 select-none',
          isDragActive
            ? 'border-blue-500 bg-blue-50 scale-[1.01]'
            : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50',
          uploading ? 'opacity-60 cursor-not-allowed' : '',
        ].join(' ')}
      >
        <input {...getInputProps()} />

        {uploading ? (
          /* ── Upload in progress ── */
          <div>
            <div className="text-4xl mb-4">⏳</div>
            <p className="text-gray-700 font-semibold mb-4">Uploading…</p>
            <div className="w-full bg-gray-200 rounded-full h-2.5 max-w-xs mx-auto">
              <div
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-sm text-gray-400 mt-2">{progress}%</p>
          </div>
        ) : (
          /* ── Idle / drag-over ── */
          <div>
            <div className="text-5xl mb-4">{isDragActive ? '📂' : '📁'}</div>
            <p className="text-gray-800 font-semibold text-lg mb-1">
              {isDragActive ? 'Drop your file here' : 'Drag & drop your dataset'}
            </p>
            <p className="text-gray-400 text-sm mb-5">or click to browse files</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {['CSV', 'JSON', 'Excel', 'TXT', 'Parquet', 'Jupyter (.ipynb)'].map((fmt) => (
                <span
                  key={fmt}
                  className="px-3 py-1 bg-gray-100 text-gray-500 rounded-full text-xs font-medium"
                >
                  {fmt}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          <strong>Upload failed:</strong> {error}
        </div>
      )}
    </div>
  )
}
