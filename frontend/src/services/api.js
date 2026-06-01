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

/** Fetch column metadata (name, type, sample_values) for the chart builder. */
export const getColumnInfo = (fileId) => client.get(`/visualize/${fileId}/columns`)

/** Build a single custom chart with optional filters — used by Chart Builder. */
export const buildCustomChart = (fileId, body) => client.post(`/visualize/${fileId}/custom`, body)

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
 * Import a file from a cloud provider.
 * Credentials are read server-side from .env – only the URI is sent here.
 */
export const cloudImport = (provider, uri, containerOrBucket = null, blobOrKey = null) =>
  client.post('/cloud/import', { provider, uri, container_or_bucket: containerOrBucket, blob_or_key: blobOrKey })

/**
 * Fetch cleaned data via API key (paginated).
 * Pass apiKey via X-API-Key header.
 */
export const getExposedData = (fileId, apiKey, page = 1, pageSize = 100, columns = '') =>
  client.get(`/data/${fileId}`, {
    params: { page, page_size: pageSize, ...(columns ? { columns } : {}) },
    headers: { 'X-API-Key': apiKey },
  })

// ── Streaming Analytics API ───────────────────────────────────────────────────

/** Return the last `limit` 1-minute aggregation windows (ascending).
 *  Pass `service` to get per-service windows computed from stream_events. */
export const getStreamMetrics = (limit = 60, service = '') =>
  client.get(`/stream/metrics?limit=${limit}${service ? `&service=${service}` : ''}`)

/** Return the most-recent metric snapshot and unresolved alerts. */
export const getStreamLatest = () => client.get('/stream/latest')

/** Return the latest raw events from the ingest endpoint. */
export const getStreamEvents = (limit = 100, service = '') =>
  client.get(`/stream/events?limit=${limit}${service ? `&service=${service}` : ''}`)

/** Create a new API key. Returns { key, name, id, created_at } — key shown once. */
export const createApiKey = (name) => client.post('/stream/api-key', { name })

/** List all API keys (no plain text). */
export const getApiKeys = () => client.get('/stream/api-keys')

/** Revoke an API key by id. */
export const deleteApiKey = (id) => client.delete(`/stream/api-key/${id}`)

