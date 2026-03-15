import streamlit as st
import requests
import pandas as pd
import plotly.graph_objects as go
from datetime import datetime

API = "http://127.0.0.1:5000/api"
st.set_page_config(page_title="Overview", page_icon="🏠", layout="wide")

st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600;700&display=swap');
html,body,[class*="css"]{font-family:'IBM Plex Sans',sans-serif;}
.metric-card{background:linear-gradient(135deg,#1a1f35,#0d1117);border:1px solid rgba(99,179,237,0.2);border-radius:12px;padding:20px 24px;text-align:center;margin-bottom:8px;}
.metric-label{color:#8892b0;font-size:13px;margin-bottom:6px;}
.metric-value{font-size:38px;font-weight:700;}
.c-info{color:#63b3ed;}.c-normal{color:#48bb78;}.c-warning{color:#f6ad55;}.c-abnormal{color:#fc8181;}
.section-title{font-size:18px;font-weight:600;color:#e2e8f0;border-left:4px solid #63b3ed;padding-left:12px;margin:20px 0 12px;}
</style>
""", unsafe_allow_html=True)

st.title("🏠 Elderly Care System — Overview")
st.caption(f"Data source: Samsung Galaxy Watch8 | Updated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

try:
    ov   = requests.get(f"{API}/overview", timeout=5).json()
    eldr = requests.get(f"{API}/elderly",  timeout=5).json()
except Exception as e:
    st.error(f"Cannot connect to Flask API. Please start app.py first. Error: {e}")
    st.stop()

st.markdown('<div class="section-title">Live Monitoring Overview</div>', unsafe_allow_html=True)
c1,c2,c3,c4,c5,c6 = st.columns(6)

def mcard(col, label, value, cls):
    col.markdown(
        f'<div class="metric-card"><div class="metric-label">{label}</div>'
        f'<div class="metric-value {cls}">{value}</div></div>',
        unsafe_allow_html=True)

mcard(c1, "Total Residents",    ov["total"],            "c-info")
mcard(c2, "Normal",             ov["normal"],           "c-normal")
mcard(c3, "Warning",            ov["warning"],          "c-warning")
mcard(c4, "Abnormal",           ov["abnormal"],         "c-abnormal")
mcard(c5, "Pending Alerts",     ov["unhandled_alerts"], "c-warning")
mcard(c6, "Critical Today",     ov["critical_alerts"],  "c-abnormal")

st.markdown('<div class="section-title">Resident Status Distribution</div>', unsafe_allow_html=True)
left, right = st.columns([1, 2])

with left:
    fig_pie = go.Figure(go.Pie(
        labels=["Normal","Warning","Abnormal"],
        values=[ov["normal"],ov["warning"],ov["abnormal"]],
        marker_colors=["#48bb78","#f6ad55","#fc8181"],
        hole=0.55, textfont_size=14
    ))
    fig_pie.update_layout(
        paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)",
        legend=dict(font=dict(color="#e2e8f0")),
        margin=dict(t=10,b=10,l=10,r=10), height=260
    )
    st.plotly_chart(fig_pie, use_container_width=True)
    st.markdown(
        f"<div style='text-align:center;color:#8892b0;margin-top:-20px;'>"
        f"Today's records: <b style='color:#63b3ed'>{ov['today_data_count']}</b>&nbsp;&nbsp;"
        f"Today's alerts: <b style='color:#f6ad55'>{ov['today_alerts']}</b></div>",
        unsafe_allow_html=True)

with right:
    st.markdown('<div class="section-title" style="margin-top:0">Resident Status Summary</div>', unsafe_allow_html=True)
    if eldr:
        df = pd.DataFrame(eldr)[["name","age","gender","last_hr","last_spo2","status","last_seen"]]
        df.columns = ["Name","Age","Gender","Latest HR (bpm)","Latest SpO2 (%)","Status","Last Updated"]
        STATUS_MAP = {"normal":"✅ Normal","warning":"⚠️ Warning","abnormal":"🚨 Abnormal"}
        df["Status"] = df["Status"].map(lambda x: STATUS_MAP.get(x,x))
        st.dataframe(df, use_container_width=True, height=240)

st.markdown('<div class="section-title">Latest Heart Rate Comparison</div>', unsafe_allow_html=True)
if eldr:
    names  = [e["name"] for e in eldr]
    hrs    = [e.get("last_hr") or 0 for e in eldr]
    colors = ["#fc8181" if (h>100 or h<55) else "#f6ad55" if h>90 else "#48bb78" for h in hrs]
    fig_bar = go.Figure(go.Bar(
        x=names, y=hrs, marker_color=colors,
        text=[f"{h} bpm" for h in hrs], textposition="outside"
    ))
    fig_bar.add_hline(y=100, line_dash="dot", line_color="#fc8181", annotation_text="High threshold")
    fig_bar.add_hline(y=60,  line_dash="dot", line_color="#f6ad55", annotation_text="Low threshold")
    fig_bar.update_layout(
        paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(13,17,23,0.8)",
        font=dict(color="#e2e8f0"),
        yaxis=dict(title="Heart Rate (bpm)", gridcolor="rgba(255,255,255,0.05)"),
        xaxis=dict(gridcolor="rgba(255,255,255,0.05)"),
        height=280, margin=dict(t=30,b=10)
    )
    st.plotly_chart(fig_bar, use_container_width=True)

st.markdown('<div class="section-title">Quick Actions</div>', unsafe_allow_html=True)
btn1, btn2, _ = st.columns([1,1,4])
with btn1:
    if st.button("🔄 Push Simulated Data", use_container_width=True):
        r = requests.post(f"{API}/simulate/push", timeout=10)
        st.success(r.json().get("message", "Done"))
        st.rerun()
with btn2:
    if st.button("🔃 Refresh", use_container_width=True):
        st.rerun()
