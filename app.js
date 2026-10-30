// WinRate — punto de entrada de la UI.
import {
  APP_VERSION, SCHEMA_VERSION, RATIO_PRESETS, PHRASES, MAX_LOSSES_PER_DAY,
  defaultState, toMoney, parseMoney, round2, calcProjection, parseRatio, formatRatio, dayKey, lockStatus, addDays,
  recordResult, recordMovement, undoLast, lastEntry, flowStats, pickPhraseIndex, exportState, validateImport, localDateKey,
  winRate, dayRecords, groupBy, sumDelta, averages, streaks, drawdown, bestWorstDay, heatmap, weekday,
} from "./js/logic.js";
import { loadState, saveState, clearState } from "./js/storage.js";
import { sfx, setSoundEnabled } from "./js/audio.js";
import { pixelSvg, mountIcons } from "./js/icons.js";
import { animateNumber, shake, flash, burst } from "./js/fx.js";
import { renderCharts, MONTHS } from "./js/charts.js";

const $ = (id) => document.getElementById(id);
const fmt = (n) => Number(n).toLocaleString("es-MX", { maximumFractionDigits: 2 });
const signed = (n) => (n > 0 ? "+" : n < 0 ? "−" : "±") + fmt(Math.abs(n));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
// Sin acentos: Press Start 2P dibuja mal las mayúsculas acentuadas
const DOW = ["LUN", "MAR", "MIE", "JUE", "VIE", "SAB", "DOM"];

