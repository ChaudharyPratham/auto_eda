# Auto EDA

Automated Exploratory Data Analysis platform. Upload any dataset and get instant analysis, smart cleaning, interactive visualizations, and downloadable reports — no code required.

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
