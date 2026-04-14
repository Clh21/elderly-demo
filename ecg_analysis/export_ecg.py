"""Export ECG sample data from MySQL to JSON files for analysis."""
import json
import os
import mysql.connector

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "127.0.0.1"),
    "port": int(os.getenv("DB_PORT", "3306")),
    "user": os.getenv("DB_USERNAME", "root"),
    "password": os.getenv("DB_PASSWORD", ""),
    "database": os.getenv("DB_NAME", "elderly"),
}

conn = mysql.connector.connect(**DB_CONFIG)
cur = conn.cursor(dictionary=True)

# Get all ECG readings metadata
cur.execute("""
    SELECT id, watch_id, ecg_heart_rate, ecg_sample_count, ecg_result, recorded_at
    FROM watch_readings
    WHERE sensor_type = 'ecg'
    ORDER BY id
""")
records = cur.fetchall()

print(f"Found {len(records)} ECG records")

for rec in records:
    rid = rec["id"]
    print(f"\nExporting id={rid}  HR={rec['ecg_heart_rate']}  samples={rec['ecg_sample_count']}  "
          f"result={rec['ecg_result']}  at={rec['recorded_at']}")

    # Fetch entire raw_payload
    cur.execute("SELECT raw_payload FROM watch_readings WHERE id = %s", (rid,))
    row = cur.fetchone()
    payload = json.loads(row["raw_payload"])
    samples = payload["ecg"]["samples"]

    out = {
        "id": rid,
        "watch_id": rec["watch_id"],
        "ecg_heart_rate": float(rec["ecg_heart_rate"]) if rec["ecg_heart_rate"] else None,
        "ecg_sample_count": rec["ecg_sample_count"],
        "ecg_result": rec["ecg_result"],
        "recorded_at": str(rec["recorded_at"]),
        "lead_off": payload["ecg"].get("leadOff", None),
        "samples": samples,
    }

    fname = f"ecg_{rid}.json"
    with open(fname, "w") as f:
        json.dump(out, f)
    print(f"  -> {fname}  ({len(samples)} samples)")

cur.close()
conn.close()
print("\nDone.")
