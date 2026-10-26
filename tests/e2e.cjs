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
  await page.click("#btnLose"); await closeModal();
  await page.click("#btnWin"); await closeModal();
  await page.click("#btnLose");
  assert((await page.textContent(".modal-tag")).includes("SYSTEM LOCKED"), "2ª pérdida muestra modal de bloqueo");
  await closeModal();
  assert(await page.isVisible("#lockPanel"), "panel SYSTEM LOCKED visible");
  assert(await page.isDisabled("#btnWin") && await page.isDisabled("#btnLose"), "WIN/LOSE deshabilitados");
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
  assert((await page.textContent("#wrTotal")) === "3", "win rate sigue contando 3 rondas");
  assert((await page.$$(".rec.move")).length === 2, "historial muestra 2 movimientos");
  await page.click('[data-filter="rounds"]');
  assert((await page.$$(".rec.move")).length === 0 && (await page.$$(".rec")).length === 3, "filtro RONDAS");
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
  assert(st.records.length === 2 && String(st.settings.capital) === (await page.inputValue("#inCapital")) && st.settings.capital === st.records[1].capitalAfter, `capital regresó a ${st.settings.capital} (antes ${capLocked})`);

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
