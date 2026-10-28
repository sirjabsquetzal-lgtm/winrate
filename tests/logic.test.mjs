// Pruebas de la lógica de WinRate:  node tests/logic.test.mjs
// (se recomienda fijar zona horaria: TZ=America/Mexico_City node tests/logic.test.mjs)
import assert from "node:assert/strict";
import * as L from "../js/logic.js";

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log("  ✓", name); }
  catch (e) { console.error("  ✗", name, "\n   ", e.message); process.exitCode = 1; }
};
const at = (y, mo, d, h, mi = 0, s = 0) => new Date(y, mo - 1, d, h, mi, s).getTime();
const withSettings = (over) => ({ ...L.defaultState(), settings: { ...L.defaultSettings(), playerName: "JABS", ...over } });

console.log("Cálculo de inversión y proyecciones");
test("floor(capital / bullets)", () => {
  assert.equal(L.calcInvestment(1000, 20), 50);
  assert.equal(L.calcInvestment(1019, 20), 50);
  assert.equal(L.calcInvestment(19, 20), 0);
  assert.equal(L.calcInvestment(1000, 0), 0);
});
test("proyección 1:2", () => {
  assert.deepEqual(L.calcProjection(1000, 20, 2), { invested: 50, gain: 100, winCapital: 1100, loss: 50, loseCapital: 950 });
});
test("proyección 1:1.5 con floor en la ganancia", () => {
  const p = L.calcProjection(1030, 20, 1.5); // inv 51 → 76.5 → 76
  assert.equal(p.invested, 51);
  assert.equal(p.gain, 76);
  assert.equal(p.winCapital, 1106);
  assert.equal(p.loseCapital, 979);
});
test("ratio custom", () => {
  assert.equal(L.parseRatio("4.5"), 4.5);
  assert.equal(L.parseRatio("1:4.5"), 4.5);
  assert.equal(L.parseRatio("4,5"), 4.5);
  assert.ok(Number.isNaN(L.parseRatio("abc")));
  assert.ok(Number.isNaN(L.parseRatio("0")));
  assert.equal(L.formatRatio(4.5), "1:4.5");
});

console.log("Día de juego (corte 06:00)");
test("05:59:59 cuenta para el día anterior", () => {
  assert.equal(L.dayKey(at(2026, 10, 27, 5, 59, 59)), "2026-10-26");
});
test("06:00:00 cuenta para el día nuevo", () => {
  assert.equal(L.dayKey(at(2026, 10, 27, 6, 0, 0)), "2026-10-27");
});
test("02:00 del martes cuenta para el lunes", () => {
  assert.equal(L.dayKey(at(2026, 10, 27, 2, 0)), "2026-10-26"); // 27 oct 2026 es martes
});
test("cambio de año", () => {
  assert.equal(L.dayKey(at(2027, 1, 1, 3, 0)), "2026-12-31");
});
test("nextReset", () => {
  assert.equal(L.nextReset(at(2026, 10, 27, 2, 0)), at(2026, 10, 27, 6, 0));
  assert.equal(L.nextReset(at(2026, 10, 27, 6, 0)), at(2026, 10, 28, 6, 0));
  assert.equal(L.nextReset(at(2026, 10, 27, 23, 0)), at(2026, 10, 28, 6, 0));
});

