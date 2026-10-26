// WinRate — lógica pura (sin DOM). Se usa en la app y en los tests de Node.

export const SCHEMA_VERSION = 1;
export const APP_VERSION = "1.0.0";
export const MAX_LOSSES_PER_DAY = 2;
export const DAY_START_HOUR = 6;
export const RATIO_PRESETS = ["1.5", "2", "3"];

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

// ---------- Estado por defecto ----------
export function defaultSettings() {
  return {
    playerName: "",
    theme: "dark",
    sound: true,
    capital: null,
    bullets: 20,
    ratio: 2,
    ratioPreset: "2",
    customRatio: null,
  };
}

export function defaultState() {
  return { schemaVersion: SCHEMA_VERSION, settings: defaultSettings(), records: [] };
}

// ---------- Cálculos de la calculadora ----------
export function toInt(v) {
  const n = typeof v === "number" ? v : parseInt(String(v ?? "").replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
}

export function calcInvestment(capital, bullets) {
  const c = toInt(capital);
  const b = toInt(bullets);
  if (!Number.isFinite(c) || !Number.isFinite(b) || b <= 0 || c <= 0) return 0;
  return Math.floor(c / b);
}

export function calcProjection(capital, bullets, ratio) {
  const c = Math.max(0, toInt(capital) || 0);
  const invested = calcInvestment(c, bullets);
  const gain = Math.floor(invested * ratio);
  return {
    invested,
    gain,
    winCapital: c + gain,
    loss: invested,
    loseCapital: c - invested,
  };
}

export function parseRatio(input) {
  // Acepta "4.5", "1:4.5", "4,5"
  let s = String(input ?? "").trim().replace(",", ".");
  if (s.includes(":")) {
    const [a, b] = s.split(":").map(Number);
    if (!(a > 0) || !Number.isFinite(b)) return NaN;
    s = String(b / a);
  }
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0 || n > 1000) return NaN;
  return Math.round(n * 1000) / 1000;
}

export function formatRatio(r) {
  return "1:" + String(Math.round(r * 1000) / 1000);
}

// ---------- Día de juego ----------
const pad = (n) => String(n).padStart(2, "0");

export function localDateKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** dayKey = fecha local de (timestamp − 6 h). */
export function dayKey(ts) {
  return localDateKey(new Date(ts - DAY_START_HOUR * HOUR));
}

/** Próximas 06:00:00 locales estrictamente después de `now`. */
export function nextReset(now) {
  const d = new Date(now);
  d.setHours(DAY_START_HOUR, 0, 0, 0);
  if (d.getTime() <= now) {
    d.setDate(d.getDate() + 1);
    d.setHours(DAY_START_HOUR, 0, 0, 0);
  }
  return d.getTime();
}

// Aritmética de dayKeys en UTC (sin problemas de horario de verano)
export function keyToUTC(key) {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}
export function utcToKey(t) {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
export function addDays(key, n) {
  return utcToKey(keyToUTC(key) + n * DAY);
}
export function weekday(key) {
  // 0 = lunes … 6 = domingo
  return (new Date(keyToUTC(key)).getUTCDay() + 6) % 7;
}
export function isoWeekKey(key) {
  const d = new Date(keyToUTC(key));
  const dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dow);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / DAY + 1) / 7);
  return `${d.getUTCFullYear()}-W${pad(week)}`;
}

// ---------- Bloqueo diario ----------
export function dayRecords(records, key) {
  return records.filter((r) => r.dayKey === key);
}

export function lossesOnDay(records, key) {
  return records.reduce((n, r) => n + (r.dayKey === key && r.result === "lose" ? 1 : 0), 0);
}

export function lockStatus(records, now) {
  const key = dayKey(now);
  const losses = lossesOnDay(records, key);
  const locked = losses >= MAX_LOSSES_PER_DAY;
  return {
    dayKey: key,
    losses,
    lives: Math.max(0, MAX_LOSSES_PER_DAY - losses),
    locked,
    unlockAt: locked ? nextReset(now) : null,
  };
}

