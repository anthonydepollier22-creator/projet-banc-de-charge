/* =========================================================================
   exercises.js — Générateurs d'exercices auto-corrigés (énoncés aléatoires)
   -------------------------------------------------------------------------
   Chaque générateur renvoie un exercice complet :
     { level, title, statement(HTML), answer, unit, tol, solution(HTML) }
   Les réponses sont calculées avec le moteur Physics pour rester exactes.
   ========================================================================= */

const Exercises = (() => {
  "use strict";

  const RHO = 1.2, NU = 15e-6, G = 9.81;
  const D50 = 0.050, D32 = 0.032;
  const A = D => Math.PI * D * D / 4;
  const rnd = (a, b, step = 1) => {
    const n = Math.round((a + Math.random() * (b - a)) / step) * step;
    return Math.round(n * 1e6) / 1e6;
  };
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const f = (n, d = 0) => n.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const diamPick = () => pick([{ label: "Ø50", D: D50 }, { label: "Ø32", D: D32 }]);

  /* ------------------------------ Générateurs --------------------------- */
  const GEN = [
    // 1 — Nombre de Reynolds
    () => {
      const V = rnd(2, 12, 0.5), d = diamPick();
      const Re = V * d.D / NU;
      return {
        level: "debutant", title: "Nombre de Reynolds",
        statement: `De l'air circule à <b>V = ${f(V,1)} m/s</b> dans un tube <b>${d.label}</b> (D = ${f(d.D,3)} m).<br>Calculez le nombre de Reynolds. On donne ν<sub>air</sub> = 15·10⁻⁶ m²/s.`,
        answer: Re, unit: "", tol: 0.02,
        solution: `Re = V·D / ν = ${f(V,1)} × ${f(d.D,3)} / 0,000015 = <b>${f(Re,0)}</b>.<br>Re > 4 000 → régime <b>turbulent</b>.`,
      };
    },
    // 2 — Débit volumique
    () => {
      const V = rnd(2, 12, 0.5), d = diamPick(), a = A(d.D);
      const Qh = V * a * 3600;
      return {
        level: "debutant", title: "Débit d'air",
        statement: `Un tube <b>${d.label}</b> de section <b>A = ${f(a,5)} m²</b> est parcouru par de l'air à <b>V = ${f(V,1)} m/s</b>.<br>Quel est le débit, en <b>m³/h</b> ?`,
        answer: Qh, unit: "m³/h", tol: 0.03,
        solution: `Q = V·A = ${f(V,1)} × ${f(a,5)} = ${f(V*a,4)} m³/s.<br>En m³/h : ×3600 → <b>${f(Qh,0)} m³/h</b>.`,
      };
    },
    // 3 — Vitesse à partir du débit
    () => {
      const Qh = rnd(20, 120, 5), d = diamPick(), a = A(d.D);
      const V = (Qh / 3600) / a;
      return {
        level: "inter", title: "Vitesse de l'air",
        statement: `La pompe fournit <b>Q = ${f(Qh,0)} m³/h</b> dans un tube <b>${d.label}</b> (A = ${f(a,5)} m²).<br>Quelle est la <b>vitesse</b> de l'air (m/s) ?`,
        answer: V, unit: "m/s", tol: 0.03,
        solution: `Q en m³/s : ${f(Qh,0)}/3600 = ${f(Qh/3600,4)} m³/s.<br>V = Q/A = ${f(Qh/3600,4)} / ${f(a,5)} = <b>${f(V,2)} m/s</b>.`,
      };
    },
    // 4 — Pression dynamique
    () => {
      const V = rnd(3, 14, 0.5);
      const q = 0.5 * RHO * V * V;
      return {
        level: "debutant", title: "Pression dynamique",
        statement: `Calculez la <b>pression dynamique</b> ½·ρ·V² de l'air à <b>V = ${f(V,1)} m/s</b>.<br>On donne ρ = 1,2 kg/m³. Résultat en pascals (Pa).`,
        answer: q, unit: "Pa", tol: 0.02,
        solution: `½ρV² = 0,5 × 1,2 × ${f(V,1)}² = 0,6 × ${f(V*V,2)} = <b>${f(q,1)} Pa</b>.`,
      };
    },
    // 5 — Coefficient de frottement (Blasius)
    () => {
      const Re = rnd(5000, 80000, 500);
      const lam = 0.316 / Math.pow(Re, 0.25);
      return {
        level: "inter", title: "Frottement λ (Blasius)",
        statement: `En régime turbulent sur tube lisse (PVC), calculez le coefficient de frottement <b>λ</b> pour <b>Re = ${f(Re,0)}</b>.<br>Formule : λ = 0,316 / Re<sup>0,25</sup>.`,
        answer: lam, unit: "", tol: 0.02,
        solution: `Re<sup>0,25</sup> = ${f(Math.pow(Re,0.25),2)}.<br>λ = 0,316 / ${f(Math.pow(Re,0.25),2)} = <b>${f(lam,4)}</b>.`,
      };
    },
    // 6 — Perte de charge régulière (Darcy-Weisbach)
    () => {
      const V = rnd(3, 10, 0.5), d = diamPick(), L = rnd(2, 8, 1);
      const Re = V * d.D / NU, lam = 0.316 / Math.pow(Re, 0.25);
      const q = 0.5 * RHO * V * V;
      const dp = lam * (L / d.D) * q;
      return {
        level: "avance", title: "Perte régulière (Darcy)",
        statement: `Air à <b>V = ${f(V,1)} m/s</b> dans un tube <b>${d.label}</b> (D = ${f(d.D,3)} m) sur <b>L = ${f(L,0)} m</b>.<br>Calculez la perte de charge régulière <b>ΔP</b> (Pa). Étapes : Re → λ (Blasius) → ΔP = λ·(L/D)·½ρV².`,
        answer: dp, unit: "Pa", tol: 0.05,
        solution: `Re = ${f(Re,0)} · λ = 0,316/Re^0,25 = ${f(lam,4)}.<br>½ρV² = ${f(q,1)} Pa · L/D = ${f(L/d.D,1)}.<br>ΔP = ${f(lam,4)} × ${f(L/d.D,1)} × ${f(q,1)} = <b>${f(dp,1)} Pa</b>.`,
      };
    },
    // 7 — Perte de charge singulière
    () => {
      const sing = pick([
        { n: "un coude 90°", K: 1.0 },
        { n: "une réduction Ø50→Ø32", K: 0.5 },
        { n: "une vanne partiellement ouverte", K: rnd(2, 6, 0.5) },
      ]);
      const V = rnd(3, 10, 0.5);
      const q = 0.5 * RHO * V * V, dp = sing.K * q;
      return {
        level: "inter", title: "Perte singulière (K)",
        statement: `Calculez la perte de charge singulière due à <b>${sing.n}</b> (K = ${f(sing.K,1)}) pour de l'air à <b>V = ${f(V,1)} m/s</b>.<br>Formule : ΔP = K · ½ρV².`,
        answer: dp, unit: "Pa", tol: 0.03,
        solution: `½ρV² = ${f(q,1)} Pa.<br>ΔP = K·½ρV² = ${f(sing.K,1)} × ${f(q,1)} = <b>${f(dp,1)} Pa</b>.`,
      };
    },
    // 8 — Conversion d'unités de pression
    () => {
      const dp = rnd(20, 300, 5);
      const mmce = dp / G;
      return {
        level: "debutant", title: "Conversion de pression",
        statement: `Une perte de charge vaut <b>ΔP = ${f(dp,0)} Pa</b>.<br>Convertissez-la en <b>mm de colonne d'eau (mmCE)</b>. On donne 1 mmCE ≈ 9,81 Pa.`,
        answer: mmce, unit: "mmCE", tol: 0.02,
        solution: `mmCE = ΔP / 9,81 = ${f(dp,0)} / 9,81 = <b>${f(mmce,1)} mmCE</b>.`,
      };
    },
    // 9 — Puissance aéraulique
    () => {
      const dp = rnd(30, 300, 10), Qh = rnd(20, 120, 5);
      const Q = Qh / 3600, P = dp * Q;
      return {
        level: "inter", title: "Puissance aéraulique",
        statement: `Le ventilateur produit <b>ΔP = ${f(dp,0)} Pa</b> pour un débit <b>Q = ${f(Qh,0)} m³/h</b>.<br>Calculez la puissance aéraulique <b>P = ΔP·Q</b> (en watts).`,
        answer: P, unit: "W", tol: 0.03,
        solution: `Q en m³/s : ${f(Qh,0)}/3600 = ${f(Q,4)} m³/s.<br>P = ΔP·Q = ${f(dp,0)} × ${f(Q,4)} = <b>${f(P,1)} W</b>.`,
      };
    },
    // 10 — Loi d'affinité (variateur)
    () => {
      const f1 = rnd(20, 35, 5), dp1 = rnd(20, 120, 5);
      let f2 = f1; while (f2 === f1) f2 = rnd(25, 50, 5);
      const dp2 = dp1 * (f2 / f1) * (f2 / f1);
      return {
        level: "avance", title: "Loi d'affinité (ΔP ∝ f²)",
        statement: `À la fréquence <b>f₁ = ${f(f1,0)} Hz</b>, la perte de charge vaut <b>ΔP₁ = ${f(dp1,0)} Pa</b>.<br>Que devient-elle à <b>f₂ = ${f(f2,0)} Hz</b> ? (ΔP ∝ fréquence²)`,
        answer: dp2, unit: "Pa", tol: 0.02,
        solution: `ΔP₂ = ΔP₁ × (f₂/f₁)² = ${f(dp1,0)} × (${f(f2,0)}/${f(f1,0)})² = ${f(dp1,0)} × ${f((f2/f1)*(f2/f1),2)} = <b>${f(dp2,1)} Pa</b>.`,
      };
    },
  ];

  // Tire un exercice au hasard (filtré par niveau : "all"|"debutant"|"inter"|"avance")
  function pickExercise(level = "all") {
    const pool = GEN.filter(g => level === "all" || true); // filtre appliqué après génération
    for (let i = 0; i < 30; i++) {
      const ex = pick(GEN)();
      if (level === "all" || ex.level === level) return ex;
    }
    return pick(GEN)();
  }

  return { pick: pickExercise, count: GEN.length };
})();
