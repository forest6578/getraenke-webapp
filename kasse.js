// =============================================================
//  Kasse-Ansicht (vorher „Leser")
//  -------------------------------------------------------------
//  Schreibgeschützte Live-Liste der Kundenaufträge des heutigen
//  Tages. Aktualisiert sich automatisch (Firestore onSnapshot),
//  sobald der Arbeiter etwas erfasst oder ändert.
// =============================================================

"use strict";

const kasseEl = {
  email:  document.getElementById("kasse-email"),
  date:   document.getElementById("kasse-date"),
  count:  document.getElementById("kasse-count"),
  cards:  document.getElementById("kasseCards"),
};

let kasseUnsub = null;

const KASSE_WOCHE_MS = 7 * 24 * 60 * 60 * 1000;  // Aufbewahrung: 1 Woche

const kasseToday = () => new Date().toISOString().slice(0, 10);
const kasseEur = (n) =>
  Number(n).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

function kasseEscape(s) {
  return String(s).replace(/[&<>"']/g, (m) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

function kasseQtyText(it) {
  const parts = [];
  if (it.kaesten)  parts.push(it.kaesten + " " + (it.kaesten === 1 ? "Kasten" : "Kästen"));
  if (it.flaschen) parts.push(it.flaschen + " " + (Math.abs(it.flaschen) === 1 ? "Flasche" : "Flaschen"));
  let t = parts.join(" · ") || "–";
  if (it.kategorie === "leer" && it.preis != null) t += " · " + kasseEur(it.preis);
  return t;
}

function renderKasseCards(kunden) {
  kasseEl.count.textContent = kunden.length;
  kasseEl.count.hidden = kunden.length === 0;

  if (kunden.length === 0) {
    kasseEl.cards.innerHTML =
      '<div class="empty-state">' +
      '<svg viewBox="0 0 24 24"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>' +
      '<p>Heute noch keine Aufträge.</p></div>';
    return;
  }

  kasseEl.cards.innerHTML = kunden.map((c) => {
    const items = (c.items && c.items.length)
      ? '<ul class="card-items">' + c.items.map((it) =>
          '<li>' +
            '<span class="item-tag ' + (it.kategorie === "voll" ? "voll" : "leer") + '">' +
              (it.kategorie === "voll" ? "VOLL" : "LEER") + '</span>' +
            '<div class="item-info">' +
              '<div class="item-name">' + kasseEscape(it.bezeichnung) + '</div>' +
              '<div class="item-qty">' + kasseQtyText(it) + '</div>' +
            '</div>' +
          '</li>').join("") + '</ul>'
      : '<div class="card-empty">Noch keine Einträge</div>';

    const done = c.status === "fertig";
    return '<div class="card">' +
      '<div class="card-head">' +
        '<div class="card-nr">' + kasseEscape(c.nummer) + '</div>' +
        '<div class="meta">' +
          '<div class="title">Kunde ' + kasseEscape(c.nummer) + '</div>' +
          '<div class="sub">' + (c.items ? c.items.length : 0) +
            ' Position' + ((c.items && c.items.length === 1) ? "" : "en") + '</div>' +
        '</div>' +
        '<span class="badge ' + (done ? "done" : "open") + '">' +
          (done ? "Fertig" : "Offen") + '</span>' +
      '</div>' +
      items +
      '<div class="card-foot">' +
        '<button class="btn btn-primary" data-act="archive" data-id="' +
          kasseEscape(c.id) + '">Auftrag abschließen</button>' +
      '</div>' +
    '</div>';
  }).join("");
}

// Auftrag abschließen: ins Archiv kopieren (mit Zeitstempel) und aus der
// aktiven Liste entfernen. Verschwindet dadurch automatisch aus der Ansicht.
function archiveOrder(id) {
  const ref = window.db.collection(window.KUNDEN_COLLECTION).doc(id);
  return ref.get().then((snap) => {
    if (!snap.exists) return;
    const data = snap.data();
    const expireMs = Date.now() + KASSE_WOCHE_MS;
    return window.db.collection(window.ARCHIV_COLLECTION).doc(id).set(
      Object.assign({}, data, {
        archivedAt: firebase.firestore.FieldValue.serverTimestamp(),
        archivedBy: window.currentUid || null,
        expireAt:   firebase.firestore.Timestamp.fromMillis(expireMs),
      })
    ).then(() => ref.delete());
  });
}

// Aufbewahrung: Archiv-Einträge, die älter als 1 Woche sind, löschen.
// Best-effort beim Öffnen der Kasse (zusätzlich zur optionalen TTL-Regel).
function purgeOldArchive() {
  const cutoff = firebase.firestore.Timestamp.fromMillis(Date.now() - KASSE_WOCHE_MS);
  window.db.collection(window.ARCHIV_COLLECTION)
    .where("archivedAt", "<", cutoff)
    .get()
    .then((snap) => snap.forEach((d) => d.ref.delete().catch(() => {})))
    .catch(() => {});
}

window.startKasse = function (user) {
  kasseEl.email.textContent = user.email || "";
  kasseEl.date.textContent = new Date().toLocaleDateString("de-DE", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });
  kasseEl.cards.innerHTML = '<div class="empty-state"><p>Lädt …</p></div>';

  // Alte Archiv-Einträge (> 1 Woche) aufräumen.
  purgeOldArchive();

  if (kasseUnsub) { kasseUnsub(); kasseUnsub = null; }

  // Nur die Aufträge von heute, neueste Nummer zuerst.
  kasseUnsub = window.db.collection(window.KUNDEN_COLLECTION)
    .where("datum", "==", kasseToday())
    .onSnapshot((snap) => {
      const list = [];
      snap.forEach((doc) => list.push(Object.assign({ id: doc.id }, doc.data())));
      list.sort((a, b) => (b.nummer || 0) - (a.nummer || 0));
      renderKasseCards(list);
    }, (err) => {
      kasseEl.cards.innerHTML =
        '<div class="empty-state"><p>Fehler beim Laden:<br>' +
        kasseEscape(err.message) + '</p></div>';
    });
};

window.stopKasse = function () {
  if (kasseUnsub) { kasseUnsub(); kasseUnsub = null; }
};

// Klick auf "Auftrag abschließen" (Delegation).
kasseEl.cards.addEventListener("click", (e) => {
  const btn = e.target.closest('[data-act="archive"]');
  if (!btn) return;
  const id = btn.dataset.id;
  if (!confirm("Auftrag abschließen? Er wird aus der Liste entfernt und ins Archiv verschoben.")) return;
  btn.disabled = true;
  btn.textContent = "Wird abgeschlossen …";
  archiveOrder(id).catch((err) => {
    alert("Fehler beim Abschließen: " + err.message);
    btn.disabled = false;
    btn.textContent = "Auftrag abschließen";
  });
});
