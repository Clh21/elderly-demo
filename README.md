# Elderly Care Dashboard

A real-time elderly health monitoring system with live sensor data, automated alerts, and a demo simulator. Built with React + Vite (frontend) and Express + MySQL (backend).

```
nocode/
├── frontend/   # React + Vite application
└── backend/    # Express + MySQL API server
```

---

## Quick Start

### 1. Database Setup (one-time)

Apply the MySQL schema to the `elderly` database:

```bash
mysql -u root -p elderly < backend/schema.sql
```

### 2. Start Backend

```bash
cd backend
npm install
node index.js
```

API server runs at **http://localhost:3001**

### 3. Start Frontend

```bash
cd frontend
npm install
npm run dev
```

App runs at **http://localhost:8080**

> Make sure the backend is running before opening the frontend.

---

## Backend

### Tech Stack
- Node.js + Express
- mysql2 (connection pool)
- CORS enabled

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/watch/:watchId` | Latest reading + 10-point minute history |
| GET | `/api/stats` | Overview statistics (residents, alerts, devices) |
| GET | `/api/residents` | Full residents list |
| GET | `/api/health/:residentId?days=7` | Daily health summary history |
| GET | `/api/alerts` | All alerts (latest 100) |
| GET | `/api/alerts/latest?after=<id>` | New active alerts since a given alert ID |
| POST | `/api/alerts/:id/resolve` | Mark an alert as resolved |
| POST | `/api/watch-reading` | Ingest a new sensor reading |

### Demo Simulator

When the backend starts, a built-in simulator runs automatically for `demo-watch-001`:

- **Every 10 seconds**: generates Heart Rate, Temperature, and EDA values and writes them to the `minute_readings` table using an UPSERT. Only one row per minute is kept — each new write in the same minute overwrites the previous one, so the row for any given minute ends up holding the reading from approximately the 50-second mark of that minute.
- **Every 2 minutes**: fires the next alert in the following fixed sequence (cycling):

| # | Type | Severity | Message |
|---|------|----------|---------|
| 1 | Heart Rate | Warning | High heart rate detected (115 bpm) |
| 2 | Heart Rate | Warning | Low heart rate detected (42 bpm) |
| 3 | Temperature | Warning | High body temperature detected (38.6°C) |
| 4 | Temperature | Warning | Low body temperature detected (35.1°C) |
| 5 | EDA (Stress) | Warning | High stress level detected (EDA: 5.2 μS) |
| 6 | EDA (Stress) | Warning | Low stress level (EDA: 0.3 μS) |
| 7 | Fall Detection | Critical | Fall detected! Immediate attention required |

---

## Frontend

### Tech Stack
- React 18
- Vite 5
- Recharts (mini line charts)
- TanStack Query (data fetching + auto-refresh)
- Tailwind CSS
- Radix UI / shadcn components
- Lucide React icons

### Features

- **Dashboard**: Real-time watch data cards for Heart Rate, Temperature, EDA, and Wear Status. Each card shows the current value and a 10-point mini line chart. Data auto-refreshes every 10 seconds.
- **Alert Popup**: Polls for new alerts every 15 seconds. When a new alert arrives, a modal popup appears matching the app style, showing the alert type, severity, resident name, and timestamp. Closed via the X button in the top-right corner.
- **Overview Stats**: Active alert count, connected devices, total residents, and data points today — all pulled live from the database.
- **Residents**: Resident management page.
- **Health Data**: Historical health charts with date range filtering and CSV export.
- **Alerts**: Alert management page with severity and status filters, resolve and acknowledge actions.
- **Admin Dashboard**: System-wide monitoring view.

---

## Database Schema

| Table | Description |
|-------|-------------|
| `residents` | Resident info: name, age, room number, watch ID, emergency contact |
| `watch_readings` | Raw sensor readings (every insert kept for audit) |
| `minute_readings` | UPSERT-by-minute table: one row per watch per minute, holds the last reading of that minute |
| `alerts` | Health alerts with type, severity, status, and timestamps |
| `daily_summaries` | Pre-aggregated daily stats per resident for history charts |

### minute_readings — How It Works

The simulator writes every 10 seconds but stores data at minute granularity:

```
15:00:00  →  UPSERT  minute_slot = '15:00:00'  (row created)
15:00:10  →  UPSERT  minute_slot = '15:00:00'  (row overwritten)
15:00:20  →  UPSERT  minute_slot = '15:00:00'  (row overwritten)
...continues every 10s...
15:00:50  →  UPSERT  minute_slot = '15:00:00'  (final write for this minute)
15:01:00  →  UPSERT  minute_slot = '15:01:00'  (new row for next minute)
```

Each minute's row ends up containing the ~50-second reading for that minute.
