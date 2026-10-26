// Sonidos 8-bit generados con Web Audio API (sin archivos).
let ctx = null;
let enabled = true;

export function setSoundEnabled(on) {
  enabled = !!on;
}

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

// notes: [freqHz, durSeg, type?, gain?]
function seq(notes, { gap = 0, slide = false } = {}) {
  if (!enabled) return;
  const a = ac();
  if (!a) return;
  let t = a.currentTime + 0.01;
  for (const [f, d, type = "square", g = 0.12] of notes) {
    const o = a.createOscillator();
    const v = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, f * 0.5), t + d);
    v.gain.setValueAtTime(0.0001, t);
    v.gain.exponentialRampToValueAtTime(g, t + 0.008);
    v.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(v).connect(a.destination);
    o.start(t);
    o.stop(t + d + 0.02);
    t += d + gap;
  }
}

export const sfx = {
  click: () => seq([[880, 0.035, "square", 0.06]]),
  win: () => seq([[523, 0.08], [659, 0.08], [784, 0.08], [1047, 0.22, "square", 0.14]], { gap: 0.01 }),
  lose: () => seq([[392, 0.12, "sawtooth", 0.1], [311, 0.12, "sawtooth", 0.1], [233, 0.3, "sawtooth", 0.1]], { gap: 0.02, slide: true }),
  lock: () => seq([[220, 0.09, "square", 0.12], [220, 0.09, "square", 0.12], [110, 0.45, "triangle", 0.2]], { gap: 0.05 }),
};