console.log("Bloqueo diario");
test("L, W, L → bloqueo; WIN/LOSE rechazados", () => {
  let s = withSettings({ capital: 1000, bullets: 20, ratio: 2 });
  let r = L.recordResult(s, "lose", at(2026, 10, 26, 20, 0));
  assert.equal(r.scenario, "lose1"); s = r.state;
  assert.equal(s.settings.capital, 950);
  r = L.recordResult(s, "win", at(2026, 10, 26, 21, 0));
  assert.equal(r.scenario, "win"); s = r.state;
  assert.equal(s.settings.capital, 950 + 94); // inv 47 × 2
  r = L.recordResult(s, "lose", at(2026, 10, 27, 1, 0)); // 1 am: mismo día de juego
  assert.equal(r.scenario, "lock"); s = r.state;
  const lock = L.lockStatus(s.records, at(2026, 10, 27, 1, 5));
  assert.equal(lock.locked, true);
  assert.equal(lock.lives, 0);
  assert.equal(lock.unlockAt, at(2026, 10, 27, 6, 0));
  const blocked = L.recordResult(s, "win", at(2026, 10, 27, 5, 59, 59));
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, "locked");
  // A las 06:00 se libera solo
  assert.equal(L.lockStatus(s.records, at(2026, 10, 27, 6, 0)).locked, false);
  assert.equal(L.recordResult(s, "win", at(2026, 10, 27, 6, 0)).ok, true);
});
test("una sola pérdida no bloquea", () => {
  const s = L.recordResult(withSettings({ capital: 1000 }), "lose", at(2026, 10, 26, 12)).state;
  const lock = L.lockStatus(s.records, at(2026, 10, 26, 13));
  assert.equal(lock.locked, false);
  assert.equal(lock.lives, 1);
});
test("capital insuficiente no registra", () => {
  const r = L.recordResult(withSettings({ capital: 19, bullets: 20 }), "win", at(2026, 10, 26, 12));
  assert.equal(r.ok, false);
  assert.equal(r.reason, "insufficient");
});
test("undo desbloquea y restaura capital", () => {
  let s = withSettings({ capital: 1000 });
  s = L.recordResult(s, "lose", at(2026, 10, 26, 10)).state;
  s = L.recordResult(s, "lose", at(2026, 10, 26, 11)).state;
  assert.equal(L.lockStatus(s.records, at(2026, 10, 26, 12)).locked, true);
  const capBefore = s.records.at(-1).capitalBefore;
  const u = L.undoLast(s);
  assert.equal(u.ok, true);
  assert.equal(u.state.records.length, 1);
  assert.equal(u.state.settings.capital, capBefore);
  assert.equal(L.lockStatus(u.state.records, at(2026, 10, 26, 12)).locked, false);
});

console.log("Frases");
test("nunca repite la misma frase dos veces seguidas", () => {
  for (const sc of ["win", "tie", "lose1", "lock"]) {
    assert.equal(L.PHRASES[sc].length, 5);
    let last;
    for (let i = 0; i < 500; i++) {
      const idx = L.pickPhraseIndex(sc, last);
      assert.ok(idx >= 0 && idx < 5);
      assert.notEqual(idx, last);
      last = idx;
    }
  }
});

console.log("Export → import");
test("export → import idéntico", () => {
  let s = withSettings({ capital: 5000, bullets: 25, ratio: 4.5, ratioPreset: "custom", customRatio: 4.5, theme: "light", sound: false });
  const times = [at(2026, 10, 20, 12), at(2026, 10, 21, 3), at(2026, 10, 22, 9), at(2026, 10, 23, 18)];
  ["win", "lose", "win", "lose"].forEach((res, i) => { s = L.recordResult(s, res, times[i]).state; });
  const json = L.exportState(s);
  const v = L.validateImport(JSON.parse(json));
  assert.equal(v.ok, true);
  assert.deepEqual(v.state, s);
  assert.equal(JSON.parse(json).schemaVersion, 3);
});
test("import rechaza schemaVersion incorrecto y registros corruptos", () => {
  assert.equal(L.validateImport({ schemaVersion: 99, settings: {}, records: [] }).ok, false);
  assert.equal(L.validateImport({ schemaVersion: 2, settings: {}, records: [] }).ok, false); // v2 exige movements
  assert.equal(L.validateImport({ schemaVersion: 1, settings: {} }).ok, false);
  const bad = { schemaVersion: 1, settings: {}, records: [{ id: "x", ts: 1, dayKey: "2026-01-01", capitalBefore: 100, bullets: 20, ratio: 2, invested: 5, result: "win", delta: 10, capitalAfter: 999 }] };
  assert.equal(L.validateImport(bad).ok, false);
  assert.equal(L.validateImport("hola").ok, false);
});

