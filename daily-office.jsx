import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Flame, Pencil, Check, Plus, Trash2, ChevronUp, ChevronDown, X
} from "lucide-react";

/* ═══════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════ */

const DAYS_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const DAYS_LONG  = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

let _uid = 0;
const uid = () => `item_${Date.now()}_${_uid++}`;

const DEFAULT_ITEMS = [
  { id:"wake",     label:"Wake",                      type:"event",  start:"07:00", end:null },
  { id:"lauds",    label:"Lauds",                     type:"prayer", start:"07:15", end:"07:30" },
  { id:"rosary",   label:"Rosary",                    type:"prayer", start:"07:30", end:"08:00" },
  { id:"work",     label:"Work",                      type:"event",  start:"10:00", end:"17:00" },
  { id:"vespers",  label:"Vespers",                   type:"prayer", start:"17:30", end:"18:00" },
  { id:"lectio",   label:"Scripture · Lectio Divina", type:"prayer", start:"21:00", end:"21:30" },
  { id:"reading",  label:"Spiritual Reading",         type:"prayer", start:"21:30", end:"22:00" },
  { id:"compline", label:"Compline",                  type:"prayer", start:"23:45", end:"00:00" },
  { id:"bed",      label:"Retire",                    type:"event",  start:"00:15", end:null },
];

/* ═══════════════════════════════════════════
   TIME UTILITIES
═══════════════════════════════════════════ */

const WAKE_MIN = 420;

