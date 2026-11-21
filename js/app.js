// Prometido Pro — lógica principal.
// Todo se guarda en el propio celular (localStorage). Sin servidores, funciona sin internet.
'use strict';

/* ==========================================================================
   1. Utilidades de fecha (siempre en hora LOCAL, nunca UTC)
   ========================================================================== */
const pad2 = (n) => String(n).padStart(2, '0');

// Date -> 'YYYY-MM-DD' usando la fecha local del teléfono
function toISODate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// 'YYYY-MM-DD' -> Date a medianoche local
function parseISODate(str) {
  const [y, m, d] = String(str).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function addDays(date, n) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
}

function todayISO() {
  return toISODate(new Date());
}

// Diferencia en días entre una fecha 'YYYY-MM-DD' y un Date (inmune a horario de verano)
function daysBetween(dateStr, dateObj) {
  const a = parseISODate(dateStr);
  if (!a) return 0;
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
  return Math.round((utcB - utcA) / 86400000);
}

function formatLongDate(d) {
  return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function formatShortDate(d) {
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

// Evita que lo que escribas en las notas rompa la página (o inyecte código)
function escapeHTML(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/* ==========================================================================
   2. Estado y autoguardado local
   ========================================================================== */
const STORAGE_KEY = 'prometido_pro_state';
const SCHEMA_VERSION = 2;

const DEFAULT_CONFIG = {
  fiancéeName: 'Mi Prometida',
  lastPeriodDate: toISODate(addDays(new Date(), -4)),
  cycleLength: 28,
  periodDuration: 5
};

function defaultState() {
  return {
    version: SCHEMA_VERSION,
    config: { ...DEFAULT_CONFIG },
    notes: DEFAULT_NOTES.map((n) => ({ ...n })),
    missionsLog: {},      // { 'YYYY-MM-DD': { w1: true, ... } } — las misiones se reinician cada día
    periodHistory: [],    // ['YYYY-MM-DD', ...] — inicios de regla registrados
    updatedAt: null
  };
}

// ÚNICA fuente de verdad. Todo el código lee y escribe aquí.
let state = defaultState();

// Convierte datos viejos o importados al formato actual
function normalizeState(raw) {
  const s = defaultState();
  if (!raw || typeof raw !== 'object') return s;
  if (raw.config && typeof raw.config === 'object') s.config = { ...DEFAULT_CONFIG, ...raw.config };
  if (Array.isArray(raw.notes)) s.notes = raw.notes.filter((n) => n && n.title);
  if (raw.missionsLog && typeof raw.missionsLog === 'object') s.missionsLog = raw.missionsLog;
  if (Array.isArray(raw.periodHistory)) {
    s.periodHistory = [...new Set(raw.periodHistory.filter((d) => parseISODate(d)))].sort();
  }
  s.updatedAt = raw.updatedAt || null;
  // Asegura que la última regla configurada esté en el historial
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
      // Primera vez con esta versión: intenta rescatar datos de la versión anterior
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

  saveNow() {
    clearTimeout(this.timer);
    this.timer = null;
    try {
      state.updatedAt = new Date().toISOString();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      this.available = true;
      setSyncStatus('saved');
      // Punto de enganche para una futura sincronización en la nube:
      // aquí se llamaría a CloudSync.push(state) cuando exista.
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

// Pide al navegador que no borre los datos aunque falte espacio
async function requestPersistentStorage() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      const already = await navigator.storage.persisted();
      if (!already) await navigator.storage.persist();
    }
  } catch (e) { /* no soportado */ }
}

function setSyncStatus(status) {
  const badge = document.getElementById('syncStatusBadge');
  const text = document.getElementById('syncStatusText');
  const dot = document.getElementById('syncStatusDot');
  if (!badge || !text || !dot) return;
  const base = 'flex items-center gap-1.5 text-[10px] font-mono px-2 py-1 rounded-full border';
  if (status === 'saving') {
    badge.className = `${base} bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800`;
    dot.className = 'w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse';
    text.textContent = 'Guardando…';
  } else if (status === 'error') {
    badge.className = `${base} bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800`;
    dot.className = 'w-1.5 h-1.5 rounded-full bg-rose-500';
    text.textContent = 'Sin guardar';
  } else {
    const t = state.updatedAt ? new Date(state.updatedAt) : null;
    badge.className = `${base} bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800`;
    dot.className = 'w-1.5 h-1.5 rounded-full bg-emerald-500';
    text.textContent = t ? `Guardado ${pad2(t.getHours())}:${pad2(t.getMinutes())}` : 'Guardado';
  }
}

/* ==========================================================================
   3. Motor del ciclo
   ========================================================================== */
const PHASE_SHORT = { winter: 'Invierno', spring: 'Primavera', summer: 'Verano', autumn: 'Otoño' };
const PHASE_EMOJI = { winter: '🩸', spring: '🌱', summer: '☀️', autumn: '🍂' };

function cycleParams() {
  const cycleLen = Math.min(45, Math.max(20, parseInt(state.config.cycleLength, 10) || 28));
  const periodDur = Math.min(10, Math.max(2, parseInt(state.config.periodDuration, 10) || 5));
  // La fase lútea dura ~14 días casi siempre; lo que varía entre mujeres es la folicular.
  // Por eso la ovulación se estima contando 14 días hacia atrás desde la próxima regla.
  const ovulationDay = Math.max(periodDur + 3, cycleLen - 14);
  return {
    cycleLen,
    periodDur,
    ovulationDay,
    ranges: {
      winter: [1, periodDur],
      spring: [periodDur + 1, ovulationDay - 2],
      summer: [ovulationDay - 1, ovulationDay + 2],
      autumn: [ovulationDay + 3, cycleLen]
    }
  };
}

function calculateCycleState(targetDate = new Date()) {
  const params = cycleParams();
  const diff = daysBetween(state.config.lastPeriodDate || todayISO(), targetDate);
  const dayInCycle = ((diff % params.cycleLen) + params.cycleLen) % params.cycleLen + 1;

  let phaseKey = 'autumn';
  for (const key of ['winter', 'spring', 'summer']) {
    const [from, to] = params.ranges[key];
    if (dayInCycle >= from && dayInCycle <= to) { phaseKey = key; break; }
  }

  const daysToNextPeriod = params.cycleLen - dayInCycle + 1;
  return { dayInCycle, cycleLen: params.cycleLen, phase: PHASES[phaseKey], daysToNextPeriod, params, targetDate };
}

// Promedio real de duración del ciclo según el historial registrado
function averageCycleFromHistory() {
  const h = state.periodHistory;
  if (h.length < 2) return null;
  const gaps = [];
  for (let i = 1; i < h.length; i++) {
    const gap = daysBetween(h[i - 1], parseISODate(h[i]));
    if (gap >= 20 && gap <= 45) gaps.push(gap); // ignora registros raros
  }
  if (!gaps.length) return null;
  const recent = gaps.slice(-6);
  return { avg: Math.round(recent.reduce((a, b) => a + b, 0) / recent.length), samples: recent.length };
}

/* ==========================================================================
   4. Pantalla principal
   ========================================================================== */
const $ = (id) => document.getElementById(id);

function updateDashboard() {
  const s = calculateCycleState(new Date());
  const p = s.phase;

  $('badgeFiancéeName').textContent = `Prometida: ${state.config.fiancéeName}`;
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

  // Rangos de días reales en la guía de secreciones y la leyenda
  document.querySelectorAll('[data-range]').forEach((el) => {
    const [from, to] = s.params.ranges[el.dataset.range];
    el.textContent = from === to ? `Día ${from}` : `Días ${from}-${to}`;
  });

  renderMissions(p);
  renderCalendar();
  renderNotes();
  renderTranslation();
  runSimulation();
}

/* ---------- Misiones (se reinician cada día) ---------- */
function renderMissions(phase) {
  const container = $('missionsContainer');
  const done = state.missionsLog[todayISO()] || {};
  let completed = 0;
  container.innerHTML = '';

  phase.missions.forEach((m) => {
    const isDone = !!done[m.id];
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

  $('missionCounter').textContent = `${completed}/${phase.missions.length} completadas`;
  renderStreak();
}

function toggleMission(id) {
  const key = todayISO();
  const day = state.missionsLog[key] || (state.missionsLog[key] = {});
  day[id] = !day[id];
  if (!day[id]) delete day[id];
  if (!Object.keys(day).length) delete state.missionsLog[key];
  playChime(day[id] ? 'success' : 'pop');
  Store.save();
  renderMissions(calculateCycleState(new Date()).phase);
}

// Racha: días seguidos con al menos una misión cumplida
function renderStreak() {
  let streak = 0;
  let d = new Date();
  // Si hoy aún no hiciste ninguna, la racha cuenta desde ayer
  if (!state.missionsLog[toISODate(d)]) d = addDays(d, -1);
  while (state.missionsLog[toISODate(d)]) {
    streak++;
    d = addDays(d, -1);
  }
  const el = $('missionStreak');
  el.textContent = streak > 0 ? `🔥 Racha: ${streak} día${streak === 1 ? '' : 's'}` : '';
  el.classList.toggle('hidden', streak === 0);
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

  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const offset = (first.getDay() + 6) % 7; // lunes = 0

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

    const cell = document.createElement('button');
    cell.type = 'button';
    cell.setAttribute('aria-label', `${day} de ${MONTH_NAMES[month]}, día ${cs.dayInCycle} del ciclo, ${PHASE_SHORT[cs.phase.id]}`);
    cell.className = `h-14 sm:h-16 p-1 rounded-xl border flex flex-col justify-between items-center transition-all active:scale-95 touch-manipulation ${CAL_COLORS[cs.phase.id]} ${
      isToday ? 'ring-2 ring-rose-500 shadow-md font-extrabold' : ''
    } ${isSelected && !isToday ? 'ring-2 ring-slate-500 dark:ring-slate-300' : ''}`;
    cell.innerHTML = `
      <div class="w-full flex items-center justify-between text-[10px]">
        <span class="font-bold">${day}</span>
        <span class="text-[9px] font-mono opacity-70">D${cs.dayInCycle}</span>
      </div>
      <span class="text-xs sm:text-sm">${logged.has(iso) ? '📍' : PHASE_EMOJI[cs.phase.id]}</span>
      <span class="text-[8px] uppercase font-bold tracking-tighter truncate w-full text-center">${isToday ? '★ Hoy' : PHASE_SHORT[cs.phase.id]}</span>`;
    cell.addEventListener('click', () => selectCalendarDate(d));
    grid.appendChild(cell);
  }

  renderSelectedDay();
}

function selectCalendarDate(d) {
  selectedCalendarDate = d;
  renderCalendar();
}

function renderSelectedDay() {
  const d = selectedCalendarDate;
  const s = calculateCycleState(d);
  const p = s.phase;
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
    </div>`;
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

/* ---------- Dossier de notas ---------- */
let currentNoteFilter = 'all';

const NOTE_CATEGORIES = {
  loved: { label: '❤️ Le Encantó', class: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' },
  trigger: { label: '💣 Detonante', class: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  craving: { label: '🍫 Antojo Clave', class: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300' },
  quirk: { label: '💡 Manía / Rasgo', class: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' }
};
const NOTE_PHASE_LABEL = { ...PHASE_SHORT, all: 'Siempre' };

function renderNotes() {
  const container = $('notesContainer');
  const filtered = state.notes.filter((n) => currentNoteFilter === 'all' || n.category === currentNoteFilter);
  $('countAllNotes').textContent = state.notes.length;
  container.innerHTML = '';

  if (!filtered.length) {
    container.innerHTML = `<div class="col-span-full py-8 text-center text-slate-400 text-xs">No hay anotaciones en esta categoría todavía. ¡Toca "Añadir Anotación" para guardar un gesto, antojo o detonante!</div>`;
    return;
  }

  filtered.forEach((n) => {
    const cat = NOTE_CATEGORIES[n.category] || NOTE_CATEGORIES.loved;
    const card = document.createElement('div');
    card.className = 'p-3.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-2';
    card.innerHTML = `
      <div class="flex items-center justify-between gap-1">
        <span class="text-[10px] font-bold px-2 py-0.5 rounded-md ${cat.class}">${cat.label}</span>
        <button type="button" class="text-slate-400 hover:text-rose-600 text-xs font-bold px-2 py-1 rounded transition-colors" title="Eliminar nota" aria-label="Eliminar nota">✕</button>
      </div>
      <h4 class="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 leading-snug">${escapeHTML(n.title)}</h4>
      <p class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">${escapeHTML(n.content)}</p>
      <div class="pt-1 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400">
        Fase: <strong>${escapeHTML(NOTE_PHASE_LABEL[n.phase] || n.phase)}</strong>
      </div>`;
    card.querySelector('button').addEventListener('click', () => deleteNote(n.id));
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

function saveNoteEntry(e) {
  e.preventDefault();
  const title = $('noteTitle').value.trim();
  if (!title) return;
  let phase = $('notePhase').value;
  if (phase === 'current') phase = calculateCycleState(new Date()).phase.id;

  state.notes.unshift({
    id: 'note_' + Date.now(),
    category: $('noteCategory').value,
    phase,
    title,
    content: $('noteContent').value.trim() || 'Sin detalles adicionales.',
    createdAt: new Date().toISOString()
  });
  Store.save();
  renderNotes();
  closeModal('noteModal');
  playChime('success');
  showToast('Nota guardada en el dossier');
}

function deleteNote(id) {
  const note = state.notes.find((n) => n.id === id);
  if (!note) return;
  if (!confirm(`¿Eliminar la nota "${note.title}"?`)) return;
  state.notes = state.notes.filter((n) => n.id !== id);
  Store.save();
  renderNotes();
}

/* ---------- Traductor ---------- */
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
  const val = $('simDateInput').value;
  const target = parseISODate(val);
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

// Próximo sábado (o el de la semana siguiente si hoy ya es sábado/domingo)
function setSimToWeekend() {
  const now = new Date();
  let delta = (6 - now.getDay() + 7) % 7;
  if (delta === 0) delta = 7;
  $('simDateInput').value = toISODate(addDays(now, delta));
  runSimulation();
}

/* ==========================================================================
   5. Modales de detalle y SOS
   ========================================================================== */
function openGenericModal(icon, title, html) {
  $('modalIcon').textContent = icon;
  $('modalTitle').textContent = title;
  $('modalMsg').innerHTML = html;
  openModal('genericModal');
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
  // Añade lo que sabes que le funciona (notas "Le encantó" de la fase actual)
  const p = calculateCycleState(new Date()).phase;
  const loved = state.notes.filter((n) => n.category === 'loved' && (n.phase === p.id || n.phase === 'all'));
  const extra = loved.length ? `<div class="mt-3">${listBlock('📓 Lo que ya sabes que le funciona', loved.map((n) => escapeHTML(n.title)), 'emerald')}</div>` : '';
  openGenericModal(icon, title, html + extra);
}

/* ==========================================================================
   6. Configuración, registro de regla y copias de seguridad
   ========================================================================== */
function openConfigModal() {
  $('cfgFiancéeName').value = state.config.fiancéeName || '';
  $('cfgLastPeriodDate').value = state.config.lastPeriodDate || todayISO();
  $('cfgLastPeriodDate').max = todayISO();
  $('cfgCycleLength').value = state.config.cycleLength || 28;
  $('cfgPeriodDuration').value = state.config.periodDuration || 5;

  const avg = averageCycleFromHistory();
  const hint = $('cfgHistoryHint');
  if (avg) {
    hint.innerHTML = `📊 Según los ${avg.samples + 1} inicios de regla registrados, su ciclo real promedia <strong>${avg.avg} días</strong>. <button type="button" data-action="apply-average" data-value="${avg.avg}" class="font-bold text-rose-600 dark:text-rose-400 underline">Usar ${avg.avg}</button>`;
    hint.classList.remove('hidden');
  } else {
    hint.textContent = '📊 Registra cada inicio de regla con el botón "Le bajó hoy" y la app calculará su duración real de ciclo.';
    hint.classList.remove('hidden');
  }
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

  state.config.fiancéeName = $('cfgFiancéeName').value.trim() || 'Mi Prometida';
  state.config.lastPeriodDate = dateVal;
  state.config.cycleLength = cycleVal >= 20 && cycleVal <= 45 ? cycleVal : 28;
  state.config.periodDuration = periodVal >= 2 && periodVal <= 10 ? periodVal : 5;
  addPeriodToHistory(dateVal);

  closeModal('configModal');
  Store.save();
  updateDashboard();
  playChime('success');
  showToast(`Ciclo actualizado: Día 1 = ${formatShortDate(parseISODate(dateVal))}`);
}

function addPeriodToHistory(iso) {
  if (!state.periodHistory.includes(iso)) {
    state.periodHistory.push(iso);
    state.periodHistory.sort();
  }
}

// Botón rápido "Le bajó hoy"
function logPeriodToday() {
  const today = todayISO();
  if (state.config.lastPeriodDate === today) {
    showToast('Ya está registrado: hoy es el Día 1');
    return;
  }
  if (!confirm('¿Registrar que hoy empezó su regla? El ciclo se reiniciará en el Día 1.')) return;
  state.config.lastPeriodDate = today;
  addPeriodToHistory(today);
  Store.save();
  updateDashboard();
  playChime('success');
  showToast('🩸 Registrado: hoy es el Día 1 del ciclo');
}

function exportBackup() {
  Store.flush();
  const data = JSON.stringify({ app: 'prometido-pro', exportedAt: new Date().toISOString(), ...state }, null, 2);
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
  const el = $('storageInfo');
  const t = state.updatedAt ? new Date(state.updatedAt) : null;
  el.textContent = Store.available
    ? `Último guardado: ${t ? t.toLocaleString('es-ES') : '—'} · ${state.notes.length} notas · ${state.periodHistory.length} reglas registradas`
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
  const { cycleLen, ranges } = cycleParams();
  const name = state.config.fiancéeName;
  const start = parseISODate(state.config.lastPeriodDate);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const ymd = (d) => toISODate(d).replace(/-/g, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Prometido Pro//CRM Ciclo//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];

  const addEvent = (uid, from, toExclusive, summary, desc) => {
    lines.push('BEGIN:VEVENT', `UID:${uid}@prometido-pro`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(from)}`, `DTEND;VALUE=DATE:${ymd(toExclusive)}`,
      `SUMMARY:${icsEscape(summary)}`, `DESCRIPTION:${icsEscape(desc)}`, 'END:VEVENT');
  };

  // Próximos 6 ciclos a partir del actual
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
  showToast('Calendario exportado (6 ciclos)');
}

/* ==========================================================================
   7. Interfaz general: modales, toasts, tema, sonido, instalación
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
  if (!action) {
    toastTimer = setTimeout(() => toast.classList.add('opacity-0', 'translate-y-3', 'pointer-events-none'), 3000);
  }
}

function applyTheme(isDark) {
  document.documentElement.classList.toggle('dark', isDark);
  $('themeIcon').textContent = isDark ? '☀️' : '🌙';
  document.querySelector('meta[name="theme-color"]').setAttribute('content', isDark ? '#0f172a' : '#f43f5e');
}

function toggleDarkMode() {
  const isDark = !document.documentElement.classList.contains('dark');
  applyTheme(isDark);
  try { localStorage.setItem('prometido_pro_theme', isDark ? 'dark' : 'light'); } catch (e) { /* sin almacenamiento */ }
}

