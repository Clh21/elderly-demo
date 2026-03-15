import streamlit as st
import requests
import pandas as pd

API = "http://127.0.0.1:5000/api"
st.set_page_config(page_title="Resident List", page_icon="👴", layout="wide")

st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600;700&display=swap');
html,body,[class*="css"]{font-family:'IBM Plex Sans',sans-serif;}
.section-title{font-size:18px;font-weight:600;color:#e2e8f0;border-left:4px solid #63b3ed;padding-left:12px;margin:20px 0 12px;}
</style>
""", unsafe_allow_html=True)

st.title("👴 Resident List Management")

def fetch_elderly():
    try:
        return requests.get(f"{API}/elderly", timeout=5).json()
    except:
        st.error("Cannot connect to Flask API. Please start app.py first.")
        return []

st.markdown('<div class="section-title">Current Residents</div>', unsafe_allow_html=True)
eldr = fetch_elderly()

if eldr:
    STATUS_MAP = {"normal":"✅ Normal","warning":"⚠️ Warning","abnormal":"🚨 Abnormal"}
    df = pd.DataFrame(eldr)
    disp = df[["id","name","age","gender","phone","watch_id","emergency_contact","emergency_phone","status","last_seen"]].copy()
    disp.columns = ["ID","Name","Age","Gender","Phone","Watch ID","Emergency Contact","Emergency Phone","Status","Last Updated"]
    disp["Status"] = disp["Status"].map(lambda x: STATUS_MAP.get(x,x))
    st.dataframe(disp, use_container_width=True, height=300)
else:
    st.info("No resident data available.")

st.divider()
st.markdown('<div class="section-title">Add New Resident</div>', unsafe_allow_html=True)

with st.form("add_form"):
    a1,a2,a3 = st.columns(3)
    name     = a1.text_input("Name *")
    age      = a2.number_input("Age *", min_value=60, max_value=110, value=75)
    gender   = a3.selectbox("Gender *", ["Male","Female"])
    b1,b2,b3 = st.columns(3)
    phone    = b1.text_input("Phone")
    watch_id = b2.text_input("Galaxy Watch ID *", placeholder="WATCH-00X")
    address  = b3.text_input("Address")
    c1,c2 = st.columns(2)
    ec_name  = c1.text_input("Emergency Contact")
    ec_phone = c2.text_input("Emergency Phone")
    if st.form_submit_button("✅ Add Resident", use_container_width=True):
        if not name or not watch_id:
            st.error("Name and Watch ID are required.")
        else:
            r = requests.post(f"{API}/elderly", timeout=5, json=dict(
                name=name, age=int(age), gender=gender, phone=phone,
                watch_id=watch_id, address=address,
                emergency_contact=ec_name, emergency_phone=ec_phone))
            if r.status_code == 201:
                st.success(f"Resident '{name}' added successfully.")
                st.rerun()
            else:
                st.error(f"Failed to add: {r.text}")

st.divider()
st.markdown('<div class="section-title">Edit / Delete Resident</div>', unsafe_allow_html=True)

if eldr:
    options = {f"{e['id']} — {e['name']}": e for e in eldr}
    sel = options[st.selectbox("Select Resident", list(options.keys()))]
    tab_edit, tab_del = st.tabs(["✏️ Edit Info", "🗑️ Delete"])

    with tab_edit:
        with st.form("edit_form"):
            e1,e2,e3 = st.columns(3)
            en  = e1.text_input("Name",   value=sel["name"])
            ea  = e2.number_input("Age",  value=sel["age"], min_value=60, max_value=110)
            eg  = e3.selectbox("Gender",  ["Male","Female"],
                               index=0 if sel["gender"] == "Male" else 1)
            f1,f2 = st.columns(2)
            ep  = f1.text_input("Phone",   value=sel.get("phone","") or "")
            ead = f2.text_input("Address", value=sel.get("address","") or "")
            g1,g2 = st.columns(2)
            ecn = g1.text_input("Emergency Contact", value=sel.get("emergency_contact","") or "")
            ecp = g2.text_input("Emergency Phone",   value=sel.get("emergency_phone","") or "")
            if st.form_submit_button("💾 Save Changes", use_container_width=True):
                r = requests.put(f"{API}/elderly/{sel['id']}", timeout=5, json=dict(
                    name=en, age=int(ea), gender=eg, phone=ep,
                    address=ead, emergency_contact=ecn, emergency_phone=ecp))
                if r.ok:
                    st.success("Updated successfully."); st.rerun()
                else:
                    st.error(f"Update failed: {r.text}")

    with tab_del:
        st.warning(f"Delete resident **{sel['name']}** and all their data? This cannot be undone.")
        if st.button("🗑️ Confirm Delete", type="primary"):
            r = requests.delete(f"{API}/elderly/{sel['id']}", timeout=5)
            if r.ok:
                st.success("Deleted."); st.rerun()
            else:
                st.error(f"Delete failed: {r.text}")
