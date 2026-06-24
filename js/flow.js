/* =========================================================================
   flow.js — Visualisation animée de l'écoulement d'air dans la conduite
   -------------------------------------------------------------------------
   Dessine un tuyau avec des particules d'air dont :
     • la vitesse est proportionnelle à la vitesse calculée V (m/s)
     • le désordre (turbulence) dépend du régime (laminaire/turbulent)
     • la couleur traduit l'intensité du ΔP (vert -> rouge)
   La conduite se rétrécit si une réduction Ø50→Ø32 est active, et présente
   un étranglement à l'emplacement de la vanne selon son ouverture.
   ========================================================================= */

const Flow = (() => {
  "use strict";

  let canvas, ctx, dpr = 1;
  let W = 0, H = 0;
  let particles = [];
  let raf = null;
  let state = {
    V: 4, regime: "turbulent", dpRatio: 0.2,
    reduction: false, valveOpen: 100, valve: true,
  };

  const N = 90; // nombre de particules

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext("2d");
    resize();
    seed();
    if (!raf) loop();
    // pause quand l'onglet est caché (économie)
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) { cancelAnimationFrame(raf); raf = null; }
      else if (!raf) loop();
    });
  }

  function resize() {
    if (!canvas) return;
    dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    W = rect.width || 600;
    H = rect.height || 200;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function seed() {
    particles = [];
    for (let i = 0; i < N; i++) particles.push(makeParticle(Math.random() * W));
  }

  function makeParticle(x) {
    return {
      x,
      lane: Math.random(),          // position verticale relative (0..1)
      phase: Math.random() * Math.PI * 2,
      len: 8 + Math.random() * 16,  // longueur de la traînée
      speedJitter: 0.7 + Math.random() * 0.6,
    };
  }

  // Géométrie du tuyau à une abscisse x (centre + demi-hauteur)
  function pipeAt(x) {
    const cy = H / 2;
    const baseR = H * 0.30;          // demi-hauteur Ø50
    const t = x / W;
    let r = baseR;

    // rétrécissement progressif Ø50 -> Ø32 au milieu du tuyau
    if (state.reduction) {
      const smallR = baseR * (32 / 50);
      const s = smoothstep(0.42, 0.58, t);
      r = baseR + (smallR - baseR) * s;
    }
    // étranglement local de la vanne (vers 72% de la longueur)
    if (state.valve && state.valveOpen < 100) {
      const close = 1 - state.valveOpen / 100;           // 0 ouverte -> 1 fermée
      const g = Math.exp(-Math.pow((t - 0.72) / 0.05, 2)); // gaussienne
      r *= 1 - close * 0.78 * g;
    }
    return { cy, r };
  }

  function smoothstep(a, b, x) {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  function dpColor(ratio) {
    // 0 -> teal, 0.5 -> orange, 1 -> rouge
    const stops = [
      { p: 0,   c: [45, 212, 191] },
      { p: 0.5, c: [255, 180, 84] },
      { p: 1,   c: [255, 92, 122] },
    ];
    const r = Math.max(0, Math.min(1, ratio));
    let a = stops[0], b = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) {
      if (r >= stops[i].p && r <= stops[i + 1].p) { a = stops[i]; b = stops[i + 1]; break; }
    }
    const t = (r - a.p) / (b.p - a.p || 1);
    return a.c.map((v, i) => Math.round(v + (b.c[i] - v) * t));
  }

  function update(newState) {
    state = { ...state, ...newState };
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);

    drawPipe();

    // facteur de vitesse d'animation (px/frame) à partir de V (m/s)
    const baseSpeed = 0.6 + state.V * 0.7;
    const turb = state.regime === "laminaire" ? 0.06
               : state.regime === "transitoire" ? 0.35 : 1;
    const [cr, cg, cb] = dpColor(state.dpRatio);

    particles.forEach(p => {
      const geo = pipeAt(p.x);
      // accélération dans les zones étroites (conservation du débit)
      const baseR = H * 0.30;
      const accel = baseR / Math.max(geo.r, 1);
      p.x += baseSpeed * p.speedJitter * accel;

      if (p.x > W + 20) { Object.assign(p, makeParticle(-10)); }

      // position verticale dans le tuyau + ondulation turbulente
      p.phase += 0.15 * turb;
      const wobble = Math.sin(p.phase) * geo.r * 0.5 * turb;
      const y = geo.cy + (p.lane - 0.5) * 2 * (geo.r * 0.8) + wobble;

      // traînée
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},0.85)`;
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.shadowColor = `rgba(${cr},${cg},${cb},0.9)`;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(p.x - p.len * accel, y);
      ctx.lineTo(p.x, y);
      ctx.stroke();
    });
    ctx.shadowBlur = 0;

    drawLabels();
  }

  function drawPipe() {
    // paroi du tuyau (haut + bas) avec léger remplissage
    const steps = 60;
    ctx.save();
    // remplissage intérieur
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const x = (W * i) / steps;
      const g = pipeAt(x);
      if (i === 0) ctx.moveTo(x, g.cy - g.r); else ctx.lineTo(x, g.cy - g.r);
    }
    for (let i = steps; i >= 0; i--) {
      const x = (W * i) / steps;
      const g = pipeAt(x);
      ctx.lineTo(x, g.cy + g.r);
    }
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "rgba(56,189,248,0.05)");
    grad.addColorStop(0.5, "rgba(45,212,191,0.10)");
    grad.addColorStop(1, "rgba(56,189,248,0.05)");
    ctx.fillStyle = grad;
    ctx.fill();

    // parois
    ctx.strokeStyle = "rgba(125,211,252,0.55)";
    ctx.lineWidth = 2.5;
    for (const sign of [-1, 1]) {
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const x = (W * i) / steps;
        const g = pipeAt(x);
        const y = g.cy + sign * g.r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawLabels() {
    ctx.font = "600 12px 'JetBrains Mono', monospace";
    ctx.fillStyle = "rgba(226,238,245,0.85)";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(`V = ${state.V.toFixed(1)} m/s`, 12, 10);
    const labels = { laminaire: "Laminaire", transitoire: "Transitoire", turbulent: "Turbulent" };
    const cols = { laminaire: "#3fb6ff", transitoire: "#ffb454", turbulent: "#ff5c7a" };
    ctx.textAlign = "right";
    ctx.fillStyle = cols[state.regime] || "#fff";
    ctx.fillText(labels[state.regime] || "", W - 12, 10);
  }

  return { init, update, resize };
})();
