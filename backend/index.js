import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';

const app = express();
app.use(cors());
app.use(express.json());

// ── DB connection pool ──────────────────────────────────────
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '3221279mp3',
  database: 'elderly',
  waitForConnections: true,
  connectionLimit: 10,
});

// ── helpers ─────────────────────────────────────────────────
const getStatusFromValue = (metric, value) => {
  if (metric === 'heartRate')   return value > 100 || value < 50 ? 'warning' : 'normal';
  if (metric === 'temperature') return value > 37.5 ? 'warning' : 'normal';
  if (metric === 'eda')         return value > 3.5  ? 'warning' : 'normal';
  return 'normal';
};

const buildHistory = (rows, valueKey) =>
  rows.map(r => ({
    time: new Date(r.recorded_at || r.minute_slot).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    value: parseFloat(r[valueKey]),
  }));

const generateSimulatedHistory = (baseValue, variance, points = 10) => {
  const data = [];
  const now = new Date();
  for (let i = points - 1; i >= 0; i--) {
    const time = new Date(now.getTime() - i * 5 * 60 * 1000);
    const value = baseValue + (Math.random() - 0.5) * variance;
    data.push({
      time: time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      value: Math.round(value * 10) / 10,
    });
  }
  return data;
};

// ── Minute-slot helper ──────────────────────────────────────
// Returns 'YYYY-MM-DD HH:MM:00' — current time truncated to the minute
const currentMinuteSlot = () => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ` +
         `${pad(now.getHours())}:${pad(now.getMinutes())}:00`;
};

// ── Demo simulator ──────────────────────────────────────────
// Readings: every 10 seconds, UPSERT into minute_readings (one row per minute)
// Alerts:   every 2 minutes, fire next in sequence
const ALERT_SEQUENCE = [
  { type: 'heart_rate',    severity: 'warning',  message: 'High heart rate detected (115 bpm)' },
  { type: 'heart_rate',    severity: 'warning',  message: 'Low heart rate detected (42 bpm)' },
  { type: 'temperature',   severity: 'warning',  message: 'High body temperature detected (38.6°C)' },
  { type: 'temperature',   severity: 'warning',  message: 'Low body temperature detected (35.1°C)' },
  { type: 'eda',           severity: 'warning',  message: 'High stress level detected (EDA: 5.2 μS)' },
  { type: 'eda',           severity: 'warning',  message: 'Low stress level (EDA: 0.3 μS) — possible device issue' },
  { type: 'fall_detection',severity: 'critical', message: 'Fall detected! Immediate attention required' },
];
let alertIndex = 0;
let simulatorStartTime = Date.now();

const runDemoSimulator = async () => {
  try {
    const [residents] = await pool.query(
      `SELECT id FROM residents WHERE watch_id = 'demo-watch-001' LIMIT 1`
    );
    if (residents.length === 0) return;
    const residentId = residents[0].id;

    // Generate reading values
    const hr   = Math.round(72 + (Math.random() - 0.5) * 16);
    const temp = Math.round((36.5 + (Math.random() - 0.5) * 1.0) * 10) / 10;
    const eda  = Math.round((2.5  + (Math.random() - 0.5) * 1.5) * 10) / 10;
    const slot = currentMinuteSlot();

    // UPSERT into minute_readings — latest value in the minute wins
    await pool.query(
      `INSERT INTO minute_readings
         (resident_id, watch_id, minute_slot, heart_rate, temperature, eda, wear_status)
       VALUES (?, 'demo-watch-001', ?, ?, ?, ?, 'worn')
       ON DUPLICATE KEY UPDATE
         heart_rate  = VALUES(heart_rate),
         temperature = VALUES(temperature),
         eda         = VALUES(eda),
         updated_at  = NOW()`,
      [residentId, slot, hr, temp, eda]
    );

    // Every 2 minutes, fire the next alert in sequence
    const elapsed2Min = Math.floor((Date.now() - simulatorStartTime) / (2 * 60 * 1000));
    if (elapsed2Min > alertIndex) {
      const alert = ALERT_SEQUENCE[alertIndex % ALERT_SEQUENCE.length];
      alertIndex++;
      await pool.query(
        `INSERT INTO alerts (resident_id, type, severity, message, status)
         VALUES (?, ?, ?, ?, 'active')`,
        [residentId, alert.type, alert.severity, alert.message]
      );
      console.log(`[Simulator] Alert fired: ${alert.message}`);
    }

    console.log(`[Simulator] 10s tick — slot:${slot} HR:${hr} Temp:${temp} EDA:${eda}`);
  } catch (err) {
    console.error('[Simulator] Error:', err.message);
  }
};

// Run immediately, then every 10 seconds
runDemoSimulator();
setInterval(runDemoSimulator, 10 * 1000);

// ── GET /api/watch/:watchId ──────────────────────────────────
app.get('/api/watch/:watchId', async (req, res) => {
  try {
    const { watchId } = req.params;

    // Latest minute reading
    const [latest] = await pool.query(
      `SELECT * FROM minute_readings WHERE watch_id = ? ORDER BY minute_slot DESC LIMIT 1`,
      [watchId]
    );
    // Last 10 minute readings for chart history
    const [history] = await pool.query(
      `SELECT heart_rate, temperature, eda, wear_status, minute_slot AS recorded_at
       FROM minute_readings WHERE watch_id = ?
       ORDER BY minute_slot DESC LIMIT 10`,
      [watchId]
    );
    const historyAsc = [...history].reverse();

    if (latest.length === 0) {
      const hr   = Math.round(72 + Math.random() * 10);
      const temp = Math.round((36.2 + Math.random() * 0.8) * 10) / 10;
      const eda  = Math.round((2.0  + Math.random() * 1.5) * 10) / 10;
      return res.json({
        heartRate: hr,   heartRateStatus:   getStatusFromValue('heartRate', hr),
        temperature: temp, temperatureStatus: getStatusFromValue('temperature', temp),
        eda,             edaStatus:          getStatusFromValue('eda', eda),
        wearStatus: 'worn',
        timestamp: new Date().toISOString(),
        heartRateHistory:   generateSimulatedHistory(hr,   8),
        temperatureHistory: generateSimulatedHistory(temp, 0.8),
        edaHistory:         generateSimulatedHistory(eda,  1.2),
        wearHistory:        generateSimulatedHistory(1,    0),
      });
    }

    const row = latest[0];
    res.json({
      heartRate:         parseFloat(row.heart_rate),
      heartRateStatus:   getStatusFromValue('heartRate', row.heart_rate),
      temperature:       parseFloat(row.temperature),
      temperatureStatus: getStatusFromValue('temperature', row.temperature),
      eda:               parseFloat(row.eda),
      edaStatus:         getStatusFromValue('eda', row.eda),
      wearStatus:        row.wear_status,
      timestamp:         row.minute_slot,
      heartRateHistory:   historyAsc.length >= 2 ? buildHistory(historyAsc, 'heart_rate')   : generateSimulatedHistory(parseFloat(row.heart_rate),   8),
      temperatureHistory: historyAsc.length >= 2 ? buildHistory(historyAsc, 'temperature')  : generateSimulatedHistory(parseFloat(row.temperature),  0.8),
      edaHistory:         historyAsc.length >= 2 ? buildHistory(historyAsc, 'eda')           : generateSimulatedHistory(parseFloat(row.eda),          1.2),
      wearHistory:        historyAsc.length >= 2
        ? historyAsc.map(r => ({
            time: new Date(r.recorded_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            value: r.wear_status === 'worn' ? 1 : 0,
          }))
        : generateSimulatedHistory(1, 0),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/stats ───────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  try {
    const [[{ totalResidents }]] = await pool.query(
      `SELECT COUNT(*) AS totalResidents FROM residents WHERE status != 'inactive'`
    );
    const [[{ activeAlerts }]] = await pool.query(
      `SELECT COUNT(*) AS activeAlerts FROM alerts WHERE status = 'active'`
    );
    const [[{ criticalAlerts }]] = await pool.query(
      `SELECT COUNT(*) AS criticalAlerts FROM alerts WHERE status = 'active' AND severity = 'critical'`
    );
    const [[{ warningAlerts }]] = await pool.query(
      `SELECT COUNT(*) AS warningAlerts FROM alerts WHERE status = 'active' AND severity = 'warning'`
    );
    const [[{ connectedDevices }]] = await pool.query(
      `SELECT COUNT(DISTINCT watch_id) AS connectedDevices
       FROM watch_readings WHERE recorded_at >= NOW() - INTERVAL 10 MINUTE`
    );
    const [[{ dataPointsToday }]] = await pool.query(
      `SELECT COUNT(*) AS dataPointsToday FROM watch_readings WHERE DATE(recorded_at) = CURDATE()`
    );
    res.json({
      totalResidents, activeAlerts, criticalAlerts, warningAlerts,
      connectedDevices, dataPointsToday,
      lastUpdate: new Date().toISOString(),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/residents ───────────────────────────────────────
app.get('/api/residents', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, age, room, watch_id AS watchId,
              emergency_contact AS emergencyContact, status
       FROM residents ORDER BY room`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/health/:residentId?days=7 ──────────────────────
