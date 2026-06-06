# Getränke – Erfassung

Mobile-first WebApp (PWA) für einen Getränkemarkt: erfasst pro Kunde **Leergut**
(Pfand, das angenommen wird) und **Vollgut** (volle Ware, die ausgegeben wird),
jeweils mit Kästen-/Flaschen-Menge. Jeder Kunde bekommt eine Tagesnummer und eine
eigene, bearbeitbare Karte; die Liste wird später an der Kasse eingetippt.

Reines HTML/CSS/JS, kein Build-Schritt. Dark Mode, am Anthropic/Claude-Look orientiert.

## Als App installieren (Vollbild, ohne Adressleiste)

Die Seite läuft über GitHub Pages (HTTPS), deshalb ist sie installierbar:

- **Android / Chrome:** Menü (⋮) → „App installieren" bzw. „Zum Startbildschirm hinzufügen".
- **iPhone / Safari:** Teilen-Symbol → „Zum Home-Bildschirm".

Danach über das neue Icon starten → läuft im Vollbild als App.

## Dateien

| Datei | Zweck |
|-------|-------|
| `index.html` | Grundgerüst, Kopfzeile, Modal- und Listen-Overlay |
| `styles.css` | Dark-Theme, mobile-first |
| `products.js` | Produkt-/Preis-Konfiguration (Single Source of Truth) |
| `app.js` | State, Navigation, Rendering, localStorage |
| `manifest.webmanifest`, `sw.js`, `icons/` | PWA: Installierbarkeit & Vollbild |
