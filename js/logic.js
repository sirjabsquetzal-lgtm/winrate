// WinRate — lógica pura (sin DOM). Se usa en la app y en los tests de Node.

// v2: agrega `movements` (abonos y retiros) · v3: resultado "tie" y `expected` (cantidad calculada) en cada ronda
export const SCHEMA_VERSION = 3;
export const SUPPORTED_SCHEMAS = [1, 2, 3];
export const APP_VERSION = "1.5.0";
export const MAX_LOSSES_PER_DAY = 2;
export const DAY_START_HOUR = 6;
export const DEFAULT_PROFIT_TARGET = 10; // % de ganancia diaria para el control de ganancia
export const DEFAULT_LOSS_LIMIT = 10; // % de pérdida diaria para el control de pérdida (stop loss)
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
    profitLock: false, // control de ganancia: bloquea el día al llegar a la meta
    profitTarget: DEFAULT_PROFIT_TARGET,
    lossControl: false, // control de pérdida: bloquea el día al llegar al límite de pérdida
    lossLimit: DEFAULT_LOSS_LIMIT,
  };
}

export function defaultState() {
  return { schemaVersion: SCHEMA_VERSION, settings: defaultSettings(), records: [], movements: [] };
}

// ---------- Cálculos de la calculadora ----------
export function toInt(v) {
  const n = typeof v === "number" ? v : parseInt(String(v ?? "").replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
}

// ---------- Coins con hasta 2 decimales ----------
// El juego paga cantidades como 4.98, así que las Coins se guardan como números redondeados a 2 decimales.
export function round2(n) {
  const r = Math.round(n * 100) / 100;
  return r === 0 ? 0 : r; // evita -0
}

export function isMoney(v) {
  return typeof v === "number" && Number.isFinite(v) && Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;
}

/** Lee lo que escribe el usuario: "4.98", "4,98", "120". NaN si no es válido o tiene más de 2 decimales. */
export function parseMoney(input) {
  const str = String(input ?? "").trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(str)) return NaN;
  return round2(Number(str));
}

export function toMoney(v) {
  if (typeof v === "number") return Number.isFinite(v) ? round2(v) : NaN;
  return parseMoney(v);
}

export function calcInvestment(capital, bullets) {
  const c = toMoney(capital);
  const b = toInt(bullets);
  if (!Number.isFinite(c) || !Number.isFinite(b) || b <= 0 || c <= 0) return 0;
  return Math.floor(c / b);
}

