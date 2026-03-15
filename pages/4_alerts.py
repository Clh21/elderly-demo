import streamlit as st
import requests
import pandas as pd

API = "http://127.0.0.1:5000/api"
st.set_page_config(page_title="Alert Management", page_icon="🚨", layout="wide")

st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600;700&display=swap');
html,body,[class*="css"]{font-family:'IBM Plex Sans',sans-serif;}
.section-title{font-size:18px;font-weight:600;color:#e2e8f0;border-left:4px solid #fc8181;padding-left:12px;margin:20px 0 12px;}
.alert-critical{background:rgba(252,129,129,0.12);border-left:4px solid #fc8181;padding:12px 16px;border-radius:8px;margin-bottom:8px;}
.alert-warning{background:rgba(246,173,85,0.12);border-left:4px solid #f6ad55;padding:12px 16px;border-radius:8px;margin-bottom:8px;}
.badge{display:inline-block;padding:2px 10px;border-radius:20px;font-size:12px;font-weight:600;}
.badge-critical{background:#742a2a;color:#fc8181;} .badge-warning{background:#744210;color:#f6ad55;}
</style>
""", unsafe_allow_html=True)

st.title("🚨 Alert Management")

cf1, cf2, cf3 = st.columns(3)
severity_opt = cf1.selectbox("Severity", ["All", "critical", "warning"])
status_opt   = cf2.selectbox("Status",   ["All", "Pending", "Handled"])
limit        = cf3.slider("Max Records", 20, 200, 50, 10)

params = {"limit": limit}
if severity_opt != "All":     params["severity"]  = severity_opt
if status_opt == "Pending":   params["is_handled"] = 0
elif status_opt == "Handled": params["is_handled"] = 1

try:
    alerts = requests.get(f"{API}/alerts", params=params, timeout=5).json()
except Exception as e:
    st.error(f"Cannot connect to Flask API: {e}")
    st.stop()

unhandled = [a for a in alerts if not a["is_handled"]]
handled   = [a for a in alerts if a["is_handled"]]

s1, s2, s3 = st.columns(3)
s1.metric("Total Alerts", len(alerts))
s2.metric("Pending", len(unhandled),
          delta=f"+{len(unhandled)}" if unhandled else None, delta_color="inverse")
s3.metric("Handled", len(handled))

st.divider()
st.markdown('<div class="section-title">Pending Alerts</div>', unsafe_allow_html=True)

if not unhandled:
    st.success("No pending alerts.")
else:
    for a in unhandled:
        sc  = "alert-critical" if a["severity"] == "critical" else "alert-warning"
        bc  = "badge-critical"  if a["severity"] == "critical" else "badge-warning"
        lbl = "CRITICAL" if a["severity"] == "critical" else "WARNING"
        st.markdown(f"""
        <div class="{sc}">
            <span class="badge {bc}">{lbl}</span>&nbsp;
            <b>{a['elderly_name']}</b>&nbsp;
            <span style="color:#8892b0;font-size:13px">{a['alert_type']} · {a['created_at']}</span><br/>
            <span style="color:#e2e8f0;margin-top:4px;display:block">{a['message']}</span>
        </div>""", unsafe_allow_html=True)
        with st.expander(f"Handle Alert #{a['id']} — {a['elderly_name']}"):
            with st.form(f"handle_{a['id']}"):
                handler = st.text_input("Handler", value="Admin")
                note    = st.text_area("Notes", placeholder="Describe the action taken...")
                if st.form_submit_button("✅ Mark as Handled", use_container_width=True):
                    r = requests.put(
                        f"{API}/alerts/{a['id']}/handle",
                        json={"handler": handler, "note": note},
                        timeout=5
                    )
                    if r.ok:
                        st.success("Alert handled."); st.rerun()
                    else:
                        st.error("Failed to handle alert.")

st.divider()
st.markdown('<div class="section-title">Handled Alert History</div>', unsafe_allow_html=True)
if not handled:
    st.info("No handled alerts yet.")
else:
    df_h = pd.DataFrame(handled)[[
        "id", "elderly_name", "alert_type", "severity",
        "message", "handler", "handle_note", "created_at", "handled_at"
    ]]
    df_h.columns = ["ID", "Resident", "Type", "Severity",
                    "Message", "Handler", "Notes", "Alert Time", "Handled Time"]
    df_h["Severity"] = df_h["Severity"].map({"critical": "Critical", "warning": "Warning"})
    st.dataframe(df_h, use_container_width=True)
