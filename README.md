# Elderly Care Management System

A real-time health monitoring system powered by **Samsung Galaxy Watch8**, providing comprehensive health management and emergency alerting for elderly residents.

---

## Project Overview

Core features of this system:
- **Real-time Health Monitoring** — heart rate, SpO2, blood pressure, steps, calories
- **Smart Alert System** — automatic anomaly detection with severity-graded alerts
- **Fall Detection** — real-time fall event recognition and emergency response
- **Sensor Analytics** — EDA stress analysis, core body temperature estimation, heart rate classification
- **Visual Dashboard** — multi-page interactive Streamlit monitoring panel
- **REST API** — full backend interface for third-party integration

---

## System Architecture

```
+-------------------------------------------------------------+
|                  Samsung Galaxy Watch8                       |
|         (EDA, Heart Rate, Temperature, Wear State)          |
+------------------------+------------------------------------+
                         | HTTP POST /watch/data
                         v
+-------------------------------------------------------------+
|              Flask REST API  (Port 5000)                     |
|  +------------------------------------------------------+   |
|  | /api/elderly          - Resident management          |   |
|  | /api/health           - Health data queries          |   |
|  | /api/alerts           - Alert management             |   |
|  | /watch/*              - Galaxy Watch data ingestion  |   |
|  | /api/simulate/push    - Data simulation trigger      |   |
|  +------------------------------------------------------+   |
+------------------------+------------------------------------+
                         |
        +----------------+-----------------+
        v                v                 v
   +---------+    +--------------+  +--------------+
   | SQLite  |    | Streamlit    |  | Data         |
   | Database|    | Dashboard    |  | Simulator    |
   |         |    | (Port 8501)  |  |              |
   +---------+    +--------------+  +--------------+
```

---

## Project Structure

```
project/
├── app.py                    # Flask main application & REST API endpoints
├── models.py                 # SQLite database initialization and connection
├── simulator.py              # Health data simulator
├── sensor_analysis.py        # Sensor data analysis algorithms
├── dashboard.py              # Streamlit home page
├── start.py                  # One-click launch script
├── test.py                   # Test scripts
├── elderly_care.db           # SQLite database file
├── requirements.txt          # Python dependencies
├── pages/                    # Streamlit multi-page app
│   ├── 1_overview.py         # System overview page
│   ├── 2_elderly_list.py     # Resident list management
│   ├── 3_health_data.py      # Health data analysis
│   ├── 4_alerts.py           # Alert management
│   └── 5_watch_data.py       # Galaxy Watch raw data viewer
└── README.md                 # Project documentation
```

---

## Database Schema

### Core Tables

#### `elderly` — Resident Information
```sql
id                INTEGER PRIMARY KEY
name              TEXT              -- Full name
age               INTEGER           -- Age
gender            TEXT              -- Gender
phone             TEXT              -- Phone number
address           TEXT              -- Address
watch_id          TEXT UNIQUE       -- Galaxy Watch device ID
emergency_contact TEXT              -- Emergency contact name
emergency_phone   TEXT              -- Emergency contact phone
status            TEXT DEFAULT 'normal'  -- Status: normal / warning / abnormal
created_at        TEXT              -- Record creation timestamp
```

#### `health_data` — Health Records
```sql
id            INTEGER PRIMARY KEY
elderly_id    INTEGER           -- FK -> elderly.id
heart_rate    REAL              -- Heart rate (bpm)
blood_oxygen  REAL              -- Blood oxygen saturation (%)
systolic      REAL              -- Systolic blood pressure (mmHg)
diastolic     REAL              -- Diastolic blood pressure (mmHg)
steps         INTEGER           -- Step count
calories      REAL              -- Calorie expenditure
latitude      REAL              -- GPS latitude
longitude     REAL              -- GPS longitude
location_name TEXT              -- Location label
fall_detected INTEGER DEFAULT 0 -- Fall event flag
activity      TEXT              -- Activity type
recorded_at   TEXT              -- Record timestamp
```