console.log("Empate y cantidad real");
test("TIE: capital igual, no gasta vida, no entra al win rate", () => {
  let s = withSettings({ capital: 1000 });
  const r = L.recordResult(s, "tie", at(2026, 10, 26, 10));
  assert.equal(r.ok, true);
  assert.equal(r.scenario, "tie");
  assert.deepEqual([r.record.delta, r.record.capitalAfter, r.record.expected, r.record.invested], [0, 1000, 0, 50]);
  s = r.state;
  s = L.recordResult(s, "win", at(2026, 10, 26, 11)).state;
  s = L.recordResult(s, "lose", at(2026, 10, 26, 12)).state;
  const wr = L.winRate(s.records);
  assert.deepEqual([wr.wins, wr.losses, wr.ties, wr.decided, wr.total, wr.pct], [1, 1, 1, 2, 3, 50]);
  assert.equal(L.lockStatus(s.records, at(2026, 10, 26, 13)).lives, 1);
});
test("TIE con comisión: cambia el capital pero sigue siendo empate", () => {
  let s = withSettings({ capital: 1000 });
  let r = L.recordResult(s, "tie", at(2026, 10, 26, 10), -3);
  assert.deepEqual([r.record.delta, r.record.capitalAfter, r.record.expected, r.state.settings.capital], [-3, 997, 0, 997]);
  s = r.state;
  r = L.recordResult(s, "tie", at(2026, 10, 26, 11), 2);
  assert.equal(r.record.capitalAfter, 999);
  s = r.state;
  assert.equal(L.winRate(s.records).pct, null);
  assert.equal(L.winRate(s.records).ties, 2);
  assert.equal(L.lockStatus(s.records, at(2026, 10, 26, 12)).lives, 2);
  assert.equal(L.recordResult(s, "tie", at(2026, 10, 26, 12), -1000).reason, "exceeds");
  assert.equal(L.recordResult(s, "tie", at(2026, 10, 26, 12), 1.555).reason, "amount");
  assert.equal(L.validateImport(JSON.parse(L.exportState(s))).ok, true);
});
test("TIE no rompe ni suma rachas", () => {
  let s = withSettings({ capital: 1000 });
  for (const [res, h] of [["win", 10], ["tie", 11], ["win", 12], ["tie", 13]]) s = L.recordResult(s, res, at(2026, 10, 26, h)).state;
  const st = L.streaks(s.records);
  assert.equal(st.bestWin, 2);
  assert.deepEqual(st.current, { type: "win", count: 2 });
});
test("TIE bloqueado también se rechaza", () => {
  let s = withSettings({ capital: 1000 });
  s = L.recordResult(s, "lose", at(2026, 10, 26, 10)).state;
  s = L.recordResult(s, "lose", at(2026, 10, 26, 11)).state;
  assert.equal(L.recordResult(s, "tie", at(2026, 10, 26, 12)).reason, "locked");
});
test("WIN con cantidad real distinta a la calculada", () => {
  const r = L.recordResult(withSettings({ capital: 1000, bullets: 20, ratio: 2 }), "win", at(2026, 10, 26, 10), 103);
  assert.equal(r.ok, true);
  assert.deepEqual([r.record.expected, r.record.delta, r.record.capitalAfter, r.state.settings.capital], [100, 103, 1103, 1103]);
});
test("LOSE con cantidad real; límites", () => {
  const s = withSettings({ capital: 1000 });
  const r = L.recordResult(s, "lose", at(2026, 10, 26, 10), 52);
  assert.deepEqual([r.record.expected, r.record.delta, r.record.capitalAfter], [-50, -52, 948]);
  assert.equal(L.recordResult(s, "lose", at(2026, 10, 26, 10), 1001).reason, "exceeds");
  assert.equal(L.recordResult(s, "win", at(2026, 10, 26, 10), 0).reason, "amount");
  assert.equal(L.recordResult(s, "win", at(2026, 10, 26, 10), 2.555).reason, "amount");
  assert.equal(L.recordResult(s, "lose", at(2026, 10, 26, 10), -3).reason, "amount");
});
test("sin cantidad usa la calculada (compatibilidad)", () => {
  const r = L.recordResult(withSettings({ capital: 1000 }), "win", at(2026, 10, 26, 10));
  assert.equal(r.record.delta, 100);
});
test("import valida empates y signos", () => {
  let s = withSettings({ capital: 1000 });
  s = L.recordResult(s, "tie", at(2026, 10, 26, 10)).state;
  s = L.recordResult(s, "win", at(2026, 10, 26, 11), 107).state;
  const v = L.validateImport(JSON.parse(L.exportState(s)));
  assert.equal(v.ok, true);
  assert.deepEqual(v.state, s);
  const bad = JSON.parse(L.exportState(s));
  bad.records[1].delta = -5; // WIN con delta negativo
  bad.records[1].capitalAfter = bad.records[1].capitalBefore - 5;
  assert.equal(L.validateImport(bad).ok, false);
});

