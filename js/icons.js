// Iconos pixel-art como SVG generados desde mapas de caracteres.
const C = {
  X: "currentColor",
  R: "var(--red)",
  r: "var(--red-hi)",
  D: "var(--red-deep)",
  S: "var(--silver)",
  s: "var(--silver-dim)",
  W: "#ffffff",
  E: "var(--silver-dim)",
  e: "var(--lose-bg)",
  K: "#0b0b0e",
};

const MAPS = {
  gear: [
    "....KKKK....",
    "..K.KKKK.K..",
    ".KKKKKKKKKK.",
    "..KKK..KKK..",
    "KKKK....KKKK",
    "KKK......KKK",
    "KKK......KKK",
    "KKKK....KKKK",
    "..KKK..KKK..",
    ".KKKKKKKKKK.",
    "..K.KKKK.K..",
    "....KKKK....",
  ],
  calc: [
    ".XXXXXXXXXX.",
    "X..........X",
    "X.XXXXXXXX.X",
    "X.XXXXXXXX.X",
    "X..........X",
    "X.XX.XX.XX.X",
    "X.XX.XX.XX.X",
    "X..........X",
    "X.XX.XX.XX.X",
    "X.XX.XX.XX.X",
    "X..........X",
    ".XXXXXXXXXX.",
  ],
  trophy: [
    "XXXXXXXXXXXX",
    "X.XXXXXXXX.X",
    "X.XXXXXXXX.X",
    ".X.XXXXXX.X.",
    "..XXXXXXXX..",
    "...XXXXXX...",
    "....XXXX....",
    ".....XX.....",
    ".....XX.....",
    "....XXXX....",
    "...XXXXXX...",
    "...XXXXXX...",
  ],
  chart: [
    "X.........XX",
    "X.........XX",
    "X......XX.XX",
    "X......XX.XX",
    "X......XX.XX",
    "X..XX..XX.XX",
    "X..XX..XX.XX",
    "X..XX..XX.XX",
    "X..XX..XX.XX",
    "X..XX..XX.XX",
    "X..........",
    "XXXXXXXXXXXX",
  ],
  heartFull: [
    ".RR.RR.",
    "RWRRRRR",
    "RRRRRRR",
    "RRRRRRD",
    ".RRRRD.",
    "..RRD..",
    "...D...",
  ],
  heartEmpty: [
    ".EE.EE.",
    "EeeEeeE",
    "EeeeeeE",
    "EeeeeeE",
    ".EeeeE.",
    "..EeE..",
    "...E...",
  ],
  coin: [
    "....SSSS....",
    "..SSRRRRSS..",
    ".SRRRRRRRRs.",
    ".SRWRRRRWRs.",
    "SRRWRRRRWRRs",
    "SRRWRRRRWRRs",
    "SRRWRWWRWRRs",
    "SRRWWRRWWRRs",
    ".SRWRRRRWRs.",
    ".sRRRRRRRRs.",
    "..ssRRRRss..",
    "....ssss....",
  ],
  lock: [
    "...SSSS...",
    "..S....S..",
    ".S......S.",
    ".S......S.",
    ".s......s.",
    "rrrrrrrrrr",
    "RRRRRRRRRR",
    "RRRRKKRRRR",
    "RRRRKKRRRR",
    "RRRRRKRRRR",
    "RRRRRRRRRR",
    "DDDDDDDDDD",
  ],
};

export function pixelSvg(name, cls = "") {
  const rows = MAPS[name];
  if (!rows) return "";
  const w = Math.max(...rows.map((r) => r.length));
  const h = rows.length;
  let rects = "";
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === "." || !C[ch]) { x++; continue; }
      let run = 1;
      while (row[x + run] === ch) run++;
      rects += `<rect x="${x}" y="${y}" width="${run}" height="1" style="fill:${C[ch]}"/>`;
      x += run;
    }
  });
  return `<svg class="${cls}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}

export function mountIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((el) => {
    if (!el.dataset.iconMounted) {
      el.insertAdjacentHTML("afterbegin", pixelSvg(el.dataset.icon));
      el.dataset.iconMounted = "1";
    }
  });
}
