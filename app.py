from flask import Flask, jsonify, request
from flask_cors import CORS
from models import init_db, get_conn
from simulator import gen_health_reading, insert_reading
from datetime import datetime, timedelta
import random

app = Flask(__name__)
CORS(app)


@app.get("/api/overview")
def overview():
    conn = get_conn()
    d = dict(
        total=conn.execute("SELECT COUNT(*) FROM elderly").fetchone()[0],
        normal=conn.execute("SELECT COUNT(*) FROM elderly WHERE status='normal'").fetchone()[0],
        warning=conn.execute("SELECT COUNT(*) FROM elderly WHERE status='warning'").fetchone()[0],
        abnormal=conn.execute("SELECT COUNT(*) FROM elderly WHERE status='abnormal'").fetchone()[0],
        unhandled_alerts=conn.execute("SELECT COUNT(*) FROM alerts WHERE is_handled=0").fetchone()[0],
        critical_alerts=conn.execute("SELECT COUNT(*) FROM alerts WHERE is_handled=0 AND severity='critical'").fetchone()[0],
        today_alerts=conn.execute("SELECT COUNT(*) FROM alerts WHERE date(created_at)=date('now','localtime')").fetchone()[0],
        today_data_count=conn.execute("SELECT COUNT(*) FROM health_data WHERE date(recorded_at)=date('now','localtime')").fetchone()[0],
    )
    conn.close()
    return jsonify(d)


@app.get("/api/elderly")
def list_elderly():
    conn = get_conn()
    rows = conn.execute("""
        SELECT e.*,
            (SELECT heart_rate   FROM health_data WHERE elderly_id=e.id ORDER BY id DESC LIMIT 1) AS last_hr,
            (SELECT blood_oxygen FROM health_data WHERE elderly_id=e.id ORDER BY id DESC LIMIT 1) AS last_spo2,
            (SELECT recorded_at  FROM health_data WHERE elderly_id=e.id ORDER BY id DESC LIMIT 1) AS last_seen
        FROM elderly e ORDER BY e.id
    """).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.get("/api/elderly/<int:eid>")
def get_elderly(eid):
    conn = get_conn()
    row = conn.execute("SELECT * FROM elderly WHERE id=?", (eid,)).fetchone()
    conn.close()
    return jsonify(dict(row)) if row else (jsonify({"error": "not found"}), 404)


@app.post("/api/elderly")
def add_elderly():
    d = request.json
    conn = get_conn()
    conn.execute("""
        INSERT INTO elderly (name,age,gender,phone,address,watch_id,emergency_contact,emergency_phone)
        VALUES (:name,:age,:gender,:phone,:address,:watch_id,:emergency_contact,:emergency_phone)
    """, d)
    conn.commit()
    nid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.close()
    return jsonify({"id": nid, "message": "Added successfully"}), 201


@app.put("/api/elderly/<int:eid>")
def update_elderly(eid):
    d = request.json
    d["id"] = eid
    conn = get_conn()
    conn.execute("""
        UPDATE elderly SET name=:name,age=:age,gender=:gender,phone=:phone,
        address=:address,emergency_contact=:emergency_contact,emergency_phone=:emergency_phone
        WHERE id=:id
    """, d)
    conn.commit()
    conn.close()
    return jsonify({"message": "Updated successfully"})


@app.delete("/api/elderly/<int:eid>")
def delete_elderly(eid):
    conn = get_conn()
    conn.execute("DELETE FROM elderly WHERE id=?", (eid,))
    conn.execute("DELETE FROM health_data WHERE elderly_id=?", (eid,))
    conn.execute("DELETE FROM alerts WHERE elderly_id=?", (eid,))
    conn.commit()
    conn.close()
    return jsonify({"message": "Deleted successfully"})