#### `alerts` — Alert Records
```sql
id          INTEGER PRIMARY KEY
elderly_id  INTEGER           -- FK -> elderly.id
alert_type  TEXT              -- Type: Heart Rate / Blood Oxygen / Blood Pressure / Fall Detected
severity    TEXT              -- Severity: warning / critical
message     TEXT              -- Alert description
is_handled  INTEGER DEFAULT 0 -- Handled flag
handler     TEXT              -- Handler name
handle_note TEXT              -- Handler notes
created_at  TEXT              -- Alert creation timestamp
handled_at  TEXT              -- Handled timestamp
```

### Galaxy Watch Sensor Tables

#### `watch_eda` — Electrodermal Activity
```sql
id               INTEGER PRIMARY KEY
client_ip        TEXT              -- Client IP address
received_at      TEXT              -- Server receive timestamp
sensor_timestamp INTEGER           -- Watch sensor timestamp
label            TEXT              -- EDA label: STABLE / VARIABLE
valid_samples    INTEGER           -- Valid sample count
skin_conductance REAL              -- Skin conductance (µS)
sample_timestamp INTEGER           -- Sample timestamp
stress_score     REAL              -- Computed stress score (0-100)
stress_level     TEXT              -- Stress level classification
created_at       TEXT              -- DB insert timestamp
```

#### `watch_heart_rate` — Heart Rate Data
```sql
id               INTEGER PRIMARY KEY
client_ip        TEXT              -- Client IP address
received_at      TEXT              -- Server receive timestamp
sensor_timestamp INTEGER           -- Watch sensor timestamp
bpm              REAL              -- Heart rate (bpm)
hr_status        INTEGER           -- Raw HR status code from watch
sample_timestamp INTEGER           -- Sample timestamp
hr_level         TEXT              -- HR level classification
hr_severity      TEXT              -- Severity: normal / warning / critical
created_at       TEXT              -- DB insert timestamp
```

#### `watch_temperature` — Temperature Data
```sql
id                  INTEGER PRIMARY KEY
client_ip           TEXT              -- Client IP address
received_at         TEXT              -- Server receive timestamp
sensor_timestamp    INTEGER           -- Watch sensor timestamp
wrist_temp          REAL              -- Wrist skin temperature (°C)
ambient_temp        REAL              -- Ambient temperature (°C)
estimated_core_temp REAL              -- Estimated core body temperature (°C)
heat_gradient       REAL              -- Heat gradient (wrist - ambient)
temp_status         TEXT              -- Status: Normal / Fever / High Fever / Low / Hypothermia Risk
created_at          TEXT              -- DB insert timestamp
```

#### `watch_wear_state` — Wear State
```sql
id               INTEGER PRIMARY KEY
client_ip        TEXT              -- Client IP address
received_at      TEXT              -- Server receive timestamp
sensor_timestamp INTEGER           -- Watch sensor timestamp
is_worn          INTEGER           -- Worn flag: 1 = worn, 0 = not worn
state            TEXT              -- State string from watch
created_at       TEXT              -- DB insert timestamp
```

---

## Getting Started

### Requirements
- Python 3.8+
- pip

### Install Dependencies

```bash
pip install -r requirements.txt
```

| Package | Version | Purpose |
|---|---|---|
| flask | 3.0.0 | Web framework |
| flask-cors | 4.0.0 | Cross-origin resource sharing |
| streamlit | 1.29.0 | Dashboard framework |
| pandas | 2.1.4 | Data processing |
| plotly | 5.18.0 | Interactive charts |
| requests | 2.31.0 | HTTP client |
| numpy | 1.26.2 | Numerical computing |
| Werkzeug | 3.0.1 | WSGI utilities |

### One-click Launch

```bash
python start.py
```

Launch sequence:
1. Initialize SQLite database and seed demo data
2. Start Flask API at `http://127.0.0.1:5000`
3. Start data simulator (pushes readings every 8 seconds)
4. Start Streamlit dashboard at `http://localhost:8501`

Expected output:
```
====================================================
   Elderly Care System -- One-click Launch
====================================================
[1/4] Initializing database...
[2/4] Starting Flask backend...
[3/4] Starting data simulator...
[4/4] Starting Streamlit Dashboard...

====================================================
  Flask  API  : http://127.0.0.1:5000
  Dashboard   : http://localhost:8501
====================================================
Open http://localhost:8501 in your browser.
Press Ctrl+C to stop.
```

