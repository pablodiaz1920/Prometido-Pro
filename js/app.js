// Prometido Pro — lógica principal.
// Local primero: todo se guarda en el celular (localStorage) y funciona sin internet.
// La nube (Firebase) es opcional y se configura desde ⚙️.
'use strict';

/* ==========================================================================
   1. Utilidades
   ========================================================================== */
const $ = (id) => document.getElementById(id);
const nowISO = () => new Date().toISOString();

function formatLongDate(d) {
  return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
function formatShortDate(d) {
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}
function escapeHTML(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/* ==========================================================================
   2. Estado y autoguardado local
   ========================================================================== */
const STORAGE_KEY = 'prometido_pro_state';
const SCHEMA_VERSION = 3;
const PARTNER_LABELS = ['Prometida', 'Esposa', 'Novia', 'Pareja'];

const DEFAULT_CONFIG = {
  fiancéeName: 'Mi Prometida',
  partnerLabel: 'Prometida',
  lastPeriodDate: toISODate(addDays(new Date(), -4)),
  cycleLength: 28,
  periodDuration: 5,
  notifyEnabled: false,
  notifyTime: '08:30',
  updatedAt: null
};

function defaultState() {
  return {
    version: SCHEMA_VERSION,
    config: { ...DEFAULT_CONFIG },
    notes: DEFAULT_NOTES.map((n) => ({ ...n, createdAt: '2026-01-01T00:00:00.000Z' })),
    missionsLog: {},   // { 'YYYY-MM-DD': { w1: true, _t: ISO } }
    dailyLog: {},      // { 'YYYY-MM-DD': { flow, mood, energy, symptoms: [], text, updatedAt } }
    periodHistory: [], // ['YYYY-MM-DD', ...]
    tombstones: {},    // { 'note:id': ISO, 'period:YYYY-MM-DD': ISO } — borrados (para la nube)
    updatedAt: null
  };
}

let state = defaultState();

// Convierte datos viejos, importados o de la nube al formato actual
function normalizeState(raw) {
  const s = defaultState();
  if (!raw || typeof raw !== 'object') return s;
  if (raw.config && typeof raw.config === 'object') s.config = { ...DEFAULT_CONFIG, ...raw.config };
  if (!PARTNER_LABELS.includes(s.config.partnerLabel)) s.config.partnerLabel = 'Prometida';
  if (Array.isArray(raw.notes)) s.notes = raw.notes.filter((n) => n && n.id && n.title);
  if (raw.missionsLog && typeof raw.missionsLog === 'object') s.missionsLog = raw.missionsLog;
  if (raw.dailyLog && typeof raw.dailyLog === 'object') s.dailyLog = raw.dailyLog;
  if (raw.tombstones && typeof raw.tombstones === 'object') s.tombstones = raw.tombstones;
  if (Array.isArray(raw.periodHistory)) {
    s.periodHistory = [...new Set(raw.periodHistory.filter((d) => parseISODate(d)))].sort();
  }
  s.updatedAt = raw.updatedAt || null;
  if (s.config.lastPeriodDate && !s.periodHistory.includes(s.config.lastPeriodDate)) {
    s.periodHistory.push(s.config.lastPeriodDate);
    s.periodHistory.sort();
  }
  return s;
}

const Store = {
  timer: null,
  available: true,

  load() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        state = normalizeState(JSON.parse(saved));
        return true;
      }
      const legacy = sessionStorage.getItem('prometido_pro_data');
      if (legacy) {
        state = normalizeState(JSON.parse(legacy));
        this.saveNow();
        return true;
      }
    } catch (e) {
      console.warn('No se pudo leer el guardado local:', e);
      this.available = false;
    }
    state = normalizeState(state);
    return false;
  },

  // Autoguardado: agrupa cambios seguidos y guarda a los 300 ms
  save() {
    setSyncStatus('saving');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.saveNow(), 300);
  },

  saveNow({ fromCloud = false } = {}) {
    clearTimeout(this.timer);
    this.timer = null;
    try {
      if (!fromCloud) state.updatedAt = nowISO();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      this.available = true;
      setSyncStatus('saved');
      publishStateForWorker();
      if (!fromCloud) CloudSync.schedule();
    } catch (e) {
      console.error('Error al guardar:', e);
      this.available = false;
      setSyncStatus('error');
    }
  },

  flush() {
    if (this.timer) this.saveNow();
  }
};