export function calcProjection(capital, bullets, ratio) {
  const c = Math.max(0, toMoney(capital) || 0);
  const invested = calcInvestment(c, bullets);
  const gain = Math.floor(invested * ratio);
  return {
    invested,
    gain,
    winCapital: round2(c + gain),
    loss: invested,
    loseCapital: round2(c - invested),
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

/**
 * Meta de ganancia del día de juego. La base es el capital con el que empezó la primera ronda del día;
 * el avance es la suma de las rondas (abonos y retiros no cuentan). Se cumple con ≥ 1 WIN y avance ≥ meta.
 */
export function dayGoal(records, key, settings = {}) {
  const target = isNum(settings.profitTarget) && settings.profitTarget > 0 ? settings.profitTarget : DEFAULT_PROFIT_TARGET;
  const recs = dayRecords(records, key);
  const base = recs.length ? recs[0].capitalBefore : null;
  const net = sumDelta(recs);
  const wins = recs.filter((r) => r.result === "win").length;
  const pct = base > 0 ? (net / base) * 100 : 0;
  const active = settings.profitLock === true;
  return { active, target, base, net, wins, pct, goalCoins: base > 0 ? round2((base * target) / 100) : null, reached: active && wins >= 1 && pct >= target - 1e-9 };
}

/**
 * Límite de pérdida del día (stop loss), espejo de dayGoal: misma base y mismo avance.
 * Se activa con ≥ 1 LOSE y avance ≤ −límite.
 */
export function dayStop(records, key, settings = {}) {
  const limit = isNum(settings.lossLimit) && settings.lossLimit > 0 ? settings.lossLimit : DEFAULT_LOSS_LIMIT;
  const recs = dayRecords(records, key);
  const base = recs.length ? recs[0].capitalBefore : null;
  const net = sumDelta(recs);
  const losses = recs.filter((r) => r.result === "lose").length;
  const pct = base > 0 ? (net / base) * 100 : 0;
  const active = settings.lossControl === true;
  return { active, limit, base, net, losses, pct, limitCoins: base > 0 ? round2((base * limit) / 100) : null, reached: active && losses >= 1 && pct <= -limit + 1e-9 };
}

/**
 * Estado de bloqueo del día. Prioridad del motivo: "losses" (2 pérdidas) > "stop" (límite de pérdida %) > "goal" (meta de ganancia).
 * `settings` es opcional: sin él solo aplica el límite de 2 pérdidas.
 */
export function lockStatus(records, now, settings = {}) {
  const key = dayKey(now);
  const losses = lossesOnDay(records, key);
  const goal = dayGoal(records, key, settings);
  const stop = dayStop(records, key, settings);
  const lossLock = losses >= MAX_LOSSES_PER_DAY;
  const locked = lossLock || stop.reached || goal.reached;
  return {
    dayKey: key,
    losses,
    lives: Math.max(0, MAX_LOSSES_PER_DAY - losses),
    locked,
    reason: lossLock ? "losses" : stop.reached ? "stop" : goal.reached ? "goal" : null,
    goal,
    stop,
    unlockAt: locked ? nextReset(now) : null,
  };
}

// ---------- Registros ----------
let idCounter = 0;
function newId(ts) {
  idCounter = (idCounter + 1) % 1e6;
  return `${ts.toString(36)}-${idCounter.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export const RESULTS = ["win", "lose", "tie"];

/**
 * Valida la cantidad real que escribe el usuario. Devuelve null si es válida o el motivo.
 * WIN/LOSE: magnitud > 0 con hasta 2 decimales. TIE: delta con signo (comisión negativa o pequeña ganancia), puede ser 0.
 */
export function checkAmount(result, amount, capitalBefore) {
  if (result === "tie") {
    if (!isMoney(amount)) return "amount";
    return -amount > capitalBefore ? "exceeds" : null;
  }
  if (!isMoney(amount) || amount <= 0) return "amount";
  if (result === "lose" && amount > capitalBefore) return "exceeds";
  return null;
}

/**
 * Registra un resultado. `amount` es la cantidad real: en WIN/LOSE la magnitud ganada o perdida (> 0, hasta 2 decimales);
 * en TIE el cambio con signo (p. ej. −3 por comisión). Si se omite se usa la calculada (TIE = 0).
 * Devuelve { ok, state, record, scenario } o { ok:false, reason }.
 * scenario: "win" | "tie" | "lose1" | "lock"
 */
export function recordResult(state, result, now, amount) {
  if (!RESULTS.includes(result)) return { ok: false, reason: "result" };
  const lock = lockStatus(state.records, now, state.settings);
  if (lock.locked) return { ok: false, reason: "locked" };
  const s = state.settings;
  const capitalBefore = toMoney(s.capital);
  const bullets = toInt(s.bullets);
  if (!Number.isFinite(capitalBefore) || !Number.isFinite(bullets) || bullets <= 0)
    return { ok: false, reason: "invalid" };
  const p = calcProjection(capitalBefore, bullets, s.ratio);
  if (p.invested <= 0) return { ok: false, reason: "insufficient" };
  const expected = result === "win" ? p.gain : result === "lose" ? -p.invested : 0;
  const real = amount === undefined || amount === null ? (result === "tie" ? 0 : Math.abs(expected)) : amount;
  const bad = checkAmount(result, real, capitalBefore);
  if (bad) return { ok: false, reason: bad };
  const delta = round2(result === "lose" ? -real : real);
  const record = {
    id: newId(now),
    ts: now,
    dayKey: dayKey(now),
    capitalBefore,
    bullets,
    ratio: s.ratio,
    invested: p.invested,
    result,
    expected,
    delta,
    capitalAfter: round2(capitalBefore + delta),
  };
  const records = [...state.records, record];
  const next = { ...state, settings: { ...s, capital: record.capitalAfter }, records };
  let scenario = result;
  if (lossesOnDay(records, record.dayKey) >= MAX_LOSSES_PER_DAY && result === "lose") scenario = "lock";
  else if (dayStop(records, record.dayKey, s).reached) scenario = "stop"; // esta ronda llegó al límite de pérdida
  else if (result === "lose") scenario = "lose1";
  else if (dayGoal(records, record.dayKey, s).reached) scenario = "goal"; // esta ronda cumplió la meta del día
  return { ok: true, state: next, record, scenario };
}

// ---------- Movimientos (abonos / retiros) ----------
// No son rondas: no cuentan para el win rate, las rachas ni el bloqueo diario.
export const MOVEMENT_TYPES = ["deposit", "withdraw"];
export const MAX_NOTE = 40;

/** Registra un abono ("deposit") o retiro ("withdraw"). Devuelve { ok, state, movement } o { ok:false, reason }. */
export function recordMovement(state, type, amount, now, note = "") {
  if (!MOVEMENT_TYPES.includes(type)) return { ok: false, reason: "type" };
  const amt = typeof amount === "number" ? amount : parseMoney(amount);
  if (!isMoney(amt) || amt <= 0) return { ok: false, reason: "amount" };
  const capitalBefore = Number.isFinite(toMoney(state.settings.capital)) ? toMoney(state.settings.capital) : 0;
  if (type === "withdraw" && amt > capitalBefore) return { ok: false, reason: "exceeds" };
  const delta = type === "deposit" ? amt : -amt;
  const movement = {
    id: newId(now),
    ts: now,
    dayKey: dayKey(now),
    type,
    amount: amt,
    capitalBefore,
    capitalAfter: round2(capitalBefore + delta),
    note: String(note || "").trim().slice(0, MAX_NOTE),
  };
  return {
    ok: true,
    movement,
    state: { ...state, settings: { ...state.settings, capital: movement.capitalAfter }, movements: [...(state.movements || []), movement] },
  };
}

/** La entrada más reciente de la línea de tiempo (ronda o movimiento). */
export function lastEntry(state) {
  const r = state.records[state.records.length - 1];
  const m = (state.movements || [])[(state.movements || []).length - 1];
  if (!r && !m) return null;
  if (!m || (r && r.ts >= m.ts)) return { kind: "record", entry: r };
  return { kind: "movement", entry: m };
}

/** Deshace la entrada más reciente (ronda o movimiento) y regresa el capital a su "capital anterior". */
export function undoLast(state) {
  const last = lastEntry(state);
  if (!last) return { ok: false, state };
  const removed = last.entry;
  const next = { ...state, settings: { ...state.settings, capital: removed.capitalBefore } };
  if (last.kind === "record") next.records = state.records.slice(0, -1);
  else next.movements = state.movements.slice(0, -1);
  return { ok: true, kind: last.kind, removed, state: next };
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
  stop: [
    "Stop loss activado. Hoy se protege lo que queda; mañana se recupera con calma.",
    "Límite de pérdida alcanzado. Parar a tiempo también es ganar.",
    "Hasta aquí por hoy. El capital que conservas es tu próxima oportunidad.",
    "Freno de mano activado. Respira, desconecta y vuelve mañana.",
    "Día cerrado en rojo, pero bajo control. Los pros saben cortar pérdidas.",
  ],
  goal: [
    "¡Meta del día cumplida! Guarda las Coins y ve a disfrutar.",
    "Objetivo logrado. Los profesionales cobran y se retiran.",
    "¡GG! Llegaste a tu meta. Mañana se juega otra vez.",
    "Ganancia asegurada. Hoy ganó la disciplina.",
    "¡Misión cumplida! Apaga la pantalla con la sonrisa puesta.",
  ],
  tie: [
    "Empate. Tus vidas siguen intactas, sigue con el plan.",
    "Ronda neutral. Respira y sigue.",
    "Tablas. No perder también es jugar bien.",
    "Ronda neutra. Mantén la calma y el enfoque.",
    "Empate técnico. Siguiente ronda con calma.",
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
    { schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), app: "WinRate", settings: state.settings, records: state.records, movements: state.movements || [] },
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
    isMoney(r.capitalBefore) && isInt(r.bullets) && r.bullets > 0 &&
    isNum(r.ratio) && r.ratio > 0 && isMoney(r.invested) && r.invested >= 0 &&
    RESULTS.includes(r.result) &&
    isMoney(r.delta) && isMoney(r.capitalAfter) && r.capitalAfter === round2(r.capitalBefore + r.delta) &&
    (r.result !== "win" || r.delta >= 0) &&
    (r.result !== "lose" || r.delta <= 0) &&
    (r.expected === undefined || isMoney(r.expected))
  );
}

// v1/v2 no guardaban `expected`: en esas rondas la cantidad real era la calculada
const normRecord = (r) => ({ ...r, expected: r.expected ?? r.delta });

export function validateMovement(m) {
  return (
    m && typeof m === "object" &&
    typeof m.id === "string" && m.id.length > 0 &&
    isNum(m.ts) && typeof m.dayKey === "string" && KEY_RE.test(m.dayKey) &&
    MOVEMENT_TYPES.includes(m.type) && isMoney(m.amount) && m.amount > 0 &&
    isMoney(m.capitalBefore) && isMoney(m.capitalAfter) &&
    m.capitalAfter === round2(m.capitalBefore + (m.type === "deposit" ? m.amount : -m.amount)) &&
    (m.note === undefined || typeof m.note === "string")
  );
}

export function sanitizeSettings(s) {
  const d = defaultSettings();
  if (!s || typeof s !== "object") return d;
  const out = { ...d };
  if (typeof s.playerName === "string") out.playerName = s.playerName.slice(0, 16);
  if (s.theme === "dark" || s.theme === "light") out.theme = s.theme;
  if (typeof s.sound === "boolean") out.sound = s.sound;
  if (s.capital === null || isMoney(s.capital)) out.capital = s.capital;
  if (isInt(s.bullets) && s.bullets > 0) out.bullets = s.bullets;
  if (isNum(s.ratio) && s.ratio > 0) out.ratio = s.ratio;
  if (s.ratioPreset === "custom" || RATIO_PRESETS.includes(s.ratioPreset)) out.ratioPreset = s.ratioPreset;
  if (s.customRatio === null || (isNum(s.customRatio) && s.customRatio > 0)) out.customRatio = s.customRatio;
  if (typeof s.profitLock === "boolean") out.profitLock = s.profitLock;
  if (isNum(s.profitTarget) && s.profitTarget > 0 && s.profitTarget <= 1000) out.profitTarget = s.profitTarget;
  if (typeof s.lossControl === "boolean") out.lossControl = s.lossControl;
  if (isNum(s.lossLimit) && s.lossLimit > 0 && s.lossLimit <= 100) out.lossLimit = s.lossLimit;
  return out;
}

/** Valida un objeto importado. Devuelve { ok, state } o { ok:false, error }. */
export function validateImport(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return { ok: false, error: "El archivo no es un objeto JSON válido." };
  if (!SUPPORTED_SCHEMAS.includes(data.schemaVersion))
    return { ok: false, error: `schemaVersion no soportado (${data.schemaVersion ?? "ausente"}). Se esperaba ${SUPPORTED_SCHEMAS.join(", ")}.` };
  if (!data.settings || typeof data.settings !== "object") return { ok: false, error: "Falta el bloque 'settings'." };
  if (!Array.isArray(data.records)) return { ok: false, error: "Falta la lista 'records'." };
  for (let i = 0; i < data.records.length; i++) {
    if (!validateRecord(data.records[i])) return { ok: false, error: `Registro #${i + 1} inválido.` };
  }
  // v1 no tenía movimientos
  const rawMov = data.schemaVersion === 1 ? data.movements ?? [] : data.movements;
  if (!Array.isArray(rawMov)) return { ok: false, error: "Falta la lista 'movements'." };
  for (let i = 0; i < rawMov.length; i++) {
    if (!validateMovement(rawMov[i])) return { ok: false, error: `Movimiento #${i + 1} inválido.` };
  }
  const records = data.records.map(normRecord).sort((a, b) => a.ts - b.ts);
  const movements = rawMov.map((m) => ({ ...m, note: m.note ?? "" })).sort((a, b) => a.ts - b.ts);
  return { ok: true, state: { schemaVersion: SCHEMA_VERSION, settings: sanitizeSettings(data.settings), records, movements } };
}

/** Normaliza lo leído de localStorage (con migración futura por schemaVersion). */
export function migrate(raw) {
  if (!raw || typeof raw !== "object") return defaultState();
  if (!SUPPORTED_SCHEMAS.includes(raw.schemaVersion)) return defaultState();
  const records = Array.isArray(raw.records) ? raw.records.filter(validateRecord).map(normRecord) : [];
  // v1 → v2: se agrega la lista de movimientos vacía
  const movements = Array.isArray(raw.movements) ? raw.movements.filter(validateMovement).map((m) => ({ ...m, note: m.note ?? "" })) : [];
  return { schemaVersion: SCHEMA_VERSION, settings: sanitizeSettings(raw.settings), records, movements };
}

// ---------- Estadísticas ----------
/** Win rate = W / (W + L). Los empates se cuentan aparte y no entran al porcentaje. */
export function winRate(list) {
  const wins = list.filter((r) => r.result === "win").length;
  const losses = list.filter((r) => r.result === "lose").length;
  const decided = wins + losses;
  return { wins, losses, ties: list.length - decided, decided, total: list.length, pct: decided ? (wins / decided) * 100 : null };
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
  return round2(list.reduce((s, r) => s + r.delta, 0));
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
    out[name] = { periods: n, avg: n ? round2(sumDelta(records) / n) : null };
  }
  return out;
}

