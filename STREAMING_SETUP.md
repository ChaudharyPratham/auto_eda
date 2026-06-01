# Streaming Analytics — Setup Guide

This guide covers how to start the pipeline, generate API keys, and send events from external applications.

---

## Architecture

```
Your App  ──POST /api/stream/ingest──►  FastAPI  ──► Kafka topic "logs"
                                                  └──► PostgreSQL stream_events

producer.py (mock)  ──────────────────────────────► Kafka topic "logs"

Kafka  ──►  spark_consumer.py  ──► PostgreSQL stream_metrics + stream_alerts

Frontend Dashboard  ◄── polls FastAPI every 5 s
```

---

## 1. Start Kafka + PostgreSQL (Docker)

From the project root (where `docker-compose.yml` lives):

```bash
docker-compose up zookeeper kafka postgres -d
```

Wait ~20 seconds for Kafka to become ready, then verify:

```bash
docker ps
# Should show: autoeda-kafka-1, autoeda-zookeeper-1, autoeda-postgres-1
```

---

## 2. Initialise Database Tables

Run once to create all streaming tables:

```powershell
cd backend/streaming
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/autoeda"
.\..\venv\Scripts\python.exe init_tables.py
```

This creates: `stream_metrics`, `stream_alerts`, `stream_api_keys`, `stream_events`.

---

## 3. Start the Mock Log Producer (optional)

Generates ~2 mock log events per second and publishes them to Kafka:

```powershell
cd backend/streaming
$env:KAFKA_BOOTSTRAP="localhost:9092"
.\..\venv\Scripts\python.exe producer.py
```

---

## 4. Start the Spark Consumer

**Windows prerequisite** — download `winutils.exe` once:

```powershell
New-Item -ItemType Directory -Force -Path "C:\hadoop\bin"
Invoke-WebRequest -Uri "https://github.com/cdarlint/winutils/raw/master/hadoop-3.3.5/bin/winutils.exe" -OutFile "C:\hadoop\bin\winutils.exe"
Invoke-WebRequest -Uri "https://github.com/cdarlint/winutils/raw/master/hadoop-3.3.5/bin/hadoop.dll" -OutFile "C:\hadoop\bin\hadoop.dll"
```

Then start the consumer:

```powershell
cd backend/streaming
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/autoeda"
$env:KAFKA_BOOTSTRAP="localhost:9092"
$env:HADOOP_HOME="C:\hadoop"
.\..\venv\Scripts\python.exe spark_consumer.py
```

Aggregated metrics appear in `stream_metrics` after the first 1-minute window (~90 seconds).

---

## 5. Start the Backend

```powershell
cd backend
.\venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000
```

---

## 6. Start the Frontend

```powershell
cd frontend
npm run dev
```

Open **http://localhost:5173/streaming**

---

## 7. Generate an API Key

**Via the dashboard** — go to the *API Integration* section and click **Generate**.

**Via curl:**

```bash
curl -X POST http://localhost:8000/api/stream/api-key \
  -H "Content-Type: application/json" \
  -d '{"name": "my-app"}'
```

Response:

```json
{
  "data": {
    "id": 1,
    "name": "my-app",
    "created_at": "2026-06-01T07:00:00",
    "key": "abc123..."
  },
  "message": "API key created. Copy it now — it will not be shown again."
}
```

> The plain key is returned **once only**. Store it securely.

List existing keys:

```bash
curl http://localhost:8000/api/stream/api-keys
```

Revoke a key:

```bash
curl -X DELETE http://localhost:8000/api/stream/api-key/1
```

---

## 8. Send Events via the Ingest API

```bash
curl -X POST http://localhost:8000/api/stream/ingest \
  -H "X-API-Key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"service":"payment","level":"ERROR","response_time":1200}'
```

Valid `level` values: `INFO`, `WARNING`, `ERROR`  
Valid `service` values: `api`, `auth`, `payment`, `parking`, `sensor` (any string ≤ 50 chars)

The event is:
1. Validated against the API key
2. Stored in `stream_events` (visible in the Raw Events viewer)
3. Forwarded to Kafka for Spark aggregation

---

## 9. Python Integration Example

```python
import requests

API_URL = "http://localhost:8000/api/stream/ingest"
API_KEY = "your_plain_key_here"

def send_event(service: str, level: str, response_time: int):
    resp = requests.post(
        API_URL,
        headers={"X-API-Key": API_KEY, "Content-Type": "application/json"},
        json={"service": service, "level": level, "response_time": response_time},
        timeout=5,
    )
    resp.raise_for_status()
    return resp.json()

# Example usage
send_event("payment", "ERROR", 1450)
send_event("api",     "INFO",  85)
send_event("auth",    "WARNING", 320)
```

---

## 10. Service Filtering

