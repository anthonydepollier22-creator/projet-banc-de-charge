/* =========================================================================
   flow.js — Visualisation animée de l'écoulement dans les 3 lignes du banc
   -------------------------------------------------------------------------
   Chaque ligne est dessinée comme un tuyau horizontal :
     • ouverte  : particules d'air dont la vitesse ∝ V, turbulence ∝ régime,
                  couleur ∝ intensité du ΔP ; vanne (poignée) ouverte.
     • coupée   : tuyau grisé, vanne fermée (croix rouge), aucune particule.
   ========================================================================= */

const Flow = (() => {
  "use strict";

  let canvas, ctx, dpr = 1;
  let W = 0, H = 0;
  let raf = null;
  // état : { lanes:[{open,V,diameter,valveOpen,regime,name}], dpRatio }
  let state = { lanes: [], dpRatio: 0.2 };
  let particles = [];   // par ligne : tableau de particules

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext("2d");
    resize();
    if (!raf) loop();
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
    H = rect.height || 250;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function makeParticle(x) {
    return {
      x,
      lane: Math.random(),
      phase: Math.random() * Math.PI * 2,
      len: 7 + Math.random() * 14,
      speedJitter: 0.7 + Math.random() * 0.6,
    };
  }

  function ensureParticles(nLanes) {
    while (particles.length < nLanes) {
      const arr = [];
      for (let i = 0; i < 26; i++) arr.push(makeParticle(Math.random() * (W || 600)));
      particles.push(arr);
    }
    particles.length = nLanes;
  }

  function update(newState) {
    state = { ...state, ...newState };
    ensureParticles(state.lanes.length);
  }

  function smoothstep(a, b, x) {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  function dpColor(ratio) {
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

  function loop() {
    raf = requestAnimationFrame(loop);
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);

    const lanes = state.lanes;
    const n = lanes.length || 1;
    const bandH = H / n;
    const [cr, cg, cb] = dpColor(state.dpRatio);

    lanes.forEach((lane, li) => {
      const cy = bandH * li + bandH / 2;
      // demi-hauteur du tuyau selon le diamètre
      const r = (lane.diameter === "D32" ? 0.20 : 0.30) * bandH;
      drawPipe(cy, r, lane.open);
      drawValve(W * 0.72, cy, r, lane);
      drawLaneLabel(cy, r, lane);

      if (!lane.open || lane.V <= 0) return;

      const baseSpeed = 0.6 + lane.V * 0.7;
      const turb = lane.regime === "laminaire" ? 0.06
                 : lane.regime === "transitoire" ? 0.35 : 1;

      particles[li].forEach(p => {
        p.x += baseSpeed * p.speedJitter;
        if (p.x > W + 20) Object.assign(p, makeParticle(-10));
        p.phase += 0.15 * turb;
        const wobble = Math.sin(p.phase) * r * 0.5 * turb;
        const y = cy + (p.lane - 0.5) * 2 * (r * 0.8) + wobble;

        ctx.strokeStyle = `rgba(${cr},${cg},${cb},0.9)`;
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.shadowColor = `rgba(${cr},${cg},${cb},0.9)`;
        ctx.shadowBlur = 7;
        ctx.beginPath();
        ctx.moveTo(p.x - p.len, y);
        ctx.lineTo(p.x, y);
        ctx.stroke();
      });
      ctx.shadowBlur = 0;
    });
  }

  function drawPipe(cy, r, open) {
    ctx.save();
    // remplissage intérieur
    const grad = ctx.createLinearGradient(0, cy - r, 0, cy + r);
    if (open) {
      grad.addColorStop(0, "rgba(56,189,248,0.06)");
      grad.addColorStop(0.5, "rgba(45,212,191,0.12)");
      grad.addColorStop(1, "rgba(56,189,248,0.06)");
    } else {
      grad.addColorStop(0, "rgba(120,140,160,0.05)");
      grad.addColorStop(1, "rgba(120,140,160,0.05)");
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, cy - r, W, 2 * r);
    // parois
    ctx.strokeStyle = open ? "rgba(125,211,252,0.55)" : "rgba(140,160,180,0.3)";
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(0, cy - r); ctx.lineTo(W, cy - r); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, cy + r); ctx.lineTo(W, cy + r); ctx.stroke();
    ctx.restore();
  }

  // Vanne boisseau : poignée rouge. Ouverte = alignée au tuyau ; fermée = en croix.
  function drawValve(x, cy, r, lane) {
    ctx.save();
    const closed = !lane.open;
    // corps de la vanne
    ctx.fillStyle = "rgba(14,22,34,0.95)";
    ctx.strokeStyle = closed ? "#ff5c7a" : "#2dd4bf";
    ctx.lineWidth = 2;
    const s = r * 0.9;
    roundRect(x - s, cy - s, 2 * s, 2 * s, 4);
    ctx.fill(); ctx.stroke();
    // poignée
    ctx.strokeStyle = "#ff5c7a";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    if (closed) {            // poignée verticale = fermé
      ctx.moveTo(x, cy - s * 1.5); ctx.lineTo(x, cy + s * 1.5);
    } else {                 // poignée horizontale = ouvert
      ctx.moveTo(x - s * 1.5, cy); ctx.lineTo(x + s * 1.5, cy);
    }
    ctx.stroke();
    ctx.restore();
  }

  function roundRect(x, y, w, h, rad) {
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }

  function drawLaneLabel(cy, r, lane) {
    ctx.font = "600 11px 'JetBrains Mono', monospace";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillStyle = lane.open ? "rgba(226,238,245,0.85)" : "rgba(255,92,122,0.9)";
    const txt = lane.open ? `${lane.name}  ${lane.V.toFixed(1)} m/s` : `${lane.name}  — COUPÉE`;
    ctx.fillText(txt, 10, cy - r - 9);
  }

  return { init, update, resize };
})();