async function requestPersistentStorage() {
  try {
    if (navigator.storage && navigator.storage.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch (e) { /* no soportado */ }
}

let cloudStatus = 'off';
function setSyncStatus(status) {
  const badge = $('syncStatusBadge');
  const text = $('syncStatusText');
  const dot = $('syncStatusDot');
  if (!badge) return;
  const base = 'flex items-center gap-1.5 text-[10px] font-mono px-2 py-1 rounded-full border';
  const tone = {
    amber: ['bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800', 'bg-amber-500 animate-pulse'],
    rose: ['bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800', 'bg-rose-500'],
    emerald: ['bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800', 'bg-emerald-500'],
    sky: ['bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800', 'bg-sky-500']
  };
  const apply = (color, label) => {
    badge.className = `${base} ${tone[color][0]}`;
    dot.className = `w-1.5 h-1.5 rounded-full ${tone[color][1]}`;
    text.textContent = label;
  };
  if (status === 'saving') return apply('amber', 'Guardando…');
  if (status === 'error') return apply('rose', 'Sin guardar');
  // Guardado local OK: muestra además el estado de la nube si está activa
  if (cloudStatus === 'syncing') return apply('sky', '☁️ Sincronizando…');
  if (cloudStatus === 'synced') return apply('sky', '☁️ Sincronizado');
  if (cloudStatus === 'error') return apply('amber', '☁️ Error nube');
  if (cloudStatus === 'offline') return apply('emerald', 'Guardado · sin red');
  const t = state.updatedAt ? new Date(state.updatedAt) : null;
  apply('emerald', t ? `Guardado ${pad2(t.getHours())}:${pad2(t.getMinutes())}` : 'Guardado');
}

/* ==========================================================================
   3. Ciclo
   ========================================================================== */
const calculateCycleState = (date = new Date()) => cycleStateFor(state.config, date);

function cycleGaps() {
  const h = state.periodHistory;
  const gaps = [];
  for (let i = 1; i < h.length; i++) {
    const len = daysBetween(h[i - 1], parseISODate(h[i]));
    if (len >= 15 && len <= 60) gaps.push({ start: h[i - 1], end: h[i], len });
  }
  return gaps;
}

function averageCycleFromHistory() {
  const gaps = cycleGaps().filter((g) => g.len >= 20 && g.len <= 45).slice(-6);
  if (!gaps.length) return null;
  return { avg: Math.round(gaps.reduce((a, g) => a + g.len, 0) / gaps.length), samples: gaps.length };
}

/* ==========================================================================
   4. Pantalla principal
   ========================================================================== */
function updateDashboard() {
  const s = calculateCycleState(new Date());
  const p = s.phase;

  $('badgeFiancéeName').textContent = `${state.config.partnerLabel}: ${state.config.fiancéeName}`;
  $('badgeCycleDay').textContent = `Día ${s.dayInCycle} de ${s.cycleLen}`;
  $('badgeNextPeriod').textContent = s.daysToNextPeriod === 1
    ? '🩸 Regla prevista: mañana'
    : `🩸 Próxima regla en ${s.daysToNextPeriod} días`;

  const shield = $('statusShield');
  shield.textContent = p.shield;
  shield.className = `text-xs font-semibold px-2.5 py-1 rounded-full border ${p.shieldClass}`;

  $('phaseTitle').textContent = p.title;
  $('phaseSubtitle').textContent = `${p.alias} — ${p.summary}`;
  $('statBattery').textContent = p.battery;
  $('statSensitivity').textContent = p.sensitivity;
  $('statCraving').textContent = p.craving;
  $('statSecretion').textContent = p.secretionBadge;
  $('goldenRuleText').textContent = `"${p.goldenRule}"`;
  $('heroCard').className = `relative overflow-hidden rounded-3xl p-4 sm:p-7 transition-all duration-300 border glass-card shadow-sm ${p.cardClass}`;

  document.querySelectorAll('[data-range]').forEach((el) => {
    const [from, to] = s.params.ranges[el.dataset.range];
    el.textContent = from === to ? `Día ${from}` : `Días ${from}-${to}`;
  });

  renderMissions();
  renderDailyLog();
  renderCalendar();
  renderNotes();
  renderTranslation();
  runSimulation();
  renderStats();
}

/* ---------- Misiones (3 al día, rotan cada día) ---------- */
function renderMissions() {
  const phase = calculateCycleState(new Date()).phase;
  const today = todayISO();
  const missions = dailyMissions(phase, today);
  const done = state.missionsLog[today] || {};
  const container = $('missionsContainer');
  let completed = 0;
  container.innerHTML = '';

  missions.forEach((m) => {
    const isDone = done[m.id] === true;
    if (isDone) completed++;
    const item = document.createElement('label');
    item.className = `p-3 sm:p-3.5 rounded-2xl border transition-all flex items-start gap-3 cursor-pointer select-none ${
      isDone
        ? 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800'
        : 'bg-white/80 dark:bg-slate-900/80 border-slate-200 dark:border-slate-800 hover:border-rose-300'
    }`;
    item.innerHTML = `
      <input type="checkbox" ${isDone ? 'checked' : ''} class="mt-0.5 w-4 h-4 rounded accent-rose-600 cursor-pointer">
      <p class="flex-1 text-xs sm:text-sm font-semibold ${isDone ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-slate-200'}">${escapeHTML(m.text)}</p>
      <span class="text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${isDone ? 'bg-emerald-200 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}">
        ${isDone ? '+50 Pts' : 'Pendiente'}
      </span>`;
    item.querySelector('input').addEventListener('change', () => toggleMission(m.id));
    container.appendChild(item);
  });

  $('missionCounter').textContent = `${completed}/${missions.length} completadas`;
  renderStreak();
}

function toggleMission(id) {
  const key = todayISO();
  const day = state.missionsLog[key] || (state.missionsLog[key] = {});
  day[id] = day[id] !== true;
  day._t = nowISO();
  playChime(day[id] ? 'success' : 'pop');
  Store.save();
  renderMissions();
}

const dayHasMission = (iso) => {
  const d = state.missionsLog[iso];
  return !!d && Object.entries(d).some(([k, v]) => k !== '_t' && v === true);
};

function totalMissionsDone() {
  return Object.values(state.missionsLog).reduce((acc, d) => acc + Object.entries(d).filter(([k, v]) => k !== '_t' && v === true).length, 0);
}

function renderStreak() {
  let streak = 0;
  let d = new Date();
  if (!dayHasMission(toISODate(d))) d = addDays(d, -1);
  while (dayHasMission(toISODate(d))) {
    streak++;
    d = addDays(d, -1);
  }
  const el = $('missionStreak');
  el.textContent = streak > 0 ? `🔥 Racha: ${streak} día${streak === 1 ? '' : 's'}` : '';
  el.classList.toggle('hidden', streak === 0);
}

/* ---------- Bitácora diaria ---------- */
const FLOW_OPTIONS = [
  ['none', 'Nada'], ['spotting', 'Manchado'], ['light', 'Ligero'], ['medium', 'Medio'], ['heavy', 'Abundante']
];
const MOOD_OPTIONS = [[1, '😢', 'Muy mal'], [2, '😕', 'Mal'], [3, '😐', 'Normal'], [4, '🙂', 'Bien'], [5, '😄', 'Genial']];
const ENERGY_OPTIONS = [[1, '🪫', 'Agotada'], [2, '🔋', 'Baja'], [3, '🔋🔋', 'Media'], [4, '⚡', 'Alta'], [5, '🚀', 'A tope']];
const SYMPTOMS = {
  cramps: '🤕 Cólicos', headache: '🤯 Dolor de cabeza', bloating: '🎈 Hinchazón', fatigue: '😴 Cansancio',
  cravings: '🍫 Antojos', breasts: '💗 Senos sensibles', acne: '🔴 Granitos', backpain: '🦴 Dolor de espalda',
  irritable: '⚡ Irritable', anxious: '😰 Ansiosa', sad: '🥺 Sensible / triste', insomnia: '🌙 Insomnio',
  libido: '🔥 Libido alta', nausea: '🤢 Náuseas'
};
const BLEEDING_FLOWS = ['light', 'medium', 'heavy'];

let logDate = new Date();
let logTextTimer = null;

function currentLog() {
  return state.dailyLog[toISODate(logDate)] || {};
}

function updateLog(patch) {
  const key = toISODate(logDate);
  const entry = { symptoms: [], ...(state.dailyLog[key] || {}), ...patch, updatedAt: nowISO() };
  const empty = !entry.flow && !entry.mood && !entry.energy && !entry.symptoms.length && !entry.text;
  if (empty) delete state.dailyLog[key];
  else state.dailyLog[key] = entry;
  Store.save();
}

function chip(selected, label, attrs, title = '') {
  return `<button type="button" ${attrs} ${title ? `title="${title}" aria-label="${title}"` : ''} aria-pressed="${selected}" class="px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all active:scale-95 ${
    selected
      ? 'bg-rose-600 border-rose-600 text-white shadow-sm'
      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-rose-300'
  }">${label}</button>`;
}

function renderDailyLog() {
  const iso = toISODate(logDate);
  const isToday = iso === todayISO();
  const entry = currentLog();
  const s = calculateCycleState(logDate);

  $('logDateLabel').textContent = isToday ? 'Hoy' : formatLongDate(logDate);
  $('logDateMeta').textContent = `Día ${s.dayInCycle} · ${PHASE_SHORT[s.phase.id]}`;
  $('logNextBtn').disabled = isToday;
  $('logTodayBtn').classList.toggle('hidden', isToday);

  $('logFlow').innerHTML = FLOW_OPTIONS.map(([v, l]) => chip(entry.flow === v, l, `data-log-flow="${v}"`)).join('');
  $('logMood').innerHTML = MOOD_OPTIONS.map(([v, e, l]) => chip(entry.mood === v, e, `data-log-mood="${v}"`, l)).join('');
  $('logEnergy').innerHTML = ENERGY_OPTIONS.map(([v, e, l]) => chip(entry.energy === v, `${e} <span class="hidden sm:inline">${l}</span>`, `data-log-energy="${v}"`, l)).join('');
  const sym = entry.symptoms || [];
  $('logSymptoms').innerHTML = Object.entries(SYMPTOMS).map(([k, l]) => chip(sym.includes(k), l, `data-log-symptom="${k}"`)).join('');
  if (document.activeElement !== $('logText')) $('logText').value = entry.text || '';

  // Sugerencia: si registra sangrado lejos de la fecha prevista, ofrece reiniciar el ciclo
  const suggest = BLEEDING_FLOWS.includes(entry.flow) && s.phase.id !== 'winter' && !state.periodHistory.includes(iso);
  $('logPeriodSuggest').classList.toggle('hidden', !suggest);
}

function onLogClick(e) {
  const b = e.target.closest('button');
  if (!b) return;
  const entry = currentLog();
  if (b.dataset.logFlow) updateLog({ flow: entry.flow === b.dataset.logFlow ? null : b.dataset.logFlow });
  else if (b.dataset.logMood) updateLog({ mood: entry.mood === +b.dataset.logMood ? null : +b.dataset.logMood });
  else if (b.dataset.logEnergy) updateLog({ energy: entry.energy === +b.dataset.logEnergy ? null : +b.dataset.logEnergy });
  else if (b.dataset.logSymptom) {
    const sym = new Set(entry.symptoms || []);
    sym.has(b.dataset.logSymptom) ? sym.delete(b.dataset.logSymptom) : sym.add(b.dataset.logSymptom);
    updateLog({ symptoms: [...sym] });
  } else return;
  playChime('pop');
  renderDailyLog();
  renderCalendar();
  renderStats();
}

function setLogDate(d) {
  logDate = d > new Date() ? new Date() : d;
  renderDailyLog();
}

/* ---------- Calendario ---------- */
let calendarDate = new Date();
let selectedCalendarDate = new Date();

const CAL_COLORS = {
  winter: 'bg-rose-100/70 dark:bg-rose-950/40 border-rose-300 dark:border-rose-900 text-rose-800 dark:text-rose-200',
  spring: 'bg-emerald-100/70 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200',
  summer: 'bg-amber-100/70 dark:bg-amber-950/40 border-amber-300 dark:border-amber-900 text-amber-800 dark:text-amber-200',
  autumn: 'bg-purple-100/70 dark:bg-purple-950/40 border-purple-300 dark:border-purple-900 text-purple-800 dark:text-purple-200'
};
const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function renderCalendar() {
  const grid = $('calendarGrid');
  grid.innerHTML = '';
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  $('calendarCurrentMonthTitle').textContent = `${MONTH_NAMES[month]} ${year}`;

  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let i = 0; i < offset; i++) {
    const empty = document.createElement('div');
    empty.className = 'h-14 sm:h-16 rounded-xl bg-slate-100/30 dark:bg-slate-900/20';
    grid.appendChild(empty);
  }

  const todayStr = todayISO();
  const selectedStr = toISODate(selectedCalendarDate);
  const logged = new Set(state.periodHistory);

  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day);
    const iso = toISODate(d);
    const cs = calculateCycleState(d);
    const isToday = iso === todayStr;
    const isSelected = iso === selectedStr;
    const hasLog = !!state.dailyLog[iso];

    const cell = document.createElement('button');
    cell.type = 'button';
    cell.setAttribute('aria-label', `${day} de ${MONTH_NAMES[month]}, día ${cs.dayInCycle} del ciclo, ${PHASE_SHORT[cs.phase.id]}${hasLog ? ', con bitácora' : ''}`);
    cell.className = `relative h-14 sm:h-16 p-1 rounded-xl border flex flex-col justify-between items-center transition-all active:scale-95 touch-manipulation ${CAL_COLORS[cs.phase.id]} ${
      isToday ? 'ring-2 ring-rose-500 shadow-md font-extrabold' : ''
    } ${isSelected && !isToday ? 'ring-2 ring-slate-500 dark:ring-slate-300' : ''}`;
    cell.innerHTML = `
      <div class="w-full flex items-center justify-between text-[10px]">
        <span class="font-bold">${day}</span>
        <span class="text-[9px] font-mono opacity-70">D${cs.dayInCycle}</span>
      </div>
      <span class="text-xs sm:text-sm">${logged.has(iso) ? '📍' : PHASE_EMOJI[cs.phase.id]}</span>
      <span class="text-[8px] uppercase font-bold tracking-tighter truncate w-full text-center">${isToday ? '★ Hoy' : PHASE_SHORT[cs.phase.id]}</span>
      ${hasLog ? '<span class="absolute bottom-0.5 right-1 w-1.5 h-1.5 rounded-full bg-slate-700 dark:bg-slate-200"></span>' : ''}`;
    cell.addEventListener('click', () => { selectedCalendarDate = d; renderCalendar(); });
    grid.appendChild(cell);
  }
  renderSelectedDay();
}

