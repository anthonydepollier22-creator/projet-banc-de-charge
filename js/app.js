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

  /* ====================== BASCULE DE THÈME (clair / sombre) ============= */
  const themeBtn = $("themeToggle");
  function syncThemeIcon() {
    const light = document.documentElement.dataset.theme === "light";
    if (themeBtn) themeBtn.textContent = light ? "☀️" : "🌙";
  }
  syncThemeIcon();
  themeBtn?.addEventListener("click", () => {
    const light = document.documentElement.dataset.theme === "light";
    if (light) { delete document.documentElement.dataset.theme; }
    else { document.documentElement.dataset.theme = "light"; }
    try { localStorage.setItem("theme", light ? "dark" : "light"); } catch (e) {}
    syncThemeIcon();
    // les graphes lisent les couleurs du thème : on les redessine
    try { updateSim(); } catch (e) {}
    try { if (lastEssai) drawEssaiChart(lastEssai.rows); } catch (e) {}
  });

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

  // Raccourcis de scénarios (ouverture/fermeture des lignes en un clic)
  const PRESETS = {
    all:      [{ open: true,  v: 100 }, { open: true,  v: 100 }, { open: true,  v: 100 }],
    cutLow:   [{ open: true,  v: 100 }, { open: true,  v: 100 }, { open: false, v: 100 }],
    onlyHigh: [{ open: true,  v: 100 }, { open: false, v: 100 }, { open: false, v: 100 }],
    midHalf:  [{ open: true,  v: 100 }, { open: true,  v: 50  }, { open: true,  v: 100 }],
  };
  function applyPreset(name) {
    const def = PRESETS[name];
    if (!def) return;
    def.forEach((d, i) => {
      $("c" + (i + 1) + "Open").checked = d.open;
      $("c" + (i + 1) + "Valve").value = d.v;
    });
    document.querySelectorAll(".preset").forEach(b => b.classList.toggle("active", b.dataset.preset === name));
    updateSim();
  }
  document.querySelectorAll(".preset").forEach(b =>
    b.addEventListener("click", () => applyPreset(b.dataset.preset)));
  // un réglage manuel retire la sélection de scénario
  ["c1Open", "c1Valve", "c2Open", "c2Valve", "c3Open", "c3Valve"].forEach(id =>
    $(id).addEventListener("input", () =>
      document.querySelectorAll(".preset.active").forEach(b => b.classList.remove("active"))));

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

  /* ====================== QUIZ ====================== */
  const QUIZ = [
    { q: "La formule de Darcy-Weisbach (ΔP = λ·L/D·½ρV²) sert à calculer…",
      options: ["Les pertes de charge régulières", "Les pertes singulières", "Le débit de la pompe"],
      answer: 0, explain: "Darcy-Weisbach donne les pertes RÉGULIÈRES, dues au frottement sur toute la longueur de la conduite." },
    { q: "Un nombre de Reynolds supérieur à 4 000 correspond à un régime…",
      options: ["Laminaire", "Turbulent", "Au repos"],
      answer: 1, explain: "Re > 4 000 → régime turbulent, dominant sur le banc (Re ≈ 15 000)." },
    { q: "Dans le réseau, que se passe-t-il si on FERME la vanne d'une ligne ?",
      options: ["Plus rien ne change", "Le débit se redistribue sur les autres lignes et le ΔP augmente", "Le débit total double"],
      answer: 1, explain: "La pompe impose le débit : avec moins de branches ouvertes, la vitesse et le ΔP augmentent sur les lignes restantes." },
    { q: "Qui pilote la vitesse de l'air dans le banc ?",
      options: ["La pompe Becker seule", "Le variateur Altivar 28", "Les vannes boisseau"],
      answer: 1, explain: "L'Altivar 28 fait varier la fréquence (0–50 Hz), donc la vitesse de la pompe Becker, donc le débit." },
    { q: "Une perte de charge SINGULIÈRE est provoquée par…",
      options: ["La longueur de la conduite", "Une singularité locale (coude, vanne, réduction…)", "La température de l'air"],
      answer: 1, explain: "Les pertes singulières viennent des accidents locaux : coudes, vannes, réductions, tés… (ΔP = K·½ρV²)." },
    { q: "Pour un tube PVC lisse en régime turbulent, on calcule λ avec…",
      options: ["La loi de Blasius (0,316/Re^0,25)", "La loi de Poiseuille (64/Re)", "La loi des gaz parfaits"],
      answer: 0, explain: "PVC = tube lisse → Blasius : λ = 0,316/Re^0,25 (valable 4 000 < Re < 10⁵). Poiseuille, c'est le laminaire." },
  ];
  let qIndex = 0, qScore = 0;

  function renderQuiz() {
    const body = $("quizBody");
    if (!body) return;
    const item = QUIZ[qIndex];
    $("quizProgress").textContent = `Question ${qIndex + 1} / ${QUIZ.length}`;
    $("quizScore").textContent = `Score : ${qScore}`;
    $("quizBar").style.width = `${(qIndex / QUIZ.length) * 100}%`;
    body.innerHTML =
      `<div class="quiz__q">${item.q}</div>` +
      `<div class="quiz__options">` +
        item.options.map((o, i) => `<button class="quiz__opt" data-i="${i}">${o}</button>`).join("") +
      `</div>` +
      `<div class="quiz__explain" id="quizExplain"></div>` +
      `<div class="quiz__foot"></div>`;
    body.querySelectorAll(".quiz__opt").forEach(b =>
      b.addEventListener("click", () => answerQuiz(parseInt(b.dataset.i, 10))));
  }

  function answerQuiz(i) {
    const item = QUIZ[qIndex];
    const opts = [...$("quizBody").querySelectorAll(".quiz__opt")];
    if (opts[0].disabled) return;
    opts.forEach(o => o.disabled = true);
    opts[item.answer].classList.add("correct");
    if (i === item.answer) qScore++;
    else opts[i].classList.add("wrong");
    $("quizScore").textContent = `Score : ${qScore}`;
    const ex = $("quizExplain");
    ex.innerHTML = (i === item.answer ? "✅ <b>Correct.</b> " : "❌ <b>Pas tout à fait.</b> ") + item.explain;
    ex.classList.add("show");
    const btn = document.createElement("button");
    btn.className = "btn btn--primary";
    btn.textContent = qIndex < QUIZ.length - 1 ? "Question suivante →" : "Voir mon résultat";
    btn.addEventListener("click", () => { qIndex++; (qIndex < QUIZ.length) ? renderQuiz() : showQuizResult(); });
    $("quizBody").querySelector(".quiz__foot").appendChild(btn);
  }

  function showQuizResult() {
    $("quizProgress").textContent = "Terminé";
    $("quizBar").style.width = "100%";
    const pct = qScore / QUIZ.length;
    const msg = pct === 1 ? "Sans faute, bravo ! 🎉"
      : pct >= 0.66 ? "Bien joué, solide maîtrise des pertes de charge."
      : pct >= 0.33 ? "Pas mal — un petit tour par la Théorie et ce sera parfait."
      : "Reprenez les sections Théorie et Simulateur, puis retentez 😉";
    $("quizBody").innerHTML =
      `<div class="quiz__result"><span class="big">${qScore} / ${QUIZ.length}</span>` +
      `<p>${msg}</p>` +
      `<button class="btn btn--ghost" id="quizRestart">↻ Recommencer</button></div>`;
    $("quizRestart").addEventListener("click", () => { qIndex = 0; qScore = 0; renderQuiz(); });
  }

  /* ====================== BOUTON RETOUR EN HAUT ====================== */
  const toTop = $("toTop");
  toTop?.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

  /* ====================== IMPRESSION / PDF ====================== */
  $("printBtn")?.addEventListener("click", () => window.print());

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
    if (toTop) toTop.classList.toggle("show", h.scrollTop > 600);
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
  try { renderQuiz(); } catch (e) { console.error("Quiz:", e); }
  try { onScroll(); } catch (e) { console.error("Scroll:", e); }

  // Signale que l'application s'est initialisée (filet de sécurité dans index.html)
  window.__appReady = true;
})();