console.log("Decimales (2)");
test("parseMoney acepta punto o coma y máx. 2 decimales", () => {
  assert.equal(L.parseMoney("4.98"), 4.98);
  assert.equal(L.parseMoney("4,98"), 4.98);
  assert.equal(L.parseMoney("120"), 120);
  assert.equal(L.parseMoney("0.5"), 0.5);
  assert.ok(Number.isNaN(L.parseMoney("4.985")));
  assert.ok(Number.isNaN(L.parseMoney("-3")));
  assert.ok(Number.isNaN(L.parseMoney("abc")));
  assert.ok(Number.isNaN(L.parseMoney("")));
});
test("WIN de 4.98 con capital 50 (caso real)", () => {
  const s = withSettings({ capital: 50, bullets: 20, ratio: 2.5 });
  const p = L.calcProjection(50, 20, 2.5);
  assert.deepEqual([p.invested, p.gain], [2, 5]);
  const r = L.recordResult(s, "win", at(2026, 10, 28, 11), 4.98);
  assert.equal(r.ok, true);
  assert.deepEqual([r.record.expected, r.record.delta, r.record.capitalAfter], [5, 4.98, 54.98]);
});
test("sumas sin errores de punto flotante", () => {
  let s = withSettings({ capital: 100.1, bullets: 10 });
  for (let i = 0; i < 10; i++) s = L.recordResult(s, "tie", at(2026, 10, 28, 7 + i), -0.1).state;
  assert.equal(s.settings.capital, 99.1);
  assert.equal(L.sumDelta(s.records), -1);
  s = L.recordResult(s, "lose", at(2026, 10, 28, 20), 0.3).state;
  assert.equal(s.settings.capital, 98.8);
  const v = L.validateImport(JSON.parse(L.exportState(s)));
  assert.equal(v.ok, true);
  assert.deepEqual(v.state, s);
});
test("capital con decimales en la calculadora", () => {
  assert.deepEqual(L.calcProjection(54.98, 20, 2.5), { invested: 2, gain: 5, winCapital: 59.98, loss: 2, loseCapital: 52.98 });
});