function renderSelectedDay() {
  const d = selectedCalendarDate;
  const iso = toISODate(d);
  const s = calculateCycleState(d);
  const p = s.phase;
  const log = state.dailyLog[iso];
  const isFuture = d > new Date();
  let logHtml = '';
  if (log) {
    const parts = [];
    if (log.flow) parts.push(`Flujo: ${FLOW_OPTIONS.find(([v]) => v === log.flow)[1]}`);
    if (log.mood) parts.push(`Ánimo: ${MOOD_OPTIONS[log.mood - 1][1]}`);
    if (log.energy) parts.push(`Energía: ${ENERGY_OPTIONS[log.energy - 1][2]}`);
    if (log.symptoms && log.symptoms.length) parts.push(log.symptoms.map((k) => SYMPTOMS[k]).filter(Boolean).join(', '));
    logHtml = `<div class="mt-2 p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
      <strong class="block text-[10px] uppercase text-slate-400 mb-0.5">📝 Bitácora de ese día</strong>
      <p>${escapeHTML(parts.join(' · '))}</p>${log.text ? `<p class="mt-1 italic">"${escapeHTML(log.text)}"</p>` : ''}
    </div>`;
  }
  $('calendarSelectedDayCard').innerHTML = `
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-2 border-b border-slate-200 dark:border-slate-800">
      <div>
        <span class="text-[10px] uppercase font-bold text-slate-400">Diagnóstico Táctico para:</span>
        <h4 class="font-bold text-sm sm:text-base capitalize text-slate-800 dark:text-slate-100">${formatLongDate(d)}</h4>
      </div>
      <div class="flex flex-wrap items-center gap-1.5 self-start sm:self-auto">
        <span class="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">Día ${s.dayInCycle} del Ciclo</span>
        <span class="text-xs font-bold px-2 py-0.5 rounded-md border ${p.shieldClass}">${p.title}</span>
      </div>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-slate-600 dark:text-slate-300">
      <div>
        <p><strong>Batería prevista:</strong> ${p.battery}</p>
        <p><strong>Sensibilidad:</strong> ${p.sensitivity}</p>
      </div>
      <div>
        <p><strong>Flujo estimado:</strong> ${p.secretionBadge}</p>
        <p><strong>Consejo de prometido:</strong> ${p.goldenRule}</p>
      </div>
    </div>
    ${logHtml}
    ${isFuture ? '' : `<button type="button" data-action="edit-log" data-date="${iso}" class="mt-2 w-full py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-rose-700 dark:text-rose-300 hover:border-rose-300">📝 ${log ? 'Editar' : 'Registrar'} bitácora de este día</button>`}`;
}

function changeCalendarMonth(delta) {
  calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + delta, 1);
  renderCalendar();
}
function goToTodayCalendar() {
  calendarDate = new Date();
  selectedCalendarDate = new Date();
  renderCalendar();
}

/* ---------- Dossier de notas (crear, editar, borrar, buscar) ---------- */
let currentNoteFilter = 'all';
let noteSearch = '';
let editingNoteId = null;

