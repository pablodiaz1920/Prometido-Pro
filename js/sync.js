// Sincronización opcional en la nube (Firebase: Auth + Firestore vía REST, sin SDK).
// La app sigue siendo "local primero": todo funciona sin esto. Si configuras Firebase,
// tus datos se respaldan en tu propia cuenta y se pueden compartir entre dos celulares
// iniciando sesión con la misma cuenta.
'use strict';

/* ==========================================================================
   Fusión de datos entre dos dispositivos (sin perder cambios de ninguno)
   ========================================================================== */
const ts = (v) => (v ? Date.parse(v) || Number(v) || 0 : 0);

function mergeStates(local, remote) {
  const out = JSON.parse(JSON.stringify(local));

  // Lápidas (elementos borrados): gana el borrado más reciente
  const tomb = { ...(remote.tombstones || {}), ...(local.tombstones || {}) };
  for (const [k, v] of Object.entries(remote.tombstones || {})) {
    if (ts(v) > ts(tomb[k])) tomb[k] = v;
  }
  out.tombstones = tomb;
  const isDeleted = (key, updatedAt) => tomb[key] && ts(tomb[key]) >= ts(updatedAt);

  // Configuración: gana la más reciente
  if (ts(remote.config && remote.config.updatedAt) > ts(local.config && local.config.updatedAt)) {
    out.config = { ...remote.config };
  }

  // Notas: por id, gana la versión editada más recientemente
  const notes = new Map();
  for (const n of [...(local.notes || []), ...(remote.notes || [])]) {
    const prev = notes.get(n.id);
    if (!prev || ts(n.updatedAt || n.createdAt) > ts(prev.updatedAt || prev.createdAt)) notes.set(n.id, n);
  }
  out.notes = [...notes.values()]
    .filter((n) => !isDeleted(`note:${n.id}`, n.updatedAt || n.createdAt))
    .sort((a, b) => ts(b.createdAt) - ts(a.createdAt));

  // Misiones: por día, gana la entrada más reciente
  const missions = { ...(local.missionsLog || {}) };
  for (const [day, entry] of Object.entries(remote.missionsLog || {})) {
    if (!missions[day] || ts(entry._t) > ts(missions[day]._t)) missions[day] = entry;
  }
  out.missionsLog = missions;

  // Bitácora: por día gana la más reciente, pero las NOTAS de ambos celulares se suman
  const migrate = (e) => (typeof migrateLogEntry === 'function' ? migrateLogEntry(e) : e);
  const log = {};
  for (const [day, e] of Object.entries(local.dailyLog || {})) log[day] = migrate(e);
  for (const [day, raw] of Object.entries(remote.dailyLog || {})) {
    const r = migrate(raw);
    const l = log[day];
    if (!l) { log[day] = r; continue; }
    const newer = ts(r.updatedAt) > ts(l.updatedAt) ? r : l;
    const notes = new Map();
    for (const n of [...(l.notes || []), ...(r.notes || [])]) {
      const prev = notes.get(n.id);
      if (!prev || ts(n.updatedAt || n.createdAt) > ts(prev.updatedAt || prev.createdAt)) notes.set(n.id, n);
    }
    log[day] = { ...newer, notes: [...notes.values()] };
  }
  for (const e of Object.values(log)) {
    if (e && Array.isArray(e.notes)) e.notes = e.notes.filter((n) => !isDeleted(`lognote:${n.id}`, n.updatedAt || n.createdAt));
  }
  out.dailyLog = log;

  // Historial de reglas: unión, menos las borradas
  const periods = new Set([...(local.periodHistory || []), ...(remote.periodHistory || [])]);
  out.periodHistory = [...periods].filter((d) => !tomb[`period:${d}`]).sort();
  if (out.config.lastPeriodDate && !out.periodHistory.includes(out.config.lastPeriodDate)) {
    out.periodHistory.push(out.config.lastPeriodDate);
    out.periodHistory.sort();
  }

  out.updatedAt = ts(remote.updatedAt) > ts(local.updatedAt) ? remote.updatedAt : local.updatedAt;
  return out;
}

/* ==========================================================================
   Cliente Firebase (REST)
   ========================================================================== */
const CLOUD_KEY = 'prometido_pro_cloud';