console.log("Abonos y retiros");
test("abono suma y retiro resta capital", () => {
  let s = withSettings({ capital: 1000 });
  let r = L.recordMovement(s, "deposit", 500, at(2026, 10, 26, 10), "recarga");
  assert.equal(r.ok, true); s = r.state;
  assert.equal(s.settings.capital, 1500);
  assert.deepEqual([r.movement.capitalBefore, r.movement.capitalAfter, r.movement.note], [1000, 1500, "recarga"]);
  r = L.recordMovement(s, "withdraw", 300, at(2026, 10, 26, 11), "skin");
  s = r.state;
  assert.equal(s.settings.capital, 1200);
  assert.equal(s.movements.length, 2);
  assert.equal(s.records.length, 0);
});
test("retiro mayor al capital y montos inválidos se rechazan", () => {
  const s = withSettings({ capital: 100 });
  assert.equal(L.recordMovement(s, "withdraw", 101, at(2026, 10, 26, 10)).reason, "exceeds");
  assert.equal(L.recordMovement(s, "withdraw", 100, at(2026, 10, 26, 10)).ok, true);
  assert.equal(L.recordMovement(s, "deposit", 0, at(2026, 10, 26, 10)).reason, "amount");
  assert.equal(L.recordMovement(s, "deposit", -5, at(2026, 10, 26, 10)).reason, "amount");
  assert.equal(L.recordMovement(s, "deposit", 2.555, at(2026, 10, 26, 10)).reason, "amount"); // máx. 2 decimales
  assert.equal(L.recordMovement(s, "withdraw", 99.99, at(2026, 10, 26, 10)).state.settings.capital, 0.01);
});
test("los movimientos no afectan win rate, rachas ni bloqueo", () => {
  let s = withSettings({ capital: 1000 });
  s = L.recordResult(s, "lose", at(2026, 10, 26, 10)).state;
  s = L.recordMovement(s, "withdraw", 200, at(2026, 10, 26, 11)).state;
  s = L.recordMovement(s, "deposit", 900, at(2026, 10, 26, 12)).state;
  assert.equal(L.winRate(s.records).total, 1);
  assert.equal(L.lockStatus(s.records, at(2026, 10, 26, 13)).lives, 1);
  assert.equal(L.recordResult(s, "win", at(2026, 10, 26, 14)).ok, true);
  assert.deepEqual(L.streaks(s.records).current, { type: "lose", count: 1 });
});
test("undo deshace la entrada más reciente (ronda o movimiento)", () => {
  let s = withSettings({ capital: 1000 });
  s = L.recordResult(s, "win", at(2026, 10, 26, 10)).state;     // 1100
  s = L.recordMovement(s, "withdraw", 600, at(2026, 10, 26, 11)).state; // 500
  let u = L.undoLast(s);
  assert.equal(u.kind, "movement");
  assert.equal(u.state.settings.capital, 1100);
  assert.equal(u.state.records.length, 1);
  assert.equal(u.state.movements.length, 0);
  u = L.undoLast(u.state);
  assert.equal(u.kind, "record");
  assert.equal(u.state.settings.capital, 1000);
});
test("un retiro no cuenta como drawdown; capital máximo sí incluye abonos", () => {
  let s = withSettings({ capital: 1000, bullets: 10, ratio: 2 });
  s = L.recordResult(s, "win", at(2026, 10, 1, 10)).state;           // 1200
  s = L.recordMovement(s, "withdraw", 1000, at(2026, 10, 1, 11)).state; // 200
  s = L.recordMovement(s, "deposit", 5000, at(2026, 10, 2, 11)).state;  // 5200
  s = L.recordResult(s, "lose", at(2026, 10, 2, 12)).state;          // 5200 - 520 = 4680
  const dd = L.drawdown(s.records, s.movements);
  assert.equal(dd.coins, 520);
  assert.equal(dd.maxCapital, 5200);
  assert.equal(L.capitalSeries(s.records, s.movements).length, 5);
});
test("métricas de flujos", () => {
  let s = withSettings({ capital: 1000 });
  s = L.recordMovement(s, "deposit", 400, at(2026, 9, 10, 10)).state;
  s = L.recordMovement(s, "withdraw", 300, at(2026, 10, 3, 10)).state;
  s = L.recordMovement(s, "withdraw", 700, at(2026, 10, 20, 10)).state;
  const f = L.flowStats(s.movements, "2026-10-26");
  assert.deepEqual([f.deposit, f.withdraw, f.depositCount, f.withdrawCount, f.net], [400, 1000, 1, 2, 600]);
  assert.deepEqual([f.monthDeposit, f.monthWithdraw, f.biggestWithdraw], [0, 1000, 700]);
  assert.deepEqual(f.byMonth[8], { month: 9, deposit: 400, withdraw: 0 });
  assert.deepEqual(f.byMonth[9], { month: 10, deposit: 0, withdraw: 1000 });
});
test("export → import con movimientos idéntico; v1 se migra", () => {
  let s = withSettings({ capital: 1000 });
  s = L.recordResult(s, "win", at(2026, 10, 20, 12)).state;
  s = L.recordMovement(s, "withdraw", 100, at(2026, 10, 21, 12), "pase de batalla").state;
  const v = L.validateImport(JSON.parse(L.exportState(s)));
  assert.equal(v.ok, true);
  assert.deepEqual(v.state, s);
  const v1 = { schemaVersion: 1, settings: s.settings, records: s.records };
  const m = L.validateImport(v1);
  assert.equal(m.ok, true);
  assert.equal(m.state.schemaVersion, 3);
  assert.equal(m.state.records[0].expected, m.state.records[0].delta); // v1 sin `expected`
  assert.deepEqual(m.state.movements, []);
  assert.deepEqual(L.migrate(v1).movements, []);
  assert.equal(L.migrate(v1).records.length, 1);
});