const NOTE_CATEGORIES = {
  loved: { label: '❤️ Le Encantó', class: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' },
  trigger: { label: '💣 Detonante', class: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  craving: { label: '🍫 Antojo Clave', class: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300' },
  quirk: { label: '💡 Manía / Rasgo', class: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' }
};
const NOTE_PHASE_LABEL = { ...PHASE_SHORT, all: 'Siempre' };
const normalizeText = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function renderNotes() {
  const container = $('notesContainer');
  const q = normalizeText(noteSearch);
  const filtered = state.notes.filter((n) =>
    (currentNoteFilter === 'all' || n.category === currentNoteFilter) &&
    (!q || normalizeText(`${n.title} ${n.content}`).includes(q))
  );
  $('countAllNotes').textContent = state.notes.length;
  container.innerHTML = '';

  if (!filtered.length) {
    container.innerHTML = `<div class="col-span-full py-8 text-center text-slate-400 text-xs">${q ? 'Ninguna nota coincide con la búsqueda.' : 'No hay anotaciones en esta categoría todavía. ¡Toca "Añadir Anotación" para guardar un gesto, antojo o detonante!'}</div>`;
    return;
  }

  filtered.forEach((n) => {
    const cat = NOTE_CATEGORIES[n.category] || NOTE_CATEGORIES.loved;
    const card = document.createElement('div');
    card.className = 'p-3.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-2';
    card.innerHTML = `
      <div class="flex items-center justify-between gap-1">
        <span class="text-[10px] font-bold px-2 py-0.5 rounded-md ${cat.class}">${cat.label}</span>
        <div class="flex items-center">
          <button type="button" data-note-edit class="text-slate-400 hover:text-rose-600 text-xs font-bold px-2 py-1 rounded transition-colors" title="Editar nota" aria-label="Editar nota">✎</button>
          <button type="button" data-note-delete class="text-slate-400 hover:text-rose-600 text-xs font-bold px-2 py-1 rounded transition-colors" title="Eliminar nota" aria-label="Eliminar nota">✕</button>
        </div>
      </div>
      <h4 class="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 leading-snug">${escapeHTML(n.title)}</h4>
      <p class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">${escapeHTML(n.content)}</p>
      <div class="pt-1 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400">
        Fase: <strong>${escapeHTML(NOTE_PHASE_LABEL[n.phase] || n.phase)}</strong>
      </div>`;
    card.querySelector('[data-note-edit]').addEventListener('click', () => openNoteModal(n.id));
    card.querySelector('[data-note-delete]').addEventListener('click', () => deleteNote(n.id));
    container.appendChild(card);
  });
}

function filterNotes(cat) {
  currentNoteFilter = cat;
  document.querySelectorAll('.note-filter-btn').forEach((btn) => {
    btn.className = btn.dataset.filter === cat
      ? 'note-filter-btn shrink-0 px-2.5 py-1 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-bold border border-rose-200 dark:border-rose-900'
      : 'note-filter-btn shrink-0 px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold border border-transparent';
  });
  renderNotes();
}

function openNoteModal(id = null) {
  editingNoteId = id;
  const n = id ? state.notes.find((x) => x.id === id) : null;
  $('noteForm').reset();
  $('noteModalTitle').textContent = n ? 'Editar Anotación' : 'Nueva Anotación en Dossier';
  $('noteSubmitBtn').textContent = n ? 'Guardar Cambios' : 'Guardar Nota';
  if (n) {
    $('noteCategory').value = n.category;
    $('notePhase').value = n.phase;
    $('noteTitle').value = n.title;
    $('noteContent').value = n.content === 'Sin detalles adicionales.' ? '' : n.content;
  }
  openModal('noteModal');
  setTimeout(() => $('noteTitle').focus(), 50);
}

function saveNoteEntry(e) {
  e.preventDefault();
  const title = $('noteTitle').value.trim();
  if (!title) return;
  let phase = $('notePhase').value;
  if (phase === 'current') phase = calculateCycleState(new Date()).phase.id;
  const fields = {
    category: $('noteCategory').value,
    phase,
    title,
    content: $('noteContent').value.trim() || 'Sin detalles adicionales.',
    updatedAt: nowISO()
  };
  const existing = editingNoteId && state.notes.find((n) => n.id === editingNoteId);
  if (existing) Object.assign(existing, fields);
  else state.notes.unshift({ id: 'note_' + Date.now(), createdAt: nowISO(), ...fields });

  Store.save();
  renderNotes();
  closeModal('noteModal');
  playChime('success');
  showToast(existing ? 'Nota actualizada' : 'Nota guardada en el dossier');
  editingNoteId = null;
}

function deleteNote(id) {
  const note = state.notes.find((n) => n.id === id);
  if (!note || !confirm(`¿Eliminar la nota "${note.title}"?`)) return;
  state.notes = state.notes.filter((n) => n.id !== id);
  state.tombstones[`note:${id}`] = nowISO();
  Store.save();
  renderNotes();
}

/* ---------- Traductor ---------- */
function populateTranslator() {
  $('phraseSelect').innerHTML = Object.entries(TRANSLATIONS)
    .map(([k, t], i) => `<option value="${k}">${i + 1}. ${escapeHTML(t.raw)}</option>`).join('');
}

function renderTranslation() {
  const t = TRANSLATIONS[$('phraseSelect').value];
  if (!t) return;
  $('translationOutput').innerHTML = `
    <div class="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
      <span class="text-[10px] uppercase font-bold text-slate-400 block">Significado real:</span>
      <p class="text-xs sm:text-sm font-semibold text-rose-600 dark:text-rose-400 mt-0.5">${t.real}</p>
    </div>
    <div class="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60">
      <span class="text-[10px] uppercase font-bold text-amber-800 dark:text-amber-300 block">⚠️ Trampa común:</span>
      <p class="text-xs text-slate-700 dark:text-slate-300 mt-0.5">${t.danger}</p>
    </div>
    <div class="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60">
      <span class="text-[10px] uppercase font-bold text-emerald-800 dark:text-emerald-300 block">💡 Jugada maestra recomendada:</span>
      <p class="text-xs text-slate-700 dark:text-slate-300 mt-0.5">${t.tactic}</p>
    </div>`;
}

/* ---------- Calculadora del futuro ---------- */
function runSimulation() {
  const target = parseISODate($('simDateInput').value);
  if (!target) return;
  const s = calculateCycleState(target);
  const p = s.phase;
  $('simResultCard').innerHTML = `
    <div class="flex items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-700">
      <div>
        <span class="text-[10px] font-bold uppercase text-slate-400">Pronóstico para el ${formatLongDate(target)}:</span>
        <h4 class="font-extrabold text-sm text-slate-800 dark:text-slate-100">${p.title}</h4>
      </div>
      <span class="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 whitespace-nowrap">Día ${s.dayInCycle}</span>
    </div>
    <p class="text-xs text-slate-600 dark:text-slate-300 mt-2">${p.summary}</p>
    <div class="mt-2 text-xs font-semibold text-rose-600 dark:text-rose-400">💡 Sugerencia para esa fecha: ${p.goldenRule}</div>`;
}

function setSimToWeekend() {
  const now = new Date();
  let delta = (6 - now.getDay() + 7) % 7;
  if (delta === 0) delta = 7;
  $('simDateInput').value = toISODate(addDays(now, delta));
  runSimulation();
}

/* ==========================================================================
   5. Estadísticas
   ========================================================================== */
function bleedingDaysFor(startISO) {
  // Días seguidos con sangrado registrado desde el inicio de la regla
  let d = parseISODate(startISO);
  let n = 0;
  while (n < 12) {
    const e = state.dailyLog[toISODate(d)];
    if (!e || !BLEEDING_FLOWS.includes(e.flow)) break;
    n++;
    d = addDays(d, 1);
  }
  return n;
}

function statTile(label, value, sub = '') {
  return `<div class="p-3 rounded-2xl bg-white/80 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
    <span class="text-[10px] uppercase font-bold text-slate-400 block">${label}</span>
    <span class="text-lg sm:text-xl font-extrabold text-slate-800 dark:text-slate-100 block leading-tight mt-0.5">${value}</span>
    ${sub ? `<span class="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">${sub}</span>` : ''}
  </div>`;
}

function renderStats() {
  const gaps = cycleGaps();
  const lens = gaps.map((g) => g.len);
  const avg = lens.length ? Math.round(lens.reduce((a, b) => a + b, 0) / lens.length) : null;
  const min = lens.length ? Math.min(...lens) : null;
  const max = lens.length ? Math.max(...lens) : null;
  const spread = lens.length >= 2 ? max - min : null;
  const regularity = spread === null ? '—' : spread <= 4 ? '✅ Regular' : spread <= 8 ? '〰️ Algo irregular' : '⚠️ Irregular';
  const bleeds = state.periodHistory.map(bleedingDaysFor).filter((n) => n > 0);
  const avgBleed = bleeds.length ? (bleeds.reduce((a, b) => a + b, 0) / bleeds.length).toFixed(1) : null;
  const done = totalMissionsDone();

  $('statsTiles').innerHTML = [
    statTile('Ciclo promedio', avg ? `${avg} días` : '—', avg ? `${lens.length} ciclo${lens.length === 1 ? '' : 's'} medido${lens.length === 1 ? '' : 's'}` : 'Registra 2 reglas'),
    statTile('Rango', lens.length ? `${min}–${max} días` : '—', regularity),
    statTile('Días de sangrado', avgBleed ? `${avgBleed}` : '—', avgBleed ? 'promedio según bitácora' : 'Registra el flujo a diario'),
    statTile('Misiones cumplidas', `${done}`, `${done * 50} pts de prometido`)
  ].join('');

  renderCycleChart(gaps, avg);
  renderPhaseInsights();
  renderPeriodHistory(gaps);
}

// Gráfica de barras: duración de cada ciclo (una sola serie, sin leyenda)
function renderCycleChart(gaps, avg) {
  const box = $('cycleChart');
  const data = gaps.slice(-12);
  if (data.length < 1) {
    box.innerHTML = `<p class="py-6 text-center text-xs text-slate-400">Cuando registres al menos 2 inicios de regla con "🩸 Le bajó hoy", aquí verás la duración de cada ciclo.</p>`;
    return;
  }
  const W = 320, H = 150, padL = 26, padB = 20, padT = 10;
  const yMax = Math.max(40, ...data.map((d) => d.len)) + 2;
  const yMin = Math.min(20, ...data.map((d) => d.len)) - 2;
  const y = (v) => padT + (H - padT - padB) * (1 - (v - yMin) / (yMax - yMin));
  const slot = (W - padL) / data.length;
  const bw = Math.min(26, slot - 4);
  const ticks = [20, 25, 30, 35, 40].filter((t) => t > yMin && t < yMax);

  const bars = data.map((d, i) => {
    const x = padL + i * slot + (slot - bw) / 2;
    const top = y(d.len);
    const base = H - padB;
    const r = Math.min(4, bw / 2);
    const label = `${formatShortDate(parseISODate(d.start))}: ${d.len} días`;
    return `<g class="bar" tabindex="0" data-tip="${escapeHTML(label)}">
      <rect x="${padL + i * slot}" y="${padT}" width="${slot}" height="${H - padT - padB}" fill="transparent"/>
      <path d="M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${base} Z" class="fill-rose-500 dark:fill-rose-400"/>
      <text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle" class="fill-slate-400" font-size="8">${parseISODate(d.start).getDate()}/${parseISODate(d.start).getMonth() + 1}</text>
    </g>`;
  }).join('');

  box.innerHTML = `
    <div class="relative">
      <svg viewBox="0 0 ${W} ${H}" class="w-full h-auto" role="img" aria-label="Duración de los últimos ${data.length} ciclos. Promedio ${avg} días.">
        ${ticks.map((t) => `<line x1="${padL}" x2="${W}" y1="${y(t)}" y2="${y(t)}" class="stroke-slate-200 dark:stroke-slate-800" stroke-width="1"/>
          <text x="${padL - 4}" y="${y(t) + 3}" text-anchor="end" class="fill-slate-400" font-size="8">${t}</text>`).join('')}
        ${bars}
        ${avg ? `<line x1="${padL}" x2="${W}" y1="${y(avg)}" y2="${y(avg)}" class="stroke-slate-500 dark:stroke-slate-300" stroke-width="1" stroke-dasharray="3 3"/>
          <text x="${W - 2}" y="${y(avg) - 3}" text-anchor="end" class="fill-slate-500 dark:fill-slate-300" font-size="8" font-weight="700">prom. ${avg}</text>` : ''}
      </svg>
      <div id="chartTip" class="hidden absolute pointer-events-none px-2 py-1 rounded-lg bg-slate-900 text-white text-[11px] font-bold shadow-lg -translate-x-1/2 -translate-y-full whitespace-nowrap"></div>
    </div>`;

  const tip = $('chartTip');
  const show = (g) => {
    const wrap = box.firstElementChild.getBoundingClientRect();
    const r = g.querySelector('path').getBoundingClientRect();
    tip.textContent = g.dataset.tip;
    tip.style.left = `${r.left - wrap.left + r.width / 2}px`;
    tip.style.top = `${r.top - wrap.top - 4}px`;
    tip.classList.remove('hidden');
  };
  box.querySelectorAll('.bar').forEach((g) => {
    g.addEventListener('pointerenter', () => show(g));
    g.addEventListener('click', () => show(g));
    g.addEventListener('focus', () => show(g));
    g.addEventListener('pointerleave', () => tip.classList.add('hidden'));
    g.addEventListener('blur', () => tip.classList.add('hidden'));
  });
}

// Fase REAL de un día pasado: se calcula desde la regla registrada anterior a ese día
// (y con la duración real de ese ciclo si ya terminó), no proyectando el ciclo actual.
function historicalPhase(iso, d) {
  const h = state.periodHistory;
  let i = -1;
  for (let k = 0; k < h.length; k++) if (h[k] <= iso) i = k;
  if (i < 0) return calculateCycleState(d).phase.id;
  const len = i + 1 < h.length ? daysBetween(h[i], parseISODate(h[i + 1])) : state.config.cycleLength;
  const cfg = { ...state.config, lastPeriodDate: h[i], cycleLength: len >= 20 && len <= 45 ? len : state.config.cycleLength };
  return cycleStateFor(cfg, d).phase.id;
}

// Síntomas y ánimo más frecuentes por fase (según la bitácora)
function renderPhaseInsights() {
  const byPhase = { winter: [], spring: [], summer: [], autumn: [] };
  for (const [iso, e] of Object.entries(state.dailyLog)) {
    const d = parseISODate(iso);
    if (d) byPhase[historicalPhase(iso, d)].push(e);
  }
  const total = Object.values(byPhase).reduce((a, l) => a + l.length, 0);
  if (!total) {
    $('phaseInsights').innerHTML = `<p class="col-span-full py-4 text-center text-xs text-slate-400">Usa la bitácora diaria unos días y aquí verás qué síntomas y estado de ánimo tiene en cada fase.</p>`;
    return;
  }
  const bar = { winter: 'bg-rose-500', spring: 'bg-emerald-500', summer: 'bg-amber-500', autumn: 'bg-purple-500' };
  $('phaseInsights').innerHTML = Object.entries(byPhase).map(([phase, entries]) => {
    const moods = entries.filter((e) => e.mood).map((e) => e.mood);
    const moodAvg = moods.length ? moods.reduce((a, b) => a + b, 0) / moods.length : null;
    const counts = {};
    entries.forEach((e) => (e.symptoms || []).forEach((k) => { counts[k] = (counts[k] || 0) + 1; }));
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 4);
    return `<div class="p-3 rounded-2xl bg-white/80 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 space-y-2">
      <div class="flex items-center justify-between gap-2">
        <strong class="text-xs text-slate-800 dark:text-slate-100">${PHASE_EMOJI[phase]} ${PHASE_SHORT[phase]}</strong>
        <span class="text-[10px] text-slate-500 dark:text-slate-400">${entries.length} día${entries.length === 1 ? '' : 's'}${moodAvg ? ` · ánimo ${MOOD_OPTIONS[Math.round(moodAvg) - 1][1]}` : ''}</span>
      </div>
      ${top.length ? top.map(([k, c]) => {
        const pct = Math.round((c / entries.length) * 100);
        return `<div class="text-[11px]">
          <div class="flex justify-between text-slate-600 dark:text-slate-300"><span>${SYMPTOMS[k] || k}</span><span class="font-mono">${pct}%</span></div>
          <div class="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"><div class="h-full rounded-full ${bar[phase]}" style="width:${pct}%"></div></div>
        </div>`;
      }).join('') : '<p class="text-[11px] text-slate-400">Sin síntomas registrados.</p>'}
    </div>`;
  }).join('');
}

function renderPeriodHistory(gaps) {
  const lenByStart = Object.fromEntries(gaps.map((g) => [g.start, g.len]));
  const rows = state.periodHistory.slice().reverse().map((iso) => `
    <tr class="border-t border-slate-100 dark:border-slate-800">
      <td class="py-1.5 capitalize">${formatLongDate(parseISODate(iso))}</td>
      <td class="py-1.5 text-right font-mono">${lenByStart[iso] ? `${lenByStart[iso]} d` : '<span class="text-slate-400">en curso</span>'}</td>
      <td class="py-1.5 text-right w-8"><button type="button" data-action="delete-period" data-date="${iso}" class="text-slate-400 hover:text-rose-600 px-1.5" aria-label="Borrar registro">✕</button></td>
    </tr>`).join('');
  $('periodHistoryTable').innerHTML = rows
    ? `<table class="w-full text-[11px] text-slate-600 dark:text-slate-300"><thead><tr class="text-[10px] uppercase text-slate-400"><th class="text-left font-bold pb-1">Inicio de regla</th><th class="text-right font-bold pb-1">Duración ciclo</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
    : '<p class="text-xs text-slate-400">Sin registros todavía.</p>';
}

function deletePeriod(iso) {
  if (state.periodHistory.length <= 1) {
    showToast('Debe quedar al menos un inicio de regla');
    return;
  }
  if (!confirm(`¿Borrar el registro de regla del ${formatLongDate(parseISODate(iso))}?`)) return;
  state.periodHistory = state.periodHistory.filter((d) => d !== iso);
  state.tombstones[`period:${iso}`] = nowISO();
  if (state.config.lastPeriodDate === iso) {
    state.config.lastPeriodDate = state.periodHistory[state.periodHistory.length - 1];
    state.config.updatedAt = nowISO();
  }
  Store.save();
  updateDashboard();
}

/* ==========================================================================
   6. Modales de detalle y SOS
   ========================================================================== */
function openGenericModal(icon, title, html) {
  $('modalIcon').textContent = icon;
  $('modalTitle').textContent = title;
  $('modalMsg').innerHTML = html;
  openModal('genericModal');
}

function listBlock(title, items, color) {
  const colors = {
    emerald: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/60',
    rose: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/60',
    amber: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60'
  };
  return `<div class="p-2.5 rounded-xl border ${colors[color]}">
    <strong class="block mb-1">${title}</strong>
    <ul class="list-disc pl-4 space-y-1 text-xs">${items.map((i) => `<li>${i}</li>`).join('')}</ul>
  </div>`;
}

function showStatDetail(key) {
  playChime('pop');
  const p = calculateCycleState(new Date()).phase;
  if (key === 'battery') {
    openGenericModal('🔋', `Batería Prevista: ${p.battery}`, `
      <div class="space-y-2 text-left">
        <p><strong>Fase actual:</strong> ${p.title}</p>
        <p class="leading-relaxed">${p.summary}</p>
        <div class="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"><strong>Consejo táctico:</strong> ${p.goldenRule}</div>
      </div>`);
  } else if (key === 'sensitivity') {
    openGenericModal('❤️', `Sensibilidad: ${p.sensitivity}`, `
      <div class="space-y-2 text-left">
        <p><strong>Nivel actual:</strong> ${p.sensitivity}</p>
        <p class="leading-relaxed">Los niveles de estrógeno y progesterona regulan los neurotransmisores cerebrales. Su sensibilidad no es exageración; responde a variaciones biológicas reales.</p>
        <div class="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200"><strong>Qué hacer:</strong> Dale abrazos prolongados, valida sus emociones y no intentes rebatirla con frialdad lógica.</div>
        ${listBlock('✅ Sí hacer', p.dos, 'emerald')}
        ${listBlock('🚫 Evitar', p.donts, 'rose')}
      </div>`);
  } else if (key === 'craving') {
    const cravingNotes = state.notes.filter((n) => n.category === 'craving' && (n.phase === p.id || n.phase === 'all'));
    openGenericModal('🍫', `Antojo: ${p.craving}`, `
      <div class="space-y-2 text-left">
        <p class="leading-relaxed">Durante esta etapa el cuerpo busca combustible reconfortante para compensar la fatiga y el gasto energético.</p>
        <div class="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-200"><strong>Recomendación:</strong> Compra su comida o snack favorito hoy sin que tenga que pedírtelo.</div>
        ${cravingNotes.length ? listBlock('📓 Sus antojos anotados en esta fase', cravingNotes.map((n) => escapeHTML(n.title)), 'amber') : ''}
      </div>`);
  } else if (key === 'secretion') {
    openGenericModal('💧', `Secreción Actual: ${p.secretionBadge}`, `
      <div class="space-y-2 text-left">
        <div class="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">${p.secretionTitle}</span>
          <p class="text-xs font-semibold text-slate-800 dark:text-slate-100 mt-1">${p.secretionDesc}</p>
        </div>
        <div class="p-2.5 rounded-xl bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-900/60 text-cyan-900 dark:text-cyan-200">
          <span class="text-[10px] font-bold uppercase tracking-wider block">💡 Consejo para hoy:</span>
          <p class="text-xs mt-1">${p.secretionAdvice}</p>
        </div>
        <button type="button" data-action="goto-secretions" class="w-full text-center py-2 text-xs font-bold text-cyan-600 dark:text-cyan-400 hover:underline block">Ver Guía Completa de Secreciones ↓</button>
      </div>`);
  }
}

const SOS = {
  cramp: ['🤕', 'Auxilio: Cólicos Fuertes', `
    <ol class="list-decimal list-inside space-y-1.5 text-left text-xs leading-relaxed">
      <li>Llévale una compresa caliente o bolsa de agua tibia al vientre.</li>
      <li>Ofrécele agua o infusión caliente (manzanilla, jengibre o canela).</li>
      <li>Pregunta con delicadeza si desea que le alcances su analgésico de confianza.</li>
      <li>Baja las luces de la habitación y no hagas ruidos molestos.</li>
    </ol>
    <p class="mt-3 text-[11px] text-slate-500">Si el dolor es incapacitante, empeora mes a mes o viene con fiebre o desmayo, sugiérele consultar a su ginecóloga.</p>`],
  badmood: ['⚡', 'Auxilio: Tensión en el Ambiente', `
    <ul class="list-disc list-inside space-y-1.5 text-left text-xs leading-relaxed">
      <li><strong>REGLA 1:</strong> No te defiendas ni discutas con argumentos técnicos.</li>
      <li>Respira hondo y di: "Entiendo que estés molesta y tienes razón en sentirte abrumada".</li>
      <li>Pregúntale: "¿Quieres que te escuche, que te ayude a resolverlo o que te dé un abrazo en silencio?".</li>
    </ul>`],
  hungry: ['🍕', 'Auxilio: Hambre Repentina', `
    <div class="text-left text-xs space-y-1.5 leading-relaxed">
      <p>La bajada hormonal genera necesidad inmediata de carbohidratos y confort.</p>
      <p><strong>Acción rápida:</strong> Dale dos opciones sencillas y pide a domicilio de inmediato sin rodeos.</p>
    </div>`],
  sad: ['🥺', 'Auxilio: Tristeza Inesperada', `
    <div class="text-left text-xs space-y-1.5 leading-relaxed">
      <p>La caída de estrógeno y serotonina puede producir llanto espontáneo sin motivo aparente.</p>
      <p><strong>Acción rápida:</strong> Siéntate a su lado, abrázala sin decir "¿por qué lloras?" y dile que todo va a estar bien.</p>
    </div>`]
};

function triggerEmergencyAction(type) {
  playChime('pop');
  const [icon, title, html] = SOS[type];
  const p = calculateCycleState(new Date()).phase;
  const loved = state.notes.filter((n) => n.category === 'loved' && (n.phase === p.id || n.phase === 'all'));
  const extra = loved.length ? `<div class="mt-3">${listBlock('📓 Lo que ya sabes que le funciona', loved.map((n) => escapeHTML(n.title)), 'emerald')}</div>` : '';
  openGenericModal(icon, title, html + extra);
}

/* ==========================================================================
   7. Configuración, registro de regla y copias de seguridad
   ========================================================================== */
function openConfigModal() {
  $('cfgFiancéeName').value = state.config.fiancéeName || '';
  $('cfgPartnerLabel').value = state.config.partnerLabel;
  $('cfgLastPeriodDate').value = state.config.lastPeriodDate || todayISO();
  $('cfgLastPeriodDate').max = todayISO();
  $('cfgCycleLength').value = state.config.cycleLength || 28;
  $('cfgPeriodDuration').value = state.config.periodDuration || 5;

  const avg = averageCycleFromHistory();
  $('cfgHistoryHint').innerHTML = avg
    ? `📊 Según los ${avg.samples + 1} inicios de regla registrados, su ciclo real promedia <strong>${avg.avg} días</strong>. <button type="button" data-action="apply-average" data-value="${avg.avg}" class="font-bold text-rose-600 dark:text-rose-400 underline">Usar ${avg.avg}</button>`
    : '📊 Registra cada inicio de regla con el botón "Le bajó hoy" y la app calculará su duración real de ciclo.';
  $('cfgHistoryHint').classList.remove('hidden');

  renderNotifySettings();
  renderCloudSettings();
  renderStorageInfo();
  openModal('configModal');
}

function saveConfiguration(e) {
  if (e) e.preventDefault();
  const dateVal = $('cfgLastPeriodDate').value;
  if (!parseISODate(dateVal)) {
    $('cfgLastPeriodDate').focus();
    return;
  }
  const cycleVal = parseInt($('cfgCycleLength').value, 10);
  const periodVal = parseInt($('cfgPeriodDuration').value, 10);

  // La fecha de aquí es la CORRECCIÓN del último periodo: reemplaza a la anterior
  // y descarta registros posteriores a ella (no pueden existir si esta es la última).
  const oldLast = state.config.lastPeriodDate;
  if (dateVal !== oldLast) {
    const now = nowISO();
    state.periodHistory = state.periodHistory.filter((d) => {
      const drop = d === oldLast || d > dateVal;
      if (drop) state.tombstones[`period:${d}`] = now;
      return !drop;
    });
  }

  Object.assign(state.config, {
    fiancéeName: $('cfgFiancéeName').value.trim() || 'Mi Prometida',
    partnerLabel: $('cfgPartnerLabel').value,
    lastPeriodDate: dateVal,
    cycleLength: cycleVal >= 20 && cycleVal <= 45 ? cycleVal : 28,
    periodDuration: periodVal >= 2 && periodVal <= 10 ? periodVal : 5,
    updatedAt: nowISO()
  });
  addPeriodToHistory(dateVal);

  closeModal('configModal');
  Store.save();
  updateDashboard();
  playChime('success');
  showToast(`Ciclo actualizado: Día 1 = ${formatShortDate(parseISODate(dateVal))}`);
}

function addPeriodToHistory(iso) {
  delete state.tombstones[`period:${iso}`];
  if (!state.periodHistory.includes(iso)) {
    state.periodHistory.push(iso);
    state.periodHistory.sort();
  }
  // El "último periodo" siempre es el más reciente registrado
  const latest = state.periodHistory[state.periodHistory.length - 1];
  if (latest !== state.config.lastPeriodDate) {
    state.config.lastPeriodDate = latest;
    state.config.updatedAt = nowISO();
  }
}

function logPeriodOn(iso, ask = true) {
  if (state.periodHistory.includes(iso)) {
    showToast('Ese inicio de regla ya está registrado');
    return;
  }
  const isToday = iso === todayISO();
  if (ask && !confirm(isToday
    ? '¿Registrar que hoy empezó su regla? El ciclo se reiniciará en el Día 1.'
    : `¿Registrar que su regla empezó el ${formatLongDate(parseISODate(iso))}?`)) return;
  addPeriodToHistory(iso);
  // Marca también el flujo en la bitácora si no había nada
  if (!state.dailyLog[iso] || !state.dailyLog[iso].flow) {
    state.dailyLog[iso] = { symptoms: [], ...(state.dailyLog[iso] || {}), flow: 'medium', updatedAt: nowISO() };
  }
  Store.save();
  updateDashboard();
  playChime('success');
  showToast(isToday ? '🩸 Registrado: hoy es el Día 1 del ciclo' : '🩸 Inicio de regla registrado');
}

function exportBackup() {
  Store.flush();
  const data = JSON.stringify({ app: 'prometido-pro', exportedAt: nowISO(), ...state }, null, 2);
  downloadFile(`prometido-pro-respaldo-${todayISO()}.json`, data, 'application/json');
  showToast('Copia de seguridad descargada');
}

function importBackup(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const raw = JSON.parse(reader.result);
      if (!raw || !raw.config) throw new Error('Formato no reconocido');
      if (!confirm('Esto reemplazará todos los datos actuales por los de la copia. ¿Continuar?')) return;
      state = normalizeState(raw);
      Store.saveNow();
      closeModal('configModal');
      updateDashboard();
      showToast('Copia de seguridad restaurada ✔');
    } catch (err) {
      alert('No se pudo leer el archivo. ¿Seguro que es una copia de Prometido Pro?');
    }
  };
  reader.readAsText(file);
}

function renderStorageInfo() {
  const t = state.updatedAt ? new Date(state.updatedAt) : null;
  $('storageInfo').textContent = Store.available
    ? `Último guardado: ${t ? t.toLocaleString('es-ES') : '—'} · ${state.notes.length} notas · ${Object.keys(state.dailyLog).length} días en bitácora · ${state.periodHistory.length} reglas`
    : '⚠️ Este navegador no permite guardar datos (¿modo incógnito?). Lo que hagas se perderá al cerrar.';
}

function downloadFile(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- Exportar a calendario (.ics) ---------- */
function icsEscape(text) {
  return String(text).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function exportCycleToICal() {
  const { cycleLen, ranges } = cycleParams(state.config);
  const name = state.config.fiancéeName;
  const start = parseISODate(state.config.lastPeriodDate);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const ymd = (d) => toISODate(d).replace(/-/g, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Prometido Pro//CRM Ciclo//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  const addEvent = (uid, from, toExclusive, summary, desc) => {
    lines.push('BEGIN:VEVENT', `UID:${uid}@prometido-pro`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(from)}`, `DTEND;VALUE=DATE:${ymd(toExclusive)}`,
      `SUMMARY:${icsEscape(summary)}`, `DESCRIPTION:${icsEscape(desc)}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(summary)}`, 'TRIGGER:-PT15H', 'END:VALARM',
      'END:VEVENT');
  };
  const currentCycleIdx = Math.max(0, Math.floor(daysBetween(state.config.lastPeriodDate, new Date()) / cycleLen));
  for (let i = currentCycleIdx; i < currentCycleIdx + 6; i++) {
    const c = addDays(start, i * cycleLen);
    const key = ymd(c);
    addEvent(`period-${key}`, c, addDays(c, ranges.winter[1]),
      `🩸 ${name}: Regla prevista (Invierno)`, 'Modo manta, agua caliente y chocolates. Cero decisiones difíciles.');
    addEvent(`ovulation-${key}`, addDays(c, ranges.summer[0] - 1), addDays(c, ranges.summer[1]),
      `☀️ ${name}: Ventana fértil estimada (Verano)`, 'Máxima conexión. Ojo: estimación, no es método anticonceptivo.');
    addEvent(`pms-${key}`, addDays(c, cycleLen - 7), addDays(c, cycleLen),
      `⚠️ ${name}: Previa a la regla / SPM (Otoño)`, 'Paciencia infinita, abrazos largos y alacena abastecida de antojos.');
  }
  lines.push('END:VCALENDAR');
  const safeName = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_');
  downloadFile(`ciclo_${safeName || 'pareja'}.ics`, lines.join('\r\n'), 'text/calendar;charset=utf-8');
  showToast('Calendario exportado (6 ciclos, con avisos)');
}

/* ==========================================================================
   8. Notificaciones diarias
   ========================================================================== */
const NOTIFIED_KEY = 'prometido_pro_last_notified'; // por dispositivo, no se sincroniza
const SW_DATA_CACHE = 'pp-data';

// El service worker no puede leer localStorage: le dejamos una copia mínima en la caché
async function publishStateForWorker() {
  try {
    if (!('caches' in window)) return;
    const cache = await caches.open(SW_DATA_CACHE);
    await cache.put('./__state.json', new Response(JSON.stringify({ config: state.config }), { headers: { 'Content-Type': 'application/json' } }));
  } catch (e) { /* sin caché */ }
}

function notificationsSupported() {
  return 'Notification' in window && 'serviceWorker' in navigator;
}

function renderNotifySettings() {
  const supported = notificationsSupported();
  const perm = supported ? Notification.permission : 'unsupported';
  $('cfgNotifyEnabled').checked = !!state.config.notifyEnabled && perm === 'granted';
  $('cfgNotifyTime').value = state.config.notifyTime || '08:30';
  const status = $('notifyStatus');
  if (!supported) status.textContent = '⚠️ Este navegador no soporta notificaciones. En iPhone, primero instala la app en la pantalla de inicio.';
  else if (perm === 'denied') status.textContent = '⚠️ Bloqueaste las notificaciones. Actívalas en los ajustes del navegador para esta página.';
  else if (state.config.notifyEnabled && perm === 'granted') status.textContent = `✅ Activas. Aviso diario a partir de las ${state.config.notifyTime}.`;
  else status.textContent = 'Recibe cada día la fase, la regla de oro y una misión.';
}

async function setNotifications(enabled) {
  if (enabled) {
    if (!notificationsSupported()) { renderNotifySettings(); return; }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      state.config.notifyEnabled = false;
      renderNotifySettings();
      return;
    }
    await registerPeriodicSync();
  }
  state.config.notifyEnabled = enabled;
  state.config.updatedAt = nowISO();
  Store.save();
  renderNotifySettings();
  if (enabled) {
    try { localStorage.removeItem(NOTIFIED_KEY); } catch (e) { /* */ }
    checkDailyNotification();
  }
}

