// Capturas en viewport móvil (390×844) de ambas temas:  node tests/screenshots.cjs [baseUrl] [outDir]
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const BASE = process.argv[2] || "http://127.0.0.1:8765/";
const OUT = process.argv[3] || path.join(__dirname, "..", "screenshots");

async function demoState(theme) {
  const L = await import(path.join(__dirname, "..", "js", "logic.js"));
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let s = { ...L.defaultState(), settings: { ...L.defaultSettings(), playerName: "JABS", theme, capital: 1000, bullets: 20, ratio: 2, ratioPreset: "2" } };
  const now = Date.now();
  const todayKey = L.dayKey(now);
  // ~80 días de historial (sin hoy)
  for (let back = 80; back >= 1; back--) {
    if (rnd() < 0.3) continue;
    const day = new Date(now);
    day.setDate(day.getDate() - back);
    day.setHours(14, 0, 0, 0);
    // abonos y retiros de vez en cuando
    if (back % 17 === 3 && s.settings.capital > 400) {
      s = L.recordMovement(s, "withdraw", Math.floor(s.settings.capital * 0.3), day.getTime() - 3600000, ["skin", "pase de batalla", "emotes"][back % 3]).state;
    } else if (back % 23 === 5) {
      s = L.recordMovement(s, "deposit", 500, day.getTime() - 3600000, "recarga").state;
    }
    const n = 1 + Math.floor(rnd() * 4);
    for (let i = 0; i < n; i++) {
      const ts = day.getTime() + i * 47 * 60000 + Math.floor(rnd() * 600000);
      if (L.dayKey(ts) === todayKey) continue;
      const ratios = [1.5, 2, 2, 3];
      s.settings.ratio = ratios[Math.floor(rnd() * ratios.length)];
      const roll = rnd();
      const r = L.recordResult(s, roll < 0.07 ? "tie" : roll < 0.54 ? "win" : "lose", ts);
      if (!r.ok) break;
      s = r.state;
    }
  }
  s.settings.ratio = 2;
  s.settings.ratioPreset = "2";
  return s;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const errors = [];
  for (const theme of ["dark", "light"]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`[${theme}] ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`[${theme}] console: ${m.text()}`); });
    const state = await demoState(theme);
    await page.addInitScript((st) => {
      if (!sessionStorage.getItem("seeded")) {
        localStorage.setItem("winrate.v1", JSON.stringify(st));
        sessionStorage.setItem("seeded", "1");
      }
    }, state);
    await page.goto(BASE);
    await page.waitForTimeout(900);
    const shot = (name, full = false) => page.screenshot({ path: path.join(OUT, `${theme}-${name}.png`), fullPage: full });

    await shot("1-calculator");
    // custom ratio
    await page.click('[data-ratio="custom"]');
    await page.fill("#inCustom", "4.5");
    await page.click("#btnCustomOk");
    await page.waitForTimeout(500);
    await shot("1b-calculator-custom");
    await page.click('[data-ratio="2"]');

    // abonar / retirar
    await page.click("#btnWithdraw");
    await page.fill("#mf_amount", "300");
    await page.fill("#mf_note", "skin legendaria");
    await page.waitForTimeout(400);
    await shot("9-modal-retirar");
    await page.click(".modal-btns .primary");
    await page.waitForTimeout(900);

    // WIN: primero el pop-up de cantidad real
    await page.click("#btnWin");
    await page.waitForSelector("#mf_amount");
    await page.fill("#mf_amount", String(Number(await page.inputValue("#mf_amount")) + 4));
    await page.waitForTimeout(300);
    await shot("4a-modal-cantidad-win");
    await page.click(".modal-btns .primary");
    await page.waitForTimeout(2600);
    await shot("4-modal-win");
    await page.click(".modal-btns .primary");

    await page.click("#btnTie");
    await page.waitForTimeout(2600);
    await shot("4b-modal-tie");
    await page.click(".modal-btns .primary");

    await page.click("#btnLose");
    await page.waitForSelector("#mf_amount");
    await page.waitForTimeout(300);
    await shot("5a-modal-cantidad-lose");
    await page.click(".modal-btns .primary");
    await page.waitForTimeout(3200);
    await shot("5-modal-lose");
    await page.click(".modal-btns .primary");

    await page.click("#btnLose");
    await page.click(".modal-btns .primary");
    await page.waitForTimeout(3200);
    await shot("6-modal-lock");
    await page.click(".modal-btns .primary");
    await page.waitForTimeout(500);
    await shot("7-system-locked");

    await page.click('[data-tab="winrate"]');
    await page.waitForTimeout(500);
    await shot("2-winrate");

    await page.click('[data-tab="stats"]');
    await page.waitForTimeout(1400);
    await shot("3-stats");
    // Por secciones (fullPage redimensiona el viewport y Chart.js se re-anima)
    let i = 0;
    for (const sel of ["#chCapital", "#chYear", "#heatmap", "#records", "#flowCards", "#chFlows"]) {
      await page.$eval(sel, (el) => el.closest(".panel, .records-grid").scrollIntoView({ block: "start" }));
      await page.evaluate(() => window.scrollBy(0, -90));
      await page.waitForTimeout(1200);
      await shot(`3${"bcdefg"[i++]}-stats`);
    }

    await page.click("#btnSettings");
    await page.waitForTimeout(500);
    await shot("8-settings");
    await ctx.close();
  }
  // primer uso
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true });
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(OUT, "dark-0-first-run.png") });
  await ctx.close();
  await browser.close();
  if (errors.length) { console.log("ERRORES:\n" + errors.join("\n")); process.exitCode = 1; }
  else console.log("OK — capturas en", OUT);
})();