Filter the dashboard by service using the pill buttons on the streaming page.

The API also supports filtering:

```bash
# Metrics aggregated per minute for the 'payment' service (from stream_events)
curl "http://localhost:8000/api/stream/metrics?service=payment&limit=30"

# Raw events for the 'payment' service
curl "http://localhost:8000/api/stream/events?service=payment&limit=50"
```

> Note: service-filtered metrics come from `stream_events` (REST-ingested events).  
> The main charts (no filter) use `stream_metrics` from the Spark consumer (all sources).

---

## Anomaly Thresholds

| Metric             | Threshold | Alert type           |
|--------------------|-----------|----------------------|
| Error rate         | > 30 %    | `HIGH_ERROR_RATE`    |
| Avg response time  | > 1000 ms | `HIGH_RESPONSE_TIME` |

Alerts appear as banners on the dashboard and are stored in `stream_alerts`.

---

## Troubleshooting

### ❌ `KafkaTimeoutError` — producer can't connect

**Symptom:** `kafka.errors.KafkaTimeoutError` or `NoBrokersAvailable` when running `producer.py` locally.

**Cause:** Kafka inside Docker advertises its internal hostname (`kafka:9092`) which local Python scripts cannot resolve.

**Fix:** The `docker-compose.yml` must define dual listeners:
```yaml
KAFKA_LISTENERS: PLAINTEXT://0.0.0.0:9092,PLAINTEXT_INTERNAL://0.0.0.0:29092
KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092,PLAINTEXT_INTERNAL://kafka:29092
KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,PLAINTEXT_INTERNAL:PLAINTEXT
KAFKA_INTER_BROKER_LISTENER_NAME: PLAINTEXT_INTERNAL
```
After editing docker-compose.yml, recreate the containers:
```powershell
docker-compose stop kafka zookeeper
docker-compose rm -f kafka zookeeper
docker-compose up zookeeper kafka -d
```

---

### ❌ `NativeIO$Windows.access0 UnsatisfiedLinkError` in PySpark

**Symptom:** Spark crashes immediately with a JNI / NativeIO error.

**Cause:** PySpark on Windows needs `winutils.exe` to perform filesystem operations.

**Fix:** Download winutils once and set HADOOP_HOME:
```powershell
New-Item -ItemType Directory -Force -Path "C:\hadoop\bin"
Invoke-WebRequest -Uri "https://github.com/cdarlint/winutils/raw/master/hadoop-3.3.5/bin/winutils.exe" -OutFile "C:\hadoop\bin\winutils.exe"
Invoke-WebRequest -Uri "https://github.com/cdarlint/winutils/raw/master/hadoop-3.3.5/bin/hadoop.dll" -OutFile "C:\hadoop\bin\hadoop.dll"
```
Then always start spark_consumer with `$env:HADOOP_HOME="C:\hadoop"`.

---

### ❌ `init_tables.py` — `could not translate host name "postgres"`

**Symptom:** Running `init_tables.py` locally gives a hostname resolution error.

**Cause:** The default `DATABASE_URL` uses `postgres` (the Docker service name), which only resolves inside Docker. When running locally, use `localhost`.

**Fix:**
```powershell
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/autoeda"
.\..\venv\Scripts\python.exe init_tables.py
```

---

### ❌ Constant `HIGH_ERROR_RATE` alerts every minute

**Symptom:** Dashboard floods with alerts even when pipeline is healthy.

**Cause:** The mock producer generated ERROR logs at 20% probability, sitting right at the 20% threshold — random variance caused most windows to trigger.

**Fix (already applied):** Producer ERROR weight lowered to 10%, alert threshold raised to 30%. If you still see alerts, the error rate in your data is genuinely high.

---

### ❌ Docker not starting — `pipe/dockerDesktopLinuxEngine` error

**Cause:** Docker Desktop is not running.

**Fix:** Open Docker Desktop from the Start Menu and wait for the whale icon in the system tray to stop animating before running docker-compose commands.

---

### ❌ `docker-compose` picks up wrong file / no services found

**Cause:** Running docker-compose from inside `backend/streaming/` instead of the project root.

**Fix:** Always `cd` to the project root first:
```powershell
cd "C:\Users\PrathamChaudhary\Desktop\project2\auto eda"
docker-compose up zookeeper kafka postgres -d
```

---

### ❌ Streaming dashboard shows spinner indefinitely

**Checklist:**
1. Is `spark_consumer.py` running? It must run for at least 90 seconds to produce the first window.
2. Is `DATABASE_URL` set correctly in the backend? Check `backend/.env`.
3. Is the backend running on port 8000? Visit http://localhost:8000/api/stream/latest in a browser.
4. Did `init_tables.py` run successfully? Tables must exist before the consumer writes to them.

