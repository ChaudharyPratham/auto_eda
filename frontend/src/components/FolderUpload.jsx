import { useRef, useState } from 'react'

const IMAGE_EXTS = new Set([
  'png', 'jpg', 'jpeg', 'bmp', 'gif', 'tiff', 'tif', 'webp',
])

function isImageFile(file) {
  const ext = file.name.split('.').pop()?.toLowerCase()
  return IMAGE_EXTS.has(ext)
}

export default function FolderUpload({ onSuccess }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState(null)
  const [fileCount, setFileCount] = useState(0)

  async function uploadFiles(files) {
    setError(null)
    const imageFiles = Array.from(files).filter(isImageFile)
    if (imageFiles.length === 0) {
      setError('No image files found. Please select a folder containing PNG, JPG, JPEG, BMP, GIF, TIFF, or WebP images.')
      return
    }
    setFileCount(imageFiles.length)
    setUploading(true)
    setProgress(0)

    const form = new FormData()
    for (const f of imageFiles) {
      // webkitRelativePath preserves the folder structure (e.g. "cats/001.jpg")
      const relativePath = f.webkitRelativePath || f.name
      form.append('files', f, relativePath)
    }

    try {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', '/api/image/upload')
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100))
      }
      const result = await new Promise((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText))
          } else {
            try {
              const err = JSON.parse(xhr.responseText)
              reject(new Error(err.detail || 'Upload failed'))
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
      // Try the DataTransferItem API (preserves directory structure)
      const files = []
      for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry?.()
        if (entry) traverseEntry(entry, files, () => {
          if (files.length > 0) uploadFiles(files)
        })
      }
    } else {
      uploadFiles(e.dataTransfer.files)
    }
  }

  // Recursively collect files from a dropped directory entry
  function traverseEntry(entry, files, done) {
    if (entry.isFile) {
      entry.file((f) => {
        files.push(f)
        done()
      })
    } else if (entry.isDirectory) {
      const reader = entry.createReader()
      reader.readEntries((entries) => {
        let pending = entries.length
        if (pending === 0) { done(); return }
        for (const e of entries) {
          traverseEntry(e, files, () => {
            pending--
            if (pending === 0) done()
          })
        }
      })
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">🖼️</span>
        <div>
          <h2 className="font-bold text-gray-900 text-lg">Image Dataset</h2>
          <p className="text-gray-400 text-xs">For deep learning — upload an image folder with optional class subdirectories</p>
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !uploading && inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors
          ${dragging ? 'border-purple-400 bg-purple-50' : 'border-gray-200 hover:border-purple-300 hover:bg-purple-50/40'}
          ${uploading ? 'pointer-events-none opacity-60' : ''}`}
      >
        <input
          ref={inputRef}
          type="file"
          // webkitdirectory allows selecting a folder
          {...{ webkitdirectory: '', directory: '', multiple: true }}
          accept="image/*"
          className="hidden"
          onChange={(e) => uploadFiles(e.target.files)}
        />

        {uploading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-purple-700 font-semibold">
              Uploading {fileCount} images… {progress}%
            </p>
            <div className="w-48 bg-gray-200 rounded-full h-2">
              <div
                className="bg-purple-500 h-2 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-gray-400">
            <span className="text-5xl">📂</span>
            <p className="font-medium text-gray-600">Drop a folder here or click to browse</p>
            <p className="text-xs">Supports PNG, JPG, JPEG, BMP, GIF, TIFF, WebP</p>
            <p className="text-xs mt-1 text-purple-400 font-medium">
              Tip: Organize sub-folders by class label for class-distribution analysis
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Supported formats */}
      <div className="mt-4 flex flex-wrap gap-2">
        {['PNG', 'JPG', 'JPEG', 'BMP', 'GIF', 'TIFF', 'WebP'].map((f) => (
          <span key={f} className="px-2 py-0.5 bg-purple-50 border border-purple-100 text-purple-600 rounded-full text-xs font-medium">
            {f}
          </span>
        ))}
      </div>
    </div>
  )
}
