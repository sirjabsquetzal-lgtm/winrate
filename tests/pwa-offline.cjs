// Verifica instalabilidad (manifest + SW) y funcionamiento offline:  node tests/pwa-offline.cjs [baseUrl]
const { chromium } = require("playwright");
const BASE = process.argv[2] || "http://127.0.0.1:8765/";

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);

  const cdp = await ctx.newCDPSession(page);
  const inst = await cdp.send("Page.getInstallabilityErrors");
  const man = await cdp.send("Page.getAppManifest");
  const manifest = JSON.parse(man.data || "{}");
  const cacheKeys = await page.evaluate(async () => {
    const keys = await caches.keys();
    const c = await caches.open(keys[0]);
    return { keys, count: (await c.keys()).length };
  });
  console.log("Manifest:", man.url, "| errores parse:", man.errors.length);
  console.log("  name/short_name:", manifest.name, "/", manifest.short_name, "| display:", manifest.display, "| theme:", manifest.theme_color);
  console.log("  icons:", manifest.icons.map((i) => `${i.sizes} ${i.purpose}`).join(", "));
  console.log("Installability errors:", inst.installabilityErrors.length ? JSON.stringify(inst.installabilityErrors) : "ninguno ✓");
  console.log("Caché SW:", cacheKeys.keys.join(","), "—", cacheKeys.count, "archivos");

  // --- Offline ---
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForTimeout(1200);
  const res = await page.evaluate(() => ({
    title: document.title,
    logo: document.querySelector(".logo")?.textContent,
    chart: typeof Chart !== "undefined",
    fontsOk: [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family),
  }));
  // completar el primer uso y registrar un resultado sin red
  await page.fill("#mf_name", "TEST");
  await page.fill("#mf_capital", "1000");
  await page.click(".modal-btns .primary");
  await page.click("#btnWin");
  await page.click(".modal-btns .primary"); // cantidad (calculada)
  await page.waitForSelector(".modal.win .modal-tag");
  await page.click(".modal-btns .primary"); // pop-up de victoria
  await page.waitForTimeout(900); // fin de la animación del contador
  res.capitalAfterWin = await page.inputValue("#inCapital");
  res.networkBlocked = await page.evaluate(() => fetch("/no-cacheado-" + Date.now()).then(() => false, () => true));
  await page.click('[data-tab="stats"]');
  await page.waitForTimeout(1200);
  console.log("Offline:", JSON.stringify(res));
  const ok = res.capitalAfterWin === "1100" && !inst.installabilityErrors.length && res.logo === "WINRATE" && res.chart && res.networkBlocked && res.fontsOk.length >= 2 && !errors.length;
  if (errors.length) console.log("Errores JS:", errors);
  console.log(ok ? "PWA + OFFLINE OK ✓" : "FALLÓ ✗");
  process.exitCode = ok ? 0 : 1;
  await browser.close();
})();