async function registerPeriodicSync() {
  try {
    const reg = await navigator.serviceWorker.ready;
    if (!('periodicSync' in reg)) return false;
    const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
    if (status.state !== 'granted') return false;
    await reg.periodicSync.register('daily-briefing', { minInterval: 6 * 60 * 60 * 1000 });
    return true;
  } catch (e) {
    return false;
  }
}

async function showBriefingNotification(test = false) {
  const reg = await navigator.serviceWorker.ready;
  const b = dailyBriefing(state.config);
  await reg.showNotification(test ? `${b.title} (prueba)` : b.title, {
    body: b.body,
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    tag: 'daily-briefing',
    data: { url: './' }
  });
}

// Mientras la app esté abierta (o en segundo plano en memoria), revisa la hora cada minuto
async function checkDailyNotification() {
  if (!state.config.notifyEnabled || !notificationsSupported() || Notification.permission !== 'granted') return;
  const today = todayISO();
  let last = null;
  try { last = localStorage.getItem(NOTIFIED_KEY); } catch (e) { /* */ }
  if (last === today) return;
  // También respeta lo que haya enviado el service worker en segundo plano
  try {
    const cache = await caches.open(SW_DATA_CACHE);
    const r = await cache.match('./__notified.json');
    if (r && (await r.json()).date === today) return;
  } catch (e) { /* */ }
  const [h, m] = (state.config.notifyTime || '08:30').split(':').map(Number);
  const now = new Date();
  if (now.getHours() * 60 + now.getMinutes() < h * 60 + m) return;
  try {
    localStorage.setItem(NOTIFIED_KEY, today);
    const cache = await caches.open(SW_DATA_CACHE);
    await cache.put('./__notified.json', new Response(JSON.stringify({ date: today })));
    await showBriefingNotification();
  } catch (e) { console.warn('Notificación:', e); }
}

