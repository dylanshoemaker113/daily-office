import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Flame, Pencil, Check, Plus, Trash2, ChevronUp, ChevronDown, X,
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

const WAKE_MIN = 420; // 7:00 AM anchor

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
   STORAGE  (localStorage)
═══════════════════════════════════════════ */

function sg(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function ss(key, val) {
  try { localStorage.setItem(key, val); } catch {}
}

/* ═══════════════════════════════════════════
   COMPONENT
═══════════════════════════════════════════ */

export default function DailyOffice() {
  const [schedules, setSchedules] = useState(() => {
    const raw = sg("do-schedules");
    try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
  });
  const [checklist, setChecklist] = useState(() => {
    const raw = sg(`do-cl:${dateKey()}`);
    try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
  });
  const [doneDates, setDoneDates] = useState(() => {
    const raw = sg("do-done-dates");
    try { return raw ? new Set(JSON.parse(raw)) : new Set(); } catch { return new Set(); }
  });
  const [viewDay,  setViewDay]  = useState(new Date().getDay());
  const [editMode, setEditMode] = useState(false);
  const [draft,    setDraft]    = useState(null);
  const [saved,    setSaved]    = useState(false);
  const [now,      setNow]      = useState(new Date());
  const saveTmr = useRef(null);

  const todayIdx  = now.getDay();
  const todayKey  = dateKey(now);
  const isToday   = viewDay === todayIdx;
  const items     = schedules[viewDay] ?? DEFAULT_ITEMS;
  const prayers   = items.filter(i => i.type === "prayer").map(i => i.id);
  const doneCount = isToday ? prayers.filter(id => checklist[id]).length : 0;
  const streakN   = calcStreak(doneDates, todayKey);

  // Clock tick
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const flash = useCallback(() => {
    setSaved(true);
    clearTimeout(saveTmr.current);
    saveTmr.current = setTimeout(() => setSaved(false), 1400);
  }, []);

  const saveDay = useCallback((dayIdx, next) => {
    const s = { ...schedules, [dayIdx]: next };
    setSchedules(s);
    ss("do-schedules", JSON.stringify(s));
    flash();
  }, [schedules, flash]);

  const toggle = useCallback((id) => {
    const next = { ...checklist, [id]: !checklist[id] };
    setChecklist(next);
    ss(`do-cl:${todayKey}`, JSON.stringify(next));
    const tp = (schedules[todayIdx] ?? DEFAULT_ITEMS).filter(i => i.type === "prayer").map(i => i.id);
    const allDone = tp.every(pid => next[pid]);
    const dd = new Set(doneDates);
    allDone ? dd.add(todayKey) : dd.delete(todayKey);
    setDoneDates(dd);
    ss("do-done-dates", JSON.stringify([...dd]));
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

  return (
    <div className="page">
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
                <div className="e-sub" style={{ marginTop:"8px" }}>
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
