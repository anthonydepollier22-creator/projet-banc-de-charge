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

  /* ----------------------- Diagramme de Moody (λ vs Re) ------------------ */
  // Colebrook (tube lisse ε≈0) : 1/√λ = -2·log10(2,51/(Re·√λ))
  function lambdaSmooth(Re) {
    let l = 0.02;
    for (let i = 0; i < 40; i++) {
      const rhs = -2 * Math.log10(2.51 / (Re * Math.sqrt(l)));
      l = 1 / (rhs * rhs);
    }
    return l;
  }

  // opts = { Re, lambda }  -> trace le diagramme de Moody avec le point courant
  function plotMoody(canvas, opts) {
    const { ctx, w, h } = setupCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    const COLORS = themeColors();
    const cs = getComputedStyle(document.documentElement);
    const cAccent = cs.getPropertyValue("--accent").trim() || "#2dd4bf";
    const cAccent2 = cs.getPropertyValue("--accent-2").trim() || "#38bdf8";
    const cWarn = "#ffb454";

    const padL = 52, padR = 16, padT = 14, padB = 38;
    const plotW = w - padL - padR, plotH = h - padT - padB;

    // Échelles log : Re de 500 à 2e6, λ de 0,008 à 0,1
    const reMin = 500, reMax = 2e6, laMin = 0.008, laMax = 0.1;
    const lg = Math.log10;
    const X = re => padL + (lg(re) - lg(reMin)) / (lg(reMax) - lg(reMin)) * plotW;
    const Y = la => padT + plotH - (lg(la) - lg(laMin)) / (lg(laMax) - lg(laMin)) * plotH;

    // Zone de transition 2300–4000
    ctx.fillStyle = "rgba(255,180,84,0.10)";
    ctx.fillRect(X(2300), padT, X(4000) - X(2300), plotH);

    // Grille verticale (décades) + libellés
    ctx.font = "10px Inter, system-ui, sans-serif";
    ctx.fillStyle = COLORS.text;
    [1e3, 1e4, 1e5, 1e6].forEach(re => {
      const x = X(re);
      ctx.strokeStyle = COLORS.grid;
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + plotH); ctx.stroke();
      ctx.textAlign = "center"; ctx.textBaseline = "top";
      ctx.fillText(re >= 1e6 ? "10⁶" : re >= 1e5 ? "10⁵" : re >= 1e4 ? "10⁴" : "10³", x, padT + plotH + 6);
    });
    // Grille horizontale
    [0.01, 0.02, 0.03, 0.05, 0.08].forEach(la => {
      const y = Y(la);
      ctx.strokeStyle = COLORS.grid;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke();
      ctx.textAlign = "right"; ctx.textBaseline = "middle";
      ctx.fillStyle = COLORS.text;
      ctx.fillText(la.toFixed(la < 0.03 ? 3 : 2), padL - 8, y);
    });

    // Axes
    ctx.strokeStyle = COLORS.axis; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + plotH); ctx.lineTo(padL + plotW, padT + plotH); ctx.stroke();
    ctx.fillStyle = COLORS.text; ctx.font = "11px Inter, system-ui, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    ctx.fillText("Nombre de Reynolds  Re", padL + plotW / 2, h - 4);
    ctx.save(); ctx.translate(12, padT + plotH / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText("λ (frottement)", 0, 0); ctx.restore();

    // Courbe laminaire λ = 64/Re (Re 500 → 2300)
    const drawCurve = (fn, reA, reB, color, dash) => {
      ctx.strokeStyle = color; ctx.lineWidth = 2.4; ctx.setLineDash(dash || []);
      ctx.shadowColor = hexA(color, .5); ctx.shadowBlur = dash ? 0 : 6;
      ctx.beginPath();
      let first = true;
      for (let k = 0; k <= 120; k++) {
        const re = reA * Math.pow(reB / reA, k / 120);
        const la = fn(re);
        if (la < laMin || la > laMax) { first = true; continue; }
        const x = X(re), y = Y(la);
        if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
      }
      ctx.stroke(); ctx.setLineDash([]); ctx.shadowBlur = 0;
    };
    drawCurve(re => 64 / re, reMin, 2300, cAccent2);              // laminaire
    drawCurve(lambdaSmooth, 4000, reMax, cAccent);                 // turbulent lisse

    // Légende
    ctx.font = "10px Inter, system-ui, sans-serif"; ctx.textBaseline = "middle"; ctx.textAlign = "left";
    let ly = padT + 8;
    const leg = (c, t) => { ctx.fillStyle = c; ctx.fillRect(padL + plotW - 150, ly - 1.5, 16, 3); ctx.fillStyle = COLORS.text; ctx.fillText(t, padL + plotW - 130, ly); ly += 15; };
    leg(cAccent2, "Laminaire 64/Re");
    leg(cAccent, "Turbulent (lisse)");
    ctx.fillStyle = cWarn; ctx.fillText("▮ transition", padL + plotW - 150, ly);

    // Point de fonctionnement
    if (opts && opts.Re > 0 && opts.lambda > 0) {
      const re = Math.max(reMin, Math.min(reMax, opts.Re));
      const la = Math.max(laMin, Math.min(laMax, opts.lambda));
      const x = X(re), y = Y(la);
      ctx.save();
      ctx.shadowColor = "rgba(255,255,255,.9)"; ctx.shadowBlur = 12;
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = COLORS.axis; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, padT + plotH); ctx.moveTo(x, y); ctx.lineTo(padL, y); ctx.stroke(); ctx.setLineDash([]);
    }
  }

  return { plotXY, plotStackedBar, plotMoody };
})();