// ---------- Registros ----------
let idCounter = 0;
function newId(ts) {
  idCounter = (idCounter + 1) % 1e6;
  return `${ts.toString(36)}-${idCounter.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Registra un resultado. Devuelve { ok, state, record, scenario } o { ok:false, reason }.
 * scenario: "win" | "lose1" | "lock"
 */
export function recordResult(state, result, now) {
  if (result !== "win" && result !== "lose") return { ok: false, reason: "result" };
  const lock = lockStatus(state.records, now);
  if (lock.locked) return { ok: false, reason: "locked" };
  const s = state.settings;
  const capitalBefore = toInt(s.capital);
  const bullets = toInt(s.bullets);
  if (!Number.isFinite(capitalBefore) || !Number.isFinite(bullets) || bullets <= 0)
    return { ok: false, reason: "invalid" };
  const p = calcProjection(capitalBefore, bullets, s.ratio);
  if (p.invested <= 0) return { ok: false, reason: "insufficient" };
  const delta = result === "win" ? p.gain : -p.invested;
  const record = {
    id: newId(now),
    ts: now,
    dayKey: dayKey(now),
    capitalBefore,
    bullets,
    ratio: s.ratio,
    invested: p.invested,
    result,
    delta,
    capitalAfter: capitalBefore + delta,
  };
  const records = [...state.records, record];
  const next = { ...state, settings: { ...s, capital: record.capitalAfter }, records };
  let scenario = "win";
  if (result === "lose") scenario = lossesOnDay(records, record.dayKey) >= MAX_LOSSES_PER_DAY ? "lock" : "lose1";
  return { ok: true, state: next, record, scenario };
}

export function undoLast(state) {
  if (!state.records.length) return { ok: false, state };
  const records = state.records.slice(0, -1);
  const removed = state.records[state.records.length - 1];
  return {
    ok: true,
    removed,
    state: { ...state, settings: { ...state.settings, capital: removed.capitalBefore }, records },
  };
}

// ---------- Frases ----------
export const PHRASES = {
  win: [
    "¡Excelente, bien jugado!",
    "¡Así se hace! Precisión de francotirador.",
    "+Coins. Ejecución limpia, sigue así.",
    "¡Victoria! Mantén la cabeza fría y el plan firme.",
    "GG. Disciplina > suerte.",
  ],
  lose1: [
    "Relax, queda 1 intento más en el día. Respira y concéntrate.",
    "Un golpe no es K.O. Te queda una vida hoy, úsala con calma.",
    "Respira. Revisa tu plan antes del último intento del día.",
    "Pérdida controlada. Último intento disponible: sin prisas.",
    "Calma, jugador. Una vida más hoy. Enfócate en la calidad, no en recuperar.",
  ],
  lock: [
    "¡RELAX! Mañana es un nuevo día. Go and enjoy life.",
    "Game over por hoy. Desconecta, recarga energía y vuelve mañana.",
    "Sistema en pausa. Los mejores jugadores saben cuándo parar.",
    "Hoy se protege el capital. Sal a vivir, mañana hay revancha.",
    "Límite alcanzado. Apaga la pantalla, el mercado sigue mañana.",
  ],
};

/** Elige un índice al azar distinto de `lastIdx`. */
export function pickPhraseIndex(scenario, lastIdx, rnd = Math.random) {
  const n = PHRASES[scenario].length;
  if (n <= 1) return 0;
  let i = Math.floor(rnd() * (n - 1));
  if (Number.isInteger(lastIdx) && lastIdx >= 0 && i >= lastIdx) i += 1;
  return Math.min(i, n - 1);
}

// ---------- Validación / import / export ----------
export function exportState(state) {
  return JSON.stringify(
    { schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), app: "WinRate", settings: state.settings, records: state.records },
    null,
    2
  );
}

const isInt = (v) => Number.isInteger(v);
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateRecord(r) {
  return (
    r && typeof r === "object" &&
    typeof r.id === "string" && r.id.length > 0 &&
    isNum(r.ts) && typeof r.dayKey === "string" && KEY_RE.test(r.dayKey) &&
    isInt(r.capitalBefore) && isInt(r.bullets) && r.bullets > 0 &&
    isNum(r.ratio) && r.ratio > 0 && isInt(r.invested) && r.invested >= 0 &&
    (r.result === "win" || r.result === "lose") &&
    isInt(r.delta) && isInt(r.capitalAfter) && r.capitalAfter === r.capitalBefore + r.delta
  );
}

export function sanitizeSettings(s) {
  const d = defaultSettings();
  if (!s || typeof s !== "object") return d;
  const out = { ...d };
  if (typeof s.playerName === "string") out.playerName = s.playerName.slice(0, 16);
  if (s.theme === "dark" || s.theme === "light") out.theme = s.theme;
  if (typeof s.sound === "boolean") out.sound = s.sound;
  if (s.capital === null || isInt(s.capital)) out.capital = s.capital;
  if (isInt(s.bullets) && s.bullets > 0) out.bullets = s.bullets;
  if (isNum(s.ratio) && s.ratio > 0) out.ratio = s.ratio;
  if (s.ratioPreset === "custom" || RATIO_PRESETS.includes(s.ratioPreset)) out.ratioPreset = s.ratioPreset;
  if (s.customRatio === null || (isNum(s.customRatio) && s.customRatio > 0)) out.customRatio = s.customRatio;
  return out;
}

/** Valida un objeto importado. Devuelve { ok, state } o { ok:false, error }. */
export function validateImport(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return { ok: false, error: "El archivo no es un objeto JSON válido." };
  if (data.schemaVersion !== SCHEMA_VERSION)
    return { ok: false, error: `schemaVersion no soportado (${data.schemaVersion ?? "ausente"}). Se esperaba ${SCHEMA_VERSION}.` };
  if (!data.settings || typeof data.settings !== "object") return { ok: false, error: "Falta el bloque 'settings'." };
  if (!Array.isArray(data.records)) return { ok: false, error: "Falta la lista 'records'." };
  for (let i = 0; i < data.records.length; i++) {
    if (!validateRecord(data.records[i])) return { ok: false, error: `Registro #${i + 1} inválido.` };
  }
  const records = [...data.records].sort((a, b) => a.ts - b.ts);
  return { ok: true, state: { schemaVersion: SCHEMA_VERSION, settings: sanitizeSettings(data.settings), records } };
}

