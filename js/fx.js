// Micro-animaciones: contador animado, partículas pixel, sacudida, destello.
const reduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function animateNumber(from, to, onStep, duration = 650) {
  if (reduced() || from === to || !Number.isFinite(from)) {
    onStep(to);
    return;
  }
  const t0 = performance.now();
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const tick = (now) => {
    const t = Math.min(1, (now - t0) / duration);
    // pasos intermedios a 2 decimales; el último es el valor exacto
    onStep(t < 1 ? Math.round((from + (to - from) * ease(t)) * 100) / 100 : to);
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function shake(el = document.getElementById("app")) {
  if (reduced()) return;
  el.classList.remove("shake");
  void el.offsetWidth;
  el.classList.add("shake");
  setTimeout(() => el.classList.remove("shake"), 500);
}

export function flash() {
  if (reduced()) return;
  document.body.classList.remove("flash");
  void document.body.offsetWidth;
  document.body.classList.add("flash");
  setTimeout(() => document.body.classList.remove("flash"), 550);
}

let particles = [];
let raf = 0;

export function burst(x, y, colors, count = 70) {
  if (reduced()) return;
  const cv = document.getElementById("fx");
  if (!cv) return;
  const dpr = window.devicePixelRatio || 1;
  cv.width = innerWidth * dpr;
  cv.height = innerHeight * dpr;
  const g = cv.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = 3 + Math.random() * 7;
    particles.push({
      x, y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v - 5,
      s: 3 + Math.floor(Math.random() * 4),
      c: colors[i % colors.length],
      life: 50 + Math.random() * 35,
    });
  }
  if (!raf) {
    const step = () => {
      g.clearRect(0, 0, innerWidth, innerHeight);
      particles = particles.filter((p) => p.life > 0);
      for (const p of particles) {
        p.vy += 0.32;
        p.vx *= 0.985;
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
        g.globalAlpha = Math.min(1, p.life / 25);
        g.fillStyle = p.c;
        g.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s);
      }
      g.globalAlpha = 1;
      if (particles.length) raf = requestAnimationFrame(step);
      else { raf = 0; g.clearRect(0, 0, innerWidth, innerHeight); }
    };
    raf = requestAnimationFrame(step);
  }
}