// Un solo AudioContext reutilizable (antes se creaba uno por sonido y el navegador los bloquea)
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

// --- Instalación como app ---
let deferredInstallPrompt = null;

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

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

// --- Service worker: funcionamiento sin internet y avisos de actualización ---
function setupServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    const promptUpdate = (worker) => {
      showToast('Nueva versión disponible', {
        label: 'Actualizar',
        onClick: () => worker.postMessage('SKIP_WAITING')
      });
    };
    if (reg.waiting && navigator.serviceWorker.controller) promptUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) promptUpdate(nw);
      });
    });
    // Busca actualizaciones cada vez que vuelves a abrir la app
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }).catch((err) => console.warn('Service worker no registrado:', err));

  // Solo recarga cuando es una ACTUALIZACIÓN (no en la primera instalación)
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
   8. Conexión de botones (sin onclick en el HTML)
   ========================================================================== */
function bindEvents() {
  const on = (id, ev, fn) => $(id).addEventListener(ev, fn);

  on('installBtn', 'click', () => openModal('installModal'));
  on('installNowBtn', 'click', installNow);
  on('configBtn', 'click', openConfigModal);
  on('themeBtn', 'click', toggleDarkMode);
  on('logPeriodBtn', 'click', logPeriodToday);
  on('configForm', 'submit', saveConfiguration);
  on('noteForm', 'submit', saveNoteEntry);
  on('addNoteBtn', 'click', () => {
    $('noteForm').reset();
    openModal('noteModal');
    setTimeout(() => $('noteTitle').focus(), 50);
  });
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

  document.querySelectorAll('[data-stat]').forEach((b) => b.addEventListener('click', () => showStatDetail(b.dataset.stat)));
  document.querySelectorAll('[data-sos]').forEach((b) => b.addEventListener('click', () => triggerEmergencyAction(b.dataset.sos)));
  document.querySelectorAll('.note-filter-btn').forEach((b) => b.addEventListener('click', () => filterNotes(b.dataset.filter)));
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => closeModal(b.dataset.close)));

  // Cerrar modales tocando el fondo oscuro o con Escape
  document.querySelectorAll('.modal-backdrop').forEach((m) => m.addEventListener('click', (e) => {
    if (e.target === m) closeModal(m.id);
  }));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.querySelectorAll('.modal-backdrop:not(.hidden)').forEach((m) => closeModal(m.id));
  });

  // Acciones dentro de contenido generado dinámicamente
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    if (el.dataset.action === 'goto-secretions') {
      closeModal('genericModal');
      $('secretionsSection').scrollIntoView({ behavior: 'smooth' });
    } else if (el.dataset.action === 'apply-average') {
      $('cfgCycleLength').value = el.dataset.value;
    }
  });

  // Guarda al instante si cierras o cambias de app
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') Store.flush(); });
  window.addEventListener('pagehide', () => Store.flush());

  // Si la app queda abierta pasada la medianoche, refresca el día
  let lastDay = todayISO();
  setInterval(() => {
    if (todayISO() !== lastDay) {
      lastDay = todayISO();
      updateDashboard();
    }
  }, 60000);

  // Si cambias datos en otra pestaña, esta se actualiza
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY && e.newValue) {
      state = normalizeState(JSON.parse(e.newValue));
      updateDashboard();
      setSyncStatus('saved');
    }
  });
}

/* ==========================================================================
   9. Arranque
   ========================================================================== */
function init() {
  applyTheme(document.documentElement.classList.contains('dark'));
  const hadData = Store.load();
  bindEvents();
  $('simDateInput').value = toISODate(addDays(new Date(), 7));
  updateDashboard();
  setSyncStatus(Store.available ? 'saved' : 'error');
  setupInstall();
  setupServiceWorker();
  requestPersistentStorage();

  // Primera vez: abre la configuración para poner la fecha real
  if (!hadData) {
    Store.saveNow();
    setTimeout(() => {
      openConfigModal();
      showToast('👋 Primero configura su ciclo');
    }, 400);
  }
}

document.addEventListener('DOMContentLoaded', init);
