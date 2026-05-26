import { useState, useCallback } from 'react'
import { uploadFile } from '../services/api'

/**
 * useFileUpload
 * Encapsulates the upload state machine: idle → uploading → done / error.
 * Returns { upload, uploading, progress, error, fileData }
 */
export function useFileUpload() {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState(null)
  const [fileData, setFileData] = useState(null)

  const upload = useCallback(async (file) => {
    setUploading(true)
    setError(null)
    setProgress(0)

    try {
      const response = await uploadFile(file, (evt) => {
        const pct = evt.total ? Math.round((evt.loaded * 100) / evt.total) : 0
        setProgress(pct)
      })
      const data = response.data.data
      setFileData(data)
      return data
    } catch (err) {
      const msg =
        err.response?.data?.detail ||
        err.message ||
        'Upload failed. Please try again.'
      setError(msg)
      return null
    } finally {
      setUploading(false)
    }
  }, [])

  return { upload, uploading, progress, error, fileData }
}