console.log("Estadísticas");
test("rachas, drawdown, mejor/peor día, promedios", () => {
  let s = withSettings({ capital: 1000, bullets: 10, ratio: 2 });
  const seq = [["win", at(2026, 10, 1, 12)], ["win", at(2026, 10, 1, 13)], ["lose", at(2026, 10, 2, 12)], ["lose", at(2026, 10, 3, 12)], ["lose", at(2026, 10, 3, 13)], ["win", at(2026, 10, 4, 12)]];
  for (const [r, t] of seq) s = L.recordResult(s, r, t).state;
  const st = L.streaks(s.records);
  assert.equal(st.bestWin, 2);
  assert.equal(st.worstLose, 3);
  assert.deepEqual(st.current, { type: "win", count: 1 });
  // 1000 → 1200 → 1440 → 1296 → 1167 → 1051 → 1261
  assert.deepEqual(s.records.map((r) => r.capitalAfter), [1200, 1440, 1296, 1167, 1051, 1261]);
  const dd = L.drawdown(s.records);
  assert.equal(dd.coins, 389);
  assert.equal(dd.maxCapital, 1440);
  assert.ok(Math.abs(dd.pct - (389 / 1440) * 100) < 1e-9);
  const bw = L.bestWorstDay(s.records);
  assert.deepEqual(bw.best, { dayKey: "2026-10-01", net: 440 });
  assert.deepEqual(bw.worst, { dayKey: "2026-10-03", net: -245 });
  const av = L.averages(s.records);
  assert.equal(av.day.periods, 4);
  assert.equal(av.day.avg, 65.25); // 261 / 4
  assert.equal(av.month.periods, 1);
  assert.equal(av.month.avg, 261);
  const wr = L.winRate(s.records);
  assert.equal(wr.pct, 50);
});
test("heatmap 13 semanas termina en la semana actual", () => {
  const hm = L.heatmap([], "2026-10-26", 13);
  assert.equal(hm.cols.length, 13);
  assert.equal(hm.cols[12][0].dayKey, "2026-10-26"); // lunes
  assert.equal(hm.cols[12][1].future, true);
});

console.log(`\n${passed} pruebas OK${process.exitCode ? " (con fallos)" : ""}`);
