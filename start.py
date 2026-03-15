# start.py — One-click launch script
import subprocess
import sys
import os
import time

BASE = os.path.dirname(os.path.abspath(__file__))


def init_database():
    sys.path.insert(0, BASE)
    from models import init_db
    init_db()


def run_flask():
    print("[Start] Launching Flask API => http://127.0.0.1:5000")
    return subprocess.Popen(
        [sys.executable, os.path.join(BASE, "app.py")],
        cwd=BASE
    )


def run_simulator():
    print("[Start] Launching Galaxy Watch8 data simulator...")
    return subprocess.Popen(
        [sys.executable, os.path.join(BASE, "simulator.py")],
        cwd=BASE
    )


def run_streamlit():
    print("[Start] Launching Streamlit Dashboard => http://localhost:8501")
    return subprocess.Popen(
        [
            sys.executable, "-m", "streamlit", "run",
            os.path.join(BASE, "dashboard.py"),
            "--server.port", "8501",
            "--server.headless", "true",
            "--theme.base", "dark",
            "--theme.primaryColor", "#63b3ed",
            "--theme.backgroundColor", "#0d1117",
            "--theme.secondaryBackgroundColor", "#1a1f35",
            "--theme.textColor", "#e2e8f0",
        ],
        cwd=BASE
    )


if __name__ == "__main__":
    print("=" * 52)
    print("   Elderly Care System — One-click Launch")
    print("=" * 52)

    print("[1/4] Initializing database...")
    init_database()

    print("[2/4] Starting Flask backend...")
    run_flask()
    time.sleep(3)

    print("[3/4] Starting data simulator...")
    run_simulator()
    time.sleep(1)

    print("[4/4] Starting Streamlit Dashboard...")
    run_streamlit()

    print()
    print("=" * 52)
    print("  Flask  API  : http://127.0.0.1:5000")
    print("  Dashboard   : http://localhost:8501")
    print("=" * 52)
    print("Open http://localhost:8501 in your browser.")
    print("Press Ctrl+C to stop this script.")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n[Stop] Exited.")
