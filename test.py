# test.py — manual API smoke tests
import requests

BASE = "http://127.0.0.1:5000"


def test_overview():
    r = requests.get(f"{BASE}/api/overview", timeout=5)
    assert r.status_code == 200
    data = r.json()
    print("[overview]", data)
    assert "total" in data


def test_list_elderly():
    r = requests.get(f"{BASE}/api/elderly", timeout=5)
    assert r.status_code == 200
    residents = r.json()
    print(f"[elderly] {len(residents)} residents found")
    return residents


def test_health_data(eid=1):
    r = requests.get(f"{BASE}/api/health/{eid}", params={"hours": 24}, timeout=5)
    assert r.status_code == 200
    records = r.json()
    print(f"[health/{eid}] {len(records)} records")


def test_health_stats(eid=1):
    r = requests.get(f"{BASE}/api/health/{eid}/stats", params={"hours": 24}, timeout=5)
    assert r.status_code == 200
    print(f"[stats/{eid}]", r.json())


def test_alerts():
    r = requests.get(f"{BASE}/api/alerts", params={"limit": 10}, timeout=5)
    assert r.status_code == 200
    alerts = r.json()
    print(f"[alerts] {len(alerts)} alerts found")


def test_simulate_push():
    r = requests.post(f"{BASE}/api/simulate/push", timeout=10)
    assert r.status_code == 200
    print("[simulate]", r.json())


def test_watch_endpoints():
    for ep in ("/watch/heart_rate", "/watch/eda", "/watch/temperature", "/watch/wear_state"):
        r = requests.get(f"{BASE}{ep}", timeout=5)
        print(f"[{ep}] status={r.status_code}")


if __name__ == "__main__":
    print("=" * 40)
    print("Elderly Care System — API Smoke Tests")
    print("=" * 40)
    test_overview()
    residents = test_list_elderly()
    if residents:
        eid = residents[0]["id"]
        test_health_data(eid)
        test_health_stats(eid)
    test_alerts()
    test_simulate_push()
    test_watch_endpoints()
    print("=" * 40)
    print("All tests passed.")
