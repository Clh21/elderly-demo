import random
import time
from datetime import datetime
from models import get_conn

LOC_POOL = [
    (39.9042, 116.4074, "Home"),
    (39.9100, 116.3980, "Community Garden"),
    (39.9055, 116.4120, "Supermarket"),
    (39.9015, 116.4000, "Community Clinic"),
    (39.9080, 116.4050, "Park"),
]
ACTIVITY_POOL = ["Resting", "Walking", "Sitting", "Light Activity", "Sleeping"]


def gen_health_reading(elderly_id: int, abnormal: bool = False) -> dict:
    loc = random.choice(LOC_POOL)
    if abnormal:
        heart_rate   = random.choice([random.uniform(40, 50), random.uniform(110, 140)])
        blood_oxygen = random.uniform(88, 93)
        systolic     = random.choice([random.uniform(160, 190), random.uniform(70, 85)])
        diastolic    = random.uniform(50, 60) if systolic < 90 else random.uniform(95, 115)
        fall         = 1 if random.random() < 0.4 else 0
    else:
        heart_rate   = random.uniform(62, 88)
        blood_oxygen = random.uniform(96, 100)
        systolic     = random.uniform(110, 138)
        diastolic    = random.uniform(70, 88)
        fall         = 0
    return {
        "elderly_id":    elderly_id,
        "heart_rate":    round(heart_rate, 1),
        "blood_oxygen":  round(blood_oxygen, 1),
        "systolic":      round(systolic, 1),
        "diastolic":     round(diastolic, 1),
        "steps":         random.randint(0, 800),
        "calories":      round(random.uniform(0, 50), 1),
        "latitude":      round(loc[0] + random.uniform(-0.001, 0.001), 6),
        "longitude":     round(loc[1] + random.uniform(-0.001, 0.001), 6),
        "location_name": loc[2],
        "fall_detected": fall,
        "activity":      random.choice(ACTIVITY_POOL),
    }


def insert_reading(data: dict) -> int:
    conn = get_conn()
    c = conn.cursor()
    c.execute("""
        INSERT INTO health_data
            (elderly_id, heart_rate, blood_oxygen, systolic, diastolic,
             steps, calories, latitude, longitude, location_name, fall_detected, activity)
        VALUES
            (:elderly_id,:heart_rate,:blood_oxygen,:systolic,:diastolic,
             :steps,:calories,:latitude,:longitude,:location_name,:fall_detected,:activity)
    """, data)
    row_id = c.lastrowid
    conn.commit()
    _check_and_alert(c, conn, data)
    conn.close()
    return row_id


def _check_and_alert(c, conn, data):
    eid = data["elderly_id"]
    alerts = []
    hr = data["heart_rate"]
    if hr < 50:
        alerts.append((eid, "Heart Rate", "critical", f"Heart rate critically low: {hr} bpm. Immediate attention required!"))
    elif hr > 110:
        alerts.append((eid, "Heart Rate", "critical", f"Heart rate critically high: {hr} bpm. Immediate attention required!"))
    elif hr > 100:
        alerts.append((eid, "Heart Rate", "warning",  f"Heart rate elevated: {hr} bpm"))
    spo2 = data["blood_oxygen"]
    if spo2 < 90:
        alerts.append((eid, "Blood Oxygen", "critical", f"Blood oxygen critically low: {spo2}%. Immediate action needed!"))
    elif spo2 < 94:
        alerts.append((eid, "Blood Oxygen", "warning",  f"Blood oxygen low: {spo2}%"))
    sbp = data["systolic"]
    if sbp > 180:
        alerts.append((eid, "Blood Pressure", "critical", f"Systolic pressure critically high: {sbp} mmHg"))
    elif sbp > 160:
        alerts.append((eid, "Blood Pressure", "warning",  f"Systolic pressure high: {sbp} mmHg"))
    elif sbp < 90:
        alerts.append((eid, "Blood Pressure", "critical", f"Systolic pressure critically low: {sbp} mmHg"))
    if data["fall_detected"]:
        alerts.append((eid, "Fall Detected", "critical", "Fall event detected! Please dispatch personnel immediately."))
    for a in alerts:
        c.execute("INSERT INTO alerts (elderly_id,alert_type,severity,message) VALUES (?,?,?,?)", a)
    if alerts:
        severity = "abnormal" if any(x[2] == "critical" for x in alerts) else "warning"
        c.execute("UPDATE elderly SET status=? WHERE id=?", (severity, eid))
        conn.commit()


def run_simulation(interval: int = 10):
    conn = get_conn()
    elderly_ids = [r[0] for r in conn.execute("SELECT id FROM elderly").fetchall()]
    conn.close()
    print(f"[Simulator] Simulating {len(elderly_ids)} residents via Galaxy Watch8, interval: {interval}s")
    tick = 0
    while True:
        for eid in elderly_ids:
            abnormal = (tick % 5 == 0) and (random.random() < 0.35)
            insert_reading(gen_health_reading(eid, abnormal=abnormal))
        tick += 1
        print(f"[Simulator] Round {tick} written at {datetime.now().strftime('%H:%M:%S')}")
        time.sleep(interval)


if __name__ == "__main__":
    run_simulation(interval=8)
