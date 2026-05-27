# Auto EDA

An open-source, full-stack **Automated Exploratory Data Analysis** platform.  
Upload any dataset (or a whole folder, or pull straight from the cloud) and get instant analysis, smart selective cleaning, interactive visualizations, a downloadable report, and a per-dataset REST API — no code required.

> **Live repo:** https://github.com/ChaudharyPratham/auto_eda

---

## Feature Overview

### Data Ingestion
| Upload method | What you get |
|---|---|
| Single file drag-and-drop | CSV · JSON · Excel (.xlsx/.xls) · TXT · Parquet · Avro · Jupyter (.ipynb) |
| Data folder (multi-file) | **Separate mode** — each file gets its own dashboard tab · **Combined mode** — schema-normalised + fuzzy-deduped merge → one dataset |
| Image folder | PNG · JPG · JPEG · BMP · WEBP — class detection, duplicate & corruption scan, clean + ZIP download |
| Cloud import | Azure Blob · AWS S3 · GCP Storage · Databricks DBFS — single file **or** full prefix/folder |

### Analysis
- Shape, column dtypes, missing-value counts & percentages
- Duplicate row count
- Descriptive statistics (mean, std, min, max, quartiles)
- IQR-based outlier counts per numeric column
- Full correlation matrix

### Selective Cleaning
The Cleaning tab **scans the dataset first** and presents a grouped checklist of detected issues:  
`Duplicates` · `Missing Values` (one entry per column with fill strategy) · `Column Names` (snake_case rename) · `Type Conversion` (text → number) · `Outliers` (IQR drop)  
Severity badges — 🔴 error / 🟡 warning / 🔵 info — are auto-assigned.  
You select exactly which operations to apply, then click **Apply**.

### Visualizations
Histograms · Box Plots · Bar Charts · Pie Charts · Scatter Plots · Correlation Heatmap  
Every chart has a **⬇ PNG** hover button that downloads a 2× retina-quality image.

### Download & Data API
- Download **cleaned CSV** and **analysis report JSON** from the Download tab
- **Generate API Key** button in the Download tab issues a per-dataset key (SHA-256 stored, plain key shown once)
- Expose your cleaned dataset externally:
  ```
  GET /api/data/{file_id}?page=1&page_size=100&columns=col1,col2
  Header: X-API-Key: <your-key>
  ```
- `GET /api/data/{file_id}/schema` — column names + dtypes
- `POST /api/key/{file_id}/regenerate` — rotate the key at any time

### Processing Engines
| File size | Engine |
|---|---|
| < 100 MB | Pandas |
| ≥ 100 MB | PySpark local mode (Java 11+ required) |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 · Vite 5 · Tailwind CSS 3 · react-plotly.js · react-dropzone · react-router-dom v6 |
| Backend | FastAPI · Pandas · NumPy · PySpark (optional) · fastavro · Pillow · rapidFuzz |
| Database | SQLAlchemy + PostgreSQL (optional — metadata only, graceful no-op if not configured) |
| Cloud SDKs | azure-storage-blob · boto3 · google-cloud-storage · databricks-sdk (all optional) |
| Container | Docker + docker-compose (nginx frontend + uvicorn backend) |

---

## Project Structure

