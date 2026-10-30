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
  // Decimales: el juego paga cantidades como 4.98
  const capDec = Number(await page.inputValue("#inCapital"));
  await page.keyboard.press("Escape"); // cierra Settings
  await page.waitForTimeout(300);
  await page.click("#btnWin");
  await page.fill("#mf_amount", "4.985");
  await page.click(".modal-btns .primary");
  assert(await page.isVisible("#modalErr"), "rechaza 3 decimales (4.985)");
  await page.fill("#mf_amount", "4,98");
  await page.click(".modal-btns .primary");
  await page.waitForSelector(".modal.win .modal-tag");
  assert((await page.textContent(".modal-big")).includes("+4.98"), "pop-up de victoria muestra +4.98 (coma aceptada)");
  await closeModal();
  assert(Math.abs(Number(await page.inputValue("#inCapital")) - (capDec + 4.98)) < 1e-9, `capital ${capDec} + 4.98 = ${await page.inputValue("#inCapital")}`);
  await page.click("#btnTie");
  await page.fill("#mf_amount", "0.02");
  await page.click(".modal-btns .primary");
  await closeModal();
  assert(Math.abs(Number(await page.inputValue("#inCapital")) - (capDec + 4.96)) < 1e-9, "TIE con comisión 0.02 descuenta decimales");
  await page.fill("#inCapital", "54,98");
  assert((await page.evaluate(() => window.__winrate.state.settings.capital)) === 54.98, "capital editable a mano con decimales (54,98)");

  // Control de ganancia: neto de hoy +49.96 sobre base 1000 (4.996%); meta 5%
  assert(await page.isHidden("#goalRow"), "barra de meta oculta con el control apagado");
  await page.click("#btnSettings");
  await page.click('[data-goal-opt="on"]');
  await page.fill("#inGoal", "5");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  assert(await page.isVisible("#goalRow"), "barra de meta visible al activar");
  assert((await page.textContent("#goalText")).trim() === "+5.0% / 5%", "progreso +5.0% / 5% (4.996 redondeado)");
  assert(await page.isHidden("#lockPanel"), "4.996% < 5%: aún no bloquea");
  await page.click("#btnWin");
  await page.fill("#mf_amount", "1");
  await page.click(".modal-btns .primary");
  await page.waitForSelector(".modal.win .modal-tag");
  assert((await page.textContent(".modal-tag")).includes("TARGET REACHED"), "pop-up de felicitación TARGET REACHED");
  await closeModal();
  assert(await page.isVisible("#lockPanel") && (await page.textContent("#lockTitle")) === "TARGET REACHED", "panel TARGET REACHED visible");
  assert(await page.isDisabled("#btnWin") && await page.isDisabled("#btnLose") && await page.isDisabled("#btnTie"), "no deja registrar más rondas");
  assert(!(await page.isDisabled("#btnWithdraw")), "sí deja retirar las ganancias");
  await page.click("#btnSettings");
  assert(await page.isDisabled('[data-goal-opt="off"]') && await page.isDisabled("#inGoal"), "con la meta cumplida no se puede apagar ni cambiar");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await page.click('[data-tab="winrate"]');
  await page.click(".rec-undo");
  await page.click(".modal-btns .primary");
  await page.waitForTimeout(900);
  await page.click('[data-tab="calc"]');
  assert(await page.isHidden("#lockPanel") && !(await page.isDisabled("#btnWin")), "UNDO del WIN quita el bloqueo de meta");

  // Texto prohibido
  const html = await page.evaluate(() => document.body.innerText);
  assert(!/apuest|apost|\bbet/i.test(html), "sin palabras prohibidas en la interfaz");
  assert(!errors.length, "sin errores JS " + errors.join(" | "));

  // ---- Control de pérdida (stop loss) en un día limpio ----
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const p2 = await ctx2.newPage();
  p2.on("pageerror", (e) => errors.push(e.message));
  await p2.goto(BASE);
  await p2.fill("#mf_name", "Jabs"); await p2.fill("#mf_capital", "1000"); await p2.click(".modal-btns .primary");
  const close2 = async () => { await p2.waitForSelector(".modal-btns .primary"); await p2.click(".modal-btns .primary"); await p2.waitForTimeout(700); };
  assert(await p2.isHidden("#stopRow"), "barra STOP HOY oculta con el control apagado");
  await p2.click("#btnSettings");
  await p2.click('[data-stop-opt="on"]');
  assert((await p2.inputValue("#inStop")) === "10", "límite por defecto 10%");
  await p2.keyboard.press("Escape"); await p2.waitForTimeout(300);
  assert(await p2.isVisible("#stopRow") && (await p2.textContent("#stopText")).trim() === "0.0% / −10%", "barra STOP HOY 0.0% / −10%");
  await p2.click("#btnLose"); await p2.fill("#mf_amount", "60"); await p2.click(".modal-btns .primary");
  await p2.waitForSelector(".modal-tag");
  assert((await p2.textContent(".modal-tag")).includes("1 VIDA"), "−6%: pérdida normal, aún sin stop");
  await close2();
  assert((await p2.textContent("#stopText")).trim() === "−6.0% / −10%", "barra STOP HOY −6.0%");
  await p2.click("#btnTie"); await p2.fill("#mf_amount", "40"); await p2.click(".modal-btns .primary");
  await p2.waitForSelector(".modal.lock .modal-tag");
  assert((await p2.textContent(".modal-tag")).includes("STOP LOSS"), "comisión de TIE completa −10% → pop-up STOP LOSS");
  await close2();
  assert(await p2.isVisible("#lockPanel") && (await p2.textContent("#lockTitle")) === "STOP LOSS", "panel STOP LOSS visible");
  assert((await p2.$$("#hearts .heart-full")).length === 1, "el stop no gasta la segunda vida");
  assert(await p2.isDisabled("#btnWin") && await p2.isDisabled("#btnLose") && await p2.isDisabled("#btnTie"), "stop loss bloquea WIN/TIE/LOSE");
  assert(!(await p2.isDisabled("#btnDeposit")), "abonar sigue permitido");
  await p2.click("#btnSettings");
  assert(await p2.isDisabled('[data-stop-opt="off"]') && await p2.isDisabled("#inStop"), "con el stop activado no se puede apagar ni cambiar");
  await p2.keyboard.press("Escape"); await p2.waitForTimeout(300);
  await p2.click('[data-tab="winrate"]'); await p2.click(".rec-undo"); await p2.click(".modal-btns .primary"); await p2.waitForTimeout(900);
  await p2.click('[data-tab="calc"]');
  assert(await p2.isHidden("#lockPanel") && !(await p2.isDisabled("#btnWin")), "UNDO quita el stop loss");
  await ctx2.close();
  assert(!errors.length, "sin errores JS en stop loss " + errors.join(" | "));
  await browser.close();
})();