/* ==========================================================================
   9. Nube (Firebase, opcional)
   ========================================================================== */
function renderCloudSettings() {
  const c = CloudSync.cfg;
  $('cloudSetup').classList.toggle('hidden', CloudSync.isConfigured());
  $('cloudLogin').classList.toggle('hidden', !CloudSync.isConfigured() || CloudSync.isSignedIn());
  $('cloudConnected').classList.toggle('hidden', !CloudSync.isSignedIn());
  if (CloudSync.isConfigured()) $('cloudProject').textContent = c.projectId;
  if (CloudSync.isSignedIn()) {
    $('cloudEmail').textContent = c.email;
    $('cloudLastSync').textContent = c.lastSyncAt ? `Última sincronización: ${new Date(c.lastSyncAt).toLocaleString('es-ES')}` : 'Aún sin sincronizar';
  }
}

function setCloudError(msg) {
  const el = $('cloudError');
  el.textContent = msg || '';
  el.classList.toggle('hidden', !msg);
}

async function cloudAuth(create) {
  setCloudError('');
  const email = $('cloudEmailInput').value.trim();
  const pass = $('cloudPassInput').value;
  if (!email || !pass) return setCloudError('Escribe correo y contraseña.');
  try {
    await CloudSync.signIn(email, pass, create);
    $('cloudPassInput').value = '';
    renderCloudSettings();
    await CloudSync.sync();
    renderCloudSettings();
    showToast('☁️ Conectado a la nube');
  } catch (e) {
    setCloudError(e.message);
  }
}

