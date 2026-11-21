// Motor del ciclo y utilidades de fecha.
// Compartido entre la app (index.html) y el service worker (notificaciones en segundo plano).
'use strict';

const pad2 = (n) => String(n).padStart(2, '0');

// Date -> 'YYYY-MM-DD' en hora LOCAL
function toISODate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// 'YYYY-MM-DD' -> Date a medianoche local
function parseISODate(str) {
  const [y, m, d] = String(str || '').split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function addDays(date, n) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
}

function todayISO() {
  return toISODate(new Date());
}

// Días entre una fecha 'YYYY-MM-DD' y un Date (inmune a horario de verano)
function daysBetween(dateStr, dateObj) {
  const a = parseISODate(dateStr);
  if (!a) return 0;
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
  return Math.round((utcB - utcA) / 86400000);
}

const PHASE_SHORT = { winter: 'Invierno', spring: 'Primavera', summer: 'Verano', autumn: 'Otoño' };
const PHASE_EMOJI = { winter: '🩸', spring: '🌱', summer: '☀️', autumn: '🍂' };

function cycleParams(config) {
  const cycleLen = Math.min(45, Math.max(20, parseInt(config.cycleLength, 10) || 28));
  const periodDur = Math.min(10, Math.max(2, parseInt(config.periodDuration, 10) || 5));
  // La fase lútea dura ~14 días casi siempre; lo que varía es la folicular.
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

function cycleStateFor(config, targetDate = new Date()) {
  const params = cycleParams(config);
  const diff = daysBetween(config.lastPeriodDate || todayISO(), targetDate);
  const dayInCycle = ((diff % params.cycleLen) + params.cycleLen) % params.cycleLen + 1;

  let phaseKey = 'autumn';
  for (const key of ['winter', 'spring', 'summer']) {
    const [from, to] = params.ranges[key];
    if (dayInCycle >= from && dayInCycle <= to) { phaseKey = key; break; }
  }
  const phaseStartsToday = params.ranges[phaseKey][0] === dayInCycle;
  const daysToNextPeriod = params.cycleLen - dayInCycle + 1;
  return { dayInCycle, cycleLen: params.cycleLen, phase: PHASES[phaseKey], phaseStartsToday, daysToNextPeriod, params, targetDate };
}

// Número estable a partir de un texto (para rotar misiones de forma predecible)
function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// 3 misiones del día, distintas cada día pero iguales durante todo ese día
function dailyMissions(phase, iso, count = 3) {
  const pool = phase.missions.slice();
  let seed = hashString(iso + phase.id);
  const picked = [];
  while (picked.length < count && pool.length) {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    picked.push(pool.splice(seed % pool.length, 1)[0]);
  }
  return picked;
}

// Texto de la notificación del día
function dailyBriefing(config, date = new Date()) {
  const s = cycleStateFor(config, date);
  const name = config.fiancéeName || 'Ella';
  const p = s.phase;
  let title = `${PHASE_EMOJI[p.id]} ${name}: Día ${s.dayInCycle} · ${PHASE_SHORT[p.id]}`;
  if (s.phaseStartsToday && s.dayInCycle !== 1) title = `${PHASE_EMOJI[p.id]} Hoy empieza el ${PHASE_SHORT[p.id]} de ${name}`;
  if (s.dayInCycle === 1) title = `🩸 Hoy debería bajarle la regla a ${name}`;
  else if (s.daysToNextPeriod === 1) title = `🩸 Mañana debería bajarle la regla a ${name}`;
  const mission = dailyMissions(p, toISODate(date))[0];
  return { title, body: `${p.goldenRule}\n🎯 Misión: ${mission ? mission.text : ''}`, state: s };
}
