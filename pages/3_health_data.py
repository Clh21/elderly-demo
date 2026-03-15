import streamlit as st
import requests
import pandas as pd
import plotly.graph_objects as go
import plotly.express as px
from plotly.subplots import make_subplots

API = "http://127.0.0.1:5000/api"
st.set_page_config(page_title="Health Data", page_icon="📊", layout="wide")

st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600;700&display=swap');
html,body,[class*="css"]{font-family:'IBM Plex Sans',sans-serif;}
.section-title{font-size:18px;font-weight:600;color:#e2e8f0;border-left:4px solid #63b3ed;padding-left:12px;margin:20px 0 12px;}
.kpi-box{background:linear-gradient(135deg,#1a1f35,#0d1117);border:1px solid rgba(99,179,237,0.2);border-radius:10px;padding:14px 18px;text-align:center;}
.kpi-label{color:#8892b0;font-size:12px;} .kpi-val{font-size:26px;font-weight:700;color:#63b3ed;}
</style>
""", unsafe_allow_html=True)

st.title("📊 Health Data Visualization")

try:
    eldr = requests.get(f"{API}/elderly", timeout=5).json()
except:
    st.error("Cannot connect to Flask API. Please start app.py first.")
    st.stop()

if not eldr:
    st.info("No resident data available."); st.stop()

col_sel, col_hr = st.columns([2, 1])
sel_name = col_sel.selectbox("Select Resident", [f"{e['id']} — {e['name']}" for e in eldr])
hours = col_hr.select_slider("Time Range", options=[1,3,6,12,24,48], value=24,
                              format_func=lambda h: f"Last {h}h")
eid = int(sel_name.split(" — ")[0])

try:
    raw   = requests.get(f"{API}/health/{eid}", params={"hours": hours}, timeout=5).json()
    stats = requests.get(f"{API}/health/{eid}/stats", params={"hours": hours}, timeout=5).json()
except Exception as e:
    st.error(f"Failed to fetch data: {e}"); st.stop()

if not raw:
    st.warning("No data in this time range. Click 'Push Simulated Data' on the Overview page."); st.stop()

df = pd.DataFrame(raw)
df["recorded_at"] = pd.to_datetime(df["recorded_at"])
df = df.sort_values("recorded_at")

# KPI cards
st.markdown('<div class="section-title">Summary Statistics</div>', unsafe_allow_html=True)
k1,k2,k3,k4,k5,k6 = st.columns(6)

def kpi(col, label, val):
    col.markdown(
        f'<div class="kpi-box"><div class="kpi-label">{label}</div>'
        f'<div class="kpi-val">{val}</div></div>',
        unsafe_allow_html=True)

kpi(k1, "Avg Heart Rate", f"{stats.get('avg_hr','—')} bpm")
kpi(k2, "Max Heart Rate", f"{stats.get('max_hr','—')} bpm")
kpi(k3, "Avg SpO2",       f"{stats.get('avg_spo2','—')} %")
kpi(k4, "Avg Systolic",   f"{stats.get('avg_sbp','—')} mmHg")
kpi(k5, "Total Steps",    f"{stats.get('total_steps','—')}")
kpi(k6, "Fall Events",    f"{stats.get('fall_count','—')}")

# Heart Rate + SpO2
st.markdown('<div class="section-title">Heart Rate & SpO2 Trend</div>', unsafe_allow_html=True)
fig1 = make_subplots(specs=[[{"secondary_y": True}]])
fig1.add_trace(go.Scatter(
    x=df["recorded_at"], y=df["heart_rate"], name="Heart Rate (bpm)",
    line=dict(color="#fc8181", width=2), fill="tozeroy", fillcolor="rgba(252,129,129,0.08)"
), secondary_y=False)
fig1.add_trace(go.Scatter(
    x=df["recorded_at"], y=df["blood_oxygen"], name="SpO2 (%)",
    line=dict(color="#63b3ed", width=2, dash="dot")
), secondary_y=True)
fig1.add_hrect(y0=100, y1=180, fillcolor="rgba(252,129,129,0.08)",
               line_width=0, annotation_text="High HR Zone", secondary_y=False)
fig1.update_layout(
    paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(13,17,23,0.8)",
    font=dict(color="#e2e8f0"), height=320,
    legend=dict(orientation="h", y=1.12), margin=dict(t=30,b=10),
    xaxis=dict(gridcolor="rgba(255,255,255,0.05)"),
)
fig1.update_yaxes(title_text="Heart Rate (bpm)", gridcolor="rgba(255,255,255,0.05)", secondary_y=False)
fig1.update_yaxes(title_text="SpO2 (%)", gridcolor="rgba(255,255,255,0.05)", secondary_y=True)
st.plotly_chart(fig1, use_container_width=True)

# Blood Pressure
st.markdown('<div class="section-title">Blood Pressure Trend</div>', unsafe_allow_html=True)
fig2 = go.Figure()
fig2.add_trace(go.Scatter(x=df["recorded_at"], y=df["systolic"],
    name="Systolic", line=dict(color="#f6ad55", width=2)))
fig2.add_trace(go.Scatter(x=df["recorded_at"], y=df["diastolic"],
    name="Diastolic", line=dict(color="#68d391", width=2),
    fill="tonexty", fillcolor="rgba(104,211,145,0.06)"))
fig2.add_hline(y=140, line_dash="dot", line_color="#fc8181", annotation_text="High BP Threshold")
fig2.update_layout(
    paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(13,17,23,0.8)",
    font=dict(color="#e2e8f0"), height=280,
    yaxis=dict(title="Blood Pressure (mmHg)", gridcolor="rgba(255,255,255,0.05)"),
    xaxis=dict(gridcolor="rgba(255,255,255,0.05)"),
    legend=dict(orientation="h", y=1.12), margin=dict(t=30,b=10),
)
st.plotly_chart(fig2, use_container_width=True)

# Steps & Calories
st.markdown('<div class="section-title">Steps & Calories</div>', unsafe_allow_html=True)
cs, cc = st.columns(2)
with cs:
    fig3 = px.bar(df, x="recorded_at", y="steps", color_discrete_sequence=["#63b3ed"])
    fig3.update_layout(paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(13,17,23,0.8)",
        font=dict(color="#e2e8f0"), height=240, yaxis_title="Steps", xaxis_title="",
        margin=dict(t=10,b=10), xaxis=dict(gridcolor="rgba(255,255,255,0.05)"),
        yaxis=dict(gridcolor="rgba(255,255,255,0.05)"))
    st.plotly_chart(fig3, use_container_width=True)
with cc:
    fig4 = px.area(df, x="recorded_at", y="calories", color_discrete_sequence=["#f6ad55"])
    fig4.update_layout(paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(13,17,23,0.8)",
        font=dict(color="#e2e8f0"), height=240, yaxis_title="Calories (kcal)", xaxis_title="",
        margin=dict(t=10,b=10), xaxis=dict(gridcolor="rgba(255,255,255,0.05)"),
        yaxis=dict(gridcolor="rgba(255,255,255,0.05)"))
    st.plotly_chart(fig4, use_container_width=True)

# Activity distribution
st.markdown('<div class="section-title">Activity Distribution</div>', unsafe_allow_html=True)
act = df["activity"].value_counts().reset_index()
act.columns = ["Activity", "Count"]
fig5 = px.bar(act, x="Activity", y="Count", color="Activity",
              color_discrete_sequence=px.colors.qualitative.Pastel)
fig5.update_layout(paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(13,17,23,0.8)",
    font=dict(color="#e2e8f0"), height=260, showlegend=False, margin=dict(t=10,b=10),
    xaxis=dict(gridcolor="rgba(255,255,255,0.05)"),
    yaxis=dict(gridcolor="rgba(255,255,255,0.05)"))
st.plotly_chart(fig5, use_container_width=True)

# Fall events
fall_df = df[df["fall_detected"] == 1]
if not fall_df.empty:
    st.markdown('<div class="section-title">🚨 Fall Events</div>', unsafe_allow_html=True)
    st.error(f"{len(fall_df)} fall event(s) detected!")
    st.dataframe(fall_df[["recorded_at","location_name","activity"]].rename(
        columns={"recorded_at":"Time","location_name":"Location","activity":"Activity"}),
        use_container_width=True)

with st.expander("📋 Raw Data"):
    st.dataframe(df[["recorded_at","heart_rate","blood_oxygen","systolic","diastolic",
                      "steps","calories","location_name","fall_detected","activity"]].rename(
        columns={"recorded_at":"Time","heart_rate":"HR","blood_oxygen":"SpO2",
                 "systolic":"Systolic","diastolic":"Diastolic","steps":"Steps",
                 "calories":"Calories","location_name":"Location",
                 "fall_detected":"Fall","activity":"Activity"}),
        use_container_width=True)