app.get('/api/health/:residentId', async (req, res) => {
  try {
    const { residentId } = req.params;
    const days = parseInt(req.query.days) || 7;
    const [rows] = await pool.query(
      `SELECT summary_date AS date,
              avg_heart_rate  AS heartRate,
              avg_temperature AS temperature,
              avg_eda         AS eda,
              total_steps     AS steps,
              alert_count     AS alerts
       FROM daily_summaries
       WHERE resident_id = ?
         AND summary_date >= CURDATE() - INTERVAL ? DAY
       ORDER BY summary_date`,
      [residentId, days]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/alerts ──────────────────────────────────────────
app.get('/api/alerts', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT a.id, a.resident_id AS residentId, r.name AS residentName,
              a.type, a.severity, a.message, a.status,
              a.created_at AS timestamp
       FROM alerts a
       JOIN residents r ON r.id = a.resident_id
       ORDER BY a.created_at DESC
       LIMIT 100`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/alerts/latest?after=<id> ───────────────────────
// Returns alerts newer than a given ID (for popup polling)
app.get('/api/alerts/latest', async (req, res) => {
  try {
    const afterId = parseInt(req.query.after) || 0;
    const [rows] = await pool.query(
      `SELECT a.id, a.resident_id AS residentId, r.name AS residentName,
              a.type, a.severity, a.message, a.status,
              a.created_at AS timestamp
       FROM alerts a
       JOIN residents r ON r.id = a.resident_id
       WHERE a.id > ? AND a.status = 'active'
       ORDER BY a.created_at ASC`,
      [afterId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/alerts/:id/resolve ───────────────────────────
app.post('/api/alerts/:id/resolve', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(
      `UPDATE alerts SET status = 'resolved', resolved_at = NOW() WHERE id = ?`,
      [id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/samsung-watch  (Samsung Galaxy Watch 8 data ingestion) ──
// Accepts all payload formats from the watch:
//   1. { sensorType: "eda",         eda: { skinConductance, label, ... } }
//   2. { sensorType: "heart_rate",   heartRate: { bpm, status, ... } }
//   3. { sensorType: "temperature",  temperature: { wristSkinTemperature, ambientTemperature, ... } }
//   4. { event: "wear_state",        isWorn, state }
//   5. Legacy combined: { eda: {...}, heartRate: {...}, temperature: {...} }
//
// The watch is matched to a resident by watchId query param or client IP.
// Data is stored via UPSERT into minute_readings (one row per minute).
app.post('/api/samsung-watch', async (req, res) => {
  try {
    const payload = req.body;
    // watchId can be passed as query param, header, or falls back to client IP
    const watchId = req.query.watchId || req.headers['x-watch-id'] || null;

    // Resolve resident by watchId or leave null (store raw data without resident link)
    let residentId = null;
    if (watchId) {
      const [rows] = await pool.query(
        `SELECT id FROM residents WHERE watch_id = ? LIMIT 1`, [watchId]
      );
      if (rows.length > 0) residentId = rows[0].id;
    }

    if (!residentId) {
      // Try to find resident by any registered watch
      const [rows] = await pool.query(`SELECT id, watch_id FROM residents LIMIT 10`);
      // Default to demo watch if no match
      const demo = rows.find(r => r.watch_id === 'demo-watch-001');
      if (demo) residentId = demo.id;
    }

    const effectiveWatchId = watchId || 'real-watch-001';
    const slot = currentMinuteSlot();

    // ── Parse payload fields ────────────────────────────────
    let hr = null, temp = null, wristTemp = null, ambientTemp = null;
    let eda = null, edaLabel = null, wearStatus = null;

    const sensorType = payload.sensorType || null;
    const event      = payload.event || null;

    // EDA
    if (sensorType === 'eda' || payload.eda) {
      const edaData = payload.eda || {};
      eda      = edaData.skinConductance != null ? parseFloat(edaData.skinConductance) : null;
      edaLabel = edaData.label || null;
    }

    // Heart Rate
    if (sensorType === 'heart_rate' || payload.heartRate) {
      const hrData = payload.heartRate || {};
      hr = hrData.bpm != null ? parseFloat(hrData.bpm) : null;
    }

    // Temperature
    if (sensorType === 'temperature' || payload.temperature) {
      const tempData = payload.temperature || {};
      wristTemp   = tempData.wristSkinTemperature   != null ? parseFloat(tempData.wristSkinTemperature)   : null;
      ambientTemp = tempData.ambientTemperature      != null ? parseFloat(tempData.ambientTemperature)      : null;
      temp = wristTemp; // use wrist temp as primary temperature
    }

    // Wear state event
    if (event === 'wear_state') {
      wearStatus = payload.isWorn ? 'worn' : 'not_worn';
    }

    // ── Insert raw reading into watch_readings ──────────────
    await pool.query(
      `INSERT INTO watch_readings
         (resident_id, watch_id, heart_rate, temperature, wrist_temperature, ambient_temperature, eda, eda_label, wear_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        residentId, effectiveWatchId,
        hr, temp, wristTemp, ambientTemp,
        eda, edaLabel,
        wearStatus || 'worn'
      ]
    );

    // ── UPSERT into minute_readings (latest value wins per minute) ──
    // Only update fields that were present in this payload
    const updates = [];
    const updateVals = [];
    if (hr          != null) { updates.push('heart_rate = VALUES(heart_rate)');               }
    if (temp        != null) { updates.push('temperature = VALUES(temperature)');             }
    if (wristTemp   != null) { updates.push('wrist_temperature = VALUES(wrist_temperature)'); }
    if (ambientTemp != null) { updates.push('ambient_temperature = VALUES(ambient_temperature)'); }
    if (eda         != null) { updates.push('eda = VALUES(eda)');                             }
    if (edaLabel    != null) { updates.push('eda_label = VALUES(eda_label)');                 }
    if (wearStatus  != null) { updates.push('wear_status = VALUES(wear_status)');             }
    updates.push('updated_at = NOW()');

    await pool.query(
      `INSERT INTO minute_readings
         (resident_id, watch_id, minute_slot, heart_rate, temperature, wrist_temperature, ambient_temperature, eda, eda_label, wear_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE ${updates.join(', ')}`,
      [
        residentId, effectiveWatchId, slot,
        hr, temp, wristTemp, ambientTemp,
        eda, edaLabel,
        wearStatus || 'worn'
      ]
    );

    console.log(`[Samsung Watch] ${effectiveWatchId} | sensorType:${sensorType || event || 'combined'} | HR:${hr} Temp:${wristTemp} EDA:${eda} Worn:${wearStatus}`);
    res.json({ success: true, slot, watchId: effectiveWatchId });
  } catch (err) {
    console.error('[Samsung Watch] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/watch-reading  (for device data ingestion) ─────
app.post('/api/watch-reading', async (req, res) => {
  try {
    const { watchId, heartRate, temperature, eda, wearStatus } = req.body;
    const [resident] = await pool.query(
      `SELECT id FROM residents WHERE watch_id = ?`, [watchId]
    );
    if (resident.length === 0) return res.status(404).json({ error: 'Watch not found' });
    await pool.query(
      `INSERT INTO watch_readings (resident_id, watch_id, heart_rate, temperature, eda, wear_status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [resident[0].id, watchId, heartRate, temperature, eda, wearStatus || 'worn']
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── Start ────────────────────────────────────────────────────
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Elderly Care API server running at http://localhost:${PORT}`);
});
