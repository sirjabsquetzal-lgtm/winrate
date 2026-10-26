// Gráficas de Stats con Chart.js (colores tomados del tema activo).
import { monthSeries, yearSeries, capitalSeries, winRate } from "./logic.js";

const MONTHS = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
const charts = {};

function theme() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim();
  return {
    red: v("--red"), redHi: v("--red-hi"), redDeep: v("--red-deep"),
    text: v("--text"), dim: v("--text-dim"), silver: v("--silver"), silverDim: v("--silver-dim"),
    lose: v("--lose"), panel: v("--panel"), bg: v("--bg"),
    grid: document.documentElement.dataset.theme === "light" ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.07)",
  };
}

function alpha(color, a) {
  // #rrggbb -> rgba
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function destroy(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}

function setEmpty(canvas, empty) {
  const box = canvas.closest(".chart-box");
  box.classList.toggle("is-empty", empty);
  if (!box.dataset.empty) box.dataset.empty = "NO DATA";
}

function baseOptions(t) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 700, easing: "easeOutQuart" },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: t.panel, borderColor: t.red, borderWidth: 2, cornerRadius: 0,
        titleColor: t.text, bodyColor: t.text, displayColors: false, padding: 8,
        titleFont: { family: "VT323", size: 18 }, bodyFont: { family: "VT323", size: 18 },
      },
    },
    scales: {
      x: { grid: { color: t.grid, drawTicks: false }, border: { color: t.silverDim }, ticks: { color: t.dim, padding: 6, font: { family: "VT323", size: 16 } } },
      y: { grid: { color: t.grid, drawTicks: false }, border: { color: t.silverDim }, ticks: { color: t.dim, padding: 6, font: { family: "VT323", size: 16 } } },
    },
  };
}

const fmt = (n) => n.toLocaleString("es-MX");

export function renderCharts(records, todayKey) {
  if (typeof Chart === "undefined") return;
  const t = theme();
  Chart.defaults.font.family = "VT323";

  // --- Coins en el tiempo (área) ---
  {
    const id = "chCapital";
    destroy(id);
    const cv = document.getElementById(id);
    const s = capitalSeries(records);
    setEmpty(cv, s.length < 2);
    if (s.length >= 2) {
      const o = baseOptions(t);
      o.scales.x.ticks.maxTicksLimit = 6;
      o.scales.y.ticks.callback = (v) => fmt(v);
      o.plugins.tooltip.callbacks = {
        title: (items) => {
          const p = s[items[0].dataIndex];
          return p.start ? "INICIO" : new Date(p.ts).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
        },
        label: (item) => `${fmt(item.parsed.y)} Coins`,
      };
      charts[id] = new Chart(cv, {
        type: "line",
        data: {
          labels: s.map((_, i) => (i === 0 ? "0" : "#" + i)),
          datasets: [{
            data: s.map((p) => p.value),
            borderColor: t.red, borderWidth: 2, tension: 0.25,
            pointRadius: s.length > 40 ? 0 : 3, pointStyle: "rect",
            pointBackgroundColor: s.map((p) => (p.result === "lose" ? t.silver : t.red)),
            pointBorderColor: s.map((p) => (p.result === "lose" ? t.silver : t.red)),
            fill: true,
            backgroundColor: (ctx) => {
              const { chart } = ctx;
              const area = chart.chartArea;
              if (!area) return alpha(t.red, 0.2);
              const g = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
              g.addColorStop(0, alpha(t.red, 0.45));
              g.addColorStop(1, alpha(t.red, 0));
              return g;
            },
          }],
        },
        options: o,
      });
    }
  }

  // --- Win rate del mes (línea) ---
  {
    const id = "chMonth";
    destroy(id);
    const cv = document.getElementById(id);
    const m = monthSeries(records, todayKey);
    cv.closest(".chart-box").dataset.empty = "SIN ACTIVIDAD ESTE MES";
    setEmpty(cv, m.length === 0);
    if (m.length) {
      const o = baseOptions(t);
      o.scales.y.min = 0; o.scales.y.max = 100;
      o.scales.y.ticks.stepSize = 25;
      o.scales.y.ticks.callback = (v) => v + "%";
      o.plugins.tooltip.callbacks = {
        title: (items) => `DÍA ${m[items[0].dataIndex].dayKey.slice(8)}`,
        label: (item) => {
          const d = m[item.dataIndex];
          return `${d.pct.toFixed(1)}% · ${d.wins}W ${d.losses}L`;
        },
      };
      charts[id] = new Chart(cv, {
        type: "line",
        data: {
          labels: m.map((d) => d.dayKey.slice(8)),
          datasets: [{
            data: m.map((d) => d.pct),
            borderColor: t.red, borderWidth: 2, tension: 0,
            pointRadius: 5, pointHoverRadius: 7, pointStyle: "rect",
            pointBackgroundColor: t.red, pointBorderColor: t.text, pointBorderWidth: 1,
            fill: false, stepped: false,
          }],
        },
        options: o,
      });
    }
  }

  // --- Win rate del año (barras por mes) ---
  {
    const id = "chYear";
    destroy(id);
    const cv = document.getElementById(id);
    const y = yearSeries(records, todayKey);
    const any = y.some((d) => d.total > 0);
    cv.closest(".chart-box").dataset.empty = "SIN ACTIVIDAD ESTE AÑO";
    setEmpty(cv, !any);
    if (any) {
      const o = baseOptions(t);
      o.scales.y.min = 0; o.scales.y.max = 100;
      o.scales.y.ticks.stepSize = 25;
      o.scales.y.ticks.callback = (v) => v + "%";
      o.scales.x.grid.display = false;
      o.scales.x.ticks.font = { family: "VT323", size: 14 };
      o.scales.x.ticks.autoSkip = false;
      o.scales.x.ticks.maxRotation = 0;
      o.plugins.tooltip.callbacks = {
        label: (item) => {
          const d = y[item.dataIndex];
          return d.total ? `${d.pct.toFixed(1)}% · ${d.wins}W ${d.losses}L` : "sin actividad";
        },
      };
      charts[id] = new Chart(cv, {
        type: "bar",
        data: {
          labels: MONTHS.map((mm) => mm.slice(0, 1)),
          datasets: [{
            data: y.map((d) => (d.total ? d.pct : null)),
            backgroundColor: y.map((d, i) => (i === Number(todayKey.slice(5, 7)) - 1 ? t.red : alpha(t.red, 0.55))),
            borderColor: t.red, borderWidth: 1, borderSkipped: false,
            barPercentage: 0.8, categoryPercentage: 0.9,
          }],
        },
        options: o,
      });
    }
  }

  // --- Dona Wins vs Losses ---
  {
    const id = "chDonut";
    destroy(id);
    const cv = document.getElementById(id);
    const wr = winRate(records);
    setEmpty(cv, wr.total === 0);
    const center = document.getElementById("donutCenter");
    center.innerHTML = wr.total ? `<div><b>${wr.pct.toFixed(1)}%</b>${wr.wins}W · ${wr.losses}L</div>` : "";
    if (wr.total) {
      charts[id] = new Chart(cv, {
        type: "doughnut",
        data: {
          labels: ["WINS", "LOSSES"],
          datasets: [{ data: [wr.wins, wr.losses], backgroundColor: [t.red, t.silver], borderColor: t.panel, borderWidth: 3, hoverOffset: 6 }],
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: "68%",
          animation: { animateRotate: true, duration: 900 },
          plugins: {
            legend: { display: false },
            tooltip: baseOptions(t).plugins.tooltip,
          },
        },
      });
    }
  }
}

export { MONTHS };