function setupCloud() {
  CloudSync.load();
  CloudSync.getLocal = () => { Store.flush(); return state; };
  CloudSync.onRemoteState = (merged) => {
    state = normalizeState(merged);
    Store.saveNow({ fromCloud: true });
    updateDashboard();
  };
  CloudSync.onStatus = (status, msg) => {
    cloudStatus = status;
    setSyncStatus('saved');
    if (status === 'error') setCloudError(msg);
    if (!$('configModal').classList.contains('hidden')) renderCloudSettings();
  };
  if (CloudSync.isSignedIn()) CloudSync.sync();
  window.addEventListener('online', () => CloudSync.sync());
  window.addEventListener('offline', () => CloudSync.onStatus('offline'));
}

/* ==========================================================================
   10. Interfaz general: modales, toasts, tema, sonido, instalación
   ========================================================================== */
function openModal(id) {
  $(id).classList.remove('hidden');
  document.body.classList.add('overflow-hidden');
}
function closeModal(id) {
  $(id).classList.add('hidden');
  if (!document.querySelector('.modal-backdrop:not(.hidden)')) document.body.classList.remove('overflow-hidden');
}

let toastTimer = null;
function showToast(text, action) {
  let toast = $('prometidoToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'prometidoToast';
    toast.setAttribute('role', 'status');
    toast.className = 'toast fixed left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-2xl bg-slate-900/95 text-white text-xs font-bold shadow-xl border border-slate-700/80 transition-all duration-300 opacity-0 translate-y-3 pointer-events-none flex items-center gap-3 max-w-[92vw]';
    document.body.appendChild(toast);
  }
  toast.innerHTML = `<span>${escapeHTML(text)}</span>`;
  if (action) {
    const b = document.createElement('button');
    b.className = 'px-2.5 py-1 rounded-lg bg-rose-600 text-white font-bold';
    b.textContent = action.label;
    b.addEventListener('click', action.onClick);
    toast.appendChild(b);
  }
  toast.classList.remove('opacity-0', 'translate-y-3', 'pointer-events-none');
  clearTimeout(toastTimer);
  if (!action) toastTimer = setTimeout(() => toast.classList.add('opacity-0', 'translate-y-3', 'pointer-events-none'), 3000);
}

