/* =========================================================================
   physics.js — Moteur de calcul des pertes de charge (banc aéraulique PVC)
   Projet Tutoré BTS Électrotechnique — Banc à Perte de Charge
   -------------------------------------------------------------------------
   Fluide : AIR. Toutes les formules proviennent des présentations du projet
   (Darcy-Weisbach, Blasius, Reynolds, pertes singulières K·ρV²/2).
   ========================================================================= */

const Physics = (() => {
  "use strict";

  /* ------------------------- Constantes physiques ------------------------ */
  const RHO_AIR = 1.2;        // masse volumique de l'air (kg/m³) à ~20 °C
  const NU_AIR = 15e-6;       // viscosité cinématique de l'air (m²/s)
  const G = 9.81;             // gravité (m/s²) — conversion Pa <-> mmCE
  const EPS_PVC = 0.0015e-3;  // rugosité absolue du PVC (m) ≈ 0,0015 mm

  // Diamètres intérieurs approximatifs des tubes PVC du banc (m)
  const DIAMETERS = { D50: 0.050, D32: 0.032 };

  /* --------------------------- Outils géométrie -------------------------- */
  // Section d'une conduite circulaire (m²)
  function area(D) {
    return Math.PI * (D * D) / 4;
  }

  /* ----------------------------- Reynolds -------------------------------- */
  // Re = V·D / ν
  function reynolds(V, D, nu = NU_AIR) {
    return (V * D) / nu;
  }

  // Détermine le régime d'écoulement à partir de Re
  function regime(Re) {
    if (Re < 2300) return { code: "laminaire", label: "Laminaire", color: "#3fb6ff" };
    if (Re < 4000) return { code: "transitoire", label: "Transitoire", color: "#ffb454" };
    return { code: "turbulent", label: "Turbulent", color: "#ff5c7a" };
  }

  /* ------------------------- Coefficient de pertes ----------------------- */
  /* Facteur de frottement λ (sans dimension).
     - Laminaire  : Poiseuille  λ = 64/Re
     - Turbulent  : Blasius      λ = 0,316 / Re^0,25  (tube lisse, 4e3<Re<1e5)
     - Au-delà    : Colebrook (itératif) pour rester correct si Re > 1e5
     Renvoie aussi le nom de la loi utilisée. */
  function frictionFactor(Re, D = DIAMETERS.D50) {
    if (Re <= 0) return { lambda: 0, law: "—" };
    if (Re < 2300) {
      return { lambda: 64 / Re, law: "Poiseuille (64/Re)" };
    }
    if (Re < 4000) {
      // Zone transitoire : interpolation douce laminaire -> Blasius
      const lamLam = 64 / 2300;
      const lamTurb = 0.316 / Math.pow(4000, 0.25);
      const t = (Re - 2300) / (4000 - 2300);
      return { lambda: lamLam + t * (lamTurb - lamLam), law: "Transitoire (interpolé)" };
    }
    if (Re <= 1e5) {
      return { lambda: 0.316 / Math.pow(Re, 0.25), law: "Blasius (0,316/Re^0,25)" };
    }
    // Colebrook-White (résolution itérative point fixe) pour grands Re
    let lambda = 0.02;
    for (let i = 0; i < 40; i++) {
      const rhs = -2 * Math.log10((EPS_PVC / D) / 3.7 + 2.51 / (Re * Math.sqrt(lambda)));
      lambda = 1 / (rhs * rhs);
    }
    return { lambda, law: "Colebrook (tube lisse)" };
  }

  /* ----------------------------- Pressions ------------------------------- */
  // Pression dynamique q = ½·ρ·V²  (Pa)
  function dynamicPressure(V, rho = RHO_AIR) {
    return 0.5 * rho * V * V;
  }

  // Perte de charge régulière (Pa) — Darcy-Weisbach
  // ΔP = λ · (L/D) · ½ρV²
  function regularLoss(lambda, L, D, V, rho = RHO_AIR) {
    return lambda * (L / D) * dynamicPressure(V, rho);
  }

  // Perte de charge singulière (Pa) — ΔP = K · ½ρV²
  function singularLoss(K, V, rho = RHO_AIR) {
    return K * dynamicPressure(V, rho);
  }

  /* ------------------- Coefficient K d'une vanne boisseau ---------------- */
  /* Vanne à boisseau (ball valve) : K dépend fortement de l'ouverture.
     Table empirique ouverture(%) -> K, interpolée en log. */
  const VALVE_TABLE = [
    { open: 100, K: 0.1 },
    { open: 90,  K: 0.3 },
    { open: 75,  K: 0.8 },
    { open: 60,  K: 1.5 },
    { open: 50,  K: 2.5 },
    { open: 40,  K: 5.0 },
    { open: 30,  K: 11 },
    { open: 25,  K: 17 },
    { open: 20,  K: 30 },
    { open: 10,  K: 90 },
    { open: 5,   K: 230 },
  ];

  function valveK(openPct) {
    const o = Math.max(5, Math.min(100, openPct));
    // recherche de l'intervalle (la table est décroissante en ouverture)
    for (let i = 0; i < VALVE_TABLE.length - 1; i++) {
      const a = VALVE_TABLE[i], b = VALVE_TABLE[i + 1];
      if (o <= a.open && o >= b.open) {
        const t = (o - b.open) / (a.open - b.open);
        // interpolation logarithmique sur K
        const logK = Math.log(b.K) + t * (Math.log(a.K) - Math.log(b.K));
        return Math.exp(logK);
      }
    }
    return VALVE_TABLE[0].K;
  }

  /* ------------------- Coefficients K des singularités ------------------- */
  // Élargissement / rétrécissement brusque à partir des sections
  function suddenContractionK() { return 0.5; }                 // Ø50 -> Ø32
  function suddenExpansionK(A1, A2) {                            // (1 - A1/A2)²
    const r = A1 / A2;
    return (1 - r) * (1 - r);
  }

  /* ============================ CALCUL COMPLET =========================== */
  /* Calcule l'état complet du circuit pour une configuration donnée.
     config = {
       freq            : fréquence Altivar (Hz)
       vAt50           : vitesse d'air (m/s) atteinte à 50 Hz dans le Ø50
       diameter        : "D50" | "D32"  (conduite étudiée)
       length          : longueur de conduite droite (m)
       elbows          : nombre de coudes 90°
       elbowK          : K d'un coude
       reduction       : bool  (rétrécissement Ø50/32 présent)
       valve           : bool
       valveOpen       : ouverture vanne (%)
       venturi         : bool
       rho, nu         : propriétés air (optionnel)
     }
  */
  function computeCircuit(config) {
    const rho = config.rho ?? RHO_AIR;
    const nu = config.nu ?? NU_AIR;

    // Vitesse de référence dans le Ø50 imposée par la fréquence Altivar (V ∝ f)
    const vRef = config.vAt50 * (config.freq / 50);

    // Débit volumique Q = V·A (conservé dans tout le circuit)
    const Aref = area(DIAMETERS.D50);
    const Q = vRef * Aref;            // m³/s

    // Vitesse réelle dans la conduite étudiée (continuité)
    const D = DIAMETERS[config.diameter];
    const A = area(D);
    const V = Q / A;                  // m/s

    // Reynolds & régime dans la conduite étudiée
    const Re = reynolds(V, D, nu);
    const reg = regime(Re);
    const fr = frictionFactor(Re, D);

    // --- Pertes régulières (conduite droite) ---
    const dpRegular = regularLoss(fr.lambda, config.length, D, V, rho);

    // --- Pertes singulières (chacune chiffrée séparément) ---
    const singular = [];

    if (config.elbows > 0) {
      const Ktot = config.elbowK * config.elbows;
      singular.push({
        name: `Coude 90° ×${config.elbows}`,
        K: Ktot,
        dp: singularLoss(Ktot, V, rho),
      });
    }

    if (config.reduction) {
      const K = suddenContractionK();
      // Le rétrécissement se calcule avec la vitesse aval (Ø32, plus rapide)
      const Vdown = Q / area(DIAMETERS.D32);
      singular.push({
        name: "Rétrécissement Ø50→Ø32",
        K,
        dp: singularLoss(K, Vdown, rho),
      });
    }

    if (config.valve) {
      const K = valveK(config.valveOpen);
      singular.push({
        name: `Vanne boisseau (${config.valveOpen}% ouverte)`,
        K,
        dp: singularLoss(K, V, rho),
      });
    }

    if (config.venturi) {
      const K = 0.05;
      singular.push({
        name: "Tube Venturi",
        K,
        dp: singularLoss(K, V, rho),
      });
    }

    const dpSingular = singular.reduce((s, e) => s + e.dp, 0);
    const dpTotal = dpRegular + dpSingular;

    return {
      vRef, Q, V, Re, regime: reg,
      lambda: fr.lambda, lambdaLaw: fr.law,
      qDyn: dynamicPressure(V, rho),
      dpRegular, dpSingular, dpTotal,
      singular,
      // conversions pratiques
      dpTotal_mmCE: dpTotal / G,        // colonne d'eau (mm)
      dpTotal_mbar: dpTotal / 100,      // millibars
    };
  }

  /* --------- Balayage de fréquence (pour les courbes / le banc) ---------- */
  function sweep(config, fStart = 10, fEnd = 50, step = 5) {
    const points = [];
    for (let f = fStart; f <= fEnd + 1e-9; f += step) {
      const r = computeCircuit({ ...config, freq: f });
      points.push({ freq: f, V: r.V, Re: r.Re, dpTotal: r.dpTotal,
                    dpRegular: r.dpRegular, dpSingular: r.dpSingular });
    }
    return points;
  }

  /* ------------------------------ Export -------------------------------- */
  return {
    RHO_AIR, NU_AIR, G, EPS_PVC, DIAMETERS,
    area, reynolds, regime, frictionFactor,
    dynamicPressure, regularLoss, singularLoss,
    valveK, suddenContractionK, suddenExpansionK,
    computeCircuit, sweep,
  };
})();
