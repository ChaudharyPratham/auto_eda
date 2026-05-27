# Auto EDA – Setup Guide

Step-by-step instructions for running this project locally on Windows, macOS, or Linux.

---

## Prerequisites

| Tool | Version | Download |
|------|---------|----------|
| Python | 3.11 or newer | https://www.python.org/downloads/ |
| Node.js | 18 or newer | https://nodejs.org/ |
| Git | Any recent | https://git-scm.com/ |
| Java JDK *(optional)* | 11 or 17 | https://adoptium.net/ — only for files ≥ 100 MB (PySpark) |

Verify: `python --version`, `node --version`, `git --version`

---

## 1. Clone the Repository

```bash
git clone https://github.com/ChaudharyPratham/auto_eda.git
cd "auto eda"
```

---

## 2. Backend Setup (FastAPI)

### 2a. Create and activate a virtual environment

```bash
cd backend
python -m venv venv

# Windows (PowerShell):
.\venv\Scripts\activate
# Windows (Command Prompt):
venv\Scripts\activate.bat
# macOS / Linux:
source venv/bin/activate
```

You should see `(venv)` in your prompt.

### 2b. Install Python dependencies

```bash
pip install -r requirements.txt
```

Key packages installed:
- `fastapi`, `uvicorn[standard]` — web framework
- `pandas`, `numpy`, `scipy`, `openpyxl`, `pyarrow` — data processing
- `fastavro` — Apache Avro support
- `Pillow` — image dataset analysis
- `rapidFuzz` — fuzzy value matching (combined folder mode)
- `sqlalchemy`, `psycopg2-binary` — PostgreSQL metadata (optional)
- `azure-storage-blob`, `boto3`, `google-cloud-storage`, `databricks-sdk` — cloud import (all optional)
- `pyspark` — large file processing (optional, needs Java 11+)

> **No Java?** PySpark will be skipped automatically. Files ≥ 100 MB will still upload but will fall back to Pandas (may be slower for very large files).

### 2c. Configure environment variables

```bash
# Windows:
copy .env.example .env
# macOS / Linux:
cp .env.example .env
```

Open `backend/.env` and fill in the fields below.  
**Everything is optional except the first block** — the server works with just the defaults.

```env
# ── Server (defaults work fine for local dev) ─────────────────────────────────
HOST=0.0.0.0
PORT=8000

# ── CORS – add your frontend URL if deploying elsewhere ───────────────────────
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

# ── Max upload size in MB ─────────────────────────────────────────────────────
MAX_UPLOAD_SIZE_MB=500

# ── PostgreSQL (optional – stores upload metadata) ────────────────────────────
# Leave blank to skip. Format: postgresql://user:password@host:5432/dbname
DATABASE_URL=

# ── Azure Blob Storage (optional – enables cloud import from Azure) ───────────
# Use EITHER connection string OR account name + key (not both)
AZURE_STORAGE_CONNECTION_STRING=
AZURE_STORAGE_ACCOUNT_NAME=
AZURE_STORAGE_ACCOUNT_KEY=

# ── AWS S3 (optional – enables cloud import from S3) ─────────────────────────
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-east-1

# ── Google Cloud Storage (optional – enables cloud import from GCS) ───────────
GCP_PROJECT_ID=
GCP_CREDENTIALS_JSON=        # full path to your service-account JSON file

# ── Databricks (optional – enables cloud import from DBFS / Volumes) ─────────
DATABRICKS_HOST=             # e.g. https://adb-1234567890.1.azuredatabricks.net
DATABRICKS_TOKEN=            # personal access token
DATABRICKS_HTTP_PATH=        # only needed for SQL Warehouse queries
```

> **Per-dataset API keys** are generated automatically on every upload and stored as SHA-256 hashes under `uploads/.keys/`. No configuration needed — use the **Generate API Key** button in the Download tab.

### 2d. Start the backend server

```bash
python -m uvicorn main:app --reload --port 8000
```

- API root: **http://localhost:8000**
- Interactive docs (Swagger): **http://localhost:8000/docs**
- ReDoc: **http://localhost:8000/redoc**

---

## 3. Frontend Setup (React + Vite)

Open a **new terminal**, keeping the backend running.

### 3a. Install Node dependencies

```bash
cd frontend
npm install
```

### 3b. Configure environment variables

```bash
# Windows:
copy .env.example .env
# macOS / Linux:
cp .env.example .env
```