### Access the App

Open **http://localhost:8501** in your browser.

---

## REST API Reference

### Overview

```http
GET /api/overview
```

Response:
```json
{
  "total": 5,
  "normal": 3,
  "warning": 1,
  "abnormal": 1,
  "unhandled_alerts": 2,
  "critical_alerts": 1,
  "today_alerts": 5,
  "today_data_count": 120
}
```

### Resident Management

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/elderly` | List all residents with latest vitals |
| GET | `/api/elderly/<id>` | Get single resident |
| POST | `/api/elderly` | Add new resident |
| PUT | `/api/elderly/<id>` | Update resident info |
| DELETE | `/api/elderly/<id>` | Delete resident and all related data |

**Add resident (POST body):**
```json
{
  "name": "John Doe",
  "age": 80,
  "gender": "Male",
  "phone": "555-0100",
  "address": "606 Birch St, Springfield",
  "watch_id": "WATCH-006",
  "emergency_contact": "Jane Doe",
  "emergency_phone": "555-0101"
}
```

### Health Data

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health/<id>?hours=24` | Historical records (up to 500 rows) |
| GET | `/api/health/<id>/latest` | Latest single reading |
| GET | `/api/health/<id>/stats?hours=24` | Aggregated statistics |

**Stats response:**
```json
{
  "avg_hr": 75.3, "min_hr": 62.1, "max_hr": 88.5,
  "avg_spo2": 97.8, "min_spo2": 96.2,
  "avg_sbp": 125.4, "avg_dbp": 78.2,
  "total_steps": 5420, "total_calories": 245.3,
  "fall_count": 0
}
```

### Alert Management

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/alerts` | List alerts (supports `severity`, `is_handled`, `limit` filters) |
| PUT | `/api/alerts/<id>/handle` | Mark alert as handled |

**Handle alert (PUT body):**
```json
{
  "handler": "Nurse Jane",
  "note": "Patient checked, vitals stabilized."
}
```

### Galaxy Watch Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/watch/data` | Receive sensor payload from watch |
| GET | `/watch/heart_rate?limit=200` | Recent HR records |
| GET | `/watch/eda?limit=200` | Recent EDA records |
| GET | `/watch/temperature?limit=200` | Recent temperature records |
| GET | `/watch/wear_state` | Latest wear state |

**Watch data payload example:**
```json
{
  "client": "192.168.1.100",
  "receivedAt": "2024-03-15T14:30:45",
  "payload": {
    "timestamp": 1710508245000,
    "heartRate": { "bpm": 75, "status": 0 },
    "eda": { "skinConductance": 2.5, "label": "STABLE", "validSampleCount": 30 },
    "temperature": { "wristSkinTemperature": 33.5, "ambientTemperature": 22.0 },
    "event": "wear_state", "isWorn": true, "state": "ON_WRIST"
  }
}
```

### Simulation

```http
POST /api/simulate/push
```
Pushes one simulated reading for every resident (25 % chance of abnormal values).

---

## Sensor Analysis Algorithms

### EDA — Electrodermal Activity

Estimates stress level from skin conductance measured by the Galaxy Watch (~30 samples per 10-minute window).

**Scoring formula:**
```
stress_score = tonic_score + phasic_score + label_score

tonic_score  = sigmoid(mean_sc,  midpoint=1.5, steepness=1.2) × 60
phasic_score = sigmoid(std_sc,   midpoint=0.5, steepness=2.0) × 25
label_score  = variable_ratio × 15
```

**Stress level thresholds:**

| Score | Level |
|---|---|
| 0 – 19 | Relaxed |
| 20 – 39 | Calm |
| 40 – 59 | Moderate |
| 60 – 79 | Stressed |
| 80 – 100 | High Stress |

### Core Temperature Estimation

Derived from wrist skin temperature and ambient temperature (Buller et al. 2013 / ISO 9886).

```
core_temp = wrist_temp + 4.5 + 0.15 × (wrist_temp − ambient_temp)
```

| Core Temp | Status |
|---|---|
| ≥ 39.0 °C | High Fever |
| 37.5 – 39.0 °C | Fever |
| 36.1 – 37.5 °C | Normal |
| 35.0 – 36.1 °C | Low |
| < 35.0 °C | Hypothermia Risk |

