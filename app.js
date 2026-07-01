/* ═══════════════════════════════════════════
   DAILY OFFICE — vanilla JS port (no build step)
═══════════════════════════════════════════ */

(function () {
  "use strict";

  /* ── CONSTANTS ── */
  const DAYS_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const DAYS_LONG  = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

  let _uid = 0;
  const uid = () => `item_${Date.now()}_${_uid++}`;

  // Fallback copy in case data.json can't be fetched (e.g. opened via file://)
  const FALLBACK_DEFAULT_ITEMS = [
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

  let DEFAULT_ITEMS = FALLBACK_DEFAULT_ITEMS;

  /* ── TIME UTILITIES ── */
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

  /* ── STORAGE (localStorage) ── */
  function sg(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  function ss(key, val) {
    try { localStorage.setItem(key, val); } catch {}
  }

  /* ── ICON HELPER (lucide) ── */
  function icon(name, size) {
    return `<i data-lucide="${name}" style="width:${size}px;height:${size}px"></i>`;
  }
  function renderIcons() {
    if (window.lucide) window.lucide.createIcons();
  }

  /* ── HTML ESCAPE ── */
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[c]));
  }

  /* ═══════════════════════════════════════════
     STATE
  ═══════════════════════════════════════════ */

  const state = {
    schedules: (() => {
      const raw = sg("do-schedules");
      try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
    })(),
    checklist: (() => {
      const raw = sg(`do-cl:${dateKey()}`);
      try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
    })(),
    doneDates: (() => {
      const raw = sg("do-done-dates");
      try { return raw ? new Set(JSON.parse(raw)) : new Set(); } catch { return new Set(); }
    })(),
    viewDay: new Date().getDay(),
    editMode: false,
    draft: null,
    saved: false,
    now: new Date(),
  };

  let saveTmr = null;
  const root = document.getElementById("root");

  /* ═══════════════════════════════════════════
     ACTIONS
  ═══════════════════════════════════════════ */

  function flash() {
    state.saved = true;
    const el = root.querySelector(".saved-txt");
    if (el) el.classList.add("show");
    clearTimeout(saveTmr);
    saveTmr = setTimeout(() => {
      state.saved = false;
      const el2 = root.querySelector(".saved-txt");
      if (el2) el2.classList.remove("show");
    }, 1400);
  }

  function saveDay(dayIdx, next, opts = {}) {
    state.schedules = { ...state.schedules, [dayIdx]: next };
    ss("do-schedules", JSON.stringify(state.schedules));
    flash();
    if (!opts.silent) render();
  }

  function toggle(id) {
    const todayIdx = state.now.getDay();
    const todayKey = dateKey(state.now);
    const next = { ...state.checklist, [id]: !state.checklist[id] };
    state.checklist = next;
    ss(`do-cl:${todayKey}`, JSON.stringify(next));
    const tp = (state.schedules[todayIdx] ?? DEFAULT_ITEMS).filter(i => i.type === "prayer").map(i => i.id);
    const allDone = tp.every(pid => next[pid]);
    const dd = new Set(state.doneDates);
    allDone ? dd.add(todayKey) : dd.delete(todayKey);
    state.doneDates = dd;
    ss("do-done-dates", JSON.stringify([...dd]));
    flash();
    render();
  }

  function updField(items, id, field, val, silent) {
    saveDay(state.viewDay, items.map(i => i.id === id ? { ...i, [field]: val } : i), { silent });
  }

  function delItem(items, id) {
    saveDay(state.viewDay, items.filter(i => i.id !== id));
  }

  function moveItem(items, id, dir) {
    const idx = items.findIndex(i => i.id === id);
    if (idx < 0) return;
    const ni = idx + dir;
    if (ni < 0 || ni >= items.length) return;
    const n = [...items];
    [n[idx], n[ni]] = [n[ni], n[idx]];
    saveDay(state.viewDay, n);
  }

  function addItem(items) {
    if (!state.draft || !state.draft.label.trim()) return;
    saveDay(state.viewDay, [...items, {
      id: uid(), label: state.draft.label.trim(),
      type: state.draft.type, start: state.draft.start || "08:00", end: state.draft.end || null,
    }]);
    state.draft = null;
  }

  /* ═══════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════ */

  function render() {
    const now = state.now;
    const todayIdx = now.getDay();
    const todayKey = dateKey(now);
    const isToday  = state.viewDay === todayIdx;
    const items    = state.schedules[state.viewDay] ?? DEFAULT_ITEMS;
    const prayers  = items.filter(i => i.type === "prayer").map(i => i.id);
    const doneCount = isToday ? prayers.filter(id => state.checklist[id]).length : 0;
    const streakN  = calcStreak(state.doneDates, todayKey);

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

    /* ── header ── */
    let html = `
      <header class="hdr">
        <div>
          <p class="eyebrow">Daily Office</p>
          <h1 class="page-title">${DAYS_LONG[state.viewDay]}</h1>
        </div>
        <div class="streak-chip" title="Consecutive days with all prayers kept">
          ${icon("flame", 13)}
          <span>${streakN} day${streakN !== 1 ? "s" : ""}</span>
        </div>
      </header>

      <nav class="day-nav" role="tablist" aria-label="Select day">
        ${DAYS_SHORT.map((d, i) => `
          <button role="tab" aria-selected="${state.viewDay === i}" data-action="set-day" data-day="${i}"
            class="day-tab${state.viewDay === i ? " sel" : ""}${i === todayIdx ? " today" : ""}">
            ${d}
            ${i === todayIdx ? `<span class="today-dot" aria-hidden="true"></span>` : ""}
          </button>
        `).join("")}
      </nav>
    `;

    if (isToday && prayers.length > 0) {
      html += `
        <div class="progress-wrap">
          <div class="beads" aria-hidden="true">
            ${prayers.map(id => `<div class="bead${state.checklist[id] ? " on" : ""}"></div>`).join("")}
          </div>
          <span class="progress-txt">${doneCount} of ${prayers.length} kept today</span>
        </div>
      `;
    } else if (isToday && prayers.length === 0) {
      html += `<p class="no-prayers-hint">No prayers scheduled — add some in Edit mode.</p>`;
    }

    html += `
      <div class="toolbar">
        <span class="saved-txt${state.saved ? " show" : ""}" aria-live="polite">Saved ✓</span>
        ${!isToday && !state.editMode ? `<span class="other-day-note">Viewing ${DAYS_SHORT[state.viewDay]}'s schedule</span>` : ""}
        <button class="ibtn${state.editMode ? " act" : ""}" data-action="toggle-edit">
          ${state.editMode ? `${icon("check", 13)} Done` : `${icon("pencil", 13)} Edit`}
        </button>
      </div>
    `;

    /* ── timeline ── */
    html += `<div class="timeline${state.editMode ? " edit-mode" : ""}">`;

    withStatus.forEach(item => {
      const done = isToday && !!state.checklist[item.id];
      const cur  = item.status === "current";
      const nxt  = item.id === nextId;

      if (state.editMode) {
        html += `
          <div class="e-row" data-id="${esc(item.id)}">
            <div class="move-col">
              <button class="mv-btn" data-action="move-up" data-id="${esc(item.id)}" ${item._first ? "disabled" : ""} aria-label="Move up">${icon("chevron-up", 14)}</button>
              <button class="mv-btn" data-action="move-down" data-id="${esc(item.id)}" ${item._last ? "disabled" : ""} aria-label="Move down">${icon("chevron-down", 14)}</button>
            </div>
            <div class="e-fields">
              <input class="e-label" data-action="field-label" data-id="${esc(item.id)}" value="${esc(item.label)}" placeholder="Label" aria-label="Item label" />
              <div class="e-sub">
                <select class="e-type" data-action="field-type" data-id="${esc(item.id)}" aria-label="Type">
                  <option value="prayer" ${item.type === "prayer" ? "selected" : ""}>Prayer ✦</option>
                  <option value="event" ${item.type === "event" ? "selected" : ""}>Event</option>
                </select>
                <input type="time" class="e-time" data-action="field-start" data-id="${esc(item.id)}" value="${esc(item.start)}" aria-label="Start"/>
                <span class="e-dash">–</span>
                <input type="time" class="e-time" data-action="field-end" data-id="${esc(item.id)}" value="${esc(item.end ?? "")}" aria-label="End"/>
              </div>
            </div>
            <button class="del-btn" data-action="delete" data-id="${esc(item.id)}" aria-label="Delete ${esc(item.label)}">${icon("trash-2", 14)}</button>
          </div>
        `;
        return;
      }

      if (item.type === "event") {
        html += `
          <div class="ev-row">
            <div class="ev-dot" aria-hidden="true"></div>
            <span class="ev-time">${fmt(item.start)}${item.end ? `–${fmt(item.end)}` : ""}</span>
            <span class="ev-label">${esc(item.label)}</span>
          </div>
        `;
        return;
      }

      html += `
        <div class="pr-wrap${done ? " done" : ""}${cur ? " cur-wrap" : ""}">
          <div class="pr-node${done ? " nd-done" : ""}${cur ? " nd-cur" : ""}" aria-hidden="true"></div>
          <div class="pr-card${cur ? " c-cur" : ""}${nxt ? " c-nxt" : ""}">
            ${isToday ? `
              <button class="cb${done ? " cbon" : ""}" data-action="toggle" data-id="${esc(item.id)}"
                aria-label="${done ? "Unmark" : "Mark"} ${esc(item.label)} done" aria-pressed="${done}">
                ${done ? icon("check", 12) : ""}
              </button>
            ` : ""}
            <div class="pr-body">
              <p class="pr-label">${esc(item.label)}</p>
              <span class="pr-time">${fmt(item.start)}${item.end ? `–${fmt(item.end)}` : ""}</span>
            </div>
            ${cur ? `<span class="tag">Now</span>` : (nxt ? `<span class="tag">Next</span>` : "")}
          </div>
        </div>
      `;
    });

    if (state.editMode) {
      html += `<div class="add-wrap">`;
      if (state.draft === null) {
        html += `
          <button class="add-btn" data-action="start-add">${icon("plus", 14)} Add item</button>
        `;
      } else {
        html += `
          <div class="add-card">
            <p class="add-hdg">New Item</p>
            <input class="e-label" id="draft-label" autofocus placeholder="e.g. Morning Prayer" value="${esc(state.draft.label)}" aria-label="New item label" />
            <div class="e-sub" style="margin-top:8px">
              <select class="e-type" id="draft-type" aria-label="Type">
                <option value="prayer" ${state.draft.type === "prayer" ? "selected" : ""}>Prayer ✦</option>
                <option value="event" ${state.draft.type === "event" ? "selected" : ""}>Event</option>
              </select>
              <input type="time" class="e-time" id="draft-start" value="${esc(state.draft.start)}"/>
              <span class="e-dash">–</span>
              <input type="time" class="e-time" id="draft-end" value="${esc(state.draft.end ?? "")}"/>
            </div>
            <div class="add-actions">
              <button class="ibtn" data-action="cancel-add">${icon("x", 13)} Cancel</button>
              <button class="ibtn act" data-action="confirm-add" ${!state.draft.label.trim() ? "disabled" : ""}>${icon("check", 13)} Add</button>
            </div>
          </div>
        `;
      }
      html += `</div>`;
    }

    html += `</div>`; // .timeline

    html += `<p class="motto">Ora et labora</p>`;

    root.innerHTML = html;
    renderIcons();
    wireInputs(items);
    focusDraftIfNeeded();
  }

  /* Keep the "New Item" label input focused across keystrokes without a
     full re-render on every character. */
  function focusDraftIfNeeded() {
    const el = document.getElementById("draft-label");
    if (el && state._focusDraft) {
      el.focus();
      const v = el.value; el.value = ""; el.value = v; // cursor to end
    }
  }

  /* Attach input/change listeners that update state WITHOUT a full
     re-render, so text fields keep focus while typing. */
  function wireInputs(items) {
    root.querySelectorAll('[data-action="field-label"]').forEach(el => {
      el.addEventListener("input", e => updField(items, el.dataset.id, "label", e.target.value, true));
    });
    root.querySelectorAll('[data-action="field-start"]').forEach(el => {
      el.addEventListener("change", e => updField(items, el.dataset.id, "start", e.target.value));
    });
    root.querySelectorAll('[data-action="field-end"]').forEach(el => {
      el.addEventListener("change", e => updField(items, el.dataset.id, "end", e.target.value || null));
    });
    root.querySelectorAll('[data-action="field-type"]').forEach(el => {
      el.addEventListener("change", e => updField(items, el.dataset.id, "type", e.target.value));
    });

    const dl = document.getElementById("draft-label");
    if (dl) {
      dl.addEventListener("input", e => { state.draft.label = e.target.value; state._focusDraft = true; softRefreshAddButton(); });
      dl.addEventListener("keydown", e => { if (e.key === "Enter") { addItem(items); render(); } });
    }
    const dt = document.getElementById("draft-type");
    if (dt) dt.addEventListener("change", e => { state.draft.type = e.target.value; });
    const ds = document.getElementById("draft-start");
    if (ds) ds.addEventListener("change", e => { state.draft.start = e.target.value; });
    const de = document.getElementById("draft-end");
    if (de) de.addEventListener("change", e => { state.draft.end = e.target.value || null; });
  }

  // Enable/disable the "Add" button live as the draft label is typed,
  // without re-rendering the whole tree (would drop input focus).
  function softRefreshAddButton() {
    const btn = root.querySelector('[data-action="confirm-add"]');
    if (btn) btn.disabled = !state.draft.label.trim();
  }

  /* ═══════════════════════════════════════════
     EVENT DELEGATION (clicks)
  ═══════════════════════════════════════════ */

  root.addEventListener("click", e => {
    const btn = e.target.closest("[data-action]");
    if (!btn || btn.disabled) return;
    const action = btn.dataset.action;
    const items = state.schedules[state.viewDay] ?? DEFAULT_ITEMS;

    switch (action) {
      case "set-day":
        state.viewDay = Number(btn.dataset.day);
        state.editMode = false;
        state.draft = null;
        render();
        break;
      case "toggle-edit":
        state.editMode = !state.editMode;
        state.draft = null;
        render();
        break;
      case "toggle":
        toggle(btn.dataset.id);
        break;
      case "move-up":
        moveItem(items, btn.dataset.id, -1);
        break;
      case "move-down":
        moveItem(items, btn.dataset.id, 1);
        break;
      case "delete":
        delItem(items, btn.dataset.id);
        break;
      case "start-add":
        state.draft = { label:"", type:"prayer", start:"08:00", end:"08:30" };
        state._focusDraft = true;
        render();
        break;
      case "cancel-add":
        state.draft = null;
        render();
        break;
      case "confirm-add":
        addItem(items);
        render();
        break;
    }
  });

  /* ═══════════════════════════════════════════
     CLOCK TICK
  ═══════════════════════════════════════════ */

  setInterval(() => {
    state.now = new Date();
    render();
  }, 30_000);

  /* ═══════════════════════════════════════════
     INIT — load default schedule from data.json, then render
  ═══════════════════════════════════════════ */

  fetch("data.json")
    .then(r => r.ok ? r.json() : Promise.reject())
    .then(d => { if (Array.isArray(d.defaultItems)) DEFAULT_ITEMS = d.defaultItems; })
    .catch(() => { DEFAULT_ITEMS = FALLBACK_DEFAULT_ITEMS; })
    .finally(render);

})();