/** Curva de capital con rondas y movimientos en orden cronológico. */
export function capitalSeries(records, movements = []) {
  const all = [
    ...records.map((r) => ({ ts: r.ts, before: r.capitalBefore, value: r.capitalAfter, result: r.result, flow: 0 })),
    ...movements.map((m) => ({ ts: m.ts, before: m.capitalBefore, value: m.capitalAfter, movement: m.type, flow: m.capitalAfter - m.capitalBefore })),
  ].sort((a, b) => a.ts - b.ts);
  if (!all.length) return [];
  return [{ ts: all[0].ts, value: all[0].before, start: true, flow: 0 }, ...all];
}

export function streaks(records) {
  let bestWin = 0, worstLose = 0, cur = 0, curType = null;
  for (const r of records) {
    if (r.result === "tie") continue; // un empate no suma ni rompe rachas
    if (r.result === curType) cur++;
    else { curType = r.result; cur = 1; }
    if (curType === "win") bestWin = Math.max(bestWin, cur);
    else worstLose = Math.max(worstLose, cur);
  }
  return { bestWin, worstLose, current: curType ? { type: curType, count: cur } : null };
}

/**
 * Caída máxima desde el pico, medida solo con el resultado de las rondas:
 * a la curva se le restan los abonos/retiros acumulados, así un retiro no cuenta como pérdida.
 * maxCapital sí es el capital real más alto (incluye movimientos).
 */
