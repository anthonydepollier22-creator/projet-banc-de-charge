/* =========================================================================
   app.js — Logique d'interface : simulateur + banc d'essai virtuel
   Relie les contrôles HTML au moteur Physics et aux tracés Charts.
   ========================================================================= */

(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const fmt = (n, d = 0) =>
    n.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });

  const COLOR_REG = "#2dd4bf";   // régulières
  const COLOR_SING = "#38bdf8";  // singulières
  const COLOR_THEO = "#2dd4bf";
  const COLOR_MEAS = "#ffb454";

  /* ====================== NAV MOBILE ====================== */
  $("burger")?.addEventListener("click", () => $("nav").querySelector(".nav__links").classList.toggle("open"));
  document.querySelectorAll(".nav__links a").forEach(a =>
    a.addEventListener("click", () => document.querySelector(".nav__links").classList.remove("open")));

  /* ====================== MINI CALCULATEUR REYNOLDS ====================== */
  function updateReynoldsMini() {
    const V = parseFloat($("rxV").value);
    const D = parseFloat($("rxD").value);
    $("rxVo").textContent = fmt(V, 1);
    const Re = Physics.reynolds(V, D);
    const reg = Physics.regime(Re);
    const fr = Physics.frictionFactor(Re, D);
    $("rxRe").textContent = fmt(Re, 0);
    const pill = $("rxReg");
    pill.textContent = reg.label;
    pill.style.background = reg.color + "22";
    pill.style.color = reg.color;
    $("rxLam").textContent = fmt(fr.lambda, 4);
  }
  ["rxV", "rxD"].forEach(id => $(id).addEventListener("input", updateReynoldsMini));

  /* ====================== SIMULATEUR ====================== */
  // Lit la configuration courante depuis les contrôles
  function readConfig() {
    return {
      freq: parseFloat($("freq").value),
      vAt50: parseFloat($("v50").value),
      diameter: $("diam").value,
      length: parseFloat($("length").value),
      elbows: $("cElbow").checked ? parseInt($("elbowN").value, 10) : 0,
      elbowK: parseFloat($("elbowK").value),
      reduction: $("cReduction").checked,
      valve: $("cValve").checked,
      valveOpen: parseInt($("valveOpen").value, 10),
      venturi: $("cVenturi").checked,
    };
  }

  function updateSim() {
    // étiquettes live des sliders
    $("vFreq").textContent = $("freq").value;
    $("vV50").textContent = fmt(parseFloat($("v50").value), 1);
    $("vKelbow").textContent = fmt(parseFloat($("elbowK").value), 1);
    $("vValve").textContent = $("valveOpen").value;

    const cfg = readConfig();
    const r = Physics.computeCircuit(cfg);

    // KPI
    $("kV").textContent = fmt(r.V, 1);
    $("kRe").textContent = fmt(r.Re, 0);
    const reg = $("kReg");
    reg.textContent = r.regime.label;
    reg.style.color = r.regime.color;
    $("kLam").textContent = fmt(r.lambda, 4);
    $("kLamLaw").textContent = r.lambdaLaw;
    $("kDp").textContent = fmt(r.dpTotal, 1);

    // conversions
    $("cPa").textContent = fmt(r.dpTotal, 1) + " Pa";
    $("cMmce").textContent = fmt(r.dpTotal_mmCE, 1) + " mmCE";
    $("cMbar").textContent = fmt(r.dpTotal_mbar, 2) + " mbar";
    $("cQ").textContent = fmt(r.Q * 3600, 0) + " m³/h";

    // barre empilée
    Charts.plotStackedBar($("barCanvas"), [
      { label: "Régulières", value: r.dpRegular, color: COLOR_REG },
      { label: "Singulières", value: r.dpSingular, color: COLOR_SING },
    ]);
    const totalNZ = r.dpTotal || 1;
    $("dpSplit").innerHTML =
      `Régulières <b style="color:${COLOR_REG}">${fmt(r.dpRegular,1)} Pa</b> · ` +
      `Singulières <b style="color:${COLOR_SING}">${fmt(r.dpSingular,1)} Pa</b>`;

    // détail des pertes
    const bd = $("breakdown");
    bd.innerHTML = "";
    const addRow = (name, color, dp) => {
      const li = document.createElement("li");
      li.innerHTML = `<span><i class="dot" style="background:${color}"></i>${name}</span>` +
                     `<b>${fmt(dp,2)} Pa · ${fmt(dp/totalNZ*100,0)}%</b>`;
      bd.appendChild(li);
    };
    addRow(`Conduite droite ${cfg.diameter==="D50"?"Ø50":"Ø32"} (${cfg.length} m)`, COLOR_REG, r.dpRegular);
    r.singular.forEach(s => addRow(`${s.name} — K=${fmt(s.K,2)}`, COLOR_SING, s.dp));

    // courbe ΔP = f(fréquence)
    drawSimCurve(cfg, r);

    // visualisation d'écoulement d'air
    const dpRatio = 1 - 1 / (1 + r.dpTotal / 200); // 0..1 (lissé)
    Flow.update({
      V: r.V, regime: r.regime.code, dpRatio,
      reduction: cfg.reduction, valve: cfg.valve, valveOpen: cfg.valveOpen,
    });
  }

  function drawSimCurve(cfg, current) {
    const pts = Physics.sweep(cfg, 10, 50, 2);
    const series = [
      { type: "line", color: COLOR_THEO, area: true, label: "ΔP total", data: pts.map(p => ({ x: p.freq, y: p.dpTotal })) },
      { type: "line", color: COLOR_SING, dash: [5,4], label: "dont singulières", data: pts.map(p => ({ x: p.freq, y: p.dpSingular })) },
      { type: "scatter", color: "#fff", ring: true, data: [{ x: cfg.freq, y: current.dpTotal }] },
    ];
    Charts.plotXY($("curveCanvas"), {
      series, xLabel: "Fréquence Altivar (Hz)", yLabel: "ΔP (Pa)",
      xMin: 10, xMax: 50,
    });
  }

  // écoute de tous les contrôles du simulateur
  ["freq","v50","diam","length","cElbow","elbowN","elbowK","cReduction",
   "cValve","valveOpen","cVenturi"].forEach(id => {
    const el = $(id);
    el.addEventListener("input", updateSim);
    el.addEventListener("change", updateSim);
  });

  /* ====================== BANC D'ESSAI VIRTUEL ====================== */
  let lastEssai = null;

  function gaussNoise() {
    // Box-Muller -> bruit ~ N(0,1)
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function runEssai() {
    const cfg = readConfig();
    const step = parseFloat($("step").value);
    const noiseAmp = parseFloat($("noise").value);
    const pts = Physics.sweep(cfg, 10, 50, step);

    const rows = pts.map(p => {
      // 3 relevés bruités autour de la valeur théorique
      const reads = [0, 1, 2].map(() => {
        const noise = 1 + (noiseAmp ? gaussNoise() * noiseAmp : 0);
        return Math.max(0, p.dpTotal * noise);
      });
      const moy = (reads[0] + reads[1] + reads[2]) / 3;
      const ecart = p.dpTotal > 0 ? (moy - p.dpTotal) / p.dpTotal * 100 : 0;
      return { ...p, reads, moy, ecart };
    });

    lastEssai = { cfg, rows };
    renderEssaiTable(rows);
    drawEssaiChart(rows);

    // verdict
    const meanAbs = rows.reduce((s, r) => s + Math.abs(r.ecart), 0) / rows.length;
    const reg = Physics.regime(rows[rows.length - 1].Re);
    $("essaiRegime").textContent = `Régime à 50 Hz : ${reg.label}`;
    const v = $("verdict");
    v.classList.add("show");
    v.innerHTML =
      `Essai terminé : <b>${rows.length} paliers</b>, ${rows.length * 3} relevés. ` +
      `Écart moyen mesuré/théorique : <b>${fmt(meanAbs,1)} %</b>. ` +
      (meanAbs < 8
        ? `✅ Corrélation conforme à l'objectif du projet (&lt; 8 %).`
        : `⚠️ Au-dessus de 8 % — réduisez le bruit de mesure pour vous rapprocher de la théorie.`);

    $("exportCsv").disabled = false;
  }

  function ecartClass(e) {
    const a = Math.abs(e);
    if (a < 5) return "ecart-ok";
    if (a < 10) return "ecart-mid";
    return "ecart-hi";
  }

  function renderEssaiTable(rows) {
    const tb = $("rtbody");
    tb.innerHTML = "";
    rows.forEach(r => {
      const tr = document.createElement("tr");
      tr.innerHTML =
        `<td>${r.freq}</td>` +
        `<td>${fmt(r.V,1)}</td>` +
        `<td>${fmt(r.Re,0)}</td>` +
        `<td>${fmt(r.reads[0],1)}</td>` +
        `<td>${fmt(r.reads[1],1)}</td>` +
        `<td>${fmt(r.reads[2],1)}</td>` +
        `<td>${fmt(r.moy,1)}</td>` +
        `<td>${fmt(r.dpTotal,1)}</td>` +
        `<td class="${ecartClass(r.ecart)}">${r.ecart >= 0 ? "+" : ""}${fmt(r.ecart,1)} %</td>`;
      tb.appendChild(tr);
    });
  }

  function drawEssaiChart(rows) {
    const series = [
      { type: "line", color: COLOR_THEO, area: true, label: "ΔP théorique (Darcy-Weisbach)",
        data: rows.map(r => ({ x: r.freq, y: r.dpTotal })) },
      { type: "scatter", color: COLOR_MEAS, ring: true, label: "ΔP mesuré (moyenne)",
        data: rows.map(r => ({ x: r.freq, y: r.moy })) },
    ];
    Charts.plotXY($("essaiCanvas"), {
      series, xLabel: "Fréquence Altivar (Hz)", yLabel: "ΔP (Pa)",
      xMin: 10, xMax: 50,
    });
  }

  function exportCsv() {
    if (!lastEssai) return;
    const { cfg, rows } = lastEssai;
    let csv = "Banc a Perte de Charge - Essai virtuel\n";
    csv += `Conduite;${cfg.diameter};Longueur;${cfg.length} m;Vitesse a 50Hz;${cfg.vAt50} m/s\n`;
    csv += `Coudes;${cfg.elbows};K coude;${cfg.elbowK};Vanne;${cfg.valve?cfg.valveOpen+"%":"non"};Reduction;${cfg.reduction?"oui":"non"};Venturi;${cfg.venturi?"oui":"non"}\n\n`;
    csv += "Frequence (Hz);Vitesse (m/s);Reynolds;Releve 1 (Pa);Releve 2 (Pa);Releve 3 (Pa);Moyenne (Pa);Theorique (Pa);Ecart (%)\n";
    rows.forEach(r => {
      csv += [r.freq, fmt(r.V,2), fmt(r.Re,0),
        fmt(r.reads[0],2), fmt(r.reads[1],2), fmt(r.reads[2],2),
        fmt(r.moy,2), fmt(r.dpTotal,2), fmt(r.ecart,1)]
        .join(";").replace(/ /g, "") + "\n";
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "essai_perte_de_charge.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  $("runEssai").addEventListener("click", runEssai);
  $("exportCsv").addEventListener("click", exportCsv);

  /* ====================== ANIMATIONS AU SCROLL ====================== */
  // Révélation progressive des éléments
  const revealEls = document.querySelectorAll("[data-reveal]");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    revealEls.forEach(el => io.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add("in"));
  }

  // Barre de progression + navigation active
  const progress = $("progress");
  const sections = [...document.querySelectorAll("section[id]")];
  const navLinks = [...document.querySelectorAll(".nav__links a")];
  function onScroll() {
    const h = document.documentElement;
    const scrolled = h.scrollTop / (h.scrollHeight - h.clientHeight);
    if (progress) progress.style.width = (scrolled * 100).toFixed(2) + "%";
    // section active
    const y = h.scrollTop + 120;
    let current = sections[0]?.id;
    for (const s of sections) { if (s.offsetTop <= y) current = s.id; }
    navLinks.forEach(a => a.classList.toggle("active", a.getAttribute("href") === "#" + current));
  }
  window.addEventListener("scroll", onScroll, { passive: true });

  /* ====================== INIT ====================== */
  // Redessine les graphes au redimensionnement (canvas HiDPI)
  let rsz;
  window.addEventListener("resize", () => {
    clearTimeout(rsz);
    rsz = setTimeout(() => {
      Flow.resize();
      updateSim();
      if (lastEssai) drawEssaiChart(lastEssai.rows);
    }, 150);
  });

  Flow.init($("flowCanvas"));
  updateReynoldsMini();
  updateSim();
  onScroll();
})();