function applyTheme(isDark) {
  document.documentElement.classList.toggle('dark', isDark);
  $('themeIcon').textContent = isDark ? '☀️' : '🌙';
  document.querySelector('meta[name="theme-color"]').setAttribute('content', isDark ? '#0f172a' : '#f43f5e');
}
function toggleDarkMode() {
  const isDark = !document.documentElement.classList.contains('dark');
  applyTheme(isDark);
  try { localStorage.setItem('prometido_pro_theme', isDark ? 'dark' : 'light'); } catch (e) { /* */ }
}

let audioCtx = null;
function playChime(type) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    if (type === 'success') {
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.1);
      osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.2);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);
    } else {
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(554.37, now + 0.1);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    }
  } catch (e) { /* audio bloqueado */ }
}

let deferredInstallPrompt = null;
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

function setupInstall() {
  if (isStandalone()) $('installBtn').classList.add('hidden');
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    $('installNowBtn').classList.remove('hidden');
  });
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    $('installBtn').classList.add('hidden');
    closeModal('installModal');
    showToast('¡App instalada! Ya la tienes en tu pantalla de inicio');
  });
}

async function installNow() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  $('installNowBtn').classList.add('hidden');
}

function setupServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    const promptUpdate = (worker) => showToast('Nueva versión disponible', {
      label: 'Actualizar',
      onClick: () => worker.postMessage('SKIP_WAITING')
    });
    if (reg.waiting && navigator.serviceWorker.controller) promptUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) promptUpdate(nw);
      });
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
    if (state.config.notifyEnabled) registerPeriodicSync();
  }).catch((err) => console.warn('Service worker no registrado:', err));

  const hadController = !!navigator.serviceWorker.controller;
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing || !hadController) return;
    refreshing = true;
    Store.flush();
    location.reload();
  });
}

/* ==========================================================================
   11. Conexión de botones
   ========================================================================== */
function bindEvents() {
  const on = (id, ev, fn) => $(id).addEventListener(ev, fn);

  on('installBtn', 'click', () => openModal('installModal'));
  on('installNowBtn', 'click', installNow);
  on('configBtn', 'click', openConfigModal);
  on('themeBtn', 'click', toggleDarkMode);
  on('logPeriodBtn', 'click', () => logPeriodOn(todayISO()));
  on('configForm', 'submit', saveConfiguration);
  on('noteForm', 'submit', saveNoteEntry);
  on('addNoteBtn', 'click', () => openNoteModal());
  on('noteSearch', 'input', (e) => { noteSearch = e.target.value; renderNotes(); });
  on('phraseSelect', 'change', renderTranslation);
  on('simDateInput', 'change', runSimulation);
  on('simWeekendBtn', 'click', setSimToWeekend);
  on('exportIcsBtn', 'click', exportCycleToICal);
  on('calPrev', 'click', () => changeCalendarMonth(-1));
  on('calNext', 'click', () => changeCalendarMonth(1));
  on('calToday', 'click', goToTodayCalendar);
  on('exportBackupBtn', 'click', exportBackup);
  on('importBackupInput', 'change', (e) => { importBackup(e.target.files[0]); e.target.value = ''; });
  on('secretionsWarningLink', 'click', () => $('secretionsWarningBox').scrollIntoView({ behavior: 'smooth', block: 'center' }));

  // Bitácora
  on('dailyLogSection', 'click', onLogClick);
  on('logPrevBtn', 'click', () => setLogDate(addDays(logDate, -1)));
  on('logNextBtn', 'click', () => setLogDate(addDays(logDate, 1)));
  on('logTodayBtn', 'click', () => setLogDate(new Date()));
  on('logText', 'input', () => {
    clearTimeout(logTextTimer);
    setSyncStatus('saving');
    logTextTimer = setTimeout(() => { updateLog({ text: $('logText').value.trim() }); renderCalendar(); }, 600);
  });
  on('logPeriodSuggestBtn', 'click', () => logPeriodOn(toISODate(logDate)));

  // Notificaciones
  on('cfgNotifyEnabled', 'change', (e) => setNotifications(e.target.checked));
  on('cfgNotifyTime', 'change', (e) => {
    state.config.notifyTime = e.target.value || '08:30';
    state.config.updatedAt = nowISO();
    Store.save();
    renderNotifySettings();
  });
  on('notifyTestBtn', 'click', async () => {
    if (!notificationsSupported()) return renderNotifySettings();
    if (Notification.permission !== 'granted' && (await Notification.requestPermission()) !== 'granted') return renderNotifySettings();
    showBriefingNotification(true);
  });

  // Nube
  on('cloudSaveConfigBtn', 'click', () => {
    setCloudError('');
    try {
      CloudSync.configure($('cloudConfigInput').value);
      renderCloudSettings();
    } catch (e) { setCloudError(e.message); }
  });
  on('cloudSignInBtn', 'click', () => cloudAuth(false));
  on('cloudSignUpBtn', 'click', () => cloudAuth(true));
  on('cloudSyncNowBtn', 'click', async () => { await CloudSync.sync(); renderCloudSettings(); });
  on('cloudSignOutBtn', 'click', () => { CloudSync.signOut(); renderCloudSettings(); });
  on('cloudForgetBtn', 'click', () => {
    if (confirm('¿Quitar la configuración de Firebase de este celular? Tus datos locales se quedan.')) {
      CloudSync.forget();
      renderCloudSettings();
    }
  });

  document.querySelectorAll('[data-stat]').forEach((b) => b.addEventListener('click', () => showStatDetail(b.dataset.stat)));
  document.querySelectorAll('[data-sos]').forEach((b) => b.addEventListener('click', () => triggerEmergencyAction(b.dataset.sos)));
  document.querySelectorAll('.note-filter-btn').forEach((b) => b.addEventListener('click', () => filterNotes(b.dataset.filter)));
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => closeModal(b.dataset.close)));

  document.querySelectorAll('.modal-backdrop').forEach((m) => m.addEventListener('click', (e) => {
    if (e.target === m) closeModal(m.id);
  }));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.querySelectorAll('.modal-backdrop:not(.hidden)').forEach((m) => closeModal(m.id));
  });

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    if (a === 'goto-secretions') {
      closeModal('genericModal');
      $('secretionsSection').scrollIntoView({ behavior: 'smooth' });
    } else if (a === 'apply-average') {
      $('cfgCycleLength').value = el.dataset.value;
    } else if (a === 'edit-log') {
      setLogDate(parseISODate(el.dataset.date));
      $('dailyLogSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (a === 'delete-period') {
      deletePeriod(el.dataset.date);
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') Store.flush();
    else {
      checkDailyNotification();
      CloudSync.schedule(500);
    }
  });
  window.addEventListener('pagehide', () => Store.flush());

  let lastDay = todayISO();
  setInterval(() => {
    if (todayISO() !== lastDay) {
      lastDay = todayISO();
      logDate = new Date();
      updateDashboard();
    }
    checkDailyNotification();
  }, 60000);

  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY && e.newValue) {
      state = normalizeState(JSON.parse(e.newValue));
      updateDashboard();
      setSyncStatus('saved');
    }
  });
}

/* ==========================================================================
   12. Arranque
   ========================================================================== */
function init() {
  applyTheme(document.documentElement.classList.contains('dark'));
  const hadData = Store.load();
  populateTranslator();
  bindEvents();
  $('simDateInput').value = toISODate(addDays(new Date(), 7));
  updateDashboard();
  setSyncStatus(Store.available ? 'saved' : 'error');
  setupInstall();
  setupServiceWorker();
  setupCloud();
  requestPersistentStorage();
  publishStateForWorker();
  checkDailyNotification();

  if (!hadData) {
    Store.saveNow();
    setTimeout(() => {
      openConfigModal();
      showToast('👋 Primero configura su ciclo');
    }, 400);
  }
}

document.addEventListener('DOMContentLoaded', init);