Leave `VITE_API_URL` empty — Vite's dev proxy forwards `/api/*` to `localhost:8000` automatically.

### 3c. Start the frontend dev server

```bash
npm run dev
```

Open **http://localhost:5173**

---

## 4. Using the App

### Uploading data

The home page has four upload methods:

| Section | What to upload |
|---------|----------------|
| **Single file** | CSV, JSON, Excel (.xlsx/.xls), TXT, Parquet, Avro, Jupyter (.ipynb) |
| **Data folder** | A folder of any of the above. Choose **Separate** (each file gets its own tab) or **Combined** (files are merged into one dataset) |
| **Image folder** | A folder of images (PNG, JPG, JPEG, BMP, WEBP) — triggers the Image Dashboard |
| **Cloud import** | Azure Blob · AWS S3 · GCP Storage · Databricks — paste a URI, choose file or folder/prefix |

### Dashboard tabs

After upload you land on one of three dashboards:

**Single-file / Combined → Dashboard**
- **📊 Analysis** — shape, dtypes, missing values, outliers (IQR), correlations
- **🧹 Cleaning** — the panel scans for issues and presents a checklist; tick what you want and click **Apply**
- **📈 Visualizations** — interactive Plotly charts; hover over any chart → **⬇ PNG** to save it
- **⬇️ Download** — download cleaned CSV, analysis JSON report, or generate a per-dataset API key

**Multi-file folder → Multi Dashboard**
- Left sidebar (desktop) / horizontal scroll strip (mobile) shows all files
- Click a file to load its own Analysis / Cleaning / Viz / Download tabs

**Image folder → Image Dashboard**
- Overview stats, sample grid, class breakdown charts, cleaning (remove corrupt / duplicate images), ZIP download

### API key & external data access

1. Open the **Download** tab for any dataset
2. Click **Generate API Key** — a unique key is shown (save it, displayed once)
3. Use it from anywhere:
   ```bash
   curl -H "X-API-Key: <your-key>" \
        "http://localhost:8000/api/data/<file_id>?page=1&page_size=100"
   ```
4. To rotate: click **Regenerate Key** (old key is immediately invalidated)

---

## 5. Supported File Formats

| Format | Notes |
|--------|-------|
| `.csv` | Standard comma-separated values |
| `.json` | Flat or records-oriented JSON |
| `.xlsx` / `.xls` | Excel workbooks |
| `.txt` | Tab or comma-separated text |
| `.parquet` | Column-oriented binary format |
| `.avro` | Apache Avro (via fastavro) |
| `.ipynb` | Jupyter Notebook — extracts the largest DataFrame from cell outputs |
| Images | `.png` `.jpg` `.jpeg` `.bmp` `.webp` (folder upload only) |

---

## 6. Processing Engines

| File size | Engine | Java required? |
|-----------|--------|----------------|
| < 100 MB | Pandas | No |
| ≥ 100 MB | PySpark local mode | Yes (JDK 11 or 17) |

PySpark runs in **local mode** — no cluster, no distributed infrastructure needed.

---

## 7. Docker (Full Stack)

```bash
# From the project root:
docker-compose up --build
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost |
| Backend API | http://localhost:8000 |
| API Docs | http://localhost:8000/docs |

```bash
docker-compose down   # stop all containers
```

Uploaded and cleaned files are persisted in `backend/uploads/`, `backend/cleaned/`, and `backend/reports/` even after containers stop (volume mounts in docker-compose).

---

## 8. Common Issues & Fixes

### `Could not import module "main"` (uvicorn)

You're running uvicorn from the wrong directory. Always run from `backend/`:

```bash
cd backend
.\venv\Scripts\activate
python -m uvicorn main:app --reload --port 8000
```

### `uvicorn: command not found`

The venv is not active or packages aren't installed there:

```bash
cd backend
.\venv\Scripts\activate        # Windows
source venv/bin/activate        # macOS/Linux
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

### CORS error in the browser

Make sure the backend is on port **8000** and the frontend on **5173**. The Vite proxy handles CORS in dev automatically.

### PySpark / Java error

PySpark needs Java 11 or 17 on your PATH. Either:
- Install from https://adoptium.net/
- Or the app auto-falls-back to Pandas — no action needed

### `No tabular data found` (.ipynb upload)

