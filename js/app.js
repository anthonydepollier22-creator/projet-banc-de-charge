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

  /* ====================== SIMULATEUR — RÉSEAU 3 CIRCUITS ================ */
  // Propriétés fixes des 3 lignes du banc (l'utilisateur ne règle que la vanne)
  const CIRCUITS = [
    { id: 1, name: "Ligne haute",  diameter: "D50", length: 6, elbows: 2, elbowK: 1.0, reduction: false, venturi: false, color: "#2dd4bf" },
    { id: 2, name: "Ligne milieu", diameter: "D50", length: 6, elbows: 1, elbowK: 1.0, reduction: false, venturi: false, color: "#38bdf8" },
    { id: 3, name: "Ligne basse",  diameter: "D32", length: 3, elbows: 1, elbowK: 1.0, reduction: true,  venturi: true,  color: "#818cf8" },
  ];

  // Lit la configuration courante (réseau) depuis les contrôles
  function readConfig() {
    return {
      freq: parseFloat($("freq").value),
      vRef50: parseFloat($("v50").value),
      circuits: CIRCUITS.map(c => ({
        ...c,
        open: $("c" + c.id + "Open").checked,
        valveOpen: parseInt($("c" + c.id + "Valve").value, 10),
      })),
    };
  }

  function updateSim() {
    // étiquettes & état visuel des contrôles
    $("vFreq").textContent = $("freq").value;
    $("vV50").textContent = fmt(parseFloat($("v50").value), 1);
    CIRCUITS.forEach(c => {
      const open = $("c" + c.id + "Open").checked;
      $("v" + c.id + "Valve").textContent = $("c" + c.id + "Valve").value;
      $("s" + c.id + "State").textContent = open ? "Ouverte" : "Coupée";
      $("circ" + c.id).classList.toggle("circ--closed", !open);
      $("c" + c.id + "Valve").disabled = !open;
    });

    const cfg = readConfig();
    const r = Physics.computeNetwork(cfg);

    // KPI
    $("kDp").textContent = r.allClosed ? "—" : fmt(r.dP, 1);
    $("kQtot").textContent = fmt(r.Qtot * 3600, 0);
    $("kOpen").textContent = r.openCount;
    const vmax = Math.max(0, ...r.circuits.map(c => c.V));
    $("kVmax").textContent = fmt(vmax, 1);

    // conversions
    $("cPa").textContent = r.allClosed ? "— Pa" : fmt(r.dP, 1) + " Pa";
    $("cMmce").textContent = r.allClosed ? "—" : fmt(r.dP_mmCE, 1) + " mmCE";
    $("cMbar").textContent = r.allClosed ? "—" : fmt(r.dP_mbar, 2) + " mbar";
    $("cQ").textContent = fmt(r.Qtot * 3600, 0) + " m³/h";

    // barre de répartition du débit entre circuits ouverts
    const parts = r.circuits.filter(c => c.open && c.Q > 0).map(c => ({ label: c.name, value: c.Q, color: c.color }));
    Charts.plotStackedBar($("barCanvas"), parts.length ? parts : [{ label: "—", value: 1, color: "#334155" }]);

    $("dpSplit").innerHTML = r.allClosed
      ? `<b style="color:#ff5c7a">⚠ Tous les circuits sont coupés — pas d'écoulement</b>`
      : `ΔP commun aux lignes ouvertes : <b style="color:#2dd4bf">${fmt(r.dP, 1)} Pa</b>`;

    // détail par circuit
    const bd = $("breakdown");
    bd.innerHTML = "";
    r.circuits.forEach(c => {
      const li = document.createElement("li");
      const diam = c.diameter === "D50" ? "Ø50" : "Ø32";
      if (c.open) {
        li.innerHTML = `<span><i class="dot" style="background:${c.color}"></i>${c.name} (${diam})</span>` +
          `<b>${fmt(c.V, 1)} m/s · Re ${fmt(c.Re, 0)} · ${fmt(c.share * 100, 0)}% du débit</b>`;
      } else {
        li.style.opacity = ".55";
        li.innerHTML = `<span><i class="dot" style="background:#475569"></i>${c.name} (${diam})</span>` +
          `<b style="color:#ff5c7a">✕ coupée</b>`;
      }
      bd.appendChild(li);
    });

    // courbe ΔP réseau = f(fréquence)
    drawSimCurve(cfg, r);

    // visualisation d'écoulement (3 lignes)
    const dpRatio = 1 - 1 / (1 + r.dP / 200);
    Flow.update({
      dpRatio,
      lanes: r.circuits.map(c => ({
        open: c.open, V: c.V, diameter: c.diameter,
        valveOpen: c.valveOpen, regime: (c.regime && c.regime.code) || "turbulent",
        name: c.name,
      })),
    });
  }

  function drawSimCurve(cfg, current) {
    const pts = Physics.sweepNetwork(cfg, 10, 50, 2);
    const series = [
      { type: "line", color: COLOR_THEO, area: true, label: "ΔP réseau", data: pts.map(p => ({ x: p.freq, y: p.dP })) },
      { type: "scatter", color: "#fff", ring: true, data: current.allClosed ? [] : [{ x: cfg.freq, y: current.dP }] },
    ];
    Charts.plotXY($("curveCanvas"), {
      series, xLabel: "Fréquence Altivar (Hz)", yLabel: "ΔP réseau (Pa)",
      xMin: 10, xMax: 50,
    });
  }

  // écoute des contrôles du simulateur
  ["freq", "v50",
   "c1Open", "c1Valve", "c2Open", "c2Valve", "c3Open", "c3Valve"].forEach(id => {
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
    const pts = Physics.sweepNetwork(cfg, 10, 50, step);

    const rows = pts.map(p => {
      // 3 relevés bruités autour de la valeur théorique (ΔP réseau)
      const reads = [0, 1, 2].map(() => {
        const noise = 1 + (noiseAmp ? gaussNoise() * noiseAmp : 0);
        return Math.max(0, p.dP * noise);
      });
      const moy = (reads[0] + reads[1] + reads[2]) / 3;
      const ecart = p.dP > 0 ? (moy - p.dP) / p.dP * 100 : 0;
      return { freq: p.freq, Qtot: p.Qtot, openCount: p.openCount, dP: p.dP, reads, moy, ecart };
    });

    lastEssai = { cfg, rows };
    renderEssaiTable(rows);
    drawEssaiChart(rows);

    // verdict
    const meanAbs = rows.reduce((s, r) => s + Math.abs(r.ecart), 0) / rows.length;
    const openCount = cfg.circuits.filter(c => c.open).length;
    $("essaiRegime").textContent = `${openCount} circuit(s) ouvert(s) sur 3`;
    const v = $("verdict");
    v.classList.add("show");
    v.innerHTML =
      `Essai terminé : <b>${rows.length} paliers</b>, ${rows.length * 3} relevés, <b>${openCount} ligne(s)</b> en service. ` +
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
        `<td>${fmt(r.Qtot * 3600, 0)}</td>` +
        `<td>${r.openCount}</td>` +
        `<td>${fmt(r.reads[0],1)}</td>` +
        `<td>${fmt(r.reads[1],1)}</td>` +
        `<td>${fmt(r.reads[2],1)}</td>` +
        `<td>${fmt(r.moy,1)}</td>` +
        `<td>${fmt(r.dP,1)}</td>` +
        `<td class="${ecartClass(r.ecart)}">${r.ecart >= 0 ? "+" : ""}${fmt(r.ecart,1)} %</td>`;
      tb.appendChild(tr);
    });
  }

  function drawEssaiChart(rows) {
    const series = [
      { type: "line", color: COLOR_THEO, area: true, label: "ΔP réseau théorique",
        data: rows.map(r => ({ x: r.freq, y: r.dP })) },
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
    let csv = "Banc a Perte de Charge - Essai virtuel (reseau 3 circuits)\n";
    csv += `Vitesse ref a 50Hz;${cfg.vRef50} m/s\n`;
    cfg.circuits.forEach(c => {
      csv += `${c.name};${c.diameter};${c.open ? "OUVERTE " + c.valveOpen + "%" : "COUPEE"}\n`;
    });
    csv += "\nFrequence (Hz);Debit total (m3/h);Circuits ouverts;Releve 1 (Pa);Releve 2 (Pa);Releve 3 (Pa);Moyenne (Pa);Theorique (Pa);Ecart (%)\n";
    rows.forEach(r => {
      csv += [r.freq, fmt(r.Qtot * 3600, 0), r.openCount,
        fmt(r.reads[0],2), fmt(r.reads[1],2), fmt(r.reads[2],2),
        fmt(r.moy,2), fmt(r.dP,2), fmt(r.ecart,1)]
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

  /* ====================== GALERIE / LIGHTBOX ====================== */
  const shots = [...document.querySelectorAll(".shot")];
  const lb = $("lightbox"), lbImg = $("lightboxImg"), lbCap = $("lightboxCap");
  let lbIndex = 0;

  function openLightbox(i) {
    lbIndex = (i + shots.length) % shots.length;
    const fig = shots[lbIndex];
    lbImg.src = fig.dataset.full;
    lbImg.alt = fig.querySelector("img")?.alt || "";
    lbCap.innerHTML = fig.querySelector("figcaption")?.innerHTML || "";
    lb.classList.add("open");
    lb.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }
  function closeLightbox() {
    lb.classList.remove("open");
    lb.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }
  shots.forEach((fig, i) => fig.addEventListener("click", () => openLightbox(i)));
  $("lightboxClose")?.addEventListener("click", closeLightbox);
  $("lightboxPrev")?.addEventListener("click", () => openLightbox(lbIndex - 1));
  $("lightboxNext")?.addEventListener("click", () => openLightbox(lbIndex + 1));
  lb?.addEventListener("click", (e) => { if (e.target === lb) closeLightbox(); });
  document.addEventListener("keydown", (e) => {
    if (!lb?.classList.contains("open")) return;
    if (e.key === "Escape") closeLightbox();
    else if (e.key === "ArrowLeft") openLightbox(lbIndex - 1);
    else if (e.key === "ArrowRight") openLightbox(lbIndex + 1);
  });

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

  // Init : on protège chaque étape pour qu'une erreur n'empêche pas l'affichage
  try { Flow.init($("flowCanvas")); } catch (e) { console.error("Flow:", e); }
  try { updateReynoldsMini(); } catch (e) { console.error("Reynolds:", e); }
  try { updateSim(); } catch (e) { console.error("Sim:", e); }
  try { onScroll(); } catch (e) { console.error("Scroll:", e); }

  // Signale que l'application s'est initialisée (filet de sécurité dans index.html)
  window.__appReady = true;
})();
