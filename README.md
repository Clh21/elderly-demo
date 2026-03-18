# Elderly Care Dashboard

A full-stack real-time health monitoring system for elderly residents. Sensor data is collected from Samsung Galaxy Watch 8 devices, stored in a MySQL database, and displayed on a live React dashboard with automated alert popups.

```
nocode/
├── frontend/      # React + Vite web application
├── backend/       # Express + MySQL REST API server
├── simulator.py   # Python loopback simulator (mimics Samsung Watch 8)
└── README.md
```

---

## Requirements

- Node.js 18+
- Python 3.8+
- MySQL 8.0
- npm

---

## Installation

### 1. Clone or download the project

```bash
cd nocode
```

### 2. Set up the MySQL database (one-time)

Create the `elderly` database and apply the schema:

```bash
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS elderly;"
mysql -u root -p elderly < backend/schema.sql
```

The schema creates 5 tables and keeps 3 active dashboard users:
- `demo-watch-001` for simulated data
- `real-watch-001` for real watch data
- `real-watch-002` for real watch data

### 3. Install backend dependencies

```bash
cd backend
npm install
```

### 4. Install frontend dependencies

```bash
cd frontend
npm install
```

---

## Running the Project

You need three terminal windows (or use background processes).

### Terminal 1 — Backend API server

```bash
cd backend
node index.js
```

Runs at **http://localhost:3100**

On startup, the built-in Node.js simulator automatically begins generating data for `demo-watch-001`:
- Inserts a new reading every **10 seconds** (UPSERT by minute into `minute_readings`)
- Fires a sequential alert every **2 minutes**

### Terminal 2 — Frontend dev server

```bash
cd frontend
npm run dev
```

Runs at **http://localhost:8080**

### Terminal 3 — Python Watch Simulator (optional)

Simulates a Samsung Galaxy Watch 8 sending real sensor payloads to the backend:

```bash
python simulator.py
```

Press `Ctrl+C` to stop. On exit, it automatically sends an UNWORN wear state.

---

## Features

### Dashboard (Home)
- Select between Demo Watch (Simulated), Real Watch - John Doe, and Real Watch - Jane Smith
- 4 real-time data cards: **Heart Rate**, **Temperature**, **EDA (Stress)**, **Wear Status**
- Each card shows the current value and a 10-point mini line chart
- Data auto-refreshes every 10 seconds
- **Alert popup**: when a new alert is detected, a modal appears automatically matching the app style. Close it with the X button in the top-right corner.
- Overview stats bar: total residents, active alerts, connected devices, data points today

### Residents
- View all registered residents with room numbers and watch IDs

### Health Data
- Historical health charts per resident (heart rate, temperature, EDA, daily steps)
- Date range filter: last 7, 14, or 30 days
- CSV export

### Alerts
- Full alert history with severity and status filters
- Resolve and acknowledge actions
- Summary cards: critical alerts, warning alerts, resolved today

### Admin Dashboard
- System-wide monitoring view across all residents

---

## Samsung Galaxy Watch 8 Integration

The backend accepts real watch data at:

```
POST http://localhost:3100/api/samsung-watch?watchId=<watch_id>
```

All payload formats from the watch are supported:

```json
// EDA
{ "sensorType": "eda", "eda": { "skinConductance": 0.465, "label": "STABLE", "validSampleCount": 1, "sampleTimestamp": 1773125672689 } }

// Heart Rate
{ "sensorType": "heart_rate", "heartRate": { "bpm": 78, "status": 1, "sampleTimestamp": 1773125634115 } }

// Temperature
{ "sensorType": "temperature", "temperature": { "wristSkinTemperature": 33.26, "ambientTemperature": 31.14, "status": "SUCCESSFUL_MEASUREMENT" } }

// Wear State
{ "event": "wear_state", "isWorn": true, "state": "WORN" }
```

To connect a real Samsung Galaxy Watch 8, configure its HTTP sender to POST to `http://<server-ip>:3100/api/samsung-watch?watchId=<watch_id>`.

Only these three watch IDs are accepted by the backend:
- `demo-watch-001`
- `real-watch-001`
- `real-watch-002`

If a real-watch user has no row in the database yet, the dashboard returns `No Data Available` instead of simulated data.

---

## Python Simulator

`simulator.py` mimics the exact payload formats of a real Samsung Galaxy Watch 8 and posts them to the local backend in a loopback. It targets `demo-watch-001` by default.

| Sensor | Send Rate | Notes |
|--------|-----------|-------|
| EDA | Every 1 second | `skinConductance` + `label` (STABLE/VARIABLE) |
| Heart Rate | Every 3 minutes | `bpm` with realistic random walk |
| Temperature | Every 1 minute | `wristSkinTemperature` + `ambientTemperature` |
| Wear State | On start/stop | WORN on start, UNWORN on Ctrl+C |

To change the target watch, edit `WATCH_ID` at the top of `simulator.py`.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/watch/:watchId` | Latest reading + 10-point minute history |
| GET | `/api/stats` | Overview statistics |
| GET | `/api/residents` | All residents |
| GET | `/api/health/:residentId?days=7` | Daily health summary history |
| GET | `/api/alerts` | All alerts (latest 100) |
| GET | `/api/alerts/latest?after=<id>` | New active alerts since given ID (used for popup polling) |
| POST | `/api/alerts/:id/resolve` | Resolve an alert |
| POST | `/api/samsung-watch?watchId=<id>` | Ingest Samsung Watch 8 sensor payload |
| POST | `/api/watch-reading` | Generic sensor reading ingestion |

---

## Database Schema

| Table | Description |
|-------|-------------|
| `residents` | Resident info: name, age, room, watch ID, emergency contact |
| `watch_readings` | Raw sensor readings — every incoming payload is stored |
| `minute_readings` | UPSERT-by-minute: one row per watch per minute, holds the last reading of that minute |
| `alerts` | Health alerts with type, severity, status, created/resolved timestamps |
| `daily_summaries` | Pre-aggregated daily stats per resident for history charts |

### minute_readings — Storage Logic

Data is written every 10 seconds but stored at 1-minute granularity. Each write in the same minute overwrites the previous row, so the final stored value for any minute is the reading from approximately the 50-second mark:

```
15:00:00  write  ->  minute_slot '15:00:00'  (row created)
15:00:10  write  ->  minute_slot '15:00:00'  (overwritten)
15:00:20  write  ->  minute_slot '15:00:00'  (overwritten)
...
15:00:50  write  ->  minute_slot '15:00:00'  (final value for this minute)
15:01:00  write  ->  minute_slot '15:01:00'  (new minute, new row)
```

---

## Automated Alert Sequence

The backend simulator fires alerts every 2 minutes in a fixed cycle:

| # | Type | Severity | Message |
|---|------|----------|---------|
| 1 | Heart Rate | Warning | High heart rate detected (115 bpm) |
| 2 | Heart Rate | Warning | Low heart rate detected (42 bpm) |
| 3 | Temperature | Warning | High body temperature detected (38.6°C) |
| 4 | Temperature | Warning | Low body temperature detected (35.1°C) |
| 5 | EDA | Warning | High stress level detected (EDA: 5.2 uS) |
| 6 | EDA | Warning | Low stress level (EDA: 0.3 uS) |
| 7 | Fall Detection | Critical | Fall detected! Immediate attention required |

When an alert fires, the dashboard frontend automatically shows a popup modal within 15 seconds.