```
auto eda/
├── backend/
│   ├── main.py                      # FastAPI entry point, CORS, router registration
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── .env.example
│   ├── routes/
│   │   ├── upload.py                # POST /api/upload
│   │   ├── analysis.py              # GET  /api/analysis/{id}
│   │   ├── cleaning.py              # GET  /api/clean/{id}/options  POST /api/clean/{id}
│   │   ├── visualization.py         # GET  /api/visualize/{id}
│   │   ├── download.py              # GET  /api/download/{id}/cleaned|report
│   │   ├── multi.py                 # POST /api/multi/upload?mode=separate|combined
│   │   ├── image.py                 # POST /api/image/upload  + analysis/clean/download
│   │   ├── cloud.py                 # POST /api/cloud/import
│   │   └── data_api.py              # GET  /api/data/{id}  POST /api/key/{id}/regenerate
│   ├── services/
│   │   ├── analysis_service.py
│   │   ├── cleaning_service.py      # get_cleaning_options + selective clean
│   │   ├── visualization_service.py
│   │   ├── spark_service.py
│   │   ├── image_service.py         # PIL-based image dataset analysis
│   │   ├── multi_service.py         # Separate-mode folder processing
│   │   ├── combine_service.py       # Combined-mode: schema norm + fuzzy dedup + 3NF
│   │   └── cloud_service.py         # Single-file + folder download for all 4 providers
│   ├── utils/
│   │   ├── file_utils.py            # Loader for CSV/JSON/Excel/TXT/Parquet/Avro/ipynb
│   │   ├── response_utils.py
│   │   └── api_key_utils.py         # generate_and_store_key / verify_key
│   ├── db/
│   │   ├── database.py              # SQLAlchemy engine + init_db()
│   │   └── models.py                # Dataset ORM model
│   ├── uploads/                     # Uploaded files (git-ignored)
│   │   └── .keys/                   # Per-dataset API key hashes
│   ├── cleaned/                     # Cleaned CSVs (git-ignored)
│   └── reports/                     # Cached report JSONs (git-ignored)
│
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Home.jsx             # Landing: all upload methods, responsive 2-col layout
│   │   │   ├── Dashboard.jsx        # Single-file: Analysis/Cleaning/Viz/Download tabs
│   │   │   ├── MultiDashboard.jsx   # Multi-file folder: sidebar + per-file tabs
│   │   │   └── ImageDashboard.jsx   # Image dataset dashboard
│   │   ├── components/
│   │   │   ├── FileUpload.jsx
│   │   │   ├── DataFolderUpload.jsx # combine / separate toggle
│   │   │   ├── FolderUpload.jsx     # image folder upload
│   │   │   ├── CloudImport.jsx      # provider tabs + file/folder toggle
│   │   │   ├── AnalysisPanel.jsx
│   │   │   ├── CleaningPanel.jsx    # checklist-based selective cleaning
│   │   │   ├── VisualizationPanel.jsx
│   │   │   ├── DownloadPanel.jsx    # download + Generate API Key
│   │   │   ├── ImageAnalysisPanel.jsx
│   │   │   └── charts/              # Histogram · BoxPlot · BarChart · PieChart · HeatMap · ScatterPlot
│   │   ├── services/api.js
│   │   ├── hooks/useFileUpload.js
│   │   └── App.jsx
│   ├── package.json
│   ├── vite.config.js
│   ├── Dockerfile
│   └── nginx.conf
│
├── docker-compose.yml
├── SETUP.md
└── README.md
```

---

## Quick Start

```bash
# Backend
cd backend
python -m venv venv
.\venv\Scripts\activate          # Windows
source venv/bin/activate          # macOS/Linux
pip install -r requirements.txt
copy .env.example .env            # Windows
cp .env.example .env              # macOS/Linux
python -m uvicorn main:app --reload --port 8000

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**

---

## API Reference

### Upload
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/upload` | Upload single file → returns `file_id` + `api_key` |
| `POST` | `/api/multi/upload?mode=separate\|combined` | Upload folder of data files |
| `POST` | `/api/image/upload` | Upload folder of images |
| `POST` | `/api/cloud/import` | Import from Azure/AWS/GCP/Databricks |

### Analysis & Cleaning
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/api/analysis/{file_id}` | Full dataset analysis |
| `GET`  | `/api/clean/{file_id}/options` | List of detected cleaning operations |
| `POST` | `/api/clean/{file_id}` | Apply selected cleaning operations |

### Visualization & Download
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/api/visualize/{file_id}` | Plotly chart data (all types) |
| `GET`  | `/api/download/{file_id}/cleaned` | Download cleaned CSV |
| `GET`  | `/api/download/{file_id}/report` | Download analysis report JSON |

