// E2E en la UI:  node tests/e2e.cjs [baseUrl]
// Bloqueo L,W,L → UNDO desbloquea → export → reset → import idéntico.
const { chromium } = require("playwright");
const fs = require("fs");
const BASE = process.argv[2] || "http://127.0.0.1:8765/";
const assert = (c, m) => { if (!c) { console.log("✗", m); process.exitCode = 1; } else console.log("✓", m); };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true, serviceWorkers: "block" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE);
  await page.fill("#mf_name", "Jabs");
  await page.fill("#mf_capital", "1000");
  await page.click(".modal-btns .primary");
  const closeModal = async () => { await page.waitForSelector(".modal-btns .primary"); await page.click(".modal-btns .primary"); await page.waitForTimeout(700); };

  assert((await page.textContent("#playerName")) === "JABS", "header muestra PLAYER: JABS");
  assert((await page.textContent("#investOut")).trim() === "50", "inversión 1000/20 = 50");
  const cap = async () => Number(await page.inputValue("#inCapital"));

  // Pop-up de cantidad: CANCELAR no registra nada
  await page.click("#btnWin");
  await page.waitForSelector("#mf_amount");
  assert((await page.inputValue("#mf_amount")) === "100", "WIN prellena la ganancia calculada (+100)");
  await page.click(".modal-btns button:not(.primary)");
  assert((await page.evaluate(() => window.__winrate.state.records.length)) === 0, "CANCELAR no registra la ronda");

  // WIN con cantidad real distinta
  await page.click("#btnWin");
  await page.fill("#mf_amount", "0");
  await page.click(".modal-btns .primary");
  assert(await page.isVisible("#modalErr"), "no acepta ganancia 0");
  await page.fill("#mf_amount", "103");
  await page.click(".modal-btns .primary");
  await page.waitForSelector(".modal.win .modal-tag");
  assert((await page.textContent(".modal-big")).includes("+103"), "pop-up de victoria muestra +103");
  await closeModal();
  assert((await cap()) === 1103, "capital 1000 + 103 = 1103");

  // TIE: pide cantidad con signo (comisión), prellena 0
  await page.click("#btnTie");
  await page.waitForSelector("#mf_amount");
  assert((await page.inputValue("#mf_amount")) === "0", "TIE prellena 0");
  assert((await page.getAttribute("#mf_sign", "data-value")) === "-", "TIE trae - PERDI seleccionado");
  await page.click(".modal-btns button:not(.primary)");
  assert((await page.evaluate(() => window.__winrate.state.records.length)) === 1, "CANCELAR en TIE no registra");
  await page.click("#btnTie");
  await page.fill("#mf_amount", "3");
  await page.click(".modal-btns .primary");
  await page.waitForSelector(".modal.tie .modal-tag");
  assert((await page.textContent(".modal-tag")).includes("TIE"), "pop-up de empate");
  assert((await page.textContent(".modal-big")).includes("−3"), "empate muestra −3 de comisión");
  await closeModal();
  assert((await cap()) === 1100, "TIE con comisión: 1103 − 3 = 1100");
  assert((await page.$$("#hearts .heart-full")).length === 2, "TIE no gasta vida");
  await page.click("#btnTie");
  await page.click('[data-sign="+"]');
  await page.fill("#mf_amount", "2");
  await page.click(".modal-btns .primary");
  await closeModal();
  assert((await cap()) === 1102, "TIE con + GANE: 1100 + 2 = 1102");

  // LOSE prellena la inversión; pierdo 57 (calculado 55)
  await page.click("#btnLose");
  await page.waitForSelector("#mf_amount");
  assert((await page.inputValue("#mf_amount")) === "55", "LOSE prellena la inversión calculada (55)");
  await page.fill("#mf_amount", "57");
  await page.click(".modal-btns .primary");
  await closeModal();
  assert((await cap()) === 1045, "capital 1102 − 57 = 1045");
  await page.click("#btnLose"); await closeModal(); // acepta la cantidad calculada (52)
  assert((await page.textContent(".modal-tag")).includes("SYSTEM LOCKED"), "2ª pérdida muestra modal de bloqueo");
  await closeModal();
  assert(await page.isVisible("#lockPanel"), "panel SYSTEM LOCKED visible");
  assert(await page.isDisabled("#btnWin") && await page.isDisabled("#btnLose") && await page.isDisabled("#btnTie"), "WIN/TIE/LOSE deshabilitados");
  assert(/^\d\d:\d\d:\d\d$/.test(await page.textContent("#lockCountdown")), "cuenta regresiva hh:mm:ss");
  const capLocked = await page.inputValue("#inCapital");

  // Abonar / retirar estando bloqueado: permitido y no cambia vidas ni win rate
  const wrBefore = await page.evaluate(() => window.__winrate.state.records.length);
  await page.click("#btnWithdraw");
  await page.fill("#mf_amount", "999999");
  await page.click(".modal-btns .primary");
  assert(await page.isVisible("#modalErr"), "no permite retirar más que el capital");
  await page.fill("#mf_amount", "100");
  await page.fill("#mf_note", "skin");
  await page.click(".modal-btns .primary");
  await page.waitForTimeout(900);
  assert(Number(await page.inputValue("#inCapital")) === Number(capLocked) - 100, "retiro resta 100 al capital");
  await page.click("#btnDeposit");
  await page.fill("#mf_amount", "250");
  await page.click(".modal-btns .primary");
  await page.waitForTimeout(900);
  assert(Number(await page.inputValue("#inCapital")) === Number(capLocked) + 150, "abono suma 250 al capital");
  assert(await page.isVisible("#lockPanel"), "sigue bloqueado tras abonar/retirar");
  assert((await page.evaluate(() => window.__winrate.state.records.length)) === wrBefore, "abonos/retiros no crean rondas");
  await page.click('[data-tab="winrate"]');
  assert((await page.textContent("#wrTotal")) === "5", "historial cuenta 5 rondas (1W 2T 2L)");
  assert((await page.textContent("#wrGlobal")) === "33.3%", "win rate 1/(1+2) = 33.3%: el TIE no cuenta");
  assert((await page.textContent("#wrTies")) === "2", "contador de empates = 2");
  assert((await page.textContent(".rec.win .rec-calc")).includes("+100"), "el WIN muestra CALC +100 junto al real +103");
  assert((await page.$$(".rec.move")).length === 2, "historial muestra 2 movimientos");
  await page.click('[data-filter="rounds"]');
  assert((await page.$$(".rec.move")).length === 0 && (await page.$$(".rec")).length === 5, "filtro RONDAS");
  await page.click('[data-filter="all"]');
  // UNDO deshace los movimientos primero (son los más recientes)
  for (let i = 0; i < 2; i++) { await page.click(".rec-undo"); await page.click(".modal-btns .primary"); await page.waitForTimeout(900); }
  assert((await page.$$(".rec.move")).length === 0, "UNDO quitó los 2 movimientos");
  assert(await page.inputValue("#inCapital") === capLocked, "capital regresó a " + capLocked);
  assert((await page.$$(".rec-undo")).length === 1, "UNDO solo en el registro más reciente");
  await page.click(".rec-undo");
  await page.click(".modal-btns .primary");
  await page.waitForTimeout(900);
  await page.click('[data-tab="calc"]');
  assert(!(await page.isVisible("#lockPanel")), "UNDO quita el bloqueo");
  assert(!(await page.isDisabled("#btnWin")), "WIN habilitado otra vez");
  const st = await page.evaluate(() => window.__winrate.state);
  assert(st.records.length === 4 && String(st.settings.capital) === (await page.inputValue("#inCapital")) && st.settings.capital === st.records[3].capitalAfter, `capital regresó a ${st.settings.capital} (antes ${capLocked})`);

  // Export (con un retiro incluido)
  await page.click("#btnWithdraw");
  await page.fill("#mf_amount", "40");
  await page.fill("#mf_note", "emote");
  await page.click(".modal-btns .primary");
  await page.waitForTimeout(300);
  await page.click("#btnSettings");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#btnExport")]);
  const fname = dl.suggestedFilename();
  assert(/^winrate-jabs-\d{4}-\d{2}-\d{2}\.json$/.test(fname), "nombre de archivo " + fname);
  const file = await dl.path();
  const exported = JSON.parse(fs.readFileSync(file, "utf8"));
  // Reset
  await page.click("#btnReset");
  await page.click(".modal-btns .primary");
  await page.fill("#mf_confirm", "reset");
  await page.click(".modal-btns .primary");
  assert(await page.isVisible("#modalErr"), "RESET exige escribir exactamente RESET");
  await page.fill("#mf_confirm", "RESET");
  await page.click(".modal-btns .primary");
  await page.waitForTimeout(300);
  assert((await page.evaluate(() => window.__winrate.state.records.length)) === 0, "reset borra registros");
  await page.fill("#mf_name", "otro"); await page.fill("#mf_capital", "5"); await page.click(".modal-btns .primary");
  // Import
  await page.click("#btnSettings");
  await page.setInputFiles("#fileImport", file);
  await page.waitForSelector(".modal-btns .primary");
  await page.click(".modal-btns .primary");
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => window.__winrate.state);
  assert(exported.movements.length === 1 && JSON.stringify({ schemaVersion: exported.schemaVersion, settings: exported.settings, records: exported.records, movements: exported.movements }) === JSON.stringify(after), "import → estado idéntico al exportado");
  // Import inválido
  fs.writeFileSync(file + ".bad.json", JSON.stringify({ schemaVersion: 99, settings: {}, records: [] }));
  await page.click("#btnSettings").catch(() => {});
  await page.setInputFiles("#fileImport", file + ".bad.json");
  await page.waitForSelector(".modal-tag");
  assert((await page.textContent(".modal-tag")).includes("INVALIDO"), "import rechaza schemaVersion 99");
  await page.click(".modal-btns .primary");
  // Texto prohibido
  const html = await page.evaluate(() => document.body.innerText);
  assert(!/apuest|apost|\bbet/i.test(html), "sin palabras prohibidas en la interfaz");
  assert(!errors.length, "sin errores JS " + errors.join(" | "));
  await browser.close();
})();
