# Getränke – Erfassung

Mobile-first WebApp (PWA) für einen Getränkemarkt: erfasst pro Kunde **Leergut**
(Pfand, das angenommen wird) und **Vollgut** (volle Ware, die ausgegeben wird),
jeweils mit Kästen-/Flaschen-Menge. Jeder Kunde bekommt eine Tagesnummer und eine
eigene, bearbeitbare Karte; die Liste wird später an der Kasse eingetippt.

Reines HTML/CSS/JS, kein Build-Schritt. Dark Mode, am Anthropic/Claude-Look orientiert.

## Anmeldung & Rollen

Beim Start erscheint ein Login (Firebase Authentication). Es gibt zwei Rollen:

- **Arbeiter** (vorher „Schreiber") – erfasst Kundenaufträge; jede Änderung wird live
  in die Datenbank (Firestore) geschrieben.
- **Kasse** (vorher „Leser") – sieht eine schreibgeschützte Live-Liste der heutigen
  Aufträge, die sich automatisch aktualisiert.

Die Rolle ergibt sich aus der Konto-UID: nur `ARBEITER_UID` (in `firebase-config.js`)
ist der Arbeiter, jedes andere angemeldete Konto ist Kasse.

## Einmalige Firebase-Einrichtung

1. **Sicherheitsregeln:** Inhalt von `firestore.rules` in der Firebase Console unter
   *Firestore Database → Regeln* einfügen und veröffentlichen.
2. **Kasse-Konto:** In *Authentication → Users* muss neben dem Arbeiter mindestens
   ein zweites Konto (E-Mail/Passwort) für die Kasse existieren.
3. *(Falls der Login mit „unauthorized-domain" scheitert):* In
   *Authentication → Settings → Authorized domains* die GitHub-Pages-Domain ergänzen.

## Als App installieren (Vollbild, ohne Adressleiste)

Die Seite läuft über GitHub Pages (HTTPS), deshalb ist sie installierbar:

- **Android / Chrome:** Menü (⋮) → „App installieren" bzw. „Zum Startbildschirm hinzufügen".
- **iPhone / Safari:** Teilen-Symbol → „Zum Home-Bildschirm".

Danach über das neue Icon starten → läuft im Vollbild als App.

## Dateien

| Datei | Zweck |
|-------|-------|
| `index.html` | Grundgerüst: Login, Erfassungs-App, Kasse-Ansicht, Modals |
| `styles.css` | Dark-Theme, mobile-first |
| `products.js` | Produkt-/Preis-Konfiguration (Single Source of Truth) |
| `app.js` | State, Navigation, Rendering, localStorage + Firestore-Sync |
| `firebase-config.js` | Firebase-Konfiguration, Arbeiter-UID, Init |
| `auth.js` | Anmeldung, Rollen-Routing (Arbeiter/Kasse), Logout |
| `kasse.js` | Schreibgeschützte Live-Ansicht der Aufträge (Kasse) |
| `firestore.rules` | Sicherheitsregeln für die Datenbank (in Console eintragen) |
| `manifest.webmanifest`, `sw.js`, `icons/` | PWA: Installierbarkeit & Vollbild |
