"""
Auto EDA - FastAPI Backend
Main application entry point. Registers all routes and configures middleware.
"""

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from routes import upload, analysis, cleaning, visualization, download, image, multi, cloud, data_api, streaming

# Load environment variables from .env file
load_dotenv()

# Initialise database (no-op when DATABASE_URL is not set)
from db.database import init_db
init_db()

app = FastAPI(
    title="Auto EDA API",
    description="Automated Exploratory Data Analysis Platform",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ---------------------------------------------------------------------------
# CORS – allow the React frontend (Vite dev server & Docker) to call the API
# ---------------------------------------------------------------------------
allowed_origins = os.getenv(
    "ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000,http://localhost:80"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Ensure required directories exist at startup
# ---------------------------------------------------------------------------
for folder in ["uploads", "cleaned", "reports"]:
    os.makedirs(folder, exist_ok=True)

# ---------------------------------------------------------------------------
# Register API routes (all prefixed with /api)
# ---------------------------------------------------------------------------
app.include_router(upload.router,        prefix="/api", tags=["Upload"])
app.include_router(analysis.router,      prefix="/api", tags=["Analysis"])
app.include_router(cleaning.router,      prefix="/api", tags=["Cleaning"])
app.include_router(visualization.router, prefix="/api", tags=["Visualization"])
app.include_router(download.router,      prefix="/api", tags=["Download"])
app.include_router(image.router,         prefix="/api", tags=["Image"])
app.include_router(multi.router,         prefix="/api", tags=["Multi-File"])
app.include_router(cloud.router,         prefix="/api", tags=["Cloud Import"])
app.include_router(data_api.router,      prefix="/api", tags=["Data API"])
app.include_router(streaming.router,     prefix="/api", tags=["Streaming"])


@app.get("/")
def root():
    return {"message": "Auto EDA API is running", "docs": "/docs"}