const CloudSync = {
  cfg: {},
  timer: null,
  busy: false,
  onStatus: () => {},   // la app se suscribe para mostrar el estado
  onRemoteState: () => {},

  load() {
    try { this.cfg = JSON.parse(localStorage.getItem(CLOUD_KEY)) || {}; } catch (e) { this.cfg = {}; }
  },
  persist() {
    try { localStorage.setItem(CLOUD_KEY, JSON.stringify(this.cfg)); } catch (e) { /* sin almacenamiento */ }
  },

  isConfigured() { return !!(this.cfg.apiKey && this.cfg.projectId); },
  isSignedIn() { return this.isConfigured() && !!this.cfg.refreshToken && !!this.cfg.uid; },

  // Acepta el bloque "firebaseConfig" tal cual lo copia la consola de Firebase
  parseFirebaseConfig(text) {
    const pick = (key) => {
      const m = String(text).match(new RegExp(`["']?${key}["']?\\s*:\\s*["']([^"']+)["']`));
      return m ? m[1].trim() : '';
    };
    const apiKey = pick('apiKey');
    const projectId = pick('projectId');
    if (!apiKey || !projectId) throw new Error('No encontré "apiKey" y "projectId" en el texto pegado.');
    return { apiKey, projectId };
  },

  configure(text) {
    const { apiKey, projectId } = this.parseFirebaseConfig(text);
    this.cfg = { apiKey, projectId };
    this.persist();
  },

  async authRequest(path, body) {
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/${path}?key=${encodeURIComponent(this.cfg.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(this.translateAuthError(data.error && data.error.message));
    return data;
  },

  translateAuthError(code = '') {
    const map = {
      EMAIL_EXISTS: 'Ese correo ya tiene cuenta. Usa "Iniciar sesión".',
      EMAIL_NOT_FOUND: 'No existe una cuenta con ese correo. Usa "Crear cuenta".',
      INVALID_PASSWORD: 'Contraseña incorrecta.',
      INVALID_LOGIN_CREDENTIALS: 'Correo o contraseña incorrectos.',
      INVALID_EMAIL: 'El correo no es válido.',
      OPERATION_NOT_ALLOWED: 'Activa "Correo/contraseña" en Firebase → Authentication → Sign-in method.',
      CONFIGURATION_NOT_FOUND: 'Activa Authentication en tu proyecto de Firebase.',
      TOO_MANY_ATTEMPTS_TRY_LATER: 'Demasiados intentos. Espera unos minutos.'
    };
    if (code.startsWith('WEAK_PASSWORD')) return 'La contraseña debe tener al menos 6 caracteres.';
    if (code.includes('API key not valid')) return 'La apiKey no es válida. Revisa lo que pegaste.';
    return map[code] || `Error de Firebase: ${code || 'desconocido'}`;
  },

  async signIn(email, password, create = false) {
    const data = await this.authRequest(create ? 'accounts:signUp' : 'accounts:signInWithPassword', {
      email, password, returnSecureToken: true
    });
    Object.assign(this.cfg, {
      email: data.email,
      uid: data.localId,
      idToken: data.idToken,
      refreshToken: data.refreshToken,
      expiresAt: Date.now() + (Number(data.expiresIn) - 60) * 1000,
      lastSyncAt: null
    });
    this.persist();
  },

  signOut() {
    const { apiKey, projectId } = this.cfg;
    this.cfg = { apiKey, projectId };
    this.persist();
    this.onStatus('off');
  },

  forget() {
    this.cfg = {};
    this.persist();
    this.onStatus('off');
  },

  async token() {
    if (this.cfg.idToken && Date.now() < this.cfg.expiresAt) return this.cfg.idToken;
    const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(this.cfg.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(this.cfg.refreshToken)}`
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      this.signOut();
      throw new Error('La sesión caducó. Vuelve a iniciar sesión.');
    }
    this.cfg.idToken = data.id_token;
    this.cfg.refreshToken = data.refresh_token;
    this.cfg.expiresAt = Date.now() + (Number(data.expires_in) - 60) * 1000;
    this.persist();
    return this.cfg.idToken;
  },

  docUrl() {
    return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(this.cfg.projectId)}/databases/(default)/documents/users/${encodeURIComponent(this.cfg.uid)}/data/state`;
  },

  async request(method, body) {
    const res = await fetch(this.docUrl(), {
      method,
      headers: { Authorization: `Bearer ${await this.token()}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    if (res.status === 404 && method === 'GET') return null;
    if (res.status === 403) throw new Error('Firestore rechazó el acceso. Revisa las reglas de seguridad (ver README).');
    if (!res.ok) throw new Error(`Error de la nube (${res.status})`);
    return res.json();
  },

  async pull() {
    const doc = await this.request('GET');
    if (!doc || !doc.fields || !doc.fields.json) return null;
    return JSON.parse(doc.fields.json.stringValue);
  },

  async push(data) {
    await this.request('PATCH', {
      fields: {
        json: { stringValue: JSON.stringify(data) },
        updatedAt: { stringValue: new Date().toISOString() }
      }
    });
  },

  // Programa una sincronización (se agrupan cambios seguidos)
  schedule(delay = 2500) {
    if (!this.isSignedIn()) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.sync(), delay);
  },

  // Trae lo de la nube, lo fusiona con lo local y sube el resultado
  async sync(getLocal) {
    if (!this.isSignedIn() || this.busy) return;
    if (!navigator.onLine) { this.onStatus('offline'); return; }
    this.busy = true;
    this.onStatus('syncing');
    try {
      const local = (getLocal || this.getLocal)();
      const remote = await this.pull();
      const merged = remote ? mergeStates(local, remote) : local;
      if (JSON.stringify(merged) !== JSON.stringify(local)) this.onRemoteState(merged);
      await this.push(merged);
      this.cfg.lastSyncAt = new Date().toISOString();
      this.persist();
      this.onStatus('synced');
    } catch (e) {
      console.warn('Sync:', e);
      this.onStatus('error', e.message);
    } finally {
      this.busy = false;
    }
  },

  getLocal: () => ({})
};
