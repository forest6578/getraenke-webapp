// =============================================================
//  Produkt- & Preis-Konfiguration  (Single Source of Truth)
//  Neue Sorten/Preise einfach hier ergänzen – keine weitere
//  Code-Änderung nötig. Die UI baut sich daraus automatisch auf.
// =============================================================

// ---- VOLLGUT --------------------------------------------------
// Marke -> Behältertyp -> [Varianten]
// Fehlt ein Behälter (z.B. Steinsieker kein PET) oder eine
// Variante (z.B. Forstetal PET kein Naturell), einfach weglassen.
const VOLLGUT = {
  "Engelbert": {
    "Glas / Plastik": ["Medium", "Naturell", "Classic"],
    "PET":            ["Medium", "Naturell", "Classic"],
  },
  "Forstetal": {
    "Glas / Plastik": ["Medium", "Naturell", "Classic"],
    "PET":            ["Medium", "Classic"],
  },
  "Stiftsquelle": {
    "Glas / Plastik": ["Medium", "Naturell", "Classic"],
    "PET":            ["Medium", "Naturell", "Classic"],
  },
  "Gerolsteiner": {
    "Glas / Plastik": ["Medium", "Naturell", "Classic"],
    "PET":            ["Medium", "Naturell", "Classic"],
  },
  "Steinsieker": {
    "Glas / Plastik": ["Medium", "Naturell", "Classic"],
  },
  // "Manuelle Eingabe" wird separat als letzte Kachel angeboten
  // (Freitext-Name, z.B. "Bolten Bügel (helles)" oder
  //  "Bitburger 0,33l (Pils)").
};

// ---- LEERGUT --------------------------------------------------
// Feste Kasten-/Pfandpreise (werden als Kacheln angezeigt).
const LEERGUT_PREISE = [3.30, 2.40, 3.10, 3.42, 4.50, 5.10, 3.00, 1.50];

// "Einzelne Flaschen" – Untermenü mit festen Flaschenpreisen.
const LEERGUT_FLASCHEN = [0.15, 0.25, 0.08];

// "Manuelle Preise" -> freies Eingabefeld (z.B. 2,46 €)
// wird separat als Kachel angeboten.
