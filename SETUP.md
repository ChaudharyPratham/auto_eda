# Auto EDA – Setup Guide

Step-by-step instructions for running this project locally on any machine (Windows, macOS, Linux).

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
