import axios from 'axios'

// In development Vite proxies /api → http://localhost:8000
// In Docker, nginx proxies /api → http://backend:8000
// Leave VITE_API_URL empty in both cases; set it only for custom deployments.
const BASE = import.meta.env.VITE_API_URL || '/api'

const client = axios.create({
  baseURL: BASE,
  timeout: 120_000, // 2 min – large files may take a while
})

/** Upload a dataset file. `onProgress` receives Axios ProgressEvent. */
export const uploadFile = (file, onProgress) => {
  const form = new FormData()
  form.append('file', file)
  return client.post('/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: onProgress,
  })
}

/** Fetch analysis results for a previously uploaded file. */
export const getAnalysis = (fileId) => client.get(`/analysis/${fileId}`)

/** Trigger cleaning for a previously uploaded file. */
export const cleanDataset = (fileId) => client.post(`/clean/${fileId}`)

/** Fetch visualization data for a previously uploaded file. */
export const getVisualizations = (fileId) => client.get(`/visualize/${fileId}`)

/** Build the download URL for the cleaned CSV. */
export const getCleanedDownloadUrl = (fileId) => `${BASE}/download/${fileId}/cleaned`

/** Build the download URL for the analysis report JSON. */
export const getReportDownloadUrl = (fileId) => `${BASE}/download/${fileId}/report`

// ── Image dataset API ─────────────────────────────────────────────────────────

/** Fetch full analysis for an uploaded image folder. */
export const getImageAnalysis = (folderId) => client.get(`/image/analyze/${folderId}`)

/** Fetch base64 thumbnail samples. */
export const getImageSamples = (folderId, n = 16) => client.get(`/image/samples/${folderId}?n=${n}`)

/** Trigger cleaning for an image folder. */
export const cleanImageFolder = (folderId, removeCorrupted = true, removeDuplicates = true) =>
  client.post(`/image/clean/${folderId}?remove_corrupted=${removeCorrupted}&remove_duplicates=${removeDuplicates}`)

/** Build the download URL for the cleaned images ZIP. */
export const getImageDownloadUrl = (folderId) => `${BASE}/image/download/${folderId}`

// ── Multi-file folder API ──────────────────────────────────────────────────

/**
 * Upload a folder of data files; backend combines them and returns a file_id
 * compatible with the standard analysis/cleaning/visualization pipeline.
 */
export const uploadDataFolder = (files, onProgress) => {
  const form = new FormData()
  for (const f of files) {
    form.append('files', f, f.webkitRelativePath || f.name)
  }
  return client.post('/multi/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: onProgress,
  })
}