### Heart Rate Classification

Age-adjusted thresholds (max HR = 220 − age, default age 75).

| BPM Range | Level | Severity |
|---|---|---|
| < 40 | Bradycardia (Severe) | critical |
| 40 – 49 | Bradycardia | warning |
| 50 – 59 | Low Normal | normal |
| 60 – 99 | Normal | normal |
| 100 – 109 | Elevated | warning |
| 110 – 129 | Tachycardia | critical |
| ≥ 130 | Tachycardia (Severe) | critical |

---

## Alert Rules

### Heart Rate
| Condition | Severity |
|---|---|
| HR < 50 bpm | Critical |
| HR > 110 bpm | Critical |
| 100 < HR ≤ 110 bpm | Warning |

### Blood Oxygen
| Condition | Severity |
|---|---|
| SpO2 < 90 % | Critical |
| 90 % ≤ SpO2 < 94 % | Warning |

### Blood Pressure
| Condition | Severity |
|---|---|
| Systolic > 180 mmHg | Critical |
| 160 < Systolic ≤ 180 mmHg | Warning |
| Systolic < 90 mmHg | Critical |

### Fall Detection
| Condition | Severity |
|---|---|
| Fall event detected | Critical |

---

## Dashboard Pages

| Page | File | Description |
|---|---|---|
| Home | `dashboard.py` | Landing page with navigation cards |
| Overview | `pages/1_overview.py` | Live stats, status pie chart, HR bar chart, quick actions |
| Resident List | `pages/2_elderly_list.py` | Add / edit / delete residents, bind Watch IDs |
| Health Data | `pages/3_health_data.py` | HR & SpO2 trends, blood pressure, steps, fall events |
| Alert Management | `pages/4_alerts.py` | View, filter and handle alerts |
| Watch Live | `pages/5_watch_data.py` | Raw Galaxy Watch sensor streams (HR, EDA, temperature) |

---

## Demo Seed Data

Automatically inserted on first run:

| ID | Name | Age | Gender | Watch ID | Location |
|---|---|---|---|---|---|
| 1 | George Smith | 78 | Male | WATCH-001 | Springfield |
| 2 | Mary Johnson | 82 | Female | WATCH-002 | Shelbyville |
| 3 | Helen Williams | 75 | Female | WATCH-003 | Capital City |
| 4 | Robert Brown | 80 | Male | WATCH-004 | Ogdenville |
| 5 | Dorothy Davis | 73 | Female | WATCH-005 | North Haverbrook |

---

## Development Guide

### Add a new alert rule

Edit `_check_and_alert()` in `simulator.py`:
```python
if data["your_field"] > THRESHOLD:
    alerts.append((eid, "Alert Type", "critical", "Alert message"))
```

### Add a new API endpoint

Edit `app.py`:
```python
@app.get("/api/your-endpoint")
def your_endpoint():
    conn = get_conn()
    # your logic
    conn.close()
    return jsonify(result)
```

### Add a new dashboard page

Create `pages/6_your_page.py`:
```python
import streamlit as st
st.set_page_config(page_title="Your Page", page_icon="📊")
st.title("Your Page Title")
```

---

## Troubleshooting

| Problem | Solution |
|---|---|
| Database locked error | Ensure only one process accesses the DB; restart the app |
| Port 5000 already in use | Change the port in `app.py` or kill the occupying process |
| Streamlit cannot reach Flask | Confirm Flask is running; check firewall / antivirus settings |
| Watch data not received | Check Watch network connectivity and that port 5000 is reachable |

---

## Tech Stack

| Component | Technology | Version |
|---|---|---|
| Backend | Flask | 3.0.0 |
| Dashboard | Streamlit | 1.29.0 |
| Database | SQLite | built-in |
| Data processing | Pandas | 2.1.4 |
| Charts | Plotly | 5.18.0 |
| Numerical computing | NumPy | 1.26.2 |
| HTTP client | Requests | 2.31.0 |

---

## License

This project is open source and free to use.

---

**Last updated:** March 15, 2024 | **Status:** Production Ready
