import { useState, useEffect, useCallback, useRef } from "react";

// ── DESIGN TOKENS ──────────────────────────────────────────────────────────
const C = {
  navy:      "#0d2137",
  navyMid:   "#1a3a5c",
  navyLight: "#234d7a",
  teal:      "#2e7d8c",
  tealLight: "#3a9aad",
  slate:     "#4a6580",
  bg:        "#f2f5f8",
  bgCard:    "#ffffff",
  border:    "#dde3ea",
  text:      "#0d1f2d",
  textMid:   "#4a6580",
  textLight: "#7a92a8",
  white:     "#ffffff",
  success:   "#2e7d5a",
  danger:    "#8b2635",
  warning:   "#8b6914",
};

const LEVEL_CONFIG = {
  A: { color: "#8b2635", bg: "#f9f2f3", label: "Level A", desc: "Non-stand / Bed / Wheelchair" },
  B: { color: "#8b6914", bg: "#f9f6ee", label: "Level B", desc: "Seated + Brief Supported Standing" },
  C: { color: "#234d7a", bg: "#f0f4f9", label: "Level C", desc: "Seated + Standing w/ Device" },
  D: { color: "#2e7d5a", bg: "#f0f6f3", label: "Level D", desc: "Higher Function / Circuit" },
};

const EXERCISE_BANK = {
  A: {
    upper: ["Postural alignment & scapular retraction","Shoulder flexion (assisted to active)","Elbow flexion & extension","Hand opening/closing & wrist ROM","Breathing w/ chest opening","Supported seated press-downs"],
    lower: ["Ankle pumps & circles","Seated marching","Seated knee extension","Hip adduction/abduction (isometric)","Seated heel raises & toe raises","Gentle seated weight shifts"],
  },
  B: {
    upper: ["Seated band row","Seated band chest press","Shoulder flexion w/ light load","Biceps curls & triceps extension","Supported standing upper-extremity task","Seated transfer-prep press drill"],
    lower: ["Seated marching (progressed)","Seated knee extension w/ light load","Seated hip abduction w/ band","Seated heel raises & toe raises","Supported sit-to-stand practice","Supported standing weight shifts"],
  },
  C: {
    upper: ["Band row (seated or standing)","Chest press (seated or supported standing)","Shoulder flexion/abduction w/ dumbbells","Biceps & triceps circuit","Functional carry or hold"],
    lower: ["Sit-to-stand","Standing marching","Standing heel raises","Mini-squats / supported partial squat","Step-tap or low step-up","Walking intervals"],
  },
  D: {
    upper: ["Standing row & chest press","Overhead / near-overhead press","Functional carry & reach","Upper-extremity endurance circuit"],
    lower: ["Sit-to-stand (performance focus)","Step-up or progressed step-tap","Dynamic standing balance","Walking circuit","Standing heel raises & mini-lunges / step-backs"],
  },
};

const METRICS = [
  { key: "restingHR",      label: "Resting HR (bpm)",         type: "number" },
  { key: "exerciseHR",     label: "Exercise HR (bpm)",        type: "number" },
  { key: "bpPre",          label: "BP Pre-Exercise",          type: "text",   placeholder: "e.g. 120/80" },
  { key: "bpPost",         label: "BP Post-Exercise",         type: "text",   placeholder: "e.g. 118/76" },
  { key: "spo2",           label: "SpO₂ (%)",                 type: "number" },
  { key: "rpe",            label: "RPE (6–20)",               type: "number" },
  { key: "painPre",        label: "Pain Pre (0–10)",          type: "number" },
  { key: "painPost",       label: "Pain Post (0–10)",         type: "number" },
  { key: "sitToStand",     label: "Sit-to-Stand (30s reps)",  type: "number" },
  { key: "gaitDistance",   label: "Gait Distance",            type: "text",   placeholder: "e.g. 50 ft" },
  { key: "gripStrength",   label: "Grip Strength (kg)",       type: "number" },
  { key: "bergBalance",    label: "Berg Balance (0–56)",      type: "number" },
  { key: "sittingTol",     label: "Sitting Tolerance (min)",  type: "number" },
  { key: "sessionDur",     label: "Session Duration (min)",   type: "number" },
  { key: "mood",           label: "Patient Mood (1–5)",       type: "number" },
  { key: "participation",  label: "Participation",            type: "select", options: ["Full","Partial","Refused","N/A"] },
  { key: "fallHistory",    label: "Falls Since Admission",    type: "number" },
];

const ROLES = { ADMIN: "admin", SUPERVISOR: "supervisor", EP: "ep" };

const DEFAULT_USERS = [
  { id:"u1", username:"admin",      password:"admin123",  role:ROLES.ADMIN,      name:"Administrator",        siteId:"s1", active:true },
  { id:"u2", username:"supervisor", password:"super123",  role:ROLES.SUPERVISOR, name:"Supervisor",           siteId:"s1", active:true },
  { id:"u3", username:"ep",         password:"ep123",     role:ROLES.EP,         name:"Exercise Physiologist",siteId:"s1", active:true },
];
const DEFAULT_SITES = [{ id:"s1", name:"Hackensack", address:"Hackensack, NJ" }];
const INACTIVITY_MS = 10 * 60 * 1000;
const WARN_MS       =  9 * 60 * 1000;

// ── STORAGE ────────────────────────────────────────────────────────────────
async function load(key) { try { const r = await window.storage.get(key); return r ? JSON.parse(r.value) : null; } catch { return null; } }
async function save(key, val) { try { await window.storage.set(key, JSON.stringify(val)); } catch {} }

async function audit(user, action, detail="") {
  const entry = { id: Date.now().toString(), ts: new Date().toISOString(), userId: user?.id, username: user?.username, role: user?.role, siteId: user?.siteId, action, detail };
  const existing = await load("kin_audit") || [];
  await save("kin_audit", [entry, ...existing].slice(0, 500));
}

