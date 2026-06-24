/* =========================================================================
   charts.js — Mini bibliothèque de tracé sur <canvas> (sans dépendance)
   Permet de tracer des courbes (théorie) et des nuages de points (mesures)
   ainsi que des barres empilées (répartition régulières/singulières).
   ========================================================================= */

const Charts = (() => {
  "use strict";

  // Couleurs d'axes/grille lues depuis le thème courant (clair ou sombre)
  function themeColors() {
    const cs = getComputedStyle(document.documentElement);
    return {
      grid: cs.getPropertyValue("--chart-grid").trim() || "rgba(255,255,255,0.08)",
      axis: cs.getPropertyValue("--chart-axis").trim() || "rgba(255,255,255,0.35)",
      text: cs.getPropertyValue("--chart-text").trim() || "rgba(226,238,245,0.75)",
    };
  }

  // Couleur hex (#rrggbb) ou rgb -> rgba avec alpha
  function hexA(c, a) {
    if (c.startsWith("#")) {
      const n = parseInt(c.slice(1), 16);
      const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
      return `rgba(${r},${g},${b},${a})`;
    }
    if (c.startsWith("rgb")) return c.replace(/rgba?\(([^)]+)\)/, (_, v) => `rgba(${v.split(",").slice(0,3).join(",")},${a})`);
    return c;
  }

  // Gestion du HiDPI : adapte la résolution interne du canvas
  function setupCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width || canvas.clientWidth || 600;
    const h = rect.height || canvas.clientHeight || 320;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }

  function niceMax(v) {
    if (v <= 0) return 1;
    const exp = Math.floor(Math.log10(v));
    const base = Math.pow(10, exp);
    const n = v / base;
    let m;
    if (n <= 1) m = 1; else if (n <= 2) m = 2;
    else if (n <= 5) m = 5; else m = 10;
    return m * base;
  }

  /* -------------------- Graphique XY (lignes + points) ------------------- */
  /* options = {
       series: [{ type:'line'|'scatter', data:[{x,y}], color, label, dash }],
       xLabel, yLabel, xMax, yMax
     } */
  function plotXY(canvas, options) {
    const { ctx, w, h } = setupCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    const COLORS = themeColors();

    const padL = 58, padR = 16, padT = 16, padB = 42;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    // bornes
    let xMax = options.xMax, yMax = options.yMax;
    let xMin = options.xMin ?? 0;
    if (xMax == null || yMax == null) {
      let mx = 0, my = 0;
      options.series.forEach(s => s.data.forEach(p => {
        mx = Math.max(mx, p.x); my = Math.max(my, p.y);
      }));
      xMax = xMax ?? niceMax(mx);
      yMax = yMax ?? niceMax(my * 1.1);
    }
    if (yMax <= 0) yMax = 1;

    const X = x => padL + ((x - xMin) / (xMax - xMin)) * plotW;
    const Y = y => padT + plotH - (y / yMax) * plotH;

    // grille + graduations
    ctx.font = "11px Inter, system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const yTicks = 5;
    for (let i = 0; i <= yTicks; i++) {
      const val = (yMax / yTicks) * i;
      const yy = Y(val);
      ctx.strokeStyle = COLORS.grid;
      ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(padL + plotW, yy); ctx.stroke();
      ctx.fillStyle = COLORS.text;
      ctx.fillText(val.toFixed(val < 10 ? 1 : 0), padL - 8, yy);
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const xTicks = 6;
    for (let i = 0; i <= xTicks; i++) {
      const val = xMin + ((xMax - xMin) / xTicks) * i;
      const xx = X(val);
      ctx.strokeStyle = COLORS.grid;
      ctx.beginPath(); ctx.moveTo(xx, padT); ctx.lineTo(xx, padT + plotH); ctx.stroke();
      ctx.fillStyle = COLORS.text;
      ctx.fillText(Number.isInteger(val) ? val : val.toFixed(1), xx, padT + plotH + 8);
    }

    // axes
    ctx.strokeStyle = COLORS.axis;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + plotH); ctx.lineTo(padL + plotW, padT + plotH);
    ctx.stroke();

    // libellés axes
    ctx.fillStyle = COLORS.text;
    ctx.font = "12px Inter, system-ui, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    if (options.xLabel) ctx.fillText(options.xLabel, padL + plotW / 2, h - 6);
    ctx.save();
    ctx.translate(14, padT + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    if (options.yLabel) ctx.fillText(options.yLabel, 0, 0);
    ctx.restore();

    // séries
    options.series.forEach(s => {
      if (!s.data.length) return;
      if (s.type === "line") {
        // remplissage dégradé sous la courbe (effet "aire")
        if (s.area) {
          const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
          grad.addColorStop(0, hexA(s.color, 0.32));
          grad.addColorStop(1, hexA(s.color, 0));
          ctx.fillStyle = grad;
          ctx.beginPath();
          s.data.forEach((p, i) => {
            const px = X(p.x), py = Y(p.y);
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          });
          ctx.lineTo(X(s.data[s.data.length - 1].x), Y(0));
          ctx.lineTo(X(s.data[0].x), Y(0));
          ctx.closePath();
          ctx.fill();
        }
        // ligne avec lueur
        ctx.save();
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 2.6;
        ctx.lineJoin = "round";
        ctx.shadowColor = hexA(s.color, 0.55);
        ctx.shadowBlur = s.dash ? 0 : 10;
        if (s.dash) ctx.setLineDash(s.dash); else ctx.setLineDash([]);
        ctx.beginPath();
        s.data.forEach((p, i) => {
          const px = X(p.x), py = Y(p.y);
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        });
        ctx.stroke();
        ctx.restore();
      } else { // scatter
        s.data.forEach(p => {
          const px = X(p.x), py = Y(p.y);
          ctx.save();
          ctx.shadowColor = hexA(s.color, 0.8);
          ctx.shadowBlur = 12;
          ctx.fillStyle = s.color;
          ctx.beginPath();
          ctx.arc(px, py, s.ring ? 5 : 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          if (s.ring) {
            ctx.strokeStyle = "rgba(255,255,255,0.85)";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(px, py, s.ring === true ? 5 : 5, 0, Math.PI * 2);
            ctx.stroke();
          }
        });
      }
    });

    // légende
    if (options.series.some(s => s.label)) {
      let lx = padL + 10, ly = padT + 6;
      ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.font = "11px Inter, system-ui, sans-serif";
      options.series.filter(s => s.label).forEach(s => {
        ctx.fillStyle = s.color;
        if (s.type === "line") {
          ctx.fillRect(lx, ly - 1.5, 18, 3);
        } else {
          ctx.beginPath(); ctx.arc(lx + 9, ly, 4, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = COLORS.text;
        ctx.fillText(s.label, lx + 24, ly);
        ly += 18;
      });
    }
  }

  /* ----------------- Barre empilée régulières / singulières -------------- */
  function plotStackedBar(canvas, parts) {
    // parts = [{label, value, color}]
    const { ctx, w, h } = setupCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    const total = parts.reduce((s, p) => s + p.value, 0) || 1;
    const padL = 14, padR = 14, padT = 18, padB = 18;
    const barH = 34;
    const y = (h - barH) / 2;
    let x = padL;
    const fullW = w - padL - padR;

    parts.forEach(p => {
      const segW = (p.value / total) * fullW;
      ctx.fillStyle = p.color;
      roundRect(ctx, x, y, Math.max(segW, 0), barH, 4);
      ctx.fill();
      // étiquette si assez large
      if (segW > 60) {
        ctx.fillStyle = "rgba(0,0,0,0.78)";
        ctx.font = "600 12px Inter, system-ui, sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        const pct = ((p.value / total) * 100).toFixed(0);
        ctx.fillText(`${pct}%`, x + segW / 2, y + barH / 2);
      }
      x += segW;
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  return { plotXY, plotStackedBar };
})();