### Data API (external access)
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/api/data/{file_id}` | Paginated JSON rows — requires `X-API-Key` header |
| `GET`  | `/api/data/{file_id}/schema` | Column names + dtypes |
| `POST` | `/api/key/{file_id}/regenerate` | Rotate the API key |

All responses follow:
```json
{ "status": "success", "message": "...", "data": { ... } }
```

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `ALLOWED_ORIGINS` | `http://localhost:5173,...` | CORS origins |
| `MAX_UPLOAD_SIZE_MB` | `500` | Upload size limit |
| `DATABASE_URL` | *(empty)* | PostgreSQL URL — optional, metadata only |
| `AZURE_STORAGE_CONNECTION_STRING` | *(empty)* | Azure Blob auth |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION` | *(empty)* | S3 auth |
| `GCP_PROJECT_ID` / `GCP_CREDENTIALS_JSON` | *(empty)* | GCP auth |
| `DATABRICKS_HOST` / `DATABRICKS_TOKEN` | *(empty)* | Databricks auth |

---

## Docker

```bash
docker-compose up --build
# Frontend → http://localhost
# Backend  → http://localhost:8000
# API docs → http://localhost:8000/docs
```

---

## License

MIT


---

## Features

| Feature | Details |
|---|---|
| Upload | CSV, JSON, Excel (.xlsx/.xls), TXT, Parquet |
| Analysis | Shape, dtypes, missing values, duplicates, statistics, outlier detection (IQR), correlations |
| Cleaning | Duplicate removal, null-filling (median/mode), column-name standardization, numeric-string conversion |
| Visualizations | Histograms, box plots, bar/pie charts, correlation heatmap, scatter plots |
| Download | Cleaned CSV + analysis report JSON |
| Processing engine | Pandas (< 100 MB) · PySpark local mode (≥ 100 MB) |

---

## Tech Stack

- **Frontend:** React 18 + Vite, Tailwind CSS, Plotly.js
- **Backend:** FastAPI (Python 3.11), Pandas, PySpark (local)
- **Containerization:** Docker + docker-compose

---

## Project Structure

```
auto-eda/
├── backend/
│   ├── main.py                    # FastAPI app entry point
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── .env.example
│   ├── routes/
│   │   ├── upload.py              # POST /api/upload
│   │   ├── analysis.py            # GET  /api/analysis/{file_id}
│   │   ├── cleaning.py            # POST /api/clean/{file_id}
│   │   ├── visualization.py       # GET  /api/visualize/{file_id}
│   │   └── download.py            # GET  /api/download/{file_id}/cleaned|report
│   ├── services/
│   │   ├── analysis_service.py    # Core analysis logic
│   │   ├── cleaning_service.py    # Core cleaning logic
│   │   ├── visualization_service.py
│   │   └── spark_service.py       # PySpark (large files)
│   ├── utils/
│   │   ├── file_utils.py
│   │   └── response_utils.py
│   ├── uploads/                   # Uploaded files (git-ignored)
│   ├── cleaned/                   # Cleaned outputs
│   └── reports/                   # Cached reports
│
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Home.jsx           # Upload landing page
│   │   │   └── Dashboard.jsx      # Analysis dashboard
│   │   ├── components/
│   │   │   ├── FileUpload.jsx
│   │   │   ├── AnalysisPanel.jsx
│   │   │   ├── CleaningPanel.jsx
│   │   │   ├── VisualizationPanel.jsx
│   │   │   ├── DownloadPanel.jsx
│   │   │   └── charts/
│   │   │       ├── Histogram.jsx
│   │   │       ├── BoxPlot.jsx
│   │   │       ├── BarChart.jsx
│   │   │       ├── PieChart.jsx
│   │   │       ├── HeatMap.jsx
│   │   │       └── ScatterPlot.jsx
│   │   ├── services/api.js        # Axios API client
│   │   ├── hooks/useFileUpload.js
│   │   └── utils/helpers.js
│   ├── package.json
│   ├── vite.config.js
│   ├── Dockerfile
│   └── nginx.conf
│
├── docker-compose.yml
└── README.md
```

---

## Quick Start (Development)

### Prerequisites

- Python 3.11+
- Node.js 20+
- Java 11+ (only needed if you upload files ≥ 100 MB — required by PySpark)

### 1. Backend

```bash
cd backend

# Create and activate a virtual environment
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Copy the example env file
cp .env.example .env

# Start the server
uvicorn main:app --reload --port 8000
```

API docs available at: http://localhost:8000/docs

### 2. Frontend

```bash
cd frontend

# Install dependencies
npm install

# Copy the example env file
cp .env.example .env

# Start Vite dev server
npm run dev
```

Open: http://localhost:5173

> The Vite dev server proxies `/api/*` to `http://localhost:8000` automatically.

---

## Docker (Full Stack)

```bash
# Build and start both services
docker-compose up --build

# Frontend: http://localhost
# Backend API: http://localhost:8000
# API docs:    http://localhost:8000/docs
```

Stop with `docker-compose down`.

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/upload` | Upload a dataset file |
| `GET`  | `/api/analysis/{file_id}` | Run and return dataset analysis |
| `POST` | `/api/clean/{file_id}` | Clean the dataset |
| `GET`  | `/api/visualize/{file_id}` | Get Plotly chart data |
| `GET`  | `/api/download/{file_id}/cleaned` | Download cleaned CSV |
| `GET`  | `/api/download/{file_id}/report` | Download analysis report JSON |

All endpoints return:
```json
{
  "status": "success",
  "message": "...",
  "data": { ... }
}
```

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | `0.0.0.0` | Server host |
| `PORT` | `8000` | Server port |
| `ALLOWED_ORIGINS` | `http://localhost:5173,...` | CORS allowed origins |
| `MAX_UPLOAD_SIZE_MB` | `500` | Max upload size in MB |

### Frontend (`frontend/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | *(empty)* | API base URL — leave empty to use Vite proxy |

---

## Processing Logic

```python
if file_size_mb < 100:
    # Use Pandas — fast, simple, no Java required
    engine = "pandas"
else:
    # Use local PySpark — handles large files without a cluster
    engine = "spark"
```

PySpark runs in **local mode** (`local[*]`) — no cluster, no distributed infrastructure.

---

## Development Phases

- **Phase 1** ✅ File upload, CSV support, Pandas analysis
- **Phase 2** ✅ Data cleaning, visualizations, download
- **Phase 3** ✅ Spark integration (large files), Parquet support
