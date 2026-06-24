# Banc à Perte de Charge — Site interactif

Site web interactif sur les **pertes de charge** dans un circuit d'air sous pression,
réalisé à partir des documents du projet tutoré **BTS Électrotechnique 2025–2026**
(banc aéraulique en PVC Ø50 / Ø32, pompe Becker, variateur Altivar 28).

Le site présente la théorie, les composants du banc réel, **et permet de faire ses
propres essais** directement dans le navigateur.

## ✨ Fonctionnalités

- **Théorie** : pertes régulières (Darcy-Weisbach), pertes singulières (K·½ρV²),
  nombre de Reynolds et régimes d'écoulement, avec un mini-calculateur de Reynolds en direct.
- **Composants** : présentation des éléments PVC, instrumentation et points de mesure (P1–P10),
  + une **galerie de photos du banc réel** (vue d'ensemble, coude, prise de pression, réduction,
  pompe Becker) avec visionneuse plein écran (lightbox, navigation clavier).
- **Simulateur interactif** : réglez la fréquence Altivar, le diamètre, les singularités
  (coudes, vanne à ouverture variable, réduction Ø50→Ø32, Venturi…) et visualisez en temps réel
  la vitesse, le Reynolds, λ, le ΔP total, sa répartition et la courbe ΔP = f(fréquence).
- **Banc d'essai virtuel** : reproduit le protocole expérimental (balayage de fréquence,
  3 relevés par palier avec bruit de mesure réaliste), tableau de résultats, courbe
  *mesuré vs théorique*, calcul de l'écart et **export CSV**.

## 🧮 Modèle physique

| Grandeur | Formule | Valeur |
|---|---|---|
| Reynolds | `Re = V·D / ν` | ν_air ≈ 15·10⁻⁶ m²/s |
| Frottement (laminaire) | `λ = 64/Re` | Re < 2300 |
| Frottement (turbulent lisse) | `λ = 0,316/Re^0,25` (Blasius) | 4000 < Re < 10⁵ |
| Pertes régulières | `ΔP = λ·(L/D)·½ρV²` | ρ_air = 1,2 kg/m³ |
| Pertes singulières | `ΔP_s = K·½ρV²` | K selon la singularité |

> Modèle pédagogique : les valeurs sont des estimations à visée éducative.

## 🚀 Utilisation

Aucune dépendance, aucun build. Le site fonctionne **hors-ligne**.

```bash
# Option 1 : ouvrir directement le fichier
open index.html            # (ou double-clic)

# Option 2 : serveur local (recommandé)
python3 -m http.server 8000
# puis http://localhost:8000
```

## 📁 Structure

```
index.html        Page principale (toutes les sections)
css/style.css     Thème et mise en page
js/physics.js     Moteur de calcul des pertes de charge
js/charts.js      Tracé sur <canvas> (sans dépendance)
js/flow.js        Visualisation animée de l'écoulement d'air
js/app.js         Logique d'interface (simulateur + banc d'essai + galerie)
assets/img/       Photos du banc réel
```

## 👥 Équipe

Martin Mulot · Sully Clain · Anthony Depollier · Enzo Tisne — BTS Électrotechnique 2025–2026