export function drawdown(records, movements = []) {
  const s = capitalSeries(records, movements);
  let peak = -Infinity, maxDD = 0, maxPct = 0, flows = 0;
  for (const p of s) {
    flows = round2(flows + p.flow);
    if (p.result === undefined && !p.start) continue; // los movimientos no mueven la curva de rendimiento
    const v = round2(p.value - flows);
    if (v > peak) peak = v;
    const dd = round2(peak - v);
    if (dd > maxDD) maxDD = dd;
    if (peak > 0 && dd / peak > maxPct) maxPct = dd / peak;
  }
  return { coins: maxDD, pct: maxPct * 100, maxCapital: s.length ? Math.max(...s.map((p) => p.value)) : null };
}

/** Métricas de abonos y retiros. */
export function flowStats(movements, todayKey) {
  const sum = (list, type) => list.filter((m) => m.type === type).reduce((s, m) => round2(s + m.amount), 0);
  const count = (list, type) => list.filter((m) => m.type === type).length;
  const month = movements.filter((m) => m.dayKey.startsWith(todayKey.slice(0, 7)));
  const y = todayKey.slice(0, 4);
  const byMonth = [];
  for (let mo = 1; mo <= 12; mo++) {
    const list = movements.filter((m) => m.dayKey.startsWith(`${y}-${pad(mo)}`));
    byMonth.push({ month: mo, deposit: sum(list, "deposit"), withdraw: sum(list, "withdraw") });
  }
  const deposit = sum(movements, "deposit");
  const withdraw = sum(movements, "withdraw");
  const withdrawals = movements.filter((m) => m.type === "withdraw");
  return {
    deposit, withdraw,
    depositCount: count(movements, "deposit"),
    withdrawCount: count(movements, "withdraw"),
    net: round2(withdraw - deposit), // > 0: ya sacaste más de lo que metiste
    monthDeposit: sum(month, "deposit"),
    monthWithdraw: sum(month, "withdraw"),
    biggestWithdraw: withdrawals.length ? Math.max(...withdrawals.map((m) => m.amount)) : 0,
    byMonth,
  };
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
