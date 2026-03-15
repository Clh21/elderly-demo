import streamlit as st

st.set_page_config(
    page_title="Elderly Care Monitor",
    page_icon="🏥",
    layout="wide",
    initial_sidebar_state="expanded",
)

st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600;700&display=swap');
html, body, [class*="css"] { font-family: 'IBM Plex Sans', sans-serif; }
[data-testid="stSidebar"] {
    background: linear-gradient(180deg, #0d1117 0%, #1a1f35 100%);
    border-right: 1px solid rgba(99,179,237,0.15);
}
.main-hero {
    background: linear-gradient(135deg, #0d1117 0%, #1a1f35 50%, #0d1117 100%);
    border: 1px solid rgba(99,179,237,0.2);
    border-radius: 16px; padding: 48px 40px;
    text-align: center; margin-bottom: 32px;
}
.hero-title { font-size:42px; font-weight:700; color:#e2e8f0; margin-bottom:8px; }
.hero-sub   { font-size:16px; color:#8892b0; margin-bottom:24px; }
.hero-tag {
    display:inline-block; background:rgba(99,179,237,0.15); color:#63b3ed;
    border:1px solid rgba(99,179,237,0.3);
    border-radius:20px; padding:4px 16px; font-size:13px; margin:4px;
}
.nav-card {
    background:linear-gradient(135deg,#1a1f35,#0d1117);
    border:1px solid rgba(99,179,237,0.15);
    border-radius:12px; padding:24px; text-align:center; margin-bottom:8px;
}
.nav-icon  { font-size:36px; margin-bottom:8px; }
.nav-title { font-size:16px; font-weight:600; color:#e2e8f0; margin-bottom:4px; }
.nav-desc  { font-size:13px; color:#8892b0; }
</style>
""", unsafe_allow_html=True)

st.markdown("""
<div class="main-hero">
    <div class="hero-title">🏥 Elderly Care Management System</div>
    <div class="hero-sub">Real-time Health Monitoring &middot; Powered by Samsung Galaxy Watch8</div>
    <span class="hero-tag">Flask REST API</span>
    <span class="hero-tag">SQLite Database</span>
    <span class="hero-tag">Streamlit Dashboard</span>
    <span class="hero-tag">Galaxy Watch8</span>
    <span class="hero-tag">Real-time Alerts</span>
</div>
""", unsafe_allow_html=True)

c1, c2, c3, c4 = st.columns(4)
for col, icon, title, desc in [
    (c1, "🏠", "Overview",        "Live resident health status, alert statistics and status distribution"),
    (c2, "👴", "Resident List",    "Add, edit and delete residents; bind Galaxy Watch device IDs"),
    (c3, "📊", "Health Data",      "Heart rate, SpO2, blood pressure trends, steps and fall event analysis"),
    (c4, "🚨", "Alert Management", "View and handle heart rate, SpO2, blood pressure and fall detection alerts"),
]:
    col.markdown(f"""
    <div class="nav-card">
        <div class="nav-icon">{icon}</div>
        <div class="nav-title">{title}</div>
        <div class="nav-desc">{desc}</div>
    </div>
    """, unsafe_allow_html=True)

st.info("👈 Select a page from the left sidebar to get started")
st.divider()
st.caption("Data source: Samsung Galaxy Watch8  |  Backend: Flask port 5000  |  Run start.py to launch all services")