The notebook must have a cell that **outputs a DataFrame**:
```python
import pandas as pd
df = pd.read_csv('data.csv')
df      # must be the last line, or use display(df)
```

### Cloud import fails silently

The cloud SDK for the selected provider must be installed **and** the matching env vars must be set in `backend/.env`. See Section 2c for the required variable names.

### Port already in use

```bash
# Windows:
netstat -ano | findstr :8000
taskkill /PID <PID> /F

# macOS/Linux:
lsof -ti:8000 | xargs kill
```

---

## 9. Project Structure (Quick Reference)

```
auto eda/
├── backend/
│   ├── main.py               ← FastAPI app, CORS, routers
│   ├── requirements.txt
│   ├── .env.example
│   ├── Dockerfile
│   ├── routes/               ← upload · analysis · cleaning · visualization
│   │                           download · multi · image · cloud · data_api
│   ├── services/             ← analysis · cleaning · visualization · spark
│   │                           image · multi · combine · cloud
│   ├── utils/                ← file_utils · response_utils · api_key_utils
│   ├── db/                   ← SQLAlchemy models + init (optional PostgreSQL)
│   ├── uploads/              ← uploaded files (git-ignored)
│   │   └── .keys/            ← per-dataset API key hashes
│   ├── cleaned/              ← cleaned outputs (git-ignored)
│   └── reports/              ← cached reports (git-ignored)
│
├── frontend/
│   ├── src/
│   │   ├── pages/            ← Home · Dashboard · MultiDashboard · ImageDashboard
│   │   ├── components/       ← all panels + chart components + CloudImport
│   │   ├── services/api.js   ← Axios API client
│   │   └── hooks/
│   ├── package.json
│   └── vite.config.js        ← dev proxy → localhost:8000
│
├── docker-compose.yml
├── SETUP.md                  ← this file
└── README.md
```


---

## Prerequisites

Before you begin, install the following tools:

| Tool | Version | Download |
|------|---------|----------|
| Python | 3.11 or newer | https://www.python.org/downloads/ |
| Node.js | 18 or newer | https://nodejs.org/ |
| Git | Any recent | https://git-scm.com/ |
| Java JDK *(optional)* | 11 or 17 | https://adoptium.net/ — only needed for files ≥ 100 MB (PySpark) |

> **Tip:** Verify installations by running `python --version`, `node --version`, and `git --version` in your terminal.

---

## 1. Clone the Repository

```bash
git clone <your-repo-url>
cd "auto eda"
```

---

## 2. Backend Setup (FastAPI)

### 2a. Create a virtual environment

```bash
cd backend

# Create venv
python -m venv venv

# Activate it:
# Windows (PowerShell):
.\venv\Scripts\activate
# Windows (Command Prompt):
venv\Scripts\activate.bat
# macOS / Linux:
source venv/bin/activate
```

You should see `(venv)` at the start of your terminal prompt.

### 2b. Install Python dependencies

```bash
pip install -r requirements.txt
```

> **Note:** If you don't have Java installed, PySpark will fail to import but the app still works — it just won't process files ≥ 100 MB with Spark. You can remove the `pyspark` line from `requirements.txt` to skip it entirely.

### 2c. Configure environment variables

```bash
# Copy the example file
cp .env.example .env      # macOS/Linux
copy .env.example .env    # Windows
```

The defaults in `.env.example` work out of the box for local development. No changes needed.

### 2d. Start the backend server

```bash
python -m uvicorn main:app --reload --port 8000
```

The API is now running at **http://localhost:8000**  
Interactive API docs: **http://localhost:8000/docs**

---

## 3. Frontend Setup (React + Vite)

Open a **new terminal window**, keeping the backend running.

### 3a. Install Node dependencies

```bash
cd frontend
npm install
```

### 3b. Configure environment variables

```bash
cp .env.example .env      # macOS/Linux
copy .env.example .env    # Windows
```

Leave `VITE_API_URL` empty — Vite's dev proxy forwards `/api/*` to the backend automatically.

### 3c. Start the frontend dev server

```bash
npm run dev
```

The app is now running at **http://localhost:5173** 🎉

---

## 4. Using the App

