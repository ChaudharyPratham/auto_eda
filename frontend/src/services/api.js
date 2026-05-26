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
