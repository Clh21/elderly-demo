import streamlit as st
import requests
import pandas as pd
import plotly.graph_objects as go
import plotly.express as px
from datetime import datetime

API = "http://127.0.0.1:5000"
st.set_page_config(page_title="Galaxy Watch Live", page_icon="⌚", layout="wide")

st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600;700&display=swap');
html,body,[class*="css"]{font-family:'IBM Plex Sans',sans-serif;}
.section-title{font-size:18px;font-weight:600;color:#e2e8f0;border-left:4px solid #a78bfa;padding-left:12px;margin:20px 0 12px;}
.kpi-box{background:linear-gradient(135deg,#1e1b4b,#0d1117);border:1px solid rgba(167,139,250,0.25);border-radius:10px;padding:14px 18px;text-align:center;}
.kpi-label{color:#8892b0;font-size:12px;} .kpi-val{font-size:24px;font-weight:700;color:#a78bfa;}
</style>
""", unsafe_allow_html=True)

st.title("⌚ Galaxy Watch8 — Live Sensor Dashboard")
st.caption(f"Real data from Galaxy Watch receiver | {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

def fetch(endpoint, limit=200):
    try:
        r = requests.get(f"{API}{endpoint}", params={"limit": limit}, timeout=5)
        return r.json()
    except Exception as e:
        return []

limit    = st.sidebar.slider("Records to show", 20, 500, 100, 10)
hr_data  = fetch("/watch/heart_rate",  limit)
eda_data = fetch("/watch/eda",          limit)
tmp_data = fetch("/watch/temperature", limit)
wear_raw = fetch("/watch/wear_state",   1)

# Wear state
wear = wear_raw if isinstance(wear_raw, dict) else (wear_raw[0] if wear_raw else {})
if wear.get("state") == "WORN":
    st.success("⌚ Watch is currently **WORN** — receiving live data")
elif wear.get("state") == "UNWORN":
    st.warning("⌚ Watch is currently **NOT WORN**")
else:
    st.info("⌚ Wear state unknown — awaiting first data packet")

st.divider()

# ── Heart Rate ────────────────────────────────────────────────────────────────
st.markdown('<div class="section-title">❤️ Heart Rate</div>', unsafe_allow_html=True)

if hr_data:
    df_hr = pd.DataFrame(hr_data).sort_values("id")
    df_hr["received_at"] = pd.to_datetime(df_hr["received_at"])
    latest_bpm = df_hr["bpm"].iloc[-1]
    avg_bpm    = round(df_hr["bpm"].mean(), 1)

    h1,h2,h3,h4 = st.columns(4)
    for col,label,val in [
        (h1,"Latest BPM",   f"{latest_bpm} bpm"),
        (h2,"Average BPM",  f"{avg_bpm} bpm"),
        (h3,"Max BPM",      f"{df_hr['bpm'].max()} bpm"),
        (h4,"Min BPM",      f"{df_hr['bpm'].min()} bpm"),
    ]:
        col.markdown(f'<div class="kpi-box"><div class="kpi-label">{label}</div><div class="kpi-val">{val}</div></div>',
                     unsafe_allow_html=True)

    SEV = {"normal":"#48bb78","warning":"#f6ad55","critical":"#fc8181"}
    colors = [SEV.get(s,"#63b3ed") for s in df_hr["hr_severity"].fillna("normal")]
    fig_hr = go.Figure()
    fig_hr.add_trace(go.Scatter(
        x=df_hr["received_at"], y=df_hr["bpm"],
        mode="lines+markers",
        line=dict(color="#a78bfa", width=2),
        marker=dict(color=colors, size=8), name="HR"
    ))
    fig_hr.add_hline(y=100, line_dash="dot", line_color="#fc8181", annotation_text="High")
    fig_hr.add_hline(y=50,  line_dash="dot", line_color="#f6ad55", annotation_text="Low")
    fig_hr.update_layout(
        paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(13,17,23,0.8)",
        font=dict(color="#e2e8f0"), height=300, showlegend=False,
        yaxis=dict(title="BPM", gridcolor="rgba(255,255,255,0.05)"),
        xaxis=dict(gridcolor="rgba(255,255,255,0.05)"),
        margin=dict(t=20,b=10)
    )
    st.plotly_chart(fig_hr, use_container_width=True)
    with st.expander("HR Classification Detail"):
        st.dataframe(df_hr[["received_at","bpm","hr_level","hr_severity"]].rename(
            columns={"received_at":"Time","bpm":"BPM","hr_level":"Level","hr_severity":"Severity"}),
            use_container_width=True)
else:
    st.info("No heart rate data yet — send packets to POST /watch/data")

st.divider()

# ── EDA Stress Analysis ───────────────────────────────────────────────────────
st.markdown('<div class="section-title">🧠 EDA — Stress & Arousal Analysis</div>', unsafe_allow_html=True)

STRESS_CLR = {"Relaxed":"#48bb78","Calm":"#68d391",
               "Moderate":"#f6ad55","Stressed":"#fc8181","High Stress":"#e53e3e"}

if eda_data:
    df_eda = pd.DataFrame(eda_data).sort_values("id")
    df_eda["received_at"] = pd.to_datetime(df_eda["received_at"])
    latest_stress = df_eda["stress_level"].iloc[-1]
    latest_score  = df_eda["stress_score"].iloc[-1]

    e1,e2,e3,e4 = st.columns(4)
    for col,label,val in [
        (e1,"Current Stress Level", latest_stress),
        (e2,"Current Score",        f"{latest_score}/100"),
        (e3,"Avg Conductance",      f"{round(df_eda['skin_conductance'].mean(),4)} µS"),
        (e4,"Avg Stress Score",     f"{round(df_eda['stress_score'].mean(),1)}/100"),
    ]:
        col.markdown(f'<div class="kpi-box"><div class="kpi-label">{label}</div><div class="kpi-val">{val}</div></div>',
                     unsafe_allow_html=True)

    cl, cr = st.columns([2, 1])
    with cl:
        fig_sc = go.Figure(go.Scatter(
            x=df_eda["received_at"], y=df_eda["skin_conductance"],
            fill="tozeroy", fillcolor="rgba(167,139,250,0.1)",
            line=dict(color="#a78bfa", width=2)
        ))
        fig_sc.update_layout(
            paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(13,17,23,0.8)",
            font=dict(color="#e2e8f0"), height=240, showlegend=False,
            yaxis=dict(title="Skin Conductance (µS)", gridcolor="rgba(255,255,255,0.05)"),
            xaxis=dict(gridcolor="rgba(255,255,255,0.05)"),
            margin=dict(t=10,b=10)
        )
        st.plotly_chart(fig_sc, use_container_width=True)

        sc_colors = [STRESS_CLR.get(l,"#a78bfa") for l in df_eda["stress_level"].fillna("Calm")]
        fig_ss = go.Figure(go.Bar(
            x=df_eda["received_at"], y=df_eda["stress_score"], marker_color=sc_colors
        ))
        fig_ss.add_hline(y=60, line_dash="dot", line_color="#f6ad55", annotation_text="Moderate")
        fig_ss.add_hline(y=80, line_dash="dot", line_color="#fc8181", annotation_text="Stressed")
        fig_ss.update_layout(
            paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(13,17,23,0.8)",
            font=dict(color="#e2e8f0"), height=220, showlegend=False,
            yaxis=dict(title="Stress Score", gridcolor="rgba(255,255,255,0.05)", range=[0,105]),
            xaxis=dict(gridcolor="rgba(255,255,255,0.05)"),
            margin=dict(t=10,b=10)
        )
        st.plotly_chart(fig_ss, use_container_width=True)

    with cr:
        lvc = df_eda["stress_level"].value_counts()
        fig_pie = go.Figure(go.Pie(
            labels=lvc.index.tolist(), values=lvc.values.tolist(),
            marker_colors=[STRESS_CLR.get(l,"#a78bfa") for l in lvc.index],
            hole=0.5, textfont_size=12
        ))
        fig_pie.update_layout(
            paper_bgcolor="rgba(0,0,0,0)",
            legend=dict(font=dict(color="#e2e8f0", size=11)),
            margin=dict(t=20,b=10,l=10,r=10), height=300
        )
        st.plotly_chart(fig_pie, use_container_width=True)
        lbl = df_eda["label"].value_counts().reset_index()
        lbl.columns = ["EDA Label","Count"]
        st.dataframe(lbl, use_container_width=True, hide_index=True)
else:
    st.info("No EDA data yet — send packets to POST /watch/data")

st.divider()

# ── Temperature ───────────────────────────────────────────────────────────────
st.markdown('<div class="section-title">🌡️ Temperature — Core Body Estimation</div>', unsafe_allow_html=True)

if tmp_data:
    df_tmp = pd.DataFrame(tmp_data).sort_values("id")
    df_tmp["received_at"] = pd.to_datetime(df_tmp["received_at"])
    lc = df_tmp["estimated_core_temp"].iloc[-1]
    lw = df_tmp["wrist_temp"].iloc[-1]
    la = df_tmp["ambient_temp"].iloc[-1]
    ls = df_tmp["temp_status"].iloc[-1]

    t1,t2,t3,t4 = st.columns(4)
    for col,label,val in [
        (t1,"Est. Core Temp",  f"{lc} °C"),
        (t2,"Wrist Skin Temp", f"{lw} °C"),
        (t3,"Ambient Temp",    f"{la} °C"),
        (t4,"Status",          ls),
    ]:
        col.markdown(f'<div class="kpi-box"><div class="kpi-label">{label}</div><div class="kpi-val">{val}</div></div>',
                     unsafe_allow_html=True)

    if ls in ("Fever","High Fever"):
        st.error(f"🌡️ {ls} detected — Core temp {lc} °C")
    elif ls == "Hypothermia Risk":
        st.warning(f"❄️ Hypothermia Risk — Core temp {lc} °C")

    fig_tmp = go.Figure()
    fig_tmp.add_trace(go.Scatter(x=df_tmp["received_at"], y=df_tmp["estimated_core_temp"],
        name="Est. Core", line=dict(color="#fc8181", width=3)))
    fig_tmp.add_trace(go.Scatter(x=df_tmp["received_at"], y=df_tmp["wrist_temp"],
        name="Wrist", line=dict(color="#f6ad55", width=2, dash="dot")))
    fig_tmp.add_trace(go.Scatter(x=df_tmp["received_at"], y=df_tmp["ambient_temp"],
        name="Ambient", line=dict(color="#63b3ed", width=2, dash="dash")))
    fig_tmp.add_hrect(y0=37.5, y1=42, fillcolor="rgba(252,129,129,0.07)",
                      line_width=0, annotation_text="Fever Zone")
    fig_tmp.add_hrect(y0=30, y1=35, fillcolor="rgba(99,179,237,0.07)",
                      line_width=0, annotation_text="Hypothermia Risk")
    fig_tmp.update_layout(
        paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(13,17,23,0.8)",
        font=dict(color="#e2e8f0"), height=340,
        yaxis=dict(title="Temperature (°C)", gridcolor="rgba(255,255,255,0.05)"),
        xaxis=dict(gridcolor="rgba(255,255,255,0.05)"),
        legend=dict(orientation="h", y=1.12),
        margin=dict(t=30,b=10)
    )
    st.plotly_chart(fig_tmp, use_container_width=True)

    with st.expander("Algorithm: Core Temperature Estimation"):
        st.markdown("""
**Formula (Buller et al. 2013 / ISO 9886 adaptation):**
```
core_temp = wrist_temp + 4.5 + 0.15 × (wrist_temp − ambient_temp)
```
- **Base offset (4.5 °C):** wrist skin is typically 4-5 °C below core
- **Ambient correction (0.15):** adjusts for heat loss gradient to environment
- **Normal range:** 36.1 – 37.2 °C
- **Fever threshold:** ≥ 37.5 °C
- **Hypothermia risk:** ≤ 35.0 °C
        """)
else:
    st.info("No temperature data yet — send packets to POST /watch/data")

st.divider()
st.caption("Send your Galaxy Watch data to: POST http://127.0.0.1:5000/watch/data")

if st.button("🔃 Refresh"):
    st.rerun()