/** Normaliza lo leído de localStorage (con migración futura por schemaVersion). */
export function migrate(raw) {
  if (!raw || typeof raw !== "object") return defaultState();
  // Aquí irían migraciones: if (raw.schemaVersion === 0) {...}
  if (raw.schemaVersion !== SCHEMA_VERSION) return defaultState();
  const records = Array.isArray(raw.records) ? raw.records.filter(validateRecord) : [];
  return { schemaVersion: SCHEMA_VERSION, settings: sanitizeSettings(raw.settings), records };
}

// ---------- Estadísticas ----------
export function winRate(list) {
  const wins = list.filter((r) => r.result === "win").length;
  const total = list.length;
  return { wins, losses: total - wins, total, pct: total ? (wins / total) * 100 : null };
}

export function groupBy(records, keyFn) {
  const m = new Map();
  for (const r of records) {
    const k = keyFn(r);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
}

export function sumDelta(list) {
  return list.reduce((s, r) => s + r.delta, 0);
}

export function averages(records) {
  const periods = {
    day: (r) => r.dayKey,
    week: (r) => isoWeekKey(r.dayKey),
    month: (r) => r.dayKey.slice(0, 7),
    year: (r) => r.dayKey.slice(0, 4),
  };
  const out = {};
  for (const [name, fn] of Object.entries(periods)) {
    const g = groupBy(records, fn);
    const n = g.size;
    out[name] = { periods: n, avg: n ? Math.round(sumDelta(records) / n) : null };
  }
  return out;
}

export function capitalSeries(records) {
  if (!records.length) return [];
  const pts = [{ ts: records[0].ts, value: records[0].capitalBefore, start: true }];
  for (const r of records) pts.push({ ts: r.ts, value: r.capitalAfter, result: r.result });
  return pts;
}

export function streaks(records) {
  let bestWin = 0, worstLose = 0, cur = 0, curType = null;
  for (const r of records) {
    if (r.result === curType) cur++;
    else { curType = r.result; cur = 1; }
    if (curType === "win") bestWin = Math.max(bestWin, cur);
    else worstLose = Math.max(worstLose, cur);
  }
  return { bestWin, worstLose, current: curType ? { type: curType, count: cur } : null };
}

export function drawdown(records) {
  const s = capitalSeries(records);
  let peak = -Infinity, maxDD = 0, maxPct = 0;
  for (const p of s) {
    if (p.value > peak) peak = p.value;
    const dd = peak - p.value;
    if (dd > maxDD) maxDD = dd;
    if (peak > 0 && dd / peak > maxPct) maxPct = dd / peak;
  }
  return { coins: maxDD, pct: maxPct * 100, maxCapital: s.length ? Math.max(...s.map((p) => p.value)) : null };
}

export function bestWorstDay(records) {
  const g = groupBy(records, (r) => r.dayKey);
  let best = null, worst = null;
  for (const [k, list] of g) {
    const net = sumDelta(list);
    if (!best || net > best.net) best = { dayKey: k, net };
    if (!worst || net < worst.net) worst = { dayKey: k, net };
  }
  return { best, worst };
}

export function monthSeries(records, todayKey) {
  const ym = todayKey.slice(0, 7);
  const g = groupBy(records.filter((r) => r.dayKey.startsWith(ym)), (r) => r.dayKey);
  return [...g.keys()].sort().map((k) => ({ dayKey: k, ...winRate(g.get(k)), net: sumDelta(g.get(k)) }));
}

export function yearSeries(records, todayKey) {
  const y = todayKey.slice(0, 4);
  const out = [];
  for (let m = 1; m <= 12; m++) {
    const list = records.filter((r) => r.dayKey.startsWith(`${y}-${pad(m)}`));
    out.push({ month: m, ...winRate(list), net: sumDelta(list) });
  }
  return out;
}

/** Celdas del heatmap: semanas (lun-dom) que cubren los últimos `weeks` periodos hasta hoy. */
export function heatmap(records, todayKey, weeks = 13) {
  const g = groupBy(records, (r) => r.dayKey);
  const lastMonday = addDays(todayKey, -weekday(todayKey));
  const start = addDays(lastMonday, -(weeks - 1) * 7);
  const cols = [];
  let maxCount = 0;
  for (let w = 0; w < weeks; w++) {
    const col = [];
    for (let d = 0; d < 7; d++) {
      const k = addDays(start, w * 7 + d);
      const list = g.get(k) || [];
      maxCount = Math.max(maxCount, list.length);
      col.push({ dayKey: k, count: list.length, net: sumDelta(list), future: k > todayKey });
    }
    cols.push(col);
  }
  return { cols, maxCount };
}