1. Open **http://localhost:5173** in your browser.
2. Drag-and-drop or click to upload a dataset.
3. You'll be taken to the dashboard with four tabs:
   - **📊 Analysis** – shape, dtypes, missing values, stats, outliers, correlations
   - **🧹 Cleaning** – click "Start Cleaning" to auto-clean the dataset
   - **📈 Visualizations** – interactive charts; hover over any chart and click **⬇ PNG** to download it
   - **⬇️ Download** – download the cleaned CSV or the full analysis report (JSON)

### Supported file formats

| Format | Notes |
|--------|-------|
| `.csv` | Standard comma-separated values |
| `.json` | Flat or records-oriented JSON |
| `.xlsx` / `.xls` | Excel workbooks |
| `.txt` | Tab-separated or comma-separated text |
| `.parquet` | Column-oriented binary format |
| `.ipynb` | Jupyter Notebooks — extracts the largest DataFrame from cell outputs |

### Processing engines

| File size | Engine |
|-----------|--------|
| < 100 MB | Pandas (no Java required) |
| ≥ 100 MB | PySpark local mode (Java 11+ required) |

---

## 5. Docker (Recommended for Deployment)

Docker runs both services in containers — no manual Python/Node setup needed.

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running

### Start everything

```bash
# From the project root (the "auto eda" folder):
docker-compose up --build
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost |
| Backend API | http://localhost:8000 |
| API Docs | http://localhost:8000/docs |

### Stop

```bash
docker-compose down
```

Uploaded files are persisted in `backend/uploads/`, `backend/cleaned/`, and `backend/reports/` even after containers stop.

---

## 6. Common Issues & Fixes

### `uvicorn: command not found` / `No module named uvicorn`

The virtual environment is not activated, or packages are installed globally instead of inside the venv.

```bash
# Make sure you're inside backend/ and the venv is active:
cd backend
.\venv\Scripts\activate     # Windows
source venv/bin/activate    # macOS/Linux

# Then install:
pip install -r requirements.txt

# Then run:
python -m uvicorn main:app --reload --port 8000
```

### `CORS error` in the browser

Ensure the backend is running on port **8000** and the frontend on **5173**. The Vite proxy handles CORS automatically in development.

### `PySpark not working` / Java error

PySpark requires **Java 11 or 17** on your PATH. Either:
- Install Java from https://adoptium.net/
- Or comment out `pyspark` in `requirements.txt` (Pandas will be used for all files)

### `No tabular data found in notebook` (`.ipynb` upload)

The notebook must have at least one code cell that **outputs a DataFrame** — e.g.:

```python
import pandas as pd
df = pd.read_csv('data.csv')
df          # <-- this line outputs the DataFrame as a table
# or:
display(df)
```

### Port already in use

```bash
# Kill the process on port 8000 (Windows):
netstat -ano | findstr :8000
taskkill /PID <PID> /F

# macOS/Linux:
lsof -ti:8000 | xargs kill
```

---

## 7. Project Structure (Quick Reference)

```
auto eda/
├── backend/
│   ├── main.py               ← FastAPI app
│   ├── requirements.txt      ← Python dependencies
│   ├── .env.example          ← Environment variable template
│   ├── Dockerfile
│   ├── routes/               ← API endpoints
│   ├── services/             ← Business logic (analysis, cleaning, viz, spark)
│   ├── utils/                ← Helpers (file loading, response format)
│   ├── uploads/              ← Uploaded files (auto-created, git-ignored)
│   ├── cleaned/              ← Cleaned datasets (auto-created, git-ignored)
│   └── reports/              ← Cached reports (auto-created, git-ignored)
│
├── frontend/
│   ├── src/
│   │   ├── pages/            ← Home (upload) + Dashboard
│   │   ├── components/       ← UI panels + chart components
│   │   ├── services/api.js   ← Axios API client
│   │   ├── hooks/            ← useFileUpload
│   │   └── utils/helpers.js
│   ├── package.json
│   ├── vite.config.js        ← Dev proxy config
│   ├── .env.example
│   └── Dockerfile
│
├── docker-compose.yml
├── README.md
└── SETUP.md                  ← This file
```

---

## 8. Environment Variables Reference

### Backend (`backend/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | `0.0.0.0` | Bind address |
| `PORT` | `8000` | Server port |
| `ALLOWED_ORIGINS` | `http://localhost:5173,...` | CORS allowed origins (comma-separated) |
| `MAX_UPLOAD_SIZE_MB` | `500` | Maximum upload file size |

### Frontend (`frontend/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | *(empty)* | API base URL — leave empty to use Vite proxy in development |