function dayLabel(key, withYear = false) {
  const [y, m, d] = key.split("-");
  return `${DOW[weekday(key)]} ${d} ${MONTHS[Number(m) - 1]}${withYear ? " " + y : ""}`;
}
function timeLabel(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Deja solo dígitos y un separador decimal (punto o coma → punto), con máx. 2 decimales. */
function cleanMoneyInput(v) {
  let out = String(v).replace(",", ".").replace(/[^\d.]/g, "");
  const i = out.indexOf(".");
  if (i !== -1) out = out.slice(0, i + 1) + out.slice(i + 1).replace(/\./g, "").slice(0, 2);
  return out.slice(0, 15);
}
const MONEY_ERR = "Escribe una cantidad válida (hasta 2 decimales, ej. 4.98).";

// ---------------- Estado ----------------
let state = loadState();
let activeTab = "calc";
let lastLock = null;
let shownInvest = null;
const lastPhrase = {};
let newRecordId = null;
let histFilter = "all";

function commit(next) {
  state = next;
  saveState(state);
}

// ---------------- Tema / sonido ----------------
function applyTheme() {
  const th = state.settings.theme;
  document.documentElement.setAttribute("data-theme", th);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", th === "light" ? "#ffffff" : "#050507");
  document.querySelectorAll("[data-theme-opt]").forEach((b) => b.classList.toggle("is-active", b.dataset.themeOpt === th));
  document.querySelectorAll("[data-sound-opt]").forEach((b) => b.classList.toggle("is-active", (b.dataset.soundOpt === "on") === state.settings.sound));
  renderGoalSettings();
  renderStopSettings();
  setSoundEnabled(state.settings.sound);
  if (activeTab === "stats") renderStats();
}

// ---------------- Control de ganancia (Settings) ----------------
function renderGoalSettings() {
  const s = state.settings;
  const goalLocked = lockStatus(state.records, Date.now(), s).reason === "goal";
  document.querySelectorAll("[data-goal-opt]").forEach((b) => {
    b.classList.toggle("is-active", (b.dataset.goalOpt === "on") === s.profitLock);
    // con la meta cumplida no se puede apagar hasta mañana (si no, el control no serviría)
    b.disabled = goalLocked && b.dataset.goalOpt === "off";
  });
  if (document.activeElement !== $("inGoal")) $("inGoal").value = s.profitTarget;
  $("inGoal").disabled = goalLocked;
  $("goalNote").classList.toggle("warn-note", goalLocked);
  $("goalNote").textContent = goalLocked
    ? "Meta cumplida hoy: el control se puede apagar o cambiar después de las 06:00."
    : s.profitLock
      ? `Al llegar a +${s.profitTarget}% del capital con que empezaste el día (con al menos 1 WIN), se bloquea el registro hasta las 06:00.`
      : "Apagado. Actívalo para que la app te detenga al llegar a tu meta diaria.";
}

function renderStopSettings() {
  const s = state.settings;
  const stopLocked = lockStatus(state.records, Date.now(), s).reason === "stop";
  document.querySelectorAll("[data-stop-opt]").forEach((b) => {
    b.classList.toggle("is-active", (b.dataset.stopOpt === "on") === s.lossControl);
    // con el límite alcanzado no se puede apagar hasta mañana
    b.disabled = stopLocked && b.dataset.stopOpt === "off";
  });
  if (document.activeElement !== $("inStop")) $("inStop").value = s.lossLimit;
  $("inStop").disabled = stopLocked;
  $("stopNote").classList.toggle("warn-note", stopLocked);
  $("stopNote").textContent = stopLocked
    ? "Límite de pérdida alcanzado hoy: el control se puede apagar o cambiar después de las 06:00."
    : s.lossControl
      ? `Al perder ${s.lossLimit}% del capital con que empezaste el día (con al menos 1 LOSE), se bloquea el registro hasta las 06:00.`
      : "Apagado. Actívalo para que la app te detenga al llegar a tu pérdida máxima del día.";
}

function setGoal(patch) {
  commit({ ...state, settings: { ...state.settings, ...patch } });
  renderGoalSettings();
  renderStopSettings();
  renderCalc({ syncInputs: false });
  if (activeTab === "stats") renderStats();
}

// ---------------- Header ----------------
function renderHeader() {
  $("playerName").textContent = (state.settings.playerName || "---").toUpperCase();
}

// ---------------- Calculator ----------------
function renderCalc({ syncInputs = true } = {}) {
  const s = state.settings;
  if (syncInputs) {
    if (document.activeElement !== $("inCapital")) $("inCapital").value = s.capital ?? "";
    if (document.activeElement !== $("inBullets")) $("inBullets").value = s.bullets;
  }
  $("ratioDisplay").textContent = formatRatio(s.ratio);
  document.querySelectorAll("[data-ratio]").forEach((b) => {
    const on = b.dataset.ratio === s.ratioPreset;
    b.classList.toggle("is-active", on);
    b.setAttribute("aria-checked", on);
  });
  if (s.ratioPreset === "custom") {
    $("customRow").hidden = false;
    if (document.activeElement !== $("inCustom") && s.customRatio) $("inCustom").value = s.customRatio;
  }

  const capital = toMoney(s.capital);
  const p = calcProjection(Number.isFinite(capital) ? capital : 0, s.bullets, s.ratio);
  const insufficient = p.invested <= 0;

  $("investOut").hidden = insufficient;
  $("investWarn").hidden = !insufficient;
  if (!insufficient && shownInvest !== p.invested) {
    const from = shownInvest ?? p.invested;
    animateNumber(from, p.invested, (v) => ($("investOut").textContent = fmt(v)), 450);
    if (shownInvest !== null) {
      $("investOut").classList.remove("bump");
      void $("investOut").offsetWidth;
      $("investOut").classList.add("bump");
    }
    shownInvest = p.invested;
  }
  if (insufficient) shownInvest = null;

  $("projWinDelta").textContent = "+" + fmt(p.gain);
  $("projWinCap").textContent = fmt(p.winCapital);
  $("projLoseDelta").textContent = "−" + fmt(p.loss);
  $("projLoseCap").textContent = fmt(p.loseCapital);

  renderLock();
  const locked = lastLock?.locked;
  $("btnWin").disabled = insufficient || locked;
  $("btnLose").disabled = insufficient || locked;
  $("btnTie").disabled = insufficient || locked;
}

function renderHearts(lock, animateLoss = false) {
  let html = "";
  for (let i = 0; i < MAX_LOSSES_PER_DAY; i++) {
    const full = i < lock.lives;
    const lost = animateLoss && i === lock.lives;
    html += pixelSvg(full ? "heartFull" : "heartEmpty", full ? "heart-full" : "heart-empty" + (lost ? " heart-lost" : ""));
  }
  $("hearts").innerHTML = html;
  $("hearts").setAttribute("aria-label", `${lock.lives} de ${MAX_LOSSES_PER_DAY} vidas`);
}

const lockSig = (l) => [l.locked, l.lives, l.dayKey, l.reason, l.goal.active, l.goal.net, l.goal.target, l.stop.active, l.stop.limit].join("|");
const pctLabel = (p) => (p > 0 ? "+" : p < 0 ? "−" : "") + Math.abs(p).toFixed(1) + "%";

function renderLock(animateLoss = false) {
  const lock = lockStatus(state.records, Date.now(), state.settings);
  const changed = !lastLock || lockSig(lastLock) !== lockSig(lock);
  lastLock = lock;
  if (changed || animateLoss) renderHearts(lock, animateLoss);
  $("dayLabel").textContent = "DÍA " + dayLabel(lock.dayKey);
  renderGoalRow(lock.goal);
  renderStopRow(lock.stop);
  $("lockPanel").hidden = !lock.locked;
  document.querySelector(".final").classList.toggle("locked", lock.locked);
  if (lock.locked && changed) {
    const isGoal = lock.reason === "goal";
    const title = { goal: "TARGET REACHED", stop: "STOP LOSS" }[lock.reason] || "SYSTEM LOCKED";
    $("lockPanel").classList.toggle("goal", isGoal);
    $("lockIcon").innerHTML = pixelSvg(isGoal ? "trophy" : "lock");
    $("lockTitle").textContent = title;
    $("lockTitle").dataset.text = title;
    $("lockReason").textContent = isGoal
      ? `Meta de +${lock.goal.target}% cumplida: ${signed(lock.goal.net)} Coins (${pctLabel(lock.goal.pct)})`
      : lock.reason === "stop"
        ? `Límite de −${lock.stop.limit}% alcanzado: ${signed(lock.stop.net)} Coins (${pctLabel(lock.stop.pct)})`
        : "Límite diario de 2 pérdidas alcanzado";
  }
  if (lock.locked) updateCountdown();
  return changed;
}

function renderGoalRow(goal) {
  $("goalRow").hidden = !goal.active;
  if (!goal.active) return;
  const progress = goal.target > 0 ? Math.max(0, Math.min(100, (goal.pct / goal.target) * 100)) : 0;
  $("goalFill").style.width = progress + "%";
  $("goalText").textContent = `${pctLabel(goal.pct)} / ${goal.target}%`;
  $("goalRow").classList.toggle("done", goal.reached);
}

// Barra de pérdida: se llena conforme el día baja hacia el límite
function renderStopRow(stop) {
  $("stopRow").hidden = !stop.active;
  if (!stop.active) return;
  const progress = stop.limit > 0 ? Math.max(0, Math.min(100, (-stop.pct / stop.limit) * 100)) : 0;
  $("stopFill").style.width = progress + "%";
  $("stopText").textContent = `${pctLabel(stop.pct)} / −${stop.limit}%`;
  $("stopRow").classList.toggle("done", stop.reached);
}

function updateCountdown() {
  if (!lastLock?.locked) return;
  const ms = Math.max(0, lastLock.unlockAt - Date.now());
  const s = Math.floor(ms / 1000);
  const p = (n) => String(n).padStart(2, "0");
  $("lockCountdown").textContent = `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

function onCapitalInput() {
  const el = $("inCapital");
  const clean = cleanMoneyInput(el.value);
  if (clean !== el.value) el.value = clean;
  const n = parseMoney(clean.replace(/\.$/, ""));
  commit({ ...state, settings: { ...state.settings, capital: clean === "" || Number.isNaN(n) ? null : n } });
  renderCalc({ syncInputs: false });
}

function onBulletsInput() {
  const el = $("inBullets");
  const clean = el.value.replace(/\D/g, "").slice(0, 6);
  if (clean !== el.value) el.value = clean;
  const n = parseInt(clean, 10);
  if (n > 0) {
    el.classList.remove("invalid");
    commit({ ...state, settings: { ...state.settings, bullets: n } });
    renderCalc({ syncInputs: false });
  } else {
    el.classList.add("invalid");
  }
}

function selectRatio(preset) {
  sfx.click();
  if (preset === "custom") {
    $("customRow").hidden = false;
    $("inCustom").value = state.settings.customRatio ?? "";
    $("inCustom").focus();
    if (state.settings.customRatio) {
      commit({ ...state, settings: { ...state.settings, ratioPreset: "custom", ratio: state.settings.customRatio } });
    }
    renderCalc();
    document.querySelectorAll("[data-ratio]").forEach((b) => b.classList.toggle("is-active", b.dataset.ratio === "custom"));
    return;
  }
  $("customRow").hidden = true;
  commit({ ...state, settings: { ...state.settings, ratioPreset: preset, ratio: Number(preset) } });
  renderCalc();
}

function applyCustom() {
  const r = parseRatio($("inCustom").value);
  if (!Number.isFinite(r)) {
    $("inCustom").classList.remove("invalid");
    void $("inCustom").offsetWidth;
    $("inCustom").classList.add("invalid");
    return;
  }
  $("inCustom").classList.remove("invalid");
  sfx.click();
  commit({ ...state, settings: { ...state.settings, ratioPreset: "custom", ratio: r, customRatio: r } });
  $("inCustom").blur();
  renderCalc();
}

// ---------------- Registrar resultado ----------------
/**
 * Pide la cantidad real de la ronda (prellenada con la calculada).
 * WIN/LOSE devuelven la magnitud; TIE devuelve el cambio con signo (comisión = negativo). null si se cancela.
 */
async function askAmount(result) {
  const capital = toMoney(state.settings.capital);
  if (result === "tie") {
    const res = await openModal({
      variant: "tie",
      tag: "EMPATE · ¿COMISION?",
      text: "Comisión o ganancia del empate.",
      sub: `Capital: ${fmt(capital)}`,
      fields: [
        { id: "sign", type: "sign", options: [["-", "- PERDI"], ["+", "+ GANE"]], value: "-" },
        { id: "amount", label: "CANTIDAD (COINS)", inputmode: "decimal", big: true, value: "0", select: true },
      ],
      validate: (v) => {
        if (Number.isNaN(parseMoney(v.amount))) return MONEY_ERR + " Pon 0 si no hubo comisión.";
        if (v.sign === "-" && parseMoney(v.amount) > capital) return `No puedes perder más de tu capital (${fmt(capital)}).`;
        return null;
      },
      buttons: [{ label: "CANCELAR", value: false }, { label: "CONFIRMAR", value: true, primary: true }],
    });
    if (!res?.value) return null;
    const n = parseMoney(res.fields.amount);
    return res.fields.sign === "-" ? round2(-n) : n;
  }
  const p = calcProjection(capital, state.settings.bullets, state.settings.ratio);
  const isWin = result === "win";
  const calc = isWin ? p.gain : p.invested;
  const res = await openModal({
    variant: isWin ? "win" : "lose",
    tag: isWin ? "¿CUANTO GANASTE?" : "¿CUANTO PERDISTE?",
    text: isWin ? "Coins ganadas en la ronda." : "Coins perdidas en la ronda.",
    sub: `Calculado: ${isWin ? "+" : "−"}${fmt(calc)} · Capital: ${fmt(capital)}`,
    fields: [{ id: "amount", label: isWin ? "GANANCIA REAL (COINS)" : "PERDIDA REAL (COINS)", inputmode: "decimal", big: true, value: String(calc), select: true }],
    validate: (v) => {
      const n = parseMoney(v.amount);
      if (Number.isNaN(n)) return MONEY_ERR;
      if (n <= 0) return "La cantidad debe ser mayor a 0.";
      if (!isWin && n > capital) return `No puedes perder más de tu capital (${fmt(capital)}).`;
      return null;
    },
    buttons: [{ label: "CANCELAR", value: false }, { label: "CONFIRMAR", value: true, primary: true }],
  });
  return res?.value ? parseMoney(res.fields.amount) : null;
}

async function onResult(result) {
  const btn = { win: $("btnWin"), lose: $("btnLose"), tie: $("btnTie") }[result];
  if (btn.disabled) return;
  sfx.click();
  const amount = await askAmount(result);
  if (amount === null) return;
  const before = toMoney(state.settings.capital);
  const res = recordResult(state, result, Date.now(), amount);
  if (!res.ok) {
    if (res.reason === "locked") renderCalc();
    return;
  }
  commit(res.state);
  newRecordId = res.record.id;

  // capital animado
  animateNumber(before, res.record.capitalAfter, (v) => {
    if (document.activeElement !== $("inCapital")) $("inCapital").value = v;
  });
  renderCalc({ syncInputs: false });
  renderLock(result === "lose");
  renderWinRate();

  const rect = btn.getBoundingClientRect();
  const cs = getComputedStyle(document.documentElement);
  if (result === "win") {
    sfx.win();
    flash();
    burst(rect.left + rect.width / 2, rect.top + rect.height / 3, [cs.getPropertyValue("--red").trim(), cs.getPropertyValue("--red-hi").trim(), "#ffffff", "#c9ced8"], 90);
    if (res.scenario === "goal") setTimeout(() => {
      sfx.win();
      burst(innerWidth / 2, innerHeight / 3, [cs.getPropertyValue("--red").trim(), "#ffffff", "#c9ced8"], 120);
    }, 450);
  } else if (result === "tie") {
    if (res.scenario === "stop") { shake(); sfx.lock(); }
    else sfx.tie();
    if (res.scenario === "goal") flash();
  } else {
    shake();
    if (res.scenario === "lock" || res.scenario === "stop") sfx.lock();
    else sfx.lose();
  }

  const scenario = res.scenario;
  const idx = pickPhraseIndex(scenario, lastPhrase[scenario]);
  lastPhrase[scenario] = idx;
  const tags = { goal: `TARGET REACHED · ${pctLabel(lastLock.goal.pct)}`, stop: `STOP LOSS · ${pctLabel(lastLock.stop.pct)}`, win: "ROUND WIN", tie: "ROUND TIE", lose1: "ROUND LOST · 1 VIDA", lock: "GAME OVER · SYSTEM LOCKED" };
  await openModal({
    variant: { win: "win", goal: "win", tie: "tie", lock: "lock", stop: "lock" }[scenario] || "lose",
    tag: tags[scenario],
    big: signed(res.record.delta) + " COINS",
    text: PHRASES[scenario][idx],
    typewriter: true,
    sub: `Capital: ${fmt(res.record.capitalAfter)} Coins`,
    buttons: [{ label: "CONTINUAR", value: true, primary: true }],
  });
  if (scenario === "lock" || scenario === "goal" || scenario === "stop") $("lockPanel").scrollIntoView({ block: "center", behavior: "smooth" });
}

// ---------------- Abonar / retirar ----------------
async function onMovement(type) {
  sfx.click();
  const isDep = type === "deposit";
  const capital = Number.isFinite(toMoney(state.settings.capital)) ? toMoney(state.settings.capital) : 0;
  const res = await openModal({
    variant: isDep ? "lose" : "win",
    tag: isDep ? "ABONAR COINS" : "RETIRAR COINS",
    text: isDep ? "¿Cuántas Coins compraste para abonar a tu capital?" : "¿Cuántas Coins retiras para comprar en la tienda?",
    sub: `Capital actual: ${fmt(capital)} Coins · no afecta tu win rate`,
    fields: [
      { id: "amount", label: "CANTIDAD (COINS)", placeholder: isDep ? "500" : String(Math.max(1, Math.floor(capital / 2))), inputmode: "decimal", big: true },
      { id: "note", label: "NOTA (OPCIONAL)", placeholder: isDep ? "recarga" : "skin, pase...", maxlength: 40 },
    ],
    validate: (v) => {
      const n = parseMoney(v.amount);
      if (Number.isNaN(n)) return MONEY_ERR;
      if (n <= 0) return "La cantidad debe ser mayor a 0.";
      if (!isDep && n > capital) return `No puedes retirar más de tu capital (${fmt(capital)}).`;
      return null;
    },
    buttons: [{ label: "CANCELAR", value: false }, { label: isDep ? "ABONAR" : "RETIRAR", value: true, primary: true }],
  });
  if (!res?.value) return;
  const r = recordMovement(state, type, parseMoney(res.fields.amount), Date.now(), res.fields.note);
  if (!r.ok) return;
  commit(r.state);
  newRecordId = r.movement.id;
  sfx.coin();
  animateNumber(capital, r.movement.capitalAfter, (v) => {
    if (document.activeElement !== $("inCapital")) $("inCapital").value = v;
  });
  const btn = isDep ? $("btnDeposit") : $("btnWithdraw");
  const rect = btn.getBoundingClientRect();
  const cs = getComputedStyle(document.documentElement);
  burst(rect.left + rect.width / 2, rect.top, isDep ? ["#ffffff", cs.getPropertyValue("--silver").trim()] : [cs.getPropertyValue("--red").trim(), "#ffffff"], 40);
  renderCalc({ syncInputs: false });
  renderWinRate();
}

// ---------------- Win-Rate ----------------
const RESULT_LABEL = { win: "WIN", lose: "LOSE", tie: "TIE" };
// "W 2L" con la T solo si hubo empates
const wlt = (w) => `${w.wins}W ${w.losses}L${w.ties ? ` ${w.ties}T` : ""}`;

function recordCard(r, lastId) {
  const calc = r.expected !== undefined && r.expected !== r.delta ? `<span class="rec-calc">CALC <b>${signed(r.expected)}</b></span>` : "";
  return `<div class="hud rec ${r.result}${r.id === newRecordId ? " is-new" : ""}">
        <div class="badge ${r.result}">${RESULT_LABEL[r.result]}</div>
        <div class="rec-time">${timeLabel(r.ts)}</div>
        <div class="rec-delta">${signed(r.delta)}</div>
        <div class="rec-detail"><span>CAP <b>${fmt(r.capitalBefore)}</b> » <b>${fmt(r.capitalAfter)}</b></span><span>INV <b>${fmt(r.invested)}</b></span><span>PAGO <b>${formatRatio(r.ratio)}</b></span>${calc}</div>
        ${r.id === lastId ? `<button class="rec-undo" data-undo="${esc(r.id)}">UNDO</button>` : ""}
      </div>`;
}

function movementCard(m, lastId) {
  const dep = m.type === "deposit";
  return `<div class="hud rec move ${m.type}${m.id === newRecordId ? " is-new" : ""}">
        <div class="badge ${m.type}">${dep ? "ABONO" : "RETIRO"}</div>
        <div class="rec-time">${timeLabel(m.ts)}</div>
        <div class="rec-delta">${dep ? "+" : "−"}${fmt(m.amount)}</div>
        <div class="rec-detail"><span>CAP <b>${fmt(m.capitalBefore)}</b> » <b>${fmt(m.capitalAfter)}</b></span>${m.note ? `<span>« <i class="rec-note">${esc(m.note)}</i> »</span>` : ""}</div>
        ${m.id === lastId ? `<button class="rec-undo" data-undo="${esc(m.id)}">UNDO</button>` : ""}
      </div>`;
}

function renderWinRate() {
  const all = winRate(state.records);
  $("wrGlobal").textContent = all.pct !== null ? all.pct.toFixed(1) + "%" : "--.-%";
  $("wrWins").textContent = all.wins;
  $("wrLosses").textContent = all.losses;
  $("wrTies").textContent = all.ties;
  $("wrTotal").textContent = all.total;
  const today = winRate(dayRecords(state.records, dayKey(Date.now())));
  $("wrToday").textContent = today.total ? `${today.pct === null ? "--" : today.pct.toFixed(1) + "%"} (${wlt(today)})` : "SIN REGISTROS";

  document.querySelectorAll("[data-filter]").forEach((b) => b.classList.toggle("is-active", b.dataset.filter === histFilter));
  const list = $("recordList");
  const movements = state.movements || [];
  // Línea de tiempo combinada: rondas + abonos/retiros (estos no cuentan en W/L ni en el neto del día)
  const timeline = [
    ...(histFilter !== "moves" ? state.records.map((r) => ({ kind: "record", e: r })) : []),
    ...(histFilter !== "rounds" ? movements.map((m) => ({ kind: "movement", e: m })) : []),
  ].sort((a, b) => b.e.ts - a.e.ts);
  if (!timeline.length) {
    const sub = histFilter === "moves" ? "SIN ABONOS NI RETIROS" : "PLAY YOUR FIRST ROUND";
    list.innerHTML = `<div class="hud panel empty"><div class="empty-icon">${pixelSvg("coin")}</div><div class="empty-txt">NO DATA</div><div class="empty-sub">${sub}</div></div>`;
    return;
  }
  const lastId = lastEntry(state)?.entry.id;
  const groups = groupBy(timeline, (x) => x.e.dayKey);
  let html = "";
  for (const [key, items] of groups) {
    const recs = items.filter((x) => x.kind === "record").map((x) => x.e);
    if (recs.length) {
      const w = winRate(recs);
      html += `<div class="day-sep"><span>${dayLabel(key, true)} · ${wlt(w)}</span><span class="net">${signed(sumDelta(recs))}</span></div>`;
    } else {
      html += `<div class="day-sep moves-only"><span>${dayLabel(key, true)}</span><span class="net">BANCO</span></div>`;
    }
    for (const x of items) html += x.kind === "record" ? recordCard(x.e, lastId) : movementCard(x.e, lastId);
  }
  list.innerHTML = html;
  newRecordId = null;
}

async function onUndo() {
  const le = lastEntry(state);
  if (!le) return;
  const last = le.entry;
  sfx.click();
  const what = le.kind === "record"
    ? `${RESULT_LABEL[last.result]} ${signed(last.delta)}`
    : `${last.type === "deposit" ? "ABONO +" : "RETIRO −"}${fmt(last.amount)}`;
  const ok = await openModal({
    variant: "lose",
    tag: "UNDO",
    text: `¿Eliminar el último registro (${what})?`,
    sub: `El capital regresará a ${fmt(last.capitalBefore)} Coins.`,
    buttons: [{ label: "CANCELAR", value: false }, { label: "ELIMINAR", value: true, primary: true }],
  });
  if (!ok) return;
  const res = undoLast(state);
  if (!res.ok) return;
  const from = toMoney(state.settings.capital);
  commit(res.state);
  animateNumber(from, res.removed.capitalBefore, (v) => ($("inCapital").value = v));
  renderAll({ syncInputs: false });
}

// ---------------- Stats ----------------
function renderStats() {
  const recs = state.records;
  const movs = state.movements || [];
  const empty = recs.length === 0 && movs.length === 0;
  $("statsEmpty").hidden = !empty;
  $("statsBody").hidden = empty;
  if (empty) return;
  const today = dayKey(Date.now());
  const [y, mo] = today.split("-");
  renderFlowStats(movs, today, y);
  $("statsNoRounds").hidden = recs.length > 0;
  $("statsRounds").hidden = recs.length === 0;
  if (!recs.length) {
    renderCharts(recs, today, movs);
    return;
  }

  // Barras de vida hoy vs ayer
  const bars = [
    ["today", "HOY", winRate(dayRecords(recs, today))],
    ["yesterday", "AYER", winRate(dayRecords(recs, addDays(today, -1)))],
  ];
  $("lifeBars").innerHTML = bars.map(([cls, label, w]) => `
    <div class="lifebar ${cls}">
      <div class="lb-head"><span>${label}</span><span class="lb-pct">${w.pct !== null ? w.pct.toFixed(1) + "%" : "--"}</span></div>
      <div class="lb-track"><div class="lb-fill" style="width:0%" data-w="${w.pct ?? 0}"></div></div>
      <div class="lb-wl">${w.wins}W · ${w.losses}L${w.ties ? ` · ${w.ties}T` : ""}</div>
    </div>`).join("");
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.querySelectorAll(".lb-fill").forEach((el) => (el.style.width = el.dataset.w + "%"));
  }));

  // Promedios
  const av = averages(recs);
  const avDefs = [["day", "DIA", "por día activo", "día", "días"], ["week", "SEMANA", "por semana activa", "semana", "semanas"], ["month", "MES", "por mes activo", "mes", "meses"], ["year", "AÑO", "por año activo", "año", "años"]];
  $("avgGrid").innerHTML = avDefs.map(([k, label, sub, one, many]) => {
    const a = av[k];
    const cls = a.avg > 0 ? "pos" : a.avg < 0 ? "neg" : "";
    return `<div class="hud panel avg-card"><div class="lbl">PROM. ${label}</div><div class="avg-val ${cls}">${a.avg === null ? "--" : signed(a.avg)}</div><div class="avg-sub">${sub} (${a.periods} ${a.periods === 1 ? one : many})</div></div>`;
  }).join("");

  // Heatmap
  const hm = heatmap(recs, today, 13);
  let h = `<div></div>`;
  let lastMonth = "";
  hm.cols.forEach((col) => {
    const m = col[0].dayKey.slice(5, 7);
    h += `<div class="hm-mon">${m !== lastMonth ? MONTHS[Number(m) - 1] : ""}</div>`;
    lastMonth = m;
  });
  const dowShort = ["L", "M", "M", "J", "V", "S", "D"];
  for (let d = 0; d < 7; d++) {
    h += `<div class="hm-dow">${d % 2 === 0 ? dowShort[d] : ""}</div>`;
    for (const col of hm.cols) {
      const c = col[d];
      if (c.future) { h += `<div class="hm-cell future"></div>`; continue; }
      let style = "";
      let cls = "";
      if (c.count && c.net === 0) {
        cls = " zero";
      } else if (c.count) {
        const color = c.net > 0 ? "var(--pos)" : "var(--neg)";
        const a = 0.35 + 0.65 * (c.count / Math.max(1, hm.maxCount));
        style = `background:${color};opacity:${a.toFixed(2)}`;
      }
      const title = `${c.dayKey} · ${c.count} reg · ${signed(c.net)}`;
      h += `<div class="hm-cell${cls}${c.dayKey === today ? " today" : ""}" style="${style}" title="${title}"></div>`;
    }
  }
  $("heatmap").innerHTML = h;

  // Récords
  const st = streaks(recs);
  const dd = drawdown(recs, movs);
  const bw = bestWorstDay(recs);
  const card = (label, value, sub, cls = "", wide = false) =>
    `<div class="hud panel rcard${wide ? " wide" : ""}"><div class="lbl">${label}</div><div class="rv ${cls}">${value}</div><div class="rs">${sub}</div></div>`;
  $("records").innerHTML = [
    card("MEJOR RACHA WIN", st.bestWin, "wins seguidos", st.bestWin ? "pos" : ""),
    card("PEOR RACHA LOSE", st.worstLose, "losses seguidos", st.worstLose ? "neg" : ""),
    card("RACHA ACTUAL", st.current ? `${st.current.count}${st.current.type === "win" ? "W" : "L"}` : "--", st.current ? (st.current.type === "win" ? "en racha ganadora" : "en racha perdedora") : "", st.current?.type === "win" ? "pos" : "neg"),
    card("CAPITAL MAX.", fmt(dd.maxCapital), "histórico (Coins)", "pos"),
    card("MEJOR DIA", signed(bw.best.net), dayLabel(bw.best.dayKey, true), bw.best.net > 0 ? "pos" : "neg"),
    card("PEOR DIA", signed(bw.worst.net), dayLabel(bw.worst.dayKey, true), bw.worst.net < 0 ? "neg" : "pos"),
    card("MAX DRAWDOWN", dd.coins ? "−" + fmt(dd.coins) : "0", `desde el pico · ${dd.pct.toFixed(1)}% · sin retiros`, dd.coins ? "neg" : "", true),
  ].join("");

  $("monthName").textContent = `${MONTHS[Number(mo) - 1]} ${y}`;
  $("yearName").textContent = y;
  renderCharts(recs, today, movs);
}

function renderFlowStats(movs, today, year) {
  const f = flowStats(movs, today);
  const gameNet = sumDelta(state.records);
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const card = (label, value, sub, cls = "", wide = false) =>
    `<div class="hud panel rcard${wide ? " wide" : ""}"><div class="lbl">${label}</div><div class="rv ${cls}">${value}</div><div class="rs">${sub}</div></div>`;
  $("flowCards").innerHTML = [
    card("TOTAL RETIRADO", fmt(f.withdraw), plural(f.withdrawCount, "retiro", "retiros"), f.withdraw ? "pos" : ""),
    card("TOTAL ABONADO", fmt(f.deposit), plural(f.depositCount, "abono", "abonos"), f.deposit ? "neg" : ""),
    card("RETIRADO MES", fmt(f.monthWithdraw), `${MONTHS[Number(today.slice(5, 7)) - 1]} ${year}`, f.monthWithdraw ? "pos" : ""),
    card("ABONADO MES", fmt(f.monthDeposit), `${MONTHS[Number(today.slice(5, 7)) - 1]} ${year}`, f.monthDeposit ? "neg" : ""),
    card("BALANCE BANCO", signed(f.net), f.net >= 0 ? "retirado − abonado · ya recuperaste" : "retirado − abonado · falta recuperar", f.net > 0 ? "pos" : f.net < 0 ? "neg" : "", true),
    card("GANANCIA DE JUEGO", signed(gameNet), "solo rondas", gameNet > 0 ? "pos" : gameNet < 0 ? "neg" : ""),
    card("MAYOR RETIRO", fmt(f.biggestWithdraw), "en un movimiento", f.biggestWithdraw ? "pos" : ""),
  ].join("");
  $("flowYear").textContent = year;
}

// ---------------- Tabs ----------------
function showTab(name) {
  if (name === activeTab) return;
  activeTab = name;
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("is-active", b.dataset.tab === name));
  document.querySelectorAll(".tab").forEach((t) => (t.hidden = t.id !== "tab-" + name));
  window.scrollTo({ top: 0 });
  if (name === "stats") renderStats();
  if (name === "winrate") renderWinRate();
}

function renderAll(opts) {
  renderHeader();
  renderCalc(opts);
  renderWinRate();
  if (activeTab === "stats") renderStats();
}

// ---------------- Modal ----------------
let modalResolve = null;
function openModal({ variant = "", tag = "", big = "", text = "", typewriter = false, sub = "", fields = [], buttons = [], validate = null }) {
  return new Promise((resolve) => {
    const root = $("modalRoot");
    const fieldsHtml = fields.map((f) => f.type === "sign" ? `
      <div class="seg sign-seg" id="mf_${f.id}" data-value="${esc(f.value)}">${f.options.map(([v, label]) => `<button type="button" class="chip${v === f.value ? " is-active" : ""}" data-sign="${esc(v)}">${esc(label)}</button>`).join("")}</div>` : `
      <label class="lbl field-lbl" for="mf_${f.id}">${esc(f.label)}</label>
      <input id="mf_${f.id}" class="${f.big ? "num-input" : "text-input"} modal-input" type="text" ${f.inputmode ? `inputmode="${f.inputmode}"` : ""} ${f.maxlength ? `maxlength="${f.maxlength}"` : ""} placeholder="${esc(f.placeholder || "")}" value="${esc(f.value ?? "")}" autocomplete="off" spellcheck="false" />`).join("");
    root.innerHTML = `
      <div class="hud modal ${variant}" role="dialog" aria-modal="true">
        ${tag ? `<div class="modal-tag">${esc(tag)}</div>` : ""}
        ${big ? `<div class="modal-big">${esc(big)}</div>` : ""}
        <div class="modal-text${typewriter ? " tw" : ""}" id="modalText"></div>
        ${sub ? `<div class="modal-sub">${esc(sub)}</div>` : ""}
        ${fieldsHtml}
        <div class="modal-sub" id="modalErr" style="color:var(--red)" hidden></div>
        <div class="modal-btns">${buttons.map((b, i) => `<button class="btn-wide${b.primary ? " primary" : ""}" data-i="${i}">${esc(b.label)}</button>`).join("")}</div>
        ${typewriter ? `<div class="modal-hint" id="modalHint">TAP PARA SALTAR >></div>` : ""}
      </div>`;
    root.hidden = false;
    root.querySelectorAll(".sign-seg").forEach((seg) => seg.addEventListener("click", (e) => {
      const b = e.target.closest("[data-sign]");
      if (!b) return;
      sfx.click();
      seg.dataset.value = b.dataset.sign;
      seg.querySelectorAll("[data-sign]").forEach((x) => x.classList.toggle("is-active", x === b));
    }));
    const textEl = $("modalText");
    let typing = null;
    if (typewriter) {
      let i = 0;
      textEl.innerHTML = `<span></span><i class="caret"></i>`;
      const span = textEl.firstChild;
      typing = setInterval(() => {
        i++;
        span.textContent = text.slice(0, i);
        if (i % 3 === 0) sfx.click();
        if (i >= text.length) finishTyping();
      }, 32);
      const finishTyping = () => {
        clearInterval(typing);
        typing = null;
        span.textContent = text;
        $("modalHint")?.remove();
      };
      textEl.parentElement.addEventListener("click", (e) => { if (typing && !e.target.closest("button")) finishTyping(); });
    } else {
      textEl.textContent = text;
    }
    const firstInput = root.querySelector("input");
    if (firstInput) setTimeout(() => {
      firstInput.focus();
      if (fields.find((f) => f.type !== "sign")?.select) firstInput.select();
    }, 50);

    const close = (value) => {
      if (typing) clearInterval(typing);
      root.hidden = true;
      root.innerHTML = "";
      modalResolve = null;
      resolve(value);
    };
    modalResolve = close;
    root.querySelectorAll(".modal-btns button").forEach((b) => {
      b.addEventListener("click", () => {
        const btn = buttons[Number(b.dataset.i)];
        sfx.click();
        if (fields.length && btn.value) {
          const vals = Object.fromEntries(fields.map((f) => [f.id, f.type === "sign" ? $("mf_" + f.id).dataset.value : $("mf_" + f.id).value.trim()]));
          const err = validate ? validate(vals) : null;
          if (err) {
            $("modalErr").textContent = err;
            $("modalErr").hidden = false;
            return;
          }
          close({ value: btn.value, fields: vals });
        } else {
          close(fields.length ? { value: btn.value, fields: {} } : btn.value);
        }
      });
    });
    root.addEventListener("keydown", (e) => {
      if (e.key === "Enter") root.querySelector(".modal-btns .primary")?.click();
    });
  });
}

// ---------------- Settings ----------------
function openSettings() {
  sfx.click();
  renderGoalSettings();
  renderStopSettings();
  $("inName").value = state.settings.playerName;
  $("settings").classList.add("open");
  $("settings").setAttribute("aria-hidden", "false");
  $("drawerBackdrop").hidden = false;
}
function closeSettings() {
  $("settings").classList.remove("open");
  $("settings").setAttribute("aria-hidden", "true");
  $("drawerBackdrop").hidden = true;
}

function exportData() {
  sfx.click();
  const player = (state.settings.playerName || "player").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "player";
  const name = `winrate-${player}-${localDateKey(new Date())}.json`;
  const blob = new Blob([exportState(state)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function importData(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    await openModal({ variant: "lose", tag: "ERROR", text: "El archivo no es un JSON válido.", buttons: [{ label: "OK", value: true, primary: true }] });
    return;
  }
  const v = validateImport(data);
  if (!v.ok) {
    await openModal({ variant: "lose", tag: "ARCHIVO INVALIDO", text: v.error, buttons: [{ label: "OK", value: true, primary: true }] });
    return;
  }
  const ok = await openModal({
    variant: "lose",
    tag: "IMPORTAR",
    text: `Se reemplazarán TODOS tus datos actuales.`,
    sub: `Archivo: ${v.state.records.length} rondas · ${v.state.movements.length} abonos/retiros · jugador ${v.state.settings.playerName || "---"} · capital ${fmt(v.state.settings.capital ?? 0)}`,
    buttons: [{ label: "CANCELAR", value: false }, { label: "REEMPLAZAR", value: true, primary: true }],
  });
  if (!ok) return;
  commit(v.state);
  shownInvest = null;
  lastLock = null;
  applyTheme();
  renderAll();
  closeSettings();
}

async function resetAll() {
  sfx.click();
  const step1 = await openModal({
    variant: "lock",
    tag: "RESET TOTAL",
    text: "Esto borra TODOS los registros y ajustes de este dispositivo.",
    sub: "Te recomendamos exportar antes.",
    buttons: [{ label: "CANCELAR", value: false }, { label: "CONTINUAR", value: true, primary: true }],
  });
  if (!step1) return;
  const step2 = await openModal({
    variant: "lock",
    tag: "CONFIRMACION FINAL",
    text: 'Escribe "RESET" para confirmar.',
    fields: [{ id: "confirm", label: "CONFIRMAR", placeholder: "RESET", maxlength: 10 }],
    validate: (v) => (v.confirm === "RESET" ? null : 'Debes escribir exactamente "RESET".'),
    buttons: [{ label: "CANCELAR", value: false }, { label: "BORRAR", value: true, primary: true }],
  });
  if (!step2?.value) return;
  clearState();
  state = defaultState();
  saveState(state);
  shownInvest = null;
  lastLock = null;
  closeSettings();
  applyTheme();
  renderAll();
  boot();
}

// ---------------- Primer uso ----------------
async function boot() {
  const s = state.settings;
  if (s.playerName && s.capital !== null) return;
  const res = await openModal({
    variant: "win",
    tag: "INSERT COIN",
    text: "Bienvenido a WINRATE. Registra tu nombre y tu capital inicial.",
    typewriter: true,
    fields: [
      { id: "name", label: "NOMBRE DEL JUGADOR", placeholder: "JABS", maxlength: 16, value: s.playerName },
      { id: "capital", label: "CAPITAL INICIAL (COINS)", placeholder: "1000", inputmode: "decimal", big: true, value: s.capital ?? "" },
    ],
    validate: (v) => {
      if (!v.name) return "Escribe tu nombre.";
      if (Number.isNaN(parseMoney(v.capital))) return "El capital debe ser un número (hasta 2 decimales).";
      return null;
    },
    buttons: [{ label: "PRESS START", value: true, primary: true }],
  });
  commit({ ...state, settings: { ...state.settings, playerName: res.fields.name.slice(0, 16), capital: parseMoney(res.fields.capital) } });
  renderAll();
}

// ---------------- Service worker ----------------
function setupSW() {
  if (!("serviceWorker" in navigator)) return;
  // Solo recarga cuando el usuario pidió actualizar (no en la primera instalación)
  let updateRequested = false;
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!updateRequested || refreshing) return;
    refreshing = true;
    location.reload();
  });
  navigator.serviceWorker.register("sw.js").then((reg) => {
    const prompt = (worker) => {
      const t = $("toast");
      t.innerHTML = `<span>NUEVA VERSION DISPONIBLE</span><button>ACTUALIZAR</button>`;
      t.hidden = false;
      t.querySelector("button").onclick = () => {
        updateRequested = true;
        worker.postMessage({ type: "SKIP_WAITING" });
      };
    };
    if (reg.waiting && navigator.serviceWorker.controller) prompt(reg.waiting);
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      w?.addEventListener("statechange", () => {
        if (w.state === "installed" && navigator.serviceWorker.controller) prompt(w);
      });
    });
    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
  }).catch((e) => console.warn("[WinRate] SW:", e));
}

// ---------------- Init ----------------
function init() {
  mountIcons();
  $("appVersion").textContent = APP_VERSION;
  $("schemaVersion").textContent = SCHEMA_VERSION;

  $("inCapital").addEventListener("input", onCapitalInput);
  $("inBullets").addEventListener("input", onBulletsInput);
  $("inBullets").addEventListener("blur", () => { $("inBullets").value = state.settings.bullets; $("inBullets").classList.remove("invalid"); });
  document.querySelectorAll("[data-ratio]").forEach((b) => b.addEventListener("click", () => selectRatio(b.dataset.ratio)));
  $("btnCustomOk").addEventListener("click", applyCustom);
  $("inCustom").addEventListener("keydown", (e) => { if (e.key === "Enter") applyCustom(); });
  $("btnDeposit").addEventListener("click", () => onMovement("deposit"));
  $("btnWithdraw").addEventListener("click", () => onMovement("withdraw"));
  document.querySelectorAll("[data-filter]").forEach((b) => b.addEventListener("click", () => {
    sfx.click();
    histFilter = b.dataset.filter;
    renderWinRate();
  }));
  $("btnWin").addEventListener("click", () => onResult("win"));
  $("btnTie").addEventListener("click", () => onResult("tie"));
  $("btnLose").addEventListener("click", () => onResult("lose"));
  $("recordList").addEventListener("click", (e) => { if (e.target.closest("[data-undo]")) onUndo(); });
  document.querySelectorAll(".tab-btn").forEach((b) => b.addEventListener("click", () => { sfx.click(); showTab(b.dataset.tab); }));

  $("btnSettings").addEventListener("click", openSettings);
  $("btnCloseSettings").addEventListener("click", closeSettings);
  $("drawerBackdrop").addEventListener("click", closeSettings);
  $("inName").addEventListener("input", () => {
    commit({ ...state, settings: { ...state.settings, playerName: $("inName").value.slice(0, 16) } });
    renderHeader();
  });
  document.querySelectorAll("[data-theme-opt]").forEach((b) => b.addEventListener("click", () => {
    sfx.click();
    commit({ ...state, settings: { ...state.settings, theme: b.dataset.themeOpt } });
    applyTheme();
  }));
  document.querySelectorAll("[data-sound-opt]").forEach((b) => b.addEventListener("click", () => {
    commit({ ...state, settings: { ...state.settings, sound: b.dataset.soundOpt === "on" } });
    applyTheme();
    sfx.click();
  }));
  document.querySelectorAll("[data-goal-opt]").forEach((b) => b.addEventListener("click", () => {
    if (b.disabled) return;
    sfx.click();
    setGoal({ profitLock: b.dataset.goalOpt === "on" });
  }));
  $("inGoal").addEventListener("input", () => {
    const n = Number($("inGoal").value.replace(",", "."));
    const ok = Number.isFinite(n) && n > 0 && n <= 1000;
    $("inGoal").classList.toggle("invalid", !ok);
    if (ok) setGoal({ profitTarget: Math.round(n * 100) / 100 });
  });
  $("inGoal").addEventListener("blur", () => { $("inGoal").classList.remove("invalid"); renderGoalSettings(); });
  document.querySelectorAll("[data-stop-opt]").forEach((b) => b.addEventListener("click", () => {
    if (b.disabled) return;
    sfx.click();
    setGoal({ lossControl: b.dataset.stopOpt === "on" });
  }));
  $("inStop").addEventListener("input", () => {
    const n = Number($("inStop").value.replace(",", "."));
    const ok = Number.isFinite(n) && n > 0 && n <= 100;
    $("inStop").classList.toggle("invalid", !ok);
    if (ok) setGoal({ lossLimit: Math.round(n * 100) / 100 });
  });
  $("inStop").addEventListener("blur", () => { $("inStop").classList.remove("invalid"); renderStopSettings(); });
  $("btnExport").addEventListener("click", exportData);
  $("btnImport").addEventListener("click", () => { sfx.click(); $("fileImport").click(); });
  $("fileImport").addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) importData(f);
  });
  $("btnReset").addEventListener("click", resetAll);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSettings(); });

  // Recalcula el bloqueo cada segundo (cuenta regresiva) y al volver a la app
  const tick = () => {
    const changed = renderLock();
    if (changed) {
      renderCalc({ syncInputs: false });
      renderWinRate();
      if (activeTab === "stats") renderStats();
    }
    updateCountdown();
  };
  setInterval(tick, 1000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) tick(); });

  applyTheme();
  renderAll();
  setupSW();
  boot();
}

// Exponer para pruebas automatizadas
window.__winrate = { get state() { return state; }, openModal };

init();
