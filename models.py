import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "elderly_care.db")


def get_conn():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_conn()
    c = conn.cursor()

    # Resident information
    c.execute("""
        CREATE TABLE IF NOT EXISTS elderly (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            name              TEXT    NOT NULL,
            age               INTEGER NOT NULL,
            gender            TEXT    NOT NULL,
            phone             TEXT,
            address           TEXT,
            watch_id          TEXT    UNIQUE NOT NULL,
            emergency_contact TEXT,
            emergency_phone   TEXT,
            status            TEXT    DEFAULT 'normal',
            created_at        TEXT    DEFAULT (datetime('now','localtime'))
        )
    """)

    # Simulated health data
    c.execute("""
        CREATE TABLE IF NOT EXISTS health_data (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            elderly_id    INTEGER NOT NULL,
            heart_rate    REAL,
            blood_oxygen  REAL,
            systolic      REAL,
            diastolic     REAL,
            steps         INTEGER,
            calories      REAL,
            latitude      REAL,
            longitude     REAL,
            location_name TEXT,
            fall_detected INTEGER DEFAULT 0,
            activity      TEXT,
            recorded_at   TEXT    DEFAULT (datetime('now','localtime')),
            FOREIGN KEY(elderly_id) REFERENCES elderly(id)
        )
    """)

    # Alerts
    c.execute("""
        CREATE TABLE IF NOT EXISTS alerts (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            elderly_id  INTEGER NOT NULL,
            alert_type  TEXT    NOT NULL,
            severity    TEXT    NOT NULL,
            message     TEXT    NOT NULL,
            is_handled  INTEGER DEFAULT 0,
            handler     TEXT,
            handle_note TEXT,
            created_at  TEXT    DEFAULT (datetime('now','localtime')),
            handled_at  TEXT,
            FOREIGN KEY(elderly_id) REFERENCES elderly(id)
        )
    """)

    # Galaxy Watch — EDA
    c.execute("""
        CREATE TABLE IF NOT EXISTS watch_eda (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            client_ip        TEXT,
            received_at      TEXT,
            sensor_timestamp INTEGER,
            label            TEXT,
            valid_samples    INTEGER,
            skin_conductance REAL,
            sample_timestamp INTEGER,
            stress_score     REAL,
            stress_level     TEXT,
            created_at       TEXT DEFAULT (datetime('now','localtime'))
        )
    """)

    # Galaxy Watch — Heart Rate
    c.execute("""
        CREATE TABLE IF NOT EXISTS watch_heart_rate (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            client_ip        TEXT,
            received_at      TEXT,
            sensor_timestamp INTEGER,
            bpm              REAL,
            hr_status        INTEGER,
            sample_timestamp INTEGER,
            hr_level         TEXT,
            hr_severity      TEXT,
            created_at       TEXT DEFAULT (datetime('now','localtime'))
        )
    """)

    # Galaxy Watch — Temperature
    c.execute("""
        CREATE TABLE IF NOT EXISTS watch_temperature (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            client_ip           TEXT,
            received_at         TEXT,
            sensor_timestamp    INTEGER,
            wrist_temp          REAL,
            ambient_temp        REAL,
            estimated_core_temp REAL,
            heat_gradient       REAL,
            temp_status         TEXT,
            created_at          TEXT DEFAULT (datetime('now','localtime'))
        )
    """)

    # Galaxy Watch — Wear State
    c.execute("""
        CREATE TABLE IF NOT EXISTS watch_wear_state (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            client_ip        TEXT,
            received_at      TEXT,
            sensor_timestamp INTEGER,
            is_worn          INTEGER,
            state            TEXT,
            created_at       TEXT DEFAULT (datetime('now','localtime'))
        )
    """)

    conn.commit()
    _seed_demo_data(c, conn)
    conn.close()
    print(f"[DB] Database initialized: {DB_PATH}")


def _seed_demo_data(c, conn):
    if c.execute("SELECT COUNT(*) FROM elderly").fetchone()[0] > 0:
        return
    rows = [
        ("George Smith",   78, "Male",   "13800001111", "101 Sunrise Ave, Springfield", "WATCH-001", "Tom Smith",    "13900001111"),
        ("Mary Johnson",   82, "Female", "13800002222", "202 Maple St, Shelbyville",    "WATCH-002", "Jane Johnson", "13900002222"),
        ("Helen Williams", 75, "Female", "13800003333", "303 Oak Blvd, Capital City",   "WATCH-003", "Bill Williams","13900003333"),
        ("Robert Brown",   80, "Male",   "13800004444", "404 Pine Rd, Ogdenville",      "WATCH-004", "Lisa Brown",   "13900004444"),
        ("Dorothy Davis",  73, "Female", "13800005555", "505 Elm Dr, North Haverbrook", "WATCH-005", "Mark Davis",   "13900005555"),
    ]
    c.executemany(
        "INSERT INTO elderly (name,age,gender,phone,address,watch_id,emergency_contact,emergency_phone) VALUES (?,?,?,?,?,?,?,?)",
        rows
    )
    conn.commit()
    print("[DB] Demo residents inserted")


if __name__ == "__main__":
    init_db()