@app.get("/api/health/<int:eid>")
def health_data(eid):
    hours = int(request.args.get("hours", 24))
    since = (datetime.now() - timedelta(hours=hours)).strftime("%Y-%m-%d %H:%M:%S")
    conn = get_conn()
    rows = conn.execute("""
        SELECT * FROM health_data WHERE elderly_id=? AND recorded_at>=?
        ORDER BY recorded_at DESC LIMIT 500
    """, (eid, since)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.get("/api/health/<int:eid>/latest")
def latest_health(eid):
    conn = get_conn()
    row = conn.execute(
        "SELECT * FROM health_data WHERE elderly_id=? ORDER BY id DESC LIMIT 1", (eid,)
    ).fetchone()
    conn.close()
    return jsonify(dict(row)) if row else (jsonify({"error": "no data"}), 404)


@app.get("/api/health/<int:eid>/stats")
def health_stats(eid):
    hours = int(request.args.get("hours", 24))
    since = (datetime.now() - timedelta(hours=hours)).strftime("%Y-%m-%d %H:%M:%S")
    conn = get_conn()
    row = conn.execute("""
        SELECT
            ROUND(AVG(heart_rate),1)   AS avg_hr,
            ROUND(MIN(heart_rate),1)   AS min_hr,
            ROUND(MAX(heart_rate),1)   AS max_hr,
            ROUND(AVG(blood_oxygen),1) AS avg_spo2,
            ROUND(MIN(blood_oxygen),1) AS min_spo2,
            ROUND(AVG(systolic),1)     AS avg_sbp,
            ROUND(AVG(diastolic),1)    AS avg_dbp,
            SUM(steps)                 AS total_steps,
            ROUND(SUM(calories),1)     AS total_calories,
            SUM(fall_detected)         AS fall_count
        FROM health_data WHERE elderly_id=? AND recorded_at>=?
    """, (eid, since)).fetchone()
    conn.close()
    return jsonify(dict(row))


@app.get("/api/alerts")
def list_alerts():
    sev = request.args.get("severity", "")
    ih  = request.args.get("is_handled", "")
    lim = int(request.args.get("limit", 100))
    cond, par = [], []
    if sev:
        cond.append("a.severity=?")
        par.append(sev)
    if ih != "":
        cond.append("a.is_handled=?")
        par.append(int(ih))
    w = ("WHERE " + " AND ".join(cond)) if cond else ""
    conn = get_conn()
    rows = conn.execute(
        f"SELECT a.*,e.name AS elderly_name FROM alerts a JOIN elderly e ON a.elderly_id=e.id {w} ORDER BY a.created_at DESC LIMIT ?",
        par + [lim]
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.put("/api/alerts/<int:aid>/handle")
def handle_alert(aid):
    d = request.json
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn = get_conn()
    conn.execute(
        "UPDATE alerts SET is_handled=1,handler=:handler,handle_note=:note,handled_at=:handled_at WHERE id=:id",
        {"handler": d.get("handler", "Admin"), "note": d.get("note", ""), "handled_at": now, "id": aid}
    )
    conn.commit()
    conn.close()
    return jsonify({"message": "Handled successfully"})


@app.post("/api/simulate/push")
def simulate_push():
    conn = get_conn()
    ids = [r[0] for r in conn.execute("SELECT id FROM elderly").fetchall()]
    conn.close()
    for eid in ids:
        insert_reading(gen_health_reading(eid, abnormal=random.random() < 0.25))
    return jsonify({"message": f"Simulated data pushed for {len(ids)} residents"})


# ── Galaxy Watch endpoints ────────────────────────────────────────────────────
@app.post("/watch/data")
def receive_watch_data():
    from sensor_analysis import analyse_single_eda, estimate_core_temperature, classify_heart_rate
    body        = request.json or {}
    client_ip   = body.get("client", request.remote_addr)
    received_at = body.get("receivedAt", datetime.now().strftime("%Y-%m-%dT%H:%M:%S"))
    payload     = body.get("payload", body)
    ts          = payload.get("timestamp")
    sensor_type = payload.get("sensorType", "")
    conn = get_conn()
    c    = conn.cursor()
    saved = []

    if payload.get("event") == "wear_state":
        c.execute(
            "INSERT INTO watch_wear_state (client_ip,received_at,sensor_timestamp,is_worn,state) VALUES (?,?,?,?,?)",
            (client_ip, received_at, ts, 1 if payload.get("isWorn") else 0, payload.get("state", ""))
        )
        saved.append("wear_state")

    eda = payload.get("eda")
    if eda and (not sensor_type or sensor_type == "eda"):
        sc    = eda.get("skinConductance")
        label = eda.get("label", "STABLE")
        an    = analyse_single_eda(sc, label) if sc is not None else {}
        c.execute("""
            INSERT INTO watch_eda
                (client_ip,received_at,sensor_timestamp,label,valid_samples,
                 skin_conductance,sample_timestamp,stress_score,stress_level)
            VALUES (?,?,?,?,?,?,?,?,?)
        """, (client_ip, received_at, ts, label,
              eda.get("validSampleCount"), sc, eda.get("sampleTimestamp"),
              an.get("stress_score"), an.get("stress_level")))
        saved.append("eda")

    hr = payload.get("heartRate")
    if hr and (not sensor_type or sensor_type == "heart_rate"):
        bpm = hr.get("bpm")
        cl  = classify_heart_rate(bpm) if bpm else {}
        c.execute("""
            INSERT INTO watch_heart_rate
                (client_ip,received_at,sensor_timestamp,bpm,hr_status,
                 sample_timestamp,hr_level,hr_severity)
            VALUES (?,?,?,?,?,?,?,?)
        """, (client_ip, received_at, ts, bpm, hr.get("status"),
              hr.get("sampleTimestamp"), cl.get("level"), cl.get("severity")))
        saved.append("heart_rate")

    tmp = payload.get("temperature")
    if tmp and (not sensor_type or sensor_type == "temperature"):
        wrist   = tmp.get("wristSkinTemperature")
        ambient = tmp.get("ambientTemperature")
        est = estimate_core_temperature(wrist, ambient) if (wrist and ambient) else {}
        c.execute("""
            INSERT INTO watch_temperature
                (client_ip,received_at,sensor_timestamp,wrist_temp,ambient_temp,
                 estimated_core_temp,heat_gradient,temp_status)
            VALUES (?,?,?,?,?,?,?,?)
        """, (client_ip, received_at, ts, wrist, ambient,
              est.get("estimated_core_temp"), est.get("heat_gradient"), est.get("status")))
        saved.append("temperature")

    conn.commit()
    conn.close()
    return jsonify({"message": "ok", "saved": saved}), 200


@app.get("/watch/eda")
def get_watch_eda():
    limit = int(request.args.get("limit", 200))
    conn  = get_conn()
    rows  = conn.execute("SELECT * FROM watch_eda ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.get("/watch/heart_rate")
def get_watch_hr():
    limit = int(request.args.get("limit", 200))
    conn  = get_conn()
    rows  = conn.execute("SELECT * FROM watch_heart_rate ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.get("/watch/temperature")
def get_watch_temperature():
    limit = int(request.args.get("limit", 200))
    conn  = get_conn()
    rows  = conn.execute("SELECT * FROM watch_temperature ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.get("/watch/wear_state")
def get_wear_state():
    conn = get_conn()
    row  = conn.execute("SELECT * FROM watch_wear_state ORDER BY id DESC LIMIT 1").fetchone()
    conn.close()
    return jsonify(dict(row)) if row else jsonify({"state": "UNKNOWN"})


if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=5000, debug=True)