// ── PRINT REPORT ───────────────────────────────────────────────────────────
function printReport(patient, sessions, user, sites) {
  const sorted = [...sessions].sort((a,b) => a.date.localeCompare(b.date));
  const lc = LEVEL_CONFIG[patient.level];
  const site = sites.find(s => s.id === patient.siteId);
  const levelColors = { A:"#8b2635", B:"#8b6914", C:"#234d7a", D:"#2e7d5a" };
  const levelHistory = sorted.reduce((acc,s) => {
    if (!acc.length || acc[acc.length-1].level !== s.level) acc.push({ date:s.date, level:s.level });
    return acc;
  }, []);

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Kinesis — ${patient.name}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#0d1f2d;background:#fff;padding:28px}
.wm{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-35deg);font-size:80px;color:rgba(0,0,0,0.03);font-weight:900;pointer-events:none;z-index:0;white-space:nowrap}
.ct{position:relative;z-index:1}
.conf{background:#0d2137;color:#fff;text-align:center;padding:5px;font-size:9px;font-weight:700;letter-spacing:2px;margin-bottom:16px}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:12px;border-bottom:2px solid #0d2137;margin-bottom:14px}
.brand{font-size:20px;font-weight:800;color:#0d2137;letter-spacing:-0.5px}
.brand span{color:#2e7d8c}
.stitle{font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#4a6580;border-bottom:1px solid #dde3ea;padding-bottom:4px;margin:12px 0 8px}
.igrid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px;margin-bottom:10px}
.iitem label{display:block;font-size:7px;font-weight:700;text-transform:uppercase;color:#7a92a8;margin-bottom:1px}
.iitem span{font-size:11px;color:#0d2137;font-weight:600}
.lbadge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:4px;font-weight:600;font-size:10px;color:#0d1f2d;background:#f2f5f8;border:1px solid #dde3ea}.ldot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.dbox{background:#f2f5f8;border-left:3px solid #0d2137;padding:7px 10px;border-radius:0 4px 4px 0;font-size:10px;margin-bottom:8px}
table{width:100%;border-collapse:collapse;font-size:10px;margin-bottom:10px}
th{background:#0d2137;color:#fff;padding:5px 7px;text-align:left;font-size:8px;text-transform:uppercase;letter-spacing:.5px}
td{padding:5px 7px;border-bottom:1px solid #f0f3f6;vertical-align:top}
tr:nth-child(even) td{background:#f8f9fb}
.sblock{border:1px solid #dde3ea;border-radius:5px;margin-bottom:8px;page-break-inside:avoid}
.shdr{background:#f2f5f8;padding:6px 10px;display:flex;justify-content:space-between;border-bottom:1px solid #dde3ea}
.sbody{padding:8px 10px}
.mgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-bottom:7px}
.mchip{background:#f2f5f8;border-radius:3px;padding:4px 6px}
.mchip .mk{font-size:7px;color:#7a92a8;text-transform:uppercase}
.mchip .mv{font-size:11px;font-weight:700;color:#0d2137}
.nbox{background:#fdfbf5;border-left:2px solid #8b6914;padding:5px 8px;font-size:10px;margin-top:5px}
.gbox{background:#f5fbf7;border-left:2px solid #2e7d5a;padding:5px 8px;font-size:10px;margin-top:4px}
.ft{margin-top:18px;padding-top:8px;border-top:1px solid #dde3ea;display:flex;justify-content:space-between;font-size:8px;color:#aaa}
.sig{margin-top:28px;display:grid;grid-template-columns:1fr 1fr;gap:40px}
.sf{border-top:1px solid #333;padding-top:3px;font-size:8px;color:#555}
@media print{body{padding:14px}}
</style></head><body>
<div class="wm">CONFIDENTIAL</div>
<div class="ct">
<div class="conf">⚕ CONFIDENTIAL — PROTECTED HEALTH INFORMATION — AUTHORIZED CLINICAL USE ONLY ⚕</div>
<div class="hdr">
  <div>
    <div class="brand">Kinesis <span>Clinical</span></div>
    <div style="font-size:9px;color:#4a6580;margin-top:2px;">Exercise Physiology Management Platform</div>
    ${site?`<div style="font-size:9px;color:#7a92a8;margin-top:2px;">${site.name} — ${site.address}</div>`:""}
    <div style="margin-top:8px;font-size:16px;font-weight:700;color:#0d2137">${patient.name}</div>
    <div style="font-size:10px;color:#4a6580;">Patient Progress Report</div>
  </div>
  <div style="text-align:right;font-size:9px;color:#7a92a8;">
    <div>Generated: ${new Date().toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"})}</div>
    <div>By: ${user?.name||user?.username} (${user?.role})</div>
    <div style="margin-top:6px;">Current Level: <span class="lbadge"><span class="ldot" style="background:${lc.color}"></span>${lc.label}</span></div>
    <div style="margin-top:2px;">Total Sessions: <strong>${sorted.length}</strong></div>
  </div>
</div>

<div class="stitle">Patient Information</div>
<div class="igrid">
  <div class="iitem"><label>Date of Birth</label><span>${patient.dob||"—"}</span></div>
  <div class="iitem"><label>Room / Unit</label><span>${patient.room||"—"}</span></div>
  <div class="iitem"><label>Admission Date</label><span>${patient.admitDate||"—"}</span></div>
  <div class="iitem"><label>Attending Physician</label><span>${patient.physician||"—"}</span></div>
  <div class="iitem"><label>Functional Level</label><span class="lbadge" style="background:${lc.color}">${lc.label} — ${lc.desc}</span></div>
  <div class="iitem"><label>Site</label><span>${site?.name||"—"}</span></div>
</div>
${patient.diagnosis?`<div class="dbox"><strong>Diagnosis / History:</strong> ${patient.diagnosis}</div>`:""}
${patient.notes?`<div class="dbox" style="border-left-color:#2e7d8c;"><strong>Notes:</strong> ${patient.notes}</div>`:""}

${levelHistory.length>1?`
<div class="stitle">Functional Level Progression</div>
<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;align-items:center;">
${levelHistory.map((lh,i)=>`${i>0?'<span style="color:#aaa;font-size:12px;">→</span>':""}<div style="text-align:center;"><div class="lbadge"><span class="ldot" style="background:${levelColors[lh.level]}"></span>${LEVEL_CONFIG[lh.level].label}</div><div style="font-size:8px;color:#7a92a8;margin-top:2px;">${lh.date}</div></div>`).join("")}
</div>`:""}

${sorted.length>0?`
<div class="stitle">Session Summary</div>
<table><thead><tr><th>Date</th><th>Level</th><th>Clinician</th><th>Exercises</th><th>Resting HR</th><th>BP Pre</th><th>RPE</th><th>Pain</th><th>Sit-Stand</th><th>Gait</th><th>Participation</th></tr></thead>
<tbody>${sorted.map(s=>`<tr><td>${s.date}</td><td><span class="lbadge" style="font-size:9px;"><span class="ldot" style="background:${levelColors[s.level]}"></span>${LEVEL_CONFIG[s.level].label}</span></td><td>${s.clinician}</td><td>${s.exercises.length}</td><td>${s.metrics.restingHR||"—"}</td><td>${s.metrics.bpPre||"—"}</td><td>${s.metrics.rpe||"—"}</td><td>${s.metrics.painPre||"—"}→${s.metrics.painPost||"—"}</td><td>${s.metrics.sitToStand||"—"}</td><td>${s.metrics.gaitDistance||"—"}</td><td>${s.metrics.participation||"—"}</td></tr>`).join("")}</tbody></table>

<div class="stitle">Detailed Session Log</div>
${sorted.map((s,idx)=>{
  const fm=METRICS.filter(m=>s.metrics[m.key]&&s.metrics[m.key]!=="N/A"&&s.metrics[m.key]!=="");
  return `<div class="sblock">
<div class="shdr"><div style="font-weight:700;color:#0d2137;font-size:11px;">Session ${idx+1} — ${s.date} <span class="lbadge" style="background:${levelColors[s.level]};font-size:8px;">${LEVEL_CONFIG[s.level].label}</span></div>
<div style="font-size:10px;color:#4a6580;">Clinician: <strong>${s.clinician}</strong> | ${s.exercises.length} exercise${s.exercises.length!==1?"s":""} | ${s.metrics.sessionDur?s.metrics.sessionDur+" min":"—"}</div></div>
<div class="sbody">
${fm.length>0?`<div class="mgrid">${fm.map(m=>`<div class="mchip"><div class="mk">${m.label}</div><div class="mv">${s.metrics[m.key]}</div></div>`).join("")}</div>`:""}
${s.exercises.length>0?`<table><thead><tr><th>Exercise</th><th>Sets</th><th>Reps / Time</th><th>Resistance</th></tr></thead><tbody>${s.exercises.map(ex=>`<tr><td>${ex}</td><td>${s.sets[ex]||"—"}</td><td>${s.reps[ex]||"—"}</td><td>${s.resistance[ex]||"—"}</td></tr>`).join("")}</tbody></table>`:""}
${s.sessionNotes?`<div class="nbox"><strong>Notes:</strong> ${s.sessionNotes}</div>`:""}
${s.nextGoals?`<div class="gbox"><strong>Next Goals:</strong> ${s.nextGoals}</div>`:""}
</div></div>`;}).join("")}`:"<p style='color:#7a92a8;padding:10px 0;'>No sessions logged yet.</p>"}

<div class="sig"><div class="sf">Clinician Signature / Date</div><div class="sf">Supervisor Review / Date</div></div>
<div class="ft">
  <span>Kinesis Clinical — Exercise Physiology Management Platform${site?" — "+site.name:""}</span>
  <span>CONFIDENTIAL — PHI — Authorized Use Only</span>
  <span>Generated ${new Date().toLocaleString()} by ${user?.username}</span>
</div>
</div></body></html>`;

  const win = window.open("","_blank");
  win.document.write(html);
  win.document.close();
  setTimeout(()=>win.print(),500);
}

// ── UI PRIMITIVES ──────────────────────────────────────────────────────────
const inputStyle = { width:"100%", padding:"9px 11px", border:`1.5px solid ${C.border}`, borderRadius:5, fontSize:14, outline:"none", boxSizing:"border-box", fontFamily:"inherit", color:C.text, background:"#fff" };
const labelStyle = { display:"block", fontSize:11, fontWeight:600, color:C.textMid, marginBottom:4, textTransform:"uppercase", letterSpacing:0.5 };

function Field({ label, children, required }) {
  return <div style={{ marginBottom:14 }}><label style={labelStyle}>{label}{required&&<span style={{color:C.danger}}> *</span>}</label>{children}</div>;
}
function Input({ label, value, onChange, type="text", placeholder="", required=false }) {
  return <Field label={label} required={required}><input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={inputStyle}/></Field>;
}
function Select({ label, value, onChange, options, required=false }) {
  return <Field label={label} required={required}>
    <select value={value} onChange={e=>onChange(e.target.value)} style={{...inputStyle,background:"#fff"}}>
      {options.map(o=>typeof o==="string"?<option key={o} value={o}>{o}</option>:<option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </Field>;
}
function Textarea({ label, value, onChange, placeholder="", rows=3 }) {
  return <Field label={label}><textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={rows} style={{...inputStyle,resize:"vertical"}}/></Field>;
}

function Btn({ children, onClick, variant="primary", size="md", style={}, disabled=false }) {
  const vs = {
    primary:   { background:C.navyMid,  color:"#fff", border:"none" },
    secondary: { background:"#fff",     color:C.navyMid, border:`1.5px solid ${C.border}` },
    teal:      { background:C.teal,     color:"#fff", border:"none" },
    danger:    { background:C.danger,   color:"#fff", border:"none" },
    success:   { background:C.success,  color:"#fff", border:"none" },
    ghost:     { background:"transparent", color:C.navyMid, border:`1.5px solid ${C.navyMid}` },
    print:     { background:"#3a4a5a",  color:"#fff", border:"none" },
  };
  const ss = { sm:{padding:"5px 12px",fontSize:12}, md:{padding:"9px 16px",fontSize:13}, lg:{padding:"11px 22px",fontSize:14} };
  return <button onClick={onClick} disabled={disabled}
    style={{ borderRadius:5, cursor:disabled?"not-allowed":"pointer", fontWeight:600, fontFamily:"inherit", opacity:disabled?0.5:1, ...vs[variant], ...ss[size], ...style }}>{children}</button>;
}

function LevelTag({ level, size="sm" }) {
  const lc = LEVEL_CONFIG[level];
  const fs = size==="lg" ? 13 : 11;
  const dot = size==="lg" ? 9 : 7;
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:5, background:C.bg, border:`1px solid ${C.border}`, borderRadius:4, padding:size==="lg"?"5px 12px":"3px 8px", fontWeight:600, fontSize:fs, color:C.text, letterSpacing:0.3 }}>
      <span style={{ width:dot, height:dot, borderRadius:"50%", background:lc.color, flexShrink:0, display:"inline-block" }}/>
      {lc.label}
    </span>
  );
}

function Card({ children, style={} }) {
  return <div style={{ background:C.bgCard, borderRadius:6, border:`1px solid ${C.border}`, padding:20, marginBottom:14, ...style }}>{children}</div>;
}

function SectionTitle({ children }) {
  return <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:1.5, color:C.textMid, borderBottom:`1px solid ${C.border}`, paddingBottom:6, marginBottom:14 }}>{children}</div>;
}

function DataTable({ headers, rows, emptyMsg="No data." }) {
  return (
    <div style={{ overflowX:"auto" }}>
      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
        <thead>
          <tr style={{ background:C.navy }}>
            {headers.map(h=><th key={h} style={{ padding:"9px 12px", textAlign:"left", color:"rgba(255,255,255,0.75)", fontWeight:600, fontSize:11, textTransform:"uppercase", letterSpacing:0.5, whiteSpace:"nowrap" }}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.length===0
            ?<tr><td colSpan={headers.length} style={{ padding:"20px 12px", color:C.textLight, textAlign:"center" }}>{emptyMsg}</td></tr>
            :rows.map((row,i)=><tr key={i} style={{ borderBottom:`1px solid ${C.border}`, background:i%2===0?"#fff":"#fafbfc" }}>
              {row.map((cell,j)=><td key={j} style={{ padding:"9px 12px", color:C.text, verticalAlign:"middle" }}>{cell}</td>)}
            </tr>)
          }
        </tbody>
      </table>
    </div>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div style={{ background:C.bgCard, border:`1px solid ${C.border}`, borderRadius:6, padding:"16px 18px" }}>
      <div style={{ fontSize:28, fontWeight:800, color:C.navy, lineHeight:1, marginBottom:4 }}>{value}</div>
      <div style={{ fontSize:11, fontWeight:600, color:C.textMid, textTransform:"uppercase", letterSpacing:0.5 }}>{label}</div>
      {sub&&<div style={{ fontSize:11, color:C.textLight, marginTop:2 }}>{sub}</div>}
    </div>
  );
}

// ── LOGIN ──────────────────────────────────────────────────────────────────
function Login({ onLogin, error }) {
  const [u,setU]=useState(""); const [p,setP]=useState("");
  return (
    <div style={{ minHeight:"100vh", background:C.navy, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div style={{ background:"#fff", borderRadius:8, padding:"40px 32px", width:"100%", maxWidth:380, boxShadow:"0 8px 40px rgba(0,0,0,0.3)" }}>
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ fontSize:28, fontWeight:800, color:C.navy, letterSpacing:-0.5 }}>Kinesis<span style={{color:C.teal}}> Clinical</span></div>
          <div style={{ fontSize:12, color:C.textLight, marginTop:4, letterSpacing:0.5 }}>Exercise Physiology Management Platform</div>
          <div style={{ width:40, height:2, background:C.teal, margin:"12px auto 0" }}/>
        </div>
        {error&&<div style={{ background:"#fdf2f3", border:`1px solid ${C.danger}`, borderRadius:5, padding:"10px 14px", marginBottom:16, fontSize:13, color:C.danger }}>{error}</div>}
        <Input label="Username" value={u} onChange={setU} placeholder="Enter username"/>
        <Input label="Password" value={p} onChange={setP} type="password" placeholder="Enter password"/>
        <Btn onClick={()=>onLogin(u,p)} variant="primary" size="lg" style={{width:"100%",marginTop:4}}>Sign In</Btn>
        <div style={{ marginTop:20, padding:"10px 12px", background:C.bg, borderRadius:5, fontSize:11, color:C.textMid, textAlign:"center" }}>
          🔒 This system contains Protected Health Information.<br/>Unauthorized access is strictly prohibited.
        </div>
      </div>
    </div>
  );
}

// ── INACTIVITY ─────────────────────────────────────────────────────────────
function InactivityGuard({ onLogout, children }) {
  const [warn,setWarn]=useState(false);
  const wt=useRef(null); const lt=useRef(null);
  const reset=useCallback(()=>{
    setWarn(false); clearTimeout(wt.current); clearTimeout(lt.current);
    wt.current=setTimeout(()=>setWarn(true),WARN_MS);
    lt.current=setTimeout(()=>onLogout("timeout"),INACTIVITY_MS);
  },[onLogout]);
  useEffect(()=>{
    const ev=["mousedown","mousemove","keydown","touchstart","scroll"];
    ev.forEach(e=>window.addEventListener(e,reset)); reset();
    return()=>{ ev.forEach(e=>window.removeEventListener(e,reset)); clearTimeout(wt.current); clearTimeout(lt.current); };
  },[reset]);
  return (<>
    {warn&&<div style={{ position:"fixed",top:0,left:0,right:0,zIndex:9999,background:C.warning,color:"#fff",padding:"10px 20px",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
      <span style={{fontWeight:600,fontSize:14}}>⚠️ Session will auto-logout in 1 minute due to inactivity.</span>
      <Btn onClick={reset} size="sm" style={{background:"#fff",color:C.warning,border:"none"}}>Stay Signed In</Btn>
    </div>}
    {children}
  </>);
}

// ── PATIENT FORM ───────────────────────────────────────────────────────────
function PatientForm({ initial, onSave, onCancel, currentUser }) {
  const INIT={id:"",name:"",dob:"",diagnosis:"",admitDate:"",room:"",physician:"",level:"A",notes:"",active:true,siteId:currentUser.siteId,createdBy:currentUser.id};
  const [f,setF]=useState(initial||INIT);
  const s=k=>v=>setF(x=>({...x,[k]:v}));
  return (
    <Card>
      <SectionTitle>{initial?.id?"Edit Patient":"New Patient"}</SectionTitle>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:"0 16px"}}>
        <Input label="Full Name" value={f.name} onChange={s("name")} required/>
        <Input label="Date of Birth" value={f.dob} onChange={s("dob")} type="date"/>
        <Input label="Room / Unit" value={f.room} onChange={s("room")}/>
        <Input label="Admission Date" value={f.admitDate} onChange={s("admitDate")} type="date"/>
        <Input label="Attending Physician" value={f.physician} onChange={s("physician")}/>
        <Select label="Functional Level" value={f.level} onChange={s("level")} options={["A","B","C","D"]} required/>
      </div>
      <Textarea label="Primary Diagnosis / Medical History" value={f.diagnosis} onChange={s("diagnosis")} rows={3}/>
      <Textarea label="Additional Notes" value={f.notes} onChange={s("notes")} rows={2}/>
      <div style={{display:"flex",gap:8,marginTop:4,flexWrap:"wrap"}}>
        <Btn onClick={()=>{if(!f.name)return alert("Name required");onSave({...f,id:f.id||Date.now().toString()});}} variant="primary">Save Patient</Btn>
        <Btn onClick={onCancel} variant="secondary">Cancel</Btn>
      </div>
    </Card>
  );
}

// ── SESSION FORM ───────────────────────────────────────────────────────────
function SessionForm({ patient, onSave, onCancel, currentUser }) {
  const INIT={date:new Date().toISOString().split("T")[0],clinician:currentUser.name||currentUser.username,level:patient.level,exercises:[],sets:{},reps:{},resistance:{},metrics:{},sessionNotes:"",nextGoals:""};
  const [f,setF]=useState(INIT);
  const sf=k=>v=>setF(x=>({...x,[k]:v}));
  const sm=k=>v=>setF(x=>({...x,metrics:{...x.metrics,[k]:v}}));
  const tx=ex=>setF(x=>({...x,exercises:x.exercises.includes(ex)?x.exercises.filter(e=>e!==ex):[...x.exercises,ex]}));
  const sd=(t,ex,v)=>setF(x=>({...x,[t]:{...x[t],[ex]:v}}));
  const bank=EXERCISE_BANK[f.level]||EXERCISE_BANK.A;

  return (
    <div>
      <Card>
        <SectionTitle>Log Session — {patient.name}</SectionTitle>
        <p style={{margin:"0 0 16px",color:C.textLight,fontSize:13}}>Current Level: <LevelTag level={patient.level}/></p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:"0 16px"}}>
          <Input label="Session Date" value={f.date} onChange={sf("date")} type="date" required/>
          <Input label="Clinician" value={f.clinician} onChange={sf("clinician")} required/>
          <Select label="Session Level" value={f.level} onChange={sf("level")} options={["A","B","C","D"]} required/>
        </div>
      </Card>

      <Card>
        <SectionTitle>Vital Signs & Metrics</SectionTitle>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:"0 16px"}}>
          {METRICS.map(m=>m.type==="select"
            ?<Select key={m.key} label={m.label} value={f.metrics[m.key]||m.options[0]} onChange={sm(m.key)} options={m.options}/>
            :<Input key={m.key} label={m.label} value={f.metrics[m.key]||""} onChange={sm(m.key)} type={m.type} placeholder={m.placeholder||"N/A"}/>
          )}
        </div>
      </Card>

      <Card>
        <SectionTitle>Exercise Selection — {LEVEL_CONFIG[f.level].label}</SectionTitle>
        {["upper","lower"].map(cat=>(
          <div key={cat} style={{marginBottom:20}}>
            <div style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1,color:C.textMid,marginBottom:10,paddingBottom:6,borderBottom:`1px solid ${C.border}`}}>
              {cat==="upper"?"Upper Extremity":"Lower Extremity"}
            </div>
            {(bank[cat]||[]).map(ex=>{
              const sel=f.exercises.includes(ex);
              return (
                <div key={ex} style={{marginBottom:8}}>
                  <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}>
                    <input type="checkbox" checked={sel} onChange={()=>tx(ex)} style={{width:15,height:15,accentColor:C.navyMid}}/>
                    <span style={{fontSize:13,color:sel?C.text:C.textMid,fontWeight:sel?600:400}}>{ex}</span>
                  </label>
                  {sel&&(
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:"0 12px",marginLeft:22,padding:"10px 12px",background:C.bg,borderRadius:5,marginTop:6}}>
                      <Input label="Sets" value={f.sets[ex]||""} onChange={v=>sd("sets",ex,v)} type="number" placeholder="3"/>
                      <Input label="Reps / Time" value={f.reps[ex]||""} onChange={v=>sd("reps",ex,v)} placeholder="10 or 30s"/>
                      <Input label="Resistance" value={f.resistance[ex]||""} onChange={v=>sd("resistance",ex,v)} placeholder="2lb / Red band"/>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        {/* CUSTOM EXERCISES */}
        <div style={{marginTop:4,paddingTop:16,borderTop:`1px solid ${C.border}`}}>
          <div style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1,color:C.textMid,marginBottom:10}}>Custom Exercises</div>
          {(f.customExercises||[]).map((ex,i)=>(
            <div key={i} style={{marginBottom:8}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                <span style={{fontSize:13,color:C.text,fontWeight:600}}>✦ {ex}</span>
                <button onClick={()=>setF(x=>({...x,customExercises:(x.customExercises||[]).filter((_,j)=>j!==i),exercises:x.exercises.filter(e=>e!==ex),sets:{...x.sets,[ex]:undefined},reps:{...x.reps,[ex]:undefined},resistance:{...x.resistance,[ex]:undefined}}))} style={{background:"none",border:"none",cursor:"pointer",color:C.danger,fontSize:12,padding:"0 4px"}}>✕ Remove</button>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:"0 12px",marginLeft:22,padding:"10px 12px",background:C.bg,borderRadius:5}}>
                <Input label="Sets" value={f.sets[ex]||""} onChange={v=>sd("sets",ex,v)} type="number" placeholder="3"/>
                <Input label="Reps / Time" value={f.reps[ex]||""} onChange={v=>sd("reps",ex,v)} placeholder="10 or 30s"/>
                <Input label="Resistance" value={f.resistance[ex]||""} onChange={v=>sd("resistance",ex,v)} placeholder="2lb / Red band"/>
              </div>
            </div>
          ))}
          <div style={{display:"flex",gap:8,alignItems:"flex-end",marginTop:8}}>
            <div style={{flex:1}}>
              <Input label="Add Custom Exercise" value={f._customInput||""} onChange={v=>setF(x=>({...x,_customInput:v}))} placeholder="e.g. Seated shoulder press, Standing hip hinge..."/>
            </div>
            <div style={{marginBottom:14}}>
              <Btn onClick={()=>{
                const name=(f._customInput||"").trim();
                if(!name)return;
                if(f.exercises.includes(name)||(f.customExercises||[]).includes(name))return alert("Exercise already added");
                setF(x=>({...x,customExercises:[...(x.customExercises||[]),name],exercises:[...x.exercises,name],_customInput:""}));
              }} variant="teal" size="sm">+ Add</Btn>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle>Session Notes</SectionTitle>
        <Textarea label="Notes & Observations" value={f.sessionNotes} onChange={sf("sessionNotes")} rows={4} placeholder="Patient tolerance, behavior, notable observations..."/>
        <Textarea label="Goals for Next Session" value={f.nextGoals} onChange={sf("nextGoals")} rows={3} placeholder="Progression targets, focus areas..."/>
      </Card>

      <div style={{display:"flex",gap:8,marginBottom:24,flexWrap:"wrap"}}>
        <Btn onClick={()=>{if(!f.clinician||!f.date)return alert("Date and clinician required");onSave({...f,id:Date.now().toString()});}} variant="success" size="lg">Save Session</Btn>
        <Btn onClick={onCancel} variant="secondary" size="lg">Cancel</Btn>
      </div>
    </div>
  );
}

// ── SESSION CARD ───────────────────────────────────────────────────────────
function SessionCard({ session, onDelete, canDelete, defaultOpen=false }) {
  const [open,setOpen]=useState(defaultOpen);
  const filled=METRICS.filter(m=>session.metrics[m.key]&&session.metrics[m.key]!=="N/A"&&session.metrics[m.key]!=="");
  return (
    <div style={{border:`1px solid ${C.border}`,borderRadius:6,marginBottom:8,overflow:"hidden"}}>
      <div onClick={()=>setOpen(o=>!o)} style={{padding:"10px 14px",background:open?"#f5f7fa":"#fafbfc",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
          <LevelTag level={session.level}/>
          <span style={{fontWeight:600,color:C.text,fontSize:13}}>{session.date}</span>
          <span style={{color:C.textMid,fontSize:13}}>{session.clinician}</span>
          <span style={{color:C.textLight,fontSize:12}}>{session.exercises.length} exercise{session.exercises.length!==1?"s":""}</span>
        </div>
        <span style={{color:C.textLight,fontSize:11}}>{open?"▲":"▼"}</span>
      </div>
      {open&&(
        <div style={{padding:14,borderTop:`1px solid ${C.border}`}}>
          {filled.length>0&&(
            <div style={{marginBottom:14}}>
              <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",color:C.textMid,marginBottom:8,letterSpacing:0.5}}>Metrics Recorded</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:6}}>
                {filled.map(m=>(
                  <div key={m.key} style={{background:C.bg,borderRadius:5,padding:"8px 10px",border:`1px solid ${C.border}`}}>
                    <div style={{fontSize:10,color:C.textLight,marginBottom:2}}>{m.label}</div>
                    <div style={{fontWeight:700,color:C.text,fontSize:15}}>{session.metrics[m.key]}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {session.exercises.length>0&&(
            <div style={{marginBottom:14,overflowX:"auto"}}>
              <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",color:C.textMid,marginBottom:8,letterSpacing:0.5}}>Exercises Performed</div>
              <DataTable
                headers={["Exercise","Sets","Reps / Time","Resistance"]}
                rows={session.exercises.map(ex=>[ex,session.sets[ex]||"—",session.reps[ex]||"—",session.resistance[ex]||"—"])}
              />
            </div>
          )}
          {session.sessionNotes&&<div style={{marginBottom:10}}><div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",color:C.textMid,marginBottom:4}}>Session Notes</div><p style={{margin:0,fontSize:13,color:C.text,lineHeight:1.6}}>{session.sessionNotes}</p></div>}
          {session.nextGoals&&<div style={{marginBottom:10}}><div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",color:C.textMid,marginBottom:4}}>Next Session Goals</div><p style={{margin:0,fontSize:13,color:C.text,lineHeight:1.6}}>{session.nextGoals}</p></div>}
          {canDelete&&<Btn onClick={()=>{if(window.confirm("Delete this session?"))onDelete(session.id);}} variant="danger" size="sm" style={{marginTop:8}}>Delete Session</Btn>}
        </div>
      )}
    </div>
  );
}

// ── PATIENT DETAIL ─────────────────────────────────────────────────────────
function PatientDetail({ patient, sessions, onBack, onAddSession, onEdit, onDeleteSession, onLevelChange, currentUser, sites, onPrint, focusSession, onFocusCleared }) {
  const [addS,setAddS]=useState(false);
  const [edit,setEdit]=useState(false);
  const sorted=[...sessions].sort((a,b)=>b.date.localeCompare(a.date));
  const canDelete=currentUser.role!==ROLES.EP;
  const lc=LEVEL_CONFIG[patient.level];

  if(addS) return <SessionForm patient={patient} onSave={s=>{onAddSession(s);setAddS(false);}} onCancel={()=>setAddS(false)} currentUser={currentUser}/>;
  if(edit) return <PatientForm initial={patient} onSave={p=>{onEdit(p);setEdit(false);}} onCancel={()=>setEdit(false)} currentUser={currentUser}/>;

  return (
    <div>
      <button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",color:C.textMid,fontSize:13,padding:"0 0 14px",display:"flex",alignItems:"center",gap:4}}>← Back to Roster</button>

      <Card style={{borderTop:`3px solid ${lc.color}`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12}}>
          <div>
            <h2 style={{margin:"0 0 6px",color:C.navy,fontSize:20,fontWeight:700}}>{patient.name}</h2>
            <div style={{display:"flex",gap:14,flexWrap:"wrap",fontSize:13,color:C.textMid,marginBottom:10}}>
              {patient.dob&&<span>DOB: {patient.dob}</span>}
              {patient.room&&<span>Room: {patient.room}</span>}
              {patient.physician&&<span>Dr. {patient.physician}</span>}
              {patient.admitDate&&<span>Admitted: {patient.admitDate}</span>}
            </div>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <LevelTag level={patient.level} size="lg"/>
              <span style={{fontSize:12,color:C.textLight}}>{lc.desc}</span>
            </div>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <Btn onClick={()=>onPrint(patient,sessions)} variant="print" size="sm">🖨 Print Report</Btn>
            <Btn onClick={()=>setEdit(true)} variant="secondary" size="sm">Edit</Btn>
            <Btn onClick={()=>setAddS(true)} variant="primary" size="sm">+ Log Session</Btn>
          </div>
        </div>
        {patient.diagnosis&&<div style={{marginTop:12,padding:"8px 12px",background:C.bg,borderRadius:5,fontSize:13,color:C.text,border:`1px solid ${C.border}`}}><span style={{fontWeight:600,color:C.textMid}}>Diagnosis: </span>{patient.diagnosis}</div>}
        {patient.notes&&<div style={{marginTop:6,padding:"8px 12px",background:C.bg,borderRadius:5,fontSize:13,color:C.text,border:`1px solid ${C.border}`}}><span style={{fontWeight:600,color:C.textMid}}>Notes: </span>{patient.notes}</div>}
      </Card>

      <Card>
        <SectionTitle>Functional Level</SectionTitle>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {Object.entries(LEVEL_CONFIG).map(([l,c])=>(
            <button key={l} onClick={()=>onLevelChange(patient.id,l)}
              style={{padding:"8px 16px",borderRadius:5,border:patient.level===l?`2px solid ${c.color}`:`1px solid ${C.border}`,background:patient.level===l?c.bg:"#fff",color:patient.level===l?c.color:C.textMid,fontWeight:patient.level===l?700:400,cursor:"pointer",fontSize:13,fontFamily:"inherit",transition:"all 0.15s"}}>
              {c.label}
            </button>
          ))}
        </div>
      </Card>

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <h4 style={{margin:0,color:C.navy,fontSize:14,fontWeight:600}}>Session History <span style={{color:C.textLight,fontWeight:400}}>({sorted.length})</span></h4>
      </div>
      {sorted.length===0
        ?<Card><p style={{margin:0,color:C.textLight,textAlign:"center",fontSize:13}}>No sessions logged yet.</p></Card>
        :sorted.map(s=><SessionCard key={s.id} session={s} onDelete={id=>onDeleteSession(patient.id,id)} canDelete={canDelete} defaultOpen={focusSession===s.id}/>)
      }
    </div>
  );
}

// ── ROSTER ─────────────────────────────────────────────────────────────────
function Roster({ patients, sessions, onSelect, onAdd, onPrintAll, currentUser, sites }) {
  const [adding,setAdding]=useState(false);
  const [filter,setFilter]=useState("active");
  const [lvl,setLvl]=useState("All");
  const [q,setQ]=useState("");
  const [siteFilter,setSiteFilter]=useState("All");

  const vis=patients.filter(p=>{
    if(filter==="active"&&!p.active)return false;
    if(filter==="inactive"&&p.active)return false;
    if(lvl!=="All"&&p.level!==lvl)return false;
    if(q&&!p.name.toLowerCase().includes(q.toLowerCase()))return false;
    if(currentUser.role===ROLES.ADMIN&&siteFilter!=="All"&&p.siteId!==siteFilter)return false;
    return true;
  });

  if(adding) return <PatientForm onSave={p=>{onAdd(p);setAdding(false);}} onCancel={()=>setAdding(false)} currentUser={currentUser}/>;

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
        <div>
          <h2 style={{margin:"0 0 2px",color:C.navy,fontSize:18,fontWeight:700}}>Patient Roster</h2>
          <p style={{margin:0,color:C.textLight,fontSize:13}}>{patients.filter(p=>p.active).length} active patients</p>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {currentUser.role!==ROLES.EP&&<Btn onClick={onPrintAll} variant="print" size="sm">🖨 Print All</Btn>}
          <Btn onClick={()=>setAdding(true)} variant="primary">+ Add Patient</Btn>
        </div>
      </div>

      <Card style={{padding:"12px 14px",marginBottom:14}}>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search patients..."
            style={{...inputStyle,flex:1,minWidth:160,padding:"8px 11px"}}/>
          <div style={{display:"flex",gap:4}}>
            {["active","inactive","all"].map(f=>(
              <button key={f} onClick={()=>setFilter(f)}
                style={{padding:"7px 12px",borderRadius:5,border:`1px solid ${filter===f?C.navyMid:C.border}`,background:filter===f?C.navyMid:"#fff",color:filter===f?"#fff":C.textMid,cursor:"pointer",fontSize:12,fontWeight:filter===f?600:400,fontFamily:"inherit",textTransform:"capitalize"}}>
                {f}
              </button>
            ))}
          </div>
          <div style={{display:"flex",gap:4}}>
            {["All","A","B","C","D"].map(l=>(
              <button key={l} onClick={()=>setLvl(l)}
                style={{padding:"7px 10px",borderRadius:5,border:`1px solid ${lvl===l?C.navyMid:C.border}`,background:lvl===l?C.navyMid:"#fff",color:lvl===l?"#fff":C.textMid,cursor:"pointer",fontSize:12,fontWeight:lvl===l?600:400,fontFamily:"inherit"}}>
                {l==="All"?"All":l}
              </button>
            ))}
          </div>
          {currentUser.role===ROLES.ADMIN&&(
            <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
              <button onClick={()=>setSiteFilter("All")}
                style={{padding:"7px 10px",borderRadius:5,border:`1px solid ${siteFilter==="All"?C.teal:C.border}`,background:siteFilter==="All"?C.teal:"#fff",color:siteFilter==="All"?"#fff":C.textMid,cursor:"pointer",fontSize:12,fontWeight:siteFilter==="All"?600:400,fontFamily:"inherit"}}>
                All Sites
              </button>
              {sites.map(s=>(
                <button key={s.id} onClick={()=>setSiteFilter(s.id)}
                  style={{padding:"7px 10px",borderRadius:5,border:`1px solid ${siteFilter===s.id?C.teal:C.border}`,background:siteFilter===s.id?C.teal:"#fff",color:siteFilter===s.id?"#fff":C.textMid,cursor:"pointer",fontSize:12,fontWeight:siteFilter===s.id?600:400,fontFamily:"inherit"}}>
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </Card>

      {vis.length===0
        ?<Card><p style={{margin:0,color:C.textLight,textAlign:"center"}}>No patients found.</p></Card>
        :vis.map(p=>{
          const lc=LEVEL_CONFIG[p.level];
          const ptS=sessions[p.id]||[];
          const last=ptS.length>0?[...ptS].sort((a,b)=>b.date.localeCompare(a.date))[0]:null;
          return (
            <div key={p.id} onClick={()=>onSelect(p.id)}
              style={{border:`1px solid ${C.border}`,borderLeft:`4px solid ${lc.color}`,borderRadius:6,padding:"12px 16px",marginBottom:8,cursor:"pointer",background:"#fff",transition:"box-shadow 0.15s"}}
              onMouseEnter={e=>e.currentTarget.style.boxShadow="0 2px 10px rgba(0,0,0,0.08)"}
              onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:4,flexWrap:"wrap"}}>
                    <span style={{fontWeight:700,color:C.text,fontSize:15}}>{p.name}</span>
                    <LevelTag level={p.level}/>
                    {!p.active&&<span style={{fontSize:10,background:"#f0f0f0",color:C.textLight,padding:"2px 7px",borderRadius:3,fontWeight:600}}>Inactive</span>}
                  </div>
                  <div style={{fontSize:12,color:C.textLight,display:"flex",gap:14,flexWrap:"wrap"}}>
                    {currentUser.role===ROLES.ADMIN&&sites&&<span style={{fontWeight:600,color:C.teal}}>{sites.find(s=>s.id===p.siteId)?.name||"Unknown Site"}</span>}
                    {p.room&&<span>Room {p.room}</span>}
                    {p.physician&&<span>Dr. {p.physician}</span>}
                    <span>{ptS.length} session{ptS.length!==1?"s":""}</span>
                    {last&&<span>Last: {last.date}</span>}
                  </div>
                </div>
                <span style={{color:C.textLight,fontSize:16}}>›</span>
              </div>
            </div>
          );
        })
      }
    </div>
  );
}

// ── DASHBOARD ──────────────────────────────────────────────────────────────
function Dashboard({ patients, sessions, currentUser, sites, onSessionClick }) {
  const active=patients.filter(p=>p.active);
  const lc={A:0,B:0,C:0,D:0};
  active.forEach(p=>lc[p.level]=(lc[p.level]||0)+1);
  const allS=Object.values(sessions).flat();
  const today=new Date().toISOString().split("T")[0];
  const site=sites.find(s=>s.id===currentUser.siteId);

  return (
    <div>
      <div style={{marginBottom:20}}>
        <h2 style={{margin:"0 0 2px",color:C.navy,fontSize:18,fontWeight:700}}>Dashboard</h2>
        <p style={{margin:0,color:C.textLight,fontSize:13}}>{site?.name} — {new Date().toLocaleDateString("en-US",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}</p>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:12,marginBottom:18}}>
        <StatCard label="Active Patients" value={active.length}/>
        <StatCard label="Sessions Today" value={allS.filter(s=>s.date===today).length}/>
        <StatCard label="This Week" value={allS.filter(s=>(new Date()-new Date(s.date))/(86400000)<=7).length}/>
        <StatCard label="Total Sessions" value={allS.length}/>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:14}}>
        <Card>
          <SectionTitle>Patients by Functional Level</SectionTitle>
          <DataTable
            headers={["Level","Description","Patients"]}
            rows={Object.entries(LEVEL_CONFIG).map(([l,c])=>[
              <LevelTag level={l}/>,
              <span style={{fontSize:12,color:C.textMid}}>{c.desc}</span>,
              <span style={{fontWeight:700,color:C.text}}>{lc[l]}</span>
            ])}
          />
        </Card>

        <Card>
          <SectionTitle>Recent Sessions</SectionTitle>
          {allS.length===0
            ?<p style={{margin:0,color:C.textLight,fontSize:13}}>No sessions logged yet.</p>
            :<div>
              {[...allS].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,6).map((s,i)=>{
                const pt=patients.find(p=>(sessions[p.id]||[]).some(ss=>ss.id===s.id));
                return (
                  <div key={s.id} onClick={()=>onSessionClick&&onSessionClick(pt?.id,s.id)}
                    style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 10px",borderRadius:5,cursor:onSessionClick?"pointer":"default",marginBottom:2,transition:"background 0.12s"}}
                    onMouseEnter={e=>{if(onSessionClick)e.currentTarget.style.background=C.bg;}}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <div style={{display:"flex",gap:10,alignItems:"center",flex:1,minWidth:0}}>
                      <LevelTag level={s.level}/>
                      <div style={{minWidth:0}}>
                        <div style={{fontWeight:600,color:C.text,fontSize:13,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{pt?.name||"—"}</div>
                        <div style={{fontSize:11,color:C.textLight}}>{s.clinician}</div>
                      </div>
                    </div>
                    <div style={{textAlign:"right",flexShrink:0}}>
                      <div style={{fontSize:12,color:C.textLight}}>{s.date}</div>
                      {onSessionClick&&<div style={{fontSize:10,color:C.teal,fontWeight:600}}>View →</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          }
        </Card>
      </div>
    </div>
  );
}

// ── AUDIT LOG ──────────────────────────────────────────────────────────────
function AuditLog({ currentUser, sites }) {
  const [log,setLog]=useState([]);
  useEffect(()=>{ load("kin_audit").then(d=>setLog(d||[])); },[]);
  const visible=log.filter(e=>currentUser.role===ROLES.ADMIN||e.siteId===currentUser.siteId);
  const roleColors={admin:C.danger,supervisor:C.warning,ep:C.teal};

  return (
    <div>
      <h2 style={{margin:"0 0 16px",color:C.navy,fontSize:18,fontWeight:700}}>Audit Log</h2>
      <Card style={{padding:0,overflow:"hidden"}}>
        <DataTable
          headers={["Timestamp","User","Role","Site","Action","Detail"]}
          rows={visible.slice(0,100).map(e=>[
            <span style={{fontSize:11,color:C.textLight,whiteSpace:"nowrap"}}>{new Date(e.ts).toLocaleString()}</span>,
            <span style={{fontWeight:600,color:C.text}}>{e.username}</span>,
            <span style={{background:roleColors[e.role]||"#999",color:"#fff",borderRadius:3,padding:"1px 7px",fontSize:10,fontWeight:600}}>{e.role}</span>,
            <span style={{color:C.textMid,fontSize:12}}>{sites.find(s=>s.id===e.siteId)?.name||"—"}</span>,
            <span style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:3,padding:"1px 7px",fontSize:10,fontWeight:600,color:C.text}}>{e.action}</span>,
            <span style={{color:C.textMid,fontSize:12}}>{e.detail}</span>
          ])}
          emptyMsg="No audit entries yet."
        />
      </Card>
    </div>
  );
}

// ── USER MANAGEMENT ────────────────────────────────────────────────────────
function UserManagement({ users, sites, currentUser, onUpdateUsers, onAuditAction }) {
  const [adding,setAdding]=useState(false);
  const [f,setF]=useState({username:"",password:"",name:"",role:ROLES.EP,siteId:currentUser.siteId,active:true});
  const s=k=>v=>setF(x=>({...x,[k]:v}));
  const roleColors={admin:C.danger,supervisor:C.warning,ep:C.teal};

  const save=()=>{
    if(!f.username||!f.password||!f.name)return alert("All fields required");
    if(users.find(u=>u.username===f.username))return alert("Username already exists");
    onUpdateUsers([...users,{...f,id:Date.now().toString()}]);
    onAuditAction("USER_CREATED",`Created: ${f.username} (${f.role})`);
    setAdding(false);
    setF({username:"",password:"",name:"",role:ROLES.EP,siteId:currentUser.siteId,active:true});
  };

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <h2 style={{margin:0,color:C.navy,fontSize:18,fontWeight:700}}>User Management</h2>
        <Btn onClick={()=>setAdding(a=>!a)} variant="primary">+ Add User</Btn>
      </div>
      {adding&&(
        <Card>
          <SectionTitle>New User</SectionTitle>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:"0 16px"}}>
            <Input label="Full Name" value={f.name} onChange={s("name")} required/>
            <Input label="Username" value={f.username} onChange={s("username")} required/>
            <Input label="Password" value={f.password} onChange={s("password")} required/>
            <Select label="Role" value={f.role} onChange={s("role")} options={[{value:ROLES.EP,label:"Exercise Physiologist"},{value:ROLES.SUPERVISOR,label:"Supervisor"},{value:ROLES.ADMIN,label:"Admin"}]}/>
            <Select label="Site" value={f.siteId} onChange={s("siteId")} options={sites.map(s=>({value:s.id,label:s.name}))}/>
          </div>
          <div style={{display:"flex",gap:8}}>
            <Btn onClick={save} variant="success">Save User</Btn>
            <Btn onClick={()=>setAdding(false)} variant="secondary">Cancel</Btn>
          </div>
        </Card>
      )}
      <Card style={{padding:0,overflow:"hidden"}}>
        <DataTable
          headers={["Name","Username","Role","Site","Status","Actions"]}
          rows={users.map(u=>[
            <span style={{fontWeight:600,color:C.text}}>{u.name}</span>,
            <span style={{color:C.textMid}}>{u.username}</span>,
            <span style={{background:roleColors[u.role]||"#999",color:"#fff",borderRadius:3,padding:"1px 7px",fontSize:10,fontWeight:600}}>{u.role}</span>,
            <span style={{color:C.textMid,fontSize:12}}>{sites.find(s=>s.id===u.siteId)?.name||"—"}</span>,
            <span style={{background:u.active?C.success:C.textLight,color:"#fff",borderRadius:3,padding:"1px 7px",fontSize:10,fontWeight:600}}>{u.active?"Active":"Inactive"}</span>,
            <div style={{display:"flex",gap:5}}>
              <Btn onClick={()=>{const pw=prompt("New password:");if(!pw)return;onUpdateUsers(users.map(x=>x.id===u.id?{...x,password:pw}:x));onAuditAction("PASSWORD_RESET",`Reset PW: ${u.username}`);}} variant="secondary" size="sm">Reset PW</Btn>
              {u.id!==currentUser.id&&<Btn onClick={()=>{onUpdateUsers(users.map(x=>x.id===u.id?{...x,active:!x.active}:x));onAuditAction("USER_TOGGLED",`${u.active?"Deactivated":"Activated"}: ${u.username}`);}} variant={u.active?"danger":"success"} size="sm">{u.active?"Deactivate":"Activate"}</Btn>}
            </div>
          ])}
        />
      </Card>
    </div>
  );
}

// ── SITE MANAGEMENT ────────────────────────────────────────────────────────
function SiteManagement({ sites, onUpdateSites, onAuditAction }) {
  const [adding,setAdding]=useState(false);
  const [f,setF]=useState({name:"",address:""});
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <h2 style={{margin:0,color:C.navy,fontSize:18,fontWeight:700}}>Site Management</h2>
        <Btn onClick={()=>setAdding(a=>!a)} variant="primary">+ Add Site</Btn>
      </div>
      {adding&&(
        <Card>
          <SectionTitle>New Site</SectionTitle>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 16px"}}>
            <Input label="Site Name" value={f.name} onChange={v=>setF(x=>({...x,name:v}))} required/>
            <Input label="Address" value={f.address} onChange={v=>setF(x=>({...x,address:v}))}/>
          </div>
          <div style={{display:"flex",gap:8}}>
            <Btn onClick={()=>{if(!f.name)return alert("Name required");onUpdateSites([...sites,{id:"s"+Date.now(),...f}]);onAuditAction("SITE_CREATED",`Added: ${f.name}`);setAdding(false);setF({name:"",address:""}); }} variant="success">Save Site</Btn>
            <Btn onClick={()=>setAdding(false)} variant="secondary">Cancel</Btn>
          </div>
        </Card>
      )}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:12}}>
        {sites.map(s=>(
          <Card key={s.id} style={{marginBottom:0}}>
            <div style={{fontWeight:700,color:C.navy,marginBottom:4,fontSize:14}}>{s.name}</div>
            <div style={{fontSize:12,color:C.textLight}}>{s.address||"No address on file"}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── MAIN APP ───────────────────────────────────────────────────────────────
export default function App() {
  const [patients,setPatients]=useState([]);
  const [sessions,setSessions]=useState({});
  const [users,setUsers]=useState(DEFAULT_USERS);
  const [sites,setSites]=useState(DEFAULT_SITES);
  const [currentUser,setCurrentUser]=useState(null);
  const [loginError,setLoginError]=useState("");
  const [view,setView]=useState("dashboard");
  const [selPt,setSelPt]=useState(null);
  const [focusSession,setFocusSession]=useState(null);
  const [loaded,setLoaded]=useState(false);

  useEffect(()=>{
    (async()=>{
      const p=await load("kin_patients"); const s=await load("kin_sessions");
      const u=await load("kin_users");    const si=await load("kin_sites");
      if(p)setPatients(p); if(s)setSessions(s);
      if(u)setUsers(u); else save("kin_users",DEFAULT_USERS);
      if(si)setSites(si); else save("kin_sites",DEFAULT_SITES);
      setLoaded(true);
    })();
  },[]);

  useEffect(()=>{if(loaded)save("kin_patients",patients);},[patients,loaded]);
  useEffect(()=>{if(loaded)save("kin_sessions",sessions);},[sessions,loaded]);
  useEffect(()=>{if(loaded)save("kin_users",users);},[users,loaded]);
  useEffect(()=>{if(loaded)save("kin_sites",sites);},[sites,loaded]);

  const doAudit=useCallback((action,detail="")=>{ if(currentUser) audit(currentUser,action,detail); },[currentUser]);

  const handleLogin=(u,p)=>{
    const user=users.find(x=>x.username===u&&x.password===p&&x.active);
    if(!user){setLoginError("Invalid username or password.");return;}
    setCurrentUser(user); setLoginError("");
    audit(user,"LOGIN",`Signed in`);
  };

  const handleLogout=(reason="manual")=>{
    if(currentUser) audit(currentUser,reason==="timeout"?"TIMEOUT":"LOGOUT","Session ended");
    setCurrentUser(null); setView("dashboard"); setSelPt(null);
  };

  const sitePts=currentUser?.role===ROLES.ADMIN?patients:patients.filter(p=>p.siteId===currentUser?.siteId);
  const selPatient=sitePts.find(p=>p.id===selPt);

  const addPt=p=>{setPatients(ps=>[...ps,p]);doAudit("PATIENT_ADDED",`Added: ${p.name}`);};
  const editPt=p=>{setPatients(ps=>ps.map(x=>x.id===p.id?p:x));doAudit("PATIENT_EDITED",`Edited: ${p.name}`);};
  const updLv=(id,lv)=>{const pt=patients.find(p=>p.id===id);setPatients(ps=>ps.map(p=>p.id===id?{...p,level:lv}:p));doAudit("LEVEL_CHANGED",`${pt?.name}: → Level ${lv}`);};
  const addS=useCallback((pid,s)=>{setSessions(ss=>({...ss,[pid]:[...(ss[pid]||[]),s]}));const pt=patients.find(p=>p.id===pid);doAudit("SESSION_SAVED",`Session for ${pt?.name}`);},[patients,doAudit]);
  const delS=(pid,sid)=>{setSessions(ss=>({...ss,[pid]:(ss[pid]||[]).filter(s=>s.id!==sid)}));doAudit("SESSION_DELETED",`Deleted session`);};

  const handlePrint=(pt,ptS)=>{printReport(pt,ptS,currentUser,sites);doAudit("REPORT_PRINTED",`Report: ${pt.name}`);};
  const printAll=()=>sitePts.filter(p=>p.active).forEach((p,i)=>setTimeout(()=>handlePrint(p,sessions[p.id]||[]),i*800));

  const canAdmin=currentUser?.role===ROLES.ADMIN;
  const canSuper=currentUser?.role!==ROLES.EP;

  const NAV=[
    {id:"dashboard",label:"Dashboard",icon:"▣"},
    {id:"roster",label:"Patients",icon:"◉"},
    ...(canSuper?[{id:"audit",label:"Audit Log",icon:"≡"}]:[]),
    ...(canAdmin?[{id:"users",label:"Users",icon:"⊕"},{id:"sites",label:"Sites",icon:"⊞"}]:[]),
  ];

  if(!loaded) return <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:C.navy,color:"#fff",fontSize:16}}>Loading...</div>;
  if(!currentUser) return <Login onLogin={handleLogin} error={loginError}/>;

  return (
    <InactivityGuard onLogout={handleLogout}>
      <div style={{display:"flex",flexDirection:"column",minHeight:"100vh",fontFamily:"'Inter','Segoe UI',system-ui,sans-serif",background:C.bg}}>

        {/* TOP BAR */}
        <div style={{background:C.navy,padding:"0 16px",display:"flex",alignItems:"center",justifyContent:"space-between",height:52,flexShrink:0,boxShadow:"0 1px 6px rgba(0,0,0,0.2)"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:3,height:24,background:C.teal,borderRadius:2}}/>
            <div>
              <div style={{fontSize:15,fontWeight:800,color:"#fff",letterSpacing:-0.3,lineHeight:1}}>Kinesis<span style={{color:C.tealLight}}> Clinical</span></div>
              <div style={{fontSize:9,color:"rgba(255,255,255,0.35)",letterSpacing:1,textTransform:"uppercase"}}>Exercise Physiology Platform</div>
            </div>
          </div>
          <nav style={{display:"flex",gap:2}}>
            {NAV.map(n=>(
              <button key={n.id} onClick={()=>{setView(n.id);setSelPt(null);}}
                style={{padding:"7px 12px",borderRadius:5,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:view===n.id?600:400,background:view===n.id?"rgba(255,255,255,0.12)":"transparent",color:view===n.id?"#fff":"rgba(255,255,255,0.55)"}}>
                {n.label}
              </button>
            ))}
          </nav>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:12,color:"#fff",fontWeight:600}}>{currentUser.name}</div>
              <div style={{fontSize:10,color:"rgba(255,255,255,0.4)",textTransform:"capitalize"}}>{currentUser.role}</div>
            </div>
            <button onClick={()=>handleLogout("manual")} style={{background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.2)",color:"rgba(255,255,255,0.7)",padding:"6px 12px",borderRadius:5,cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>Sign Out</button>
          </div>
        </div>

        {/* CONTENT */}
        <div style={{flex:1,padding:"18px 16px",overflowY:"auto",paddingBottom:72,maxWidth:1100,width:"100%",margin:"0 auto",boxSizing:"border-box"}}>
          {view==="dashboard"&&<Dashboard patients={sitePts} sessions={sessions} currentUser={currentUser} sites={sites} onSessionClick={(ptId,sId)=>{setSelPt(ptId);setFocusSession(sId);setView("roster");}}/>}
          {view==="roster"&&(
            selPatient
              ?<PatientDetail patient={selPatient} sessions={sessions[selPt]||[]} onBack={()=>{setSelPt(null);setFocusSession(null);}} onAddSession={s=>addS(selPt,s)} onEdit={editPt} onDeleteSession={delS} onLevelChange={updLv} onPrint={handlePrint} currentUser={currentUser} sites={sites} focusSession={focusSession} onFocusCleared={()=>setFocusSession(null)}/>
              :<Roster patients={sitePts} sessions={sessions} onSelect={id=>{setSelPt(id);doAudit("PATIENT_VIEWED",`Viewed: ${sitePts.find(p=>p.id===id)?.name}`);}} onAdd={addPt} onPrintAll={printAll} currentUser={currentUser} sites={sites}/>
          )}
          {view==="audit"&&canSuper&&<AuditLog currentUser={currentUser} sites={sites}/>}
          {view==="users"&&canAdmin&&<UserManagement users={users} sites={sites} currentUser={currentUser} onUpdateUsers={setUsers} onAuditAction={doAudit}/>}
          {view==="sites"&&canAdmin&&<SiteManagement sites={sites} onUpdateSites={setSites} onAuditAction={doAudit}/>}
        </div>

        {/* BOTTOM NAV */}
        <div style={{position:"fixed",bottom:0,left:0,right:0,background:C.navy,display:"flex",borderTop:`1px solid rgba(255,255,255,0.08)`,zIndex:100}}>
          {NAV.map(n=>(
            <button key={n.id} onClick={()=>{setView(n.id);setSelPt(null);}}
              style={{flex:1,padding:"10px 4px 8px",border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:10,fontWeight:view===n.id?600:400,background:view===n.id?"rgba(255,255,255,0.08)":"transparent",color:view===n.id?"#fff":"rgba(255,255,255,0.4)",borderTop:view===n.id?`2px solid ${C.teal}`:"2px solid transparent",display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
              <span style={{fontSize:14}}>{n.icon}</span>
              <span>{n.label}</span>
            </button>
          ))}
        </div>
      </div>
    </InactivityGuard>
  );
}