function toMin(hhmm) {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function orderMin(hhmm) {
  const m = toMin(hhmm) - WAKE_MIN;
  return m < 0 ? m + 1440 : m;
}
function fmt(hhmm) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2,"0")} ${h < 12 ? "AM" : "PM"}`;
}
function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}
function dateKey(d = new Date()) {
  const c = new Date(d);
  if (c.getHours() < 4) c.setDate(c.getDate() - 1);
  return c.toISOString().slice(0, 10);
}
function prevDateKey(k) {
  const d = new Date(k + "T12:00:00");
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}
function calcStreak(doneSet, key) {
  let n = 0, cur = doneSet.has(key) ? key : prevDateKey(key);
  while (doneSet.has(cur)) { n++; cur = prevDateKey(cur); }
  return n;
}

/* ═══════════════════════════════════════════
   STORAGE  (window.storage — Claude artifact)
═══════════════════════════════════════════ */

async function sg(key) {
  try { const r = await window.storage.get(key, false); return r?.value ?? null; }
  catch { return null; }
}
async function ss(key, val) {
  try { await window.storage.set(key, val, false); } catch {}
}

/* ═══════════════════════════════════════════
   COMPONENT
═══════════════════════════════════════════ */

export default function DailyOffice() {
  const [schedules, setSchedules] = useState({});
  const [checklist, setChecklist] = useState({});
  const [doneDates, setDoneDates] = useState(new Set());
  const [viewDay,   setViewDay]   = useState(new Date().getDay());
  const [editMode,  setEditMode]  = useState(false);
  const [draft,     setDraft]     = useState(null);
  const [saved,     setSaved]     = useState(false);
  const [loading,   setLoading]   = useState(true);
  const [now,       setNow]       = useState(new Date());
  const saveTmr = useRef(null);

  const todayIdx  = now.getDay();
  const todayKey  = dateKey(now);
  const isToday   = viewDay === todayIdx;
  const items     = schedules[viewDay] ?? DEFAULT_ITEMS;
  const prayers   = items.filter(i => i.type === "prayer").map(i => i.id);
  const doneCount = isToday ? prayers.filter(id => checklist[id]).length : 0;
  const streakN   = calcStreak(doneDates, todayKey);

  useEffect(() => {
    (async () => {
      const [schRaw, clRaw, ddRaw] = await Promise.all([
        sg("do-schedules"), sg(`do-cl:${dateKey()}`), sg("do-done-dates"),
      ]);
      if (schRaw) try { setSchedules(JSON.parse(schRaw)); } catch {}
      if (clRaw)  try { setChecklist(JSON.parse(clRaw));  } catch {}
      if (ddRaw)  try { setDoneDates(new Set(JSON.parse(ddRaw))); } catch {}
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const flash = useCallback(() => {
    setSaved(true);
    clearTimeout(saveTmr.current);
    saveTmr.current = setTimeout(() => setSaved(false), 1400);
  }, []);

  const saveDay = useCallback(async (dayIdx, next) => {
    const s = { ...schedules, [dayIdx]: next };
    setSchedules(s);
    await ss("do-schedules", JSON.stringify(s));
    flash();
  }, [schedules, flash]);

  const toggle = useCallback(async (id) => {
    const next = { ...checklist, [id]: !checklist[id] };
    setChecklist(next);
    await ss(`do-cl:${todayKey}`, JSON.stringify(next));
    const tp = (schedules[todayIdx] ?? DEFAULT_ITEMS).filter(i => i.type === "prayer").map(i => i.id);
    const allDone = tp.every(pid => next[pid]);
    const dd = new Set(doneDates);
    allDone ? dd.add(todayKey) : dd.delete(todayKey);
    setDoneDates(dd);
    await ss("do-done-dates", JSON.stringify([...dd]));
    flash();
  }, [checklist, todayKey, schedules, todayIdx, doneDates, flash]);

  const updField = useCallback((id, field, val) =>
    saveDay(viewDay, items.map(i => i.id === id ? { ...i, [field]: val } : i)),
    [items, viewDay, saveDay]);

  const delItem = useCallback((id) =>
    saveDay(viewDay, items.filter(i => i.id !== id)),
    [items, viewDay, saveDay]);

  const moveItem = useCallback((id, dir) => {
    const idx = items.findIndex(i => i.id === id);
    if (idx < 0) return;
    const ni = idx + dir;
    if (ni < 0 || ni >= items.length) return;
    const n = [...items];
    [n[idx], n[ni]] = [n[ni], n[idx]];
    saveDay(viewDay, n);
  }, [items, viewDay, saveDay]);

  const addItem = useCallback(() => {
    if (!draft?.label.trim()) return;
    saveDay(viewDay, [...items, {
      id: uid(), label: draft.label.trim(),
      type: draft.type, start: draft.start || "08:00", end: draft.end || null,
    }]);
    setDraft(null);
  }, [draft, items, viewDay, saveDay]);

  const nowOM = orderMin(nowHHMM());
  const withStatus = items.map((item, idx) => {
    const sOM = orderMin(item.start);
    const eOM = item.end ? orderMin(item.end) : sOM + 15;
    let status = "future";
    if (isToday) {
      if (nowOM >= sOM && nowOM < eOM) status = "current";
      else if (nowOM >= eOM) status = "past";
    }
    return { ...item, status, _i: idx, _first: idx === 0, _last: idx === items.length - 1 };
  });

  const nextId = (() => {
    if (!isToday) return null;
    if (withStatus.some(i => i.type === "prayer" && i.status === "current")) return null;
    return withStatus
      .filter(i => i.type === "prayer" && i.status === "future")
      .sort((a,b) => orderMin(a.start) - orderMin(b.start))[0]?.id ?? null;
  })();

  if (loading) return (
    <div style={{
      minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center",
      background:"#F5F2EA", fontFamily:"system-ui", color:"#8C8474", fontSize:"14px",
    }}>Gathering your hours…</div>
  );

  return (
    <div className="page">
      <style>{CSS}</style>

      <header className="hdr">
        <div>
          <p className="eyebrow">Daily Office</p>
          <h1 className="page-title">{DAYS_LONG[viewDay]}</h1>
        </div>
        <div className="streak-chip" title="Consecutive days with all prayers kept">
          <Flame size={13} />
          <span>{streakN} day{streakN !== 1 ? "s" : ""}</span>
        </div>
      </header>

      <nav className="day-nav" role="tablist" aria-label="Select day">
        {DAYS_SHORT.map((d, i) => (
          <button key={i} role="tab" aria-selected={viewDay === i}
            className={`day-tab${viewDay === i ? " sel" : ""}${i === todayIdx ? " today" : ""}`}
            onClick={() => { setViewDay(i); setEditMode(false); setDraft(null); }}>
            {d}
            {i === todayIdx && <span className="today-dot" aria-hidden="true" />}
          </button>
        ))}
      </nav>

      {isToday && prayers.length > 0 && (
        <div className="progress-wrap">
          <div className="beads" aria-hidden="true">
            {prayers.map(id => <div key={id} className={`bead${checklist[id] ? " on" : ""}`} />)}
          </div>
          <span className="progress-txt">{doneCount} of {prayers.length} kept today</span>
        </div>
      )}
      {isToday && prayers.length === 0 && (
        <p className="no-prayers-hint">No prayers scheduled — add some in Edit mode.</p>
      )}

      <div className="toolbar">
        <span className={`saved-txt${saved ? " show" : ""}`} aria-live="polite">Saved ✓</span>
        {!isToday && !editMode && (
          <span className="other-day-note">Viewing {DAYS_SHORT[viewDay]}'s schedule</span>
        )}
        <button className={`ibtn${editMode ? " act" : ""}`}
          onClick={() => { setEditMode(v => !v); setDraft(null); }}>
          {editMode ? <><Check size={13}/> Done</> : <><Pencil size={13}/> Edit</>}
        </button>
      </div>

      <div className={`timeline${editMode ? " edit-mode" : ""}`}>
        {withStatus.map(item => {
          const done = isToday && !!checklist[item.id];
          const cur  = item.status === "current";
          const nxt  = item.id === nextId;

          if (editMode) return (
            <div className="e-row" key={item.id}>
              <div className="move-col">
                <button className="mv-btn" onClick={() => moveItem(item.id, -1)}
                  disabled={item._first} aria-label="Move up"><ChevronUp size={14}/></button>
                <button className="mv-btn" onClick={() => moveItem(item.id,  1)}
                  disabled={item._last}  aria-label="Move down"><ChevronDown size={14}/></button>
              </div>
              <div className="e-fields">
                <input className="e-label" value={item.label}
                  onChange={ev => updField(item.id, "label", ev.target.value)}
                  placeholder="Label" aria-label="Item label" />
                <div className="e-sub">
                  <select className="e-type" value={item.type}
                    onChange={ev => updField(item.id, "type", ev.target.value)} aria-label="Type">
                    <option value="prayer">Prayer ✦</option>
                    <option value="event">Event</option>
                  </select>
                  <input type="time" className="e-time" value={item.start}
                    onChange={ev => updField(item.id, "start", ev.target.value)} aria-label="Start"/>
                  <span className="e-dash">–</span>
                  <input type="time" className="e-time" value={item.end ?? ""}
                    onChange={ev => updField(item.id, "end", ev.target.value || null)} aria-label="End"/>
                </div>
              </div>
              <button className="del-btn" onClick={() => delItem(item.id)}
                aria-label={`Delete ${item.label}`}><Trash2 size={14}/></button>
            </div>
          );

          if (item.type === "event") return (
            <div className="ev-row" key={item.id}>
              <div className="ev-dot" aria-hidden="true"/>
              <span className="ev-time">{fmt(item.start)}{item.end ? `–${fmt(item.end)}` : ""}</span>
              <span className="ev-label">{item.label}</span>
            </div>
          );

          return (
            <div className={`pr-wrap${done ? " done" : ""}${cur ? " cur-wrap" : ""}`} key={item.id}>
              <div className={`pr-node${done ? " nd-done" : ""}${cur ? " nd-cur" : ""}`} aria-hidden="true"/>
              <div className={`pr-card${cur ? " c-cur" : ""}${nxt ? " c-nxt" : ""}`}>
                {isToday && (
                  <button className={`cb${done ? " cbon" : ""}`} onClick={() => toggle(item.id)}
                    aria-label={`${done ? "Unmark" : "Mark"} ${item.label} done`} aria-pressed={done}>
                    {done && <Check size={12} color="#fff" strokeWidth={3}/>}
                  </button>
                )}
                <div className="pr-body">
                  <p className="pr-label">{item.label}</p>
                  <span className="pr-time">{fmt(item.start)}{item.end ? `–${fmt(item.end)}` : ""}</span>
                </div>
                {cur && <span className="tag">Now</span>}
                {!cur && nxt && <span className="tag">Next</span>}
              </div>
            </div>
          );
        })}

        {editMode && (
          <div className="add-wrap">
            {draft === null ? (
              <button className="add-btn"
                onClick={() => setDraft({ label:"", type:"prayer", start:"08:00", end:"08:30" })}>
                <Plus size={14}/> Add item
              </button>
            ) : (
              <div className="add-card">
                <p className="add-hdg">New Item</p>
                <input className="e-label" autoFocus placeholder="e.g. Morning Prayer"
                  value={draft.label}
                  onChange={ev => setDraft(d => ({ ...d, label: ev.target.value }))}
                  onKeyDown={ev => ev.key === "Enter" && addItem()}
                  aria-label="New item label" />
                <div className="e-sub" style={{ marginTop:8 }}>
                  <select className="e-type" value={draft.type}
                    onChange={ev => setDraft(d => ({ ...d, type: ev.target.value }))}>
                    <option value="prayer">Prayer ✦</option>
                    <option value="event">Event</option>
                  </select>
                  <input type="time" className="e-time" value={draft.start}
                    onChange={ev => setDraft(d => ({ ...d, start: ev.target.value }))}/>
                  <span className="e-dash">–</span>
                  <input type="time" className="e-time" value={draft.end ?? ""}
                    onChange={ev => setDraft(d => ({ ...d, end: ev.target.value || null }))}/>
                </div>
                <div className="add-actions">
                  <button className="ibtn" onClick={() => setDraft(null)}><X size={13}/> Cancel</button>
                  <button className="ibtn act" onClick={addItem} disabled={!draft.label.trim()}>
                    <Check size={13}/> Add
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <p className="motto">Ora et labora</p>
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,500;0,600;1,500&family=Work+Sans:wght@400;500;600&display=swap');
*, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
:root {
  --bg:#F5F2EA; --card:#FCFAF4; --ink:#2A2823; --muted:#8C8474;
  --sage:#66745C; --sage-lt:#DCE2D4; --gold:#AD8748; --gold-lt:#F0E4CC;
  --line:#E2DBC8; --red:#B85C4A; --red-lt:#F9EDE9;
  --sh:0 1px 2px rgba(42,40,35,.04),0 4px 14px rgba(42,40,35,.07);
}
.page {
  min-height:100vh; background:var(--bg); color:var(--ink);
  font-family:'Work Sans',system-ui,sans-serif;
  padding:28px 16px 80px; display:flex; flex-direction:column; align-items:center;
}
.page > * { width:100%; max-width:460px; }
.hdr { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px; }
.eyebrow { font-size:11px; letter-spacing:.13em; text-transform:uppercase; color:var(--muted); margin-bottom:2px; }
.page-title { font-family:'Lora',Georgia,serif; font-weight:600; font-size:26px; line-height:1.2; }
.streak-chip {
  display:flex; align-items:center; gap:5px; background:var(--gold-lt); color:#8A6A33;
  border-radius:99px; padding:6px 12px; font-size:12.5px; font-weight:600; white-space:nowrap; flex-shrink:0; margin-top:2px;
}
.day-nav {
  display:flex; gap:3px; background:rgba(42,40,35,.06);
  border-radius:11px; padding:4px; margin-bottom:20px;
}
.day-tab {
  flex:1; position:relative; background:transparent; border:none; border-radius:8px;
  padding:7px 2px; font-size:11.5px; font-weight:500; color:var(--muted); font-family:inherit; cursor:pointer;
  transition:background .15s,color .15s,box-shadow .15s;
}
.day-tab.sel { background:var(--card); color:var(--ink); box-shadow:var(--sh); }
.day-tab.today { color:var(--sage); }
.day-tab.sel.today { color:var(--sage); }
.today-dot {
  position:absolute; bottom:3px; left:50%; transform:translateX(-50%);
  width:4px; height:4px; border-radius:50%; background:var(--sage);
}
.progress-wrap { display:flex; align-items:center; gap:12px; margin-bottom:18px; }
.beads { display:flex; gap:6px; flex-wrap:wrap; }
.bead { width:8px; height:8px; border-radius:50%; background:var(--line); transition:background .3s; }
.bead.on { background:var(--sage); }
.progress-txt { font-size:12px; color:var(--muted); }
.no-prayers-hint { font-size:12.5px; color:var(--muted); margin-bottom:16px; font-style:italic; }
.toolbar { display:flex; align-items:center; justify-content:flex-end; gap:10px; margin-bottom:8px; flex-wrap:wrap; }
.saved-txt { font-size:12px; color:var(--sage); opacity:0; transition:opacity .25s; }
.saved-txt.show { opacity:1; }
.other-day-note { font-size:11.5px; color:var(--muted); margin-right:auto; font-style:italic; }
.ibtn {
  display:inline-flex; align-items:center; gap:5px; background:transparent;
  border:1px solid var(--line); color:var(--muted); border-radius:8px; padding:6px 11px;
  font-size:12.5px; font-family:inherit; cursor:pointer;
  transition:border-color .18s,color .18s,background .18s;
}
.ibtn:hover:not(:disabled) { border-color:var(--sage); color:var(--sage); }
.ibtn:focus-visible { outline:2px solid var(--sage); outline-offset:2px; }
.ibtn.act { border-color:var(--gold); color:#8A6A33; background:var(--gold-lt); }
.ibtn:disabled { opacity:.38; cursor:not-allowed; }
.timeline { position:relative; padding-left:26px; }
.timeline::before {
  content:''; position:absolute; left:8px; top:8px; bottom:8px; width:1px; background:var(--line);
}
.timeline.edit-mode { padding-left:0; }
.timeline.edit-mode::before { display:none; }
.ev-row { display:flex; align-items:baseline; gap:10px; padding:5px 0; position:relative; margin-bottom:6px; }
.ev-dot { position:absolute; left:-19px; top:9px; width:6px; height:6px; border-radius:50%; background:var(--line); }
.ev-time { font-size:12px; color:var(--muted); min-width:90px; font-variant-numeric:tabular-nums; flex-shrink:0; }
.ev-label { font-size:13px; color:var(--muted); }
.pr-wrap { position:relative; margin-bottom:8px; transition:opacity .2s; }
.pr-wrap.done { opacity:.62; }
.pr-node {
  position:absolute; left:-19px; top:15px; width:9px; height:9px; border-radius:50%;
  background:var(--bg); border:1.5px solid var(--muted); z-index:1;
}
.pr-node.nd-done { background:var(--sage); border-color:var(--sage); }
.pr-node.nd-cur { border-color:var(--gold); background:var(--gold-lt); animation:pulse 2.2s ease-in-out infinite; }
@keyframes pulse {
  0%,100% { box-shadow:0 0 0 0 rgba(173,135,72,.4); }
  50%      { box-shadow:0 0 0 5px rgba(173,135,72,0); }
}
.pr-card {
  background:var(--card); border:1px solid var(--line); border-radius:10px;
  padding:12px 13px; display:flex; align-items:center; gap:11px; box-shadow:var(--sh);
}
.pr-card.c-cur { border-color:var(--gold); border-left-width:3px; padding-left:11px; }
.pr-card.c-nxt { border-left:3px solid var(--sage); padding-left:11px; }
.cb {
  width:22px; height:22px; min-width:22px; border-radius:50%; border:1.5px solid var(--muted);
  background:transparent; display:flex; align-items:center; justify-content:center;
  cursor:pointer; transition:all .18s; padding:0;
}
.cb:focus-visible { outline:2px solid var(--sage); outline-offset:2px; }
.cb.cbon { background:var(--sage); border-color:var(--sage); }
.pr-body { flex:1; min-width:0; }
.pr-label { font-size:14.5px; font-weight:500; margin-bottom:1px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.pr-time { font-size:12px; color:var(--muted); font-variant-numeric:tabular-nums; }
.tag { font-size:10px; text-transform:uppercase; letter-spacing:.08em; font-weight:600; color:#8A6A33; flex-shrink:0; }
.e-row {
  display:flex; align-items:center; gap:8px; background:var(--card);
  border:1px solid var(--line); border-radius:10px; padding:10px; margin-bottom:6px; box-shadow:var(--sh);
}
.move-col { display:flex; flex-direction:column; gap:2px; flex-shrink:0; }
.mv-btn {
  width:22px; height:22px; background:transparent; border:1px solid var(--line); border-radius:5px;
  display:flex; align-items:center; justify-content:center; cursor:pointer; color:var(--muted); padding:0;
  transition:border-color .15s,color .15s;
}
.mv-btn:hover:not(:disabled) { border-color:var(--sage); color:var(--sage); }
.mv-btn:disabled { opacity:.25; cursor:not-allowed; }
.mv-btn:focus-visible { outline:2px solid var(--sage); }
.e-fields { flex:1; min-width:0; }
.e-label {
  display:block; width:100%; font-family:inherit; font-size:14px; font-weight:500; color:var(--ink);
  border:1px solid transparent; border-radius:6px; padding:3px 6px; background:transparent; margin-bottom:5px;
  transition:border-color .15s,background .15s;
}
.e-label:hover { border-color:var(--line); }
.e-label:focus { outline:none; border-color:var(--sage); background:#fff; }
.e-sub { display:flex; align-items:center; gap:4px; flex-wrap:wrap; }
.e-type {
  font-family:inherit; font-size:11px; color:var(--muted); border:1px solid var(--line);
  border-radius:5px; padding:3px 5px; background:transparent; cursor:pointer;
}
.e-type:focus-visible { outline:2px solid var(--sage); }
.e-time {
  font-family:inherit; font-size:12px; color:var(--ink);
  border:1px solid var(--line); border-radius:5px; padding:3px 5px; background:transparent;
}
.e-time:focus-visible { outline:2px solid var(--sage); }
.e-dash { font-size:12px; color:var(--muted); }
.del-btn {
  background:transparent; border:1px solid transparent; border-radius:7px; color:var(--muted);
  width:32px; height:32px; flex-shrink:0; display:flex; align-items:center; justify-content:center;
  cursor:pointer; padding:0; transition:color .15s,border-color .15s,background .15s;
}
.del-btn:hover { color:var(--red); border-color:#D8A89A; background:var(--red-lt); }
.del-btn:focus-visible { outline:2px solid var(--red); }
.add-wrap { margin-top:10px; }
.add-btn {
  display:flex; align-items:center; justify-content:center; gap:7px; width:100%;
  background:transparent; border:1.5px dashed var(--line); border-radius:10px; padding:13px;
  color:var(--muted); font-family:inherit; font-size:13.5px; cursor:pointer;
  transition:border-color .18s,color .18s;
}
.add-btn:hover { border-color:var(--sage); color:var(--sage); }
.add-btn:focus-visible { outline:2px solid var(--sage); }
.add-card { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:14px; box-shadow:var(--sh); }
.add-hdg { font-size:10.5px; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); margin-bottom:8px; }
.add-actions { display:flex; gap:8px; justify-content:flex-end; margin-top:12px; }
.motto { text-align:center; margin-top:36px; font-family:'Lora',Georgia,serif; font-style:italic; font-size:12.5px; color:var(--muted); letter-spacing:.02em; }
@media (prefers-reduced-motion:reduce) { * { animation-duration:.001ms !important; transition-duration:.001ms !important; } }
`;
