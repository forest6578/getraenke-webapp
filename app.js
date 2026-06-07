// =============================================================
//  Getränke-WebApp – App-Logik (State, Navigation, Rendering)
//  Reines Frontend, keine Datenbank. Persistenz via localStorage.
// =============================================================

"use strict";

const STORAGE_KEY = "getraenke_state_v1";

// ---- State ----------------------------------------------------
let state = {
  customers: [],                 // [{ id, nummer, datum, status, items:[] }]
  counter:   { datum: null, last: 0 },
  currentId: null,
};
let navStack = [{ view: "start" }];   // oberstes Element = aktuelle View
let pending  = null;                  // Mengen-Modal: anstehender / zu bearbeitender Eintrag

// ---- DOM-Referenzen -------------------------------------------
const el = {
  view:       document.getElementById("view"),
  back:       document.getElementById("backBtn"),
  kundeBadge: document.getElementById("kundeBadge"),
  kundeNr:    document.getElementById("kundeNr"),
  listBtn:    document.getElementById("listBtn"),
  listCount:  document.getElementById("listCount"),
  fab:        document.getElementById("finishFab"),
  // Mengen-Modal
  qtyModal:    document.getElementById("qtyModal"),
  qtyCategory: document.getElementById("qtyCategory"),
  qtyTitle:    document.getElementById("qtyTitle"),
  qtyKaesten:  document.getElementById("qtyKaesten"),
  qtyFlaschen: document.getElementById("qtyFlaschen"),
  qtyHint:     document.getElementById("qtyHint"),
  qtyConfirm:  document.getElementById("qtyConfirm"),
  qtyCancel:   document.getElementById("qtyCancel"),
  // Listen-Sheet
  listOverlay: document.getElementById("listOverlay"),
  listClose:   document.getElementById("listClose"),
  cards:       document.getElementById("cards"),
};

// ---- Hilfsfunktionen ------------------------------------------
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const todayStr = () => new Date().toISOString().slice(0, 10);
const eur = (n) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

const svgChevron = '<svg class="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>';

const currentCustomer = () => state.customers.find((c) => c.id === state.currentId) || null;
const currentView = () => navStack[navStack.length - 1];

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    customers: state.customers,
    counter: state.counter,
    currentId: state.currentId,
  }));
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    state.customers = data.customers || [];
    state.counter   = data.counter || { datum: null, last: 0 };
    state.currentId = data.currentId || null;
  } catch (e) {
    console.warn("State konnte nicht geladen werden:", e);
  }
}

// ---- Firestore-Synchronisation --------------------------------
// Der Arbeiter schreibt jede Änderung zusätzlich in die Datenbank,
// damit die Kasse sie live sieht. Schlägt das fehl (offline/keine
// Rolle), läuft die App lokal trotzdem normal weiter.
function syncCustomer(c) {
  if (!window.db || !window.isArbeiter || !c) return;
  window.db.collection(window.KUNDEN_COLLECTION).doc(c.id).set({
    nummer: c.nummer,
    datum:  c.datum,
    status: c.status,
    items:  c.items,
    createdBy: window.currentUid || null,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  }, { merge: true }).catch((err) => console.warn("Sync-Fehler:", err));
}

function deleteCustomerRemote(id) {
  if (!window.db || !window.isArbeiter || !id) return;
  window.db.collection(window.KUNDEN_COLLECTION).doc(id).delete()
    .catch((err) => console.warn("Löschen (Datenbank) fehlgeschlagen:", err));
}

// ---- Live-Abgleich über mehrere Arbeiter-Geräte --------------
// Die Datenbank (kunden, heutiger Tag) ist die gemeinsame Quelle.
// Snapshots werden in den lokalen State eingemischt, damit z.B. PC
// und Handy denselben Stand sehen. Der gerade offene Kunde bleibt
// lokal (schützt aktive Bearbeitung vor Überschreiben).
let arbeiterUnsub = null;

function applyRemoteCustomers(remote) {
  const today = todayStr();
  const localById = new Map(state.customers.map((c) => [c.id, c]));
  const otherDays = state.customers.filter((c) => c.datum !== today);
  const curId = state.currentId;

  const list = remote.map((rc) =>
    (rc.id === curId && localById.has(curId)) ? localById.get(curId) : rc
  );
  // Offenen, noch nicht hochgeladenen Kunden bewahren.
  if (curId && localById.has(curId) && localById.get(curId).datum === today &&
      !remote.some((r) => r.id === curId)) {
    list.push(localById.get(curId));
  }
  state.customers = otherDays.concat(list);

  // Tageszähler an die höchste bekannte Nummer angleichen, damit neue
  // Aufträge auf einem zweiten Gerät nicht dieselbe Nummer vergeben.
  const maxNr = state.customers
    .filter((c) => c.datum === today)
    .reduce((m, c) => Math.max(m, c.nummer || 0), 0);
  if (state.counter.datum !== today) state.counter = { datum: today, last: maxNr };
  else state.counter.last = Math.max(state.counter.last, maxNr);

  save();
  if (!el.listOverlay.hidden) renderCards();
  // Start-View neu rendern (Anzahl aktualisieren); andere Views nicht,
  // damit Auswahl/Eingaben nicht unterbrochen werden.
  if (currentView().view === "start") render();
  else refreshHeaderCounts();
}

function refreshHeaderCounts() {
  const total = state.customers.length;
  el.listCount.hidden = total === 0;
  el.listCount.textContent = total;
}

window.subscribeArbeiter = function () {
  if (!window.db) return;
  if (arbeiterUnsub) { arbeiterUnsub(); arbeiterUnsub = null; }
  arbeiterUnsub = window.db.collection(window.KUNDEN_COLLECTION)
    .where("datum", "==", todayStr())
    .onSnapshot((snap) => {
      const remote = [];
      snap.forEach((doc) => remote.push(Object.assign({ id: doc.id }, doc.data())));
      applyRemoteCustomers(remote);
    }, (err) => console.warn("Arbeiter-Sync-Fehler:", err));
};

window.stopArbeiterSync = function () {
  if (arbeiterUnsub) { arbeiterUnsub(); arbeiterUnsub = null; }
};

// ---- Auftrag archivieren (jederzeit, auch unfertig) -----------
// Kopiert den Auftrag ins Archiv (mit Zeitstempel) und entfernt ihn
// aus der aktiven Liste – lokal und in der Datenbank.
function archiveCustomer(id) {
  const c = state.customers.find((x) => x.id === id);
  if (!c) return;

  if (window.db) {
    const expireMs = Date.now() + 7 * 24 * 60 * 60 * 1000;
    window.db.collection(window.ARCHIV_COLLECTION).doc(c.id).set({
      nummer: c.nummer,
      datum:  c.datum,
      status: c.status,
      items:  c.items,
      createdBy:  c.createdBy || window.currentUid || null,
      archivedAt: firebase.firestore.FieldValue.serverTimestamp(),
      archivedBy: window.currentUid || null,
      expireAt:   firebase.firestore.Timestamp.fromMillis(expireMs),
    })
      .then(() => window.db.collection(window.KUNDEN_COLLECTION).doc(c.id).delete())
      .catch((err) => console.warn("Archivieren fehlgeschlagen:", err));
  }

  state.customers = state.customers.filter((x) => x.id !== id);
  if (state.currentId === id) { state.currentId = null; navStack = [{ view: "start" }]; }
  save();
  renderCards();
  render();
  if (state.customers.length === 0) closeList();
}

// ---- Navigation -----------------------------------------------
function go(view, ctx = {}) {
  navStack.push({ view, ...ctx });
  render();
}

function back() {
  if (navStack.length > 1) {
    navStack.pop();
    render();
  }
}

// Setzt den Stack auf die Wurzel des Bereichs (nach Mengeneingabe).
function resetToArea(area) {
  if (area === "voll") navStack = [{ view: "kategorie" }, { view: "voll-marke" }];
  else                 navStack = [{ view: "kategorie" }, { view: "leer-preis" }];
  render();
}

// ---- Kunden / Aufträge ----------------------------------------
function neuerAuftrag() {
  const today = todayStr();
  if (state.counter.datum !== today) state.counter = { datum: today, last: 0 };
  state.counter.last += 1;

  const kunde = { id: uid(), nummer: state.counter.last, datum: today, status: "offen", items: [] };
  state.customers.push(kunde);
  state.currentId = kunde.id;
  save();
  syncCustomer(kunde);

  showBigNumber(kunde.nummer, () => {
    navStack = [{ view: "kategorie" }];
    render();
  });
}

function finishCurrent() {
  const c = currentCustomer();
  if (c) { c.status = "fertig"; }
  state.currentId = null;
  navStack = [{ view: "start" }];
  save();
  if (c) syncCustomer(c);
  render();
}

function addItem(item) {
  const c = currentCustomer();
  if (!c) return;
  c.items.push(item);
  save();
  syncCustomer(c);
}

// ---- Große Nummer-Einblendung ---------------------------------
function showBigNumber(nr, done) {
  const overlay = document.createElement("div");
  overlay.className = "big-number";
  overlay.innerHTML = `<span class="bn-label">Kundennummer</span><span class="bn-value">${nr}</span>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", finish);
  const t = setTimeout(finish, 1000);
  function finish() {
    clearTimeout(t);
    overlay.removeEventListener("click", finish);
    overlay.remove();
    done();
  }
}

// =============================================================
//  RENDERING
// =============================================================
function render() {
  const v = currentView();

  // Kopfzeile / FAB aktualisieren
  el.back.hidden = navStack.length <= 1;
  const c = currentCustomer();
  el.kundeBadge.hidden = !c;
  if (c) el.kundeNr.textContent = c.nummer;
  el.fab.hidden = !(c && c.status === "offen");
  const total = state.customers.length;
  el.listCount.hidden = total === 0;
  el.listCount.textContent = total;

  // View-Inhalt
  switch (v.view) {
    case "start":         return renderStart();
    case "kategorie":     return renderKategorie();
    case "voll-marke":    return renderVollMarke();
    case "voll-behaelter":return renderVollBehaelter(v.marke);
    case "voll-variante": return renderVollVariante(v.marke, v.behaelter);
    case "voll-manuell":  return renderManuell("voll");
    case "leer-preis":    return renderLeerPreis();
    case "leer-flaschen": return renderLeerFlaschen();
    case "leer-manuell":  return renderManuell("leer");
    default:              return renderStart();
  }
}

function head(title, sub) {
  return `<div class="view-head"><h1 class="view-title">${title}</h1>${sub ? `<p class="view-sub">${sub}</p>` : ""}</div>`;
}

function tile(label, sub, opts = {}) {
  const cls = "tile" + (opts.accent ? " accent" : "") + (opts.cls ? " " + opts.cls : "");
  const main = sub
    ? `<span class="tile-main"><span>${label}</span><span class="tile-sub">${sub}</span></span>`
    : `<span>${label}</span>`;
  return `<button class="${cls}" data-act="${opts.act}"${opts.data || ""}>${main}${opts.noChev ? "" : svgChevron}</button>`;
}

// ---- Views ----
function renderStart() {
  const offene = state.customers.filter((c) => c.status === "offen").length;
  const total  = state.customers.length;
  el.view.innerHTML = `
    <div class="start">
      <div class="start-top">
        <div class="start-logo">
          <svg viewBox="0 0 24 24"><path d="M6 2h12l-1 6a5 5 0 01-10 0L6 2zM9 22h6M12 13v9"/></svg>
        </div>
        <h1>Getränke-Erfassung</h1>
        <p class="start-tagline">Leergut annehmen &amp; Vollgut ausgeben – schnell pro Kunde erfasst.</p>
      </div>

      <div class="start-actions">
        <button class="btn btn-primary btn-block btn-lg" data-act="neu">Neuer Auftrag</button>
        ${total ? `<button class="btn btn-ghost btn-block" data-act="open-list">Liste ansehen (${total}${offene ? `, ${offene} offen` : ""})</button>` : ""}
      </div>

      <div class="howto">
        <div class="howto-step">
          <span class="step-num">1</span>
          <div class="howto-text"><span class="t">Auftrag starten</span><span class="d">„Neuer Auftrag" tippen – der Kunde bekommt automatisch eine Nummer.</span></div>
        </div>
        <div class="howto-step">
          <span class="step-num">2</span>
          <div class="howto-text"><span class="t">Artikel erfassen</span><span class="d">Leergut oder Vollgut wählen, durchtippen, dann Kästen &amp; Flaschen eingeben.</span></div>
        </div>
        <div class="howto-step">
          <span class="step-num">3</span>
          <div class="howto-text"><span class="t">Liste &amp; Fertigstellen</span><span class="d">Oben rechts die <b>Liste</b> jederzeit prüfen oder ändern – dann unten „Liste fertigstellen".</span></div>
        </div>
      </div>

      <button class="btn btn-ghost btn-block account-logout" data-act="logout">Abmelden</button>
    </div>`;
}

function renderKategorie() {
  el.view.innerHTML = head("Was bringt der Kunde?", "Leergut annehmen oder Vollgut ausgeben") + `
    <div class="grid fill">
      <button class="tile big" data-act="kat" data-kat="leer">
        <svg class="cat-icon" viewBox="0 0 24 24"><path d="M9 2h6l-1 4H10L9 2zM8 6h8l1 14a2 2 0 01-2 2H9a2 2 0 01-2-2L8 6z"/></svg>
        <span class="cat-name">LEERGUT</span>
        <span class="cat-desc">Pfand annehmen</span>
      </button>
      <button class="tile big" data-act="kat" data-kat="voll">
        <svg class="cat-icon" viewBox="0 0 24 24"><path d="M3 7l9-4 9 4v10l-9 4-9-4V7zM3 7l9 4 9-4M12 11v10"/></svg>
        <span class="cat-name">VOLLGUT</span>
        <span class="cat-desc">Volle Ware ausgeben</span>
      </button>
    </div>`;
}

function renderVollMarke() {
  const marken = Object.keys(VOLLGUT)
    .map((m) => tile(m, null, { act: "marke", data: ` data-marke="${m}"` }))
    .join("");
  el.view.innerHTML = head("Vollgut", "Marke wählen") + `
    <div class="grid one fill">
      ${marken}
      ${tile("Manuelle Eingabe", "z.B. Bolten Bügel (helles)", { act: "voll-manuell", accent: true })}
    </div>`;
}

function renderVollBehaelter(marke) {
  const behaelter = Object.keys(VOLLGUT[marke] || {})
    .map((b) => tile(b, null, { act: "behaelter", data: ` data-marke="${marke}" data-behaelter="${b}"` }))
    .join("");
  el.view.innerHTML = head(marke, "Behälter wählen") + `<div class="grid one fill">${behaelter}</div>`;
}

function renderVollVariante(marke, behaelter) {
  const farbe = { Medium: "v-medium", Naturell: "v-naturell", Classic: "v-classic" };
  const varianten = (VOLLGUT[marke]?.[behaelter] || [])
    .map((vr) => tile(vr, null, {
      act: "variante", noChev: true, cls: farbe[vr] || "",
      data: ` data-marke="${marke}" data-behaelter="${behaelter}" data-variante="${vr}"`,
    }))
    .join("");
  el.view.innerHTML = head(marke, behaelter) + `<div class="grid fill">${varianten}</div>`;
}

function renderLeerPreis() {
  const preise = LEERGUT_PREISE
    .map((p) => tile(eur(p), null, { act: "leer-preis-pick", cls: "price", noChev: true, data: ` data-preis="${p}"` }))
    .join("");
  el.view.innerHTML = head("Leergut", "Pfand-Betrag wählen") + `
    <div class="grid fill">${preise}</div>
    <div class="grid">
      ${tile("Einzelne Flaschen", "0,15 / 0,25 / 0,08 €", { act: "leer-flaschen" })}
      ${tile("Manuelle Preise", "z.B. 2,46 €", { act: "leer-manuell", accent: true })}
    </div>`;
}

function renderLeerFlaschen() {
  const flaschen = LEERGUT_FLASCHEN
    .map((p) => tile(eur(p), null, { act: "leer-flasche-pick", cls: "price", noChev: true, data: ` data-preis="${p}"` }))
    .join("");
  el.view.innerHTML = head("Einzelne Flaschen", "Flaschenpfand wählen") + `<div class="grid fill">${flaschen}</div>`;
}

function renderManuell(kategorie) {
  const isVoll = kategorie === "voll";
  el.view.innerHTML = head(isVoll ? "Manuelle Eingabe" : "Manueller Preis",
                           isVoll ? "Produktname eingeben" : "Pfand-Betrag eingeben") + `
    <div class="manual-form">
      <div class="field">
        <label>${isVoll ? "Bezeichnung" : "Betrag in €"}</label>
        <input id="manualInput" type="${isVoll ? "text" : "number"}"
               ${isVoll ? 'placeholder="z.B. Bitburger 0,33l (Pils)"' : 'inputmode="decimal" step="0.01" min="0" placeholder="z.B. 2,46"'}>
      </div>
      <button class="btn btn-primary btn-block" data-act="manual-next" data-kat="${kategorie}">Weiter</button>
    </div>`;
  const inp = document.getElementById("manualInput");
  inp.focus();
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter") document.querySelector('[data-act="manual-next"]').click(); });
}

// =============================================================
//  MENGEN-MODAL
// =============================================================
function openQtyModal(item, opts = {}) {
  pending = item;                          // {kategorie, bezeichnung, preis?, id?(=edit)}
  // Bei Leergut dürfen Flaschen negativ sein (Kasten kommt nicht ganz voll zurück).
  const allowNeg = item.kategorie === "leer";
  el.qtyModal.dataset.allowneg = allowNeg ? "true" : "false";
  el.qtyFlaschen.min = allowNeg ? -999 : 0;
  el.qtyCategory.textContent = item.kategorie === "voll" ? "Vollgut" : "Leergut";
  const preisTxt = item.preis != null ? ` · ${eur(item.preis)}` : "";
  el.qtyTitle.textContent = item.bezeichnung + preisTxt;
  el.qtyKaesten.value  = item.kaesten ?? 0;
  el.qtyFlaschen.value = item.flaschen ?? 0;
  el.qtyHint.hidden = !allowNeg;
  el.qtyModal.hidden = false;
  // Bei einzelnen Flaschen / Edit ggf. Flaschenfeld fokussieren
  const focusEl = opts.focusFlaschen ? el.qtyFlaschen : el.qtyKaesten;
  setTimeout(() => focusEl.select(), 50);
}

function closeQtyModal() {
  el.qtyModal.hidden = true;
  pending = null;
}

function confirmQty() {
  const allowNeg = pending.kategorie === "leer";
  const kaesten  = Math.max(0, parseInt(el.qtyKaesten.value, 10) || 0);
  let flaschen   = parseInt(el.qtyFlaschen.value, 10) || 0;
  if (!allowNeg) flaschen = Math.max(0, flaschen);   // Vollgut: keine negativen Flaschen
  if (kaesten === 0 && flaschen === 0) {
    el.qtyKaesten.focus();
    return; // nichts erfassen ohne Menge
  }

  if (pending.id) {
    // Bearbeiten eines bestehenden Eintrags
    const c = currentCustomer() || state.customers.find((x) => x.items.some((i) => i.id === pending.id));
    const it = c?.items.find((i) => i.id === pending.id);
    if (it) { it.kaesten = kaesten; it.flaschen = flaschen; }
    save();
    if (c) syncCustomer(c);
    closeQtyModal();
    // Wenn aus der Liste bearbeitet: Liste offen lassen
    if (!el.listOverlay.hidden) { renderCards(); render(); }
    else { render(); }
    return;
  }

  // Neuer Eintrag
  const area = pending.kategorie;
  addItem({
    id: uid(),
    kategorie: area,
    bezeichnung: pending.bezeichnung,
    preis: pending.preis ?? null,
    kaesten, flaschen,
  });
  closeQtyModal();
  resetToArea(area);   // zurück zur Bereichswurzel
}

// =============================================================
//  LISTEN-SHEET (Kundenkarten)
// =============================================================
function openList() { el.listOverlay.hidden = false; renderCards(); }
function closeList() { el.listOverlay.hidden = true; }

function qtyText(it) {
  const parts = [];
  if (it.kaesten)  parts.push(`${it.kaesten} ${it.kaesten === 1 ? "Kasten" : "Kästen"}`);
  if (it.flaschen) parts.push(`${it.flaschen} ${Math.abs(it.flaschen) === 1 ? "Flasche" : "Flaschen"}`);
  let t = parts.join(" · ") || "–";
  if (it.kategorie === "leer" && it.preis != null) t += ` · ${eur(it.preis)}`;
  return t;
}

function renderCards() {
  if (state.customers.length === 0) {
    el.cards.innerHTML = `<div class="empty-state">
      <svg viewBox="0 0 24 24"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
      <p>Noch keine Kunden erfasst.</p></div>`;
    return;
  }
  // Neueste zuerst, aktueller Kunde immer ganz oben
  const list = [...state.customers].reverse().sort((a, b) =>
    (a.id === state.currentId ? -1 : 0) - (b.id === state.currentId ? -1 : 0));

  el.cards.innerHTML = list.map((c) => {
    const isCurrent = c.id === state.currentId;
    const items = c.items.length
      ? `<ul class="card-items">${c.items.map((it) => `
          <li>
            <span class="item-tag ${it.kategorie}">${it.kategorie === "voll" ? "VOLL" : "LEER"}</span>
            <button class="item-info" data-act="edit-item" data-cid="${c.id}" data-iid="${it.id}" style="text-align:left;background:none;border:none;color:inherit;padding:0">
              <div class="item-name">${escapeHtml(it.bezeichnung)}</div>
              <div class="item-qty">${qtyText(it)}</div>
            </button>
            <button class="item-del" data-act="del-item" data-cid="${c.id}" data-iid="${it.id}" aria-label="Eintrag löschen">
              <svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg>
            </button>
          </li>`).join("")}</ul>`
      : `<div class="card-empty">Noch keine Einträge</div>`;

    const archiveBtn = `<button class="btn btn-ghost btn-archive" data-act="archive-card" data-cid="${c.id}">Archivieren</button>`;
    const foot = isCurrent
      ? `<div class="card-foot">
           <button class="btn btn-danger" data-act="del-card" data-cid="${c.id}">Kunde löschen</button>
           <button class="btn btn-primary" data-act="finish-card" data-cid="${c.id}">Fertigstellen</button>
           ${archiveBtn}
         </div>`
      : `<div class="card-foot">
           <button class="btn btn-danger" data-act="del-card" data-cid="${c.id}">Löschen</button>
           <button class="btn btn-ghost" data-act="reopen-card" data-cid="${c.id}">Wieder öffnen</button>
           ${archiveBtn}
         </div>`;

    return `<div class="card ${isCurrent ? "current" : ""}">
      <div class="card-head">
        <div class="card-nr">${c.nummer}</div>
        <div class="meta">
          <div class="title">Kunde ${c.nummer}</div>
          <div class="sub">${c.items.length} Position${c.items.length === 1 ? "" : "en"}</div>
        </div>
        <span class="badge ${c.status === "fertig" ? "done" : "open"}">${c.status === "fertig" ? "Fertig" : "Offen"}</span>
      </div>
      ${items}
      ${foot}
    </div>`;
  }).join("");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

// =============================================================
//  EVENTS
// =============================================================
// Klicks im Haupt-View (Delegation)
el.view.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const act = btn.dataset.act;

  switch (act) {
    case "neu":        neuerAuftrag(); break;
    case "open-list":  openList(); break;
    case "logout":     if (window.logout) window.logout(); break;
    case "kat":        btn.dataset.kat === "voll" ? go("voll-marke") : go("leer-preis"); break;
    case "marke":      go("voll-behaelter", { marke: btn.dataset.marke }); break;
    case "behaelter":  go("voll-variante", { marke: btn.dataset.marke, behaelter: btn.dataset.behaelter }); break;
    case "variante":
      openQtyModal({ kategorie: "voll",
        bezeichnung: `${btn.dataset.marke} · ${btn.dataset.behaelter} · ${btn.dataset.variante}` });
      break;
    case "voll-manuell": go("voll-manuell"); break;
    case "leer-flaschen": go("leer-flaschen"); break;
    case "leer-manuell":  go("leer-manuell"); break;
    case "leer-preis-pick":
      openQtyModal({ kategorie: "leer", bezeichnung: "Leergut", preis: parseFloat(btn.dataset.preis) });
      break;
    case "leer-flasche-pick":
      openQtyModal({ kategorie: "leer", bezeichnung: "Einzelflasche", preis: parseFloat(btn.dataset.preis) },
                   { focusFlaschen: true });
      break;
    case "manual-next": {
      const kat = btn.dataset.kat;
      const val = document.getElementById("manualInput").value.trim();
      if (kat === "voll") {
        if (!val) { document.getElementById("manualInput").focus(); return; }
        openQtyModal({ kategorie: "voll", bezeichnung: val });
      } else {
        const p = parseFloat(val.replace(",", "."));
        if (!(p > 0)) { document.getElementById("manualInput").focus(); return; }
        openQtyModal({ kategorie: "leer", bezeichnung: "Leergut", preis: p });
      }
      break;
    }
  }
});

// Kopfzeile + FAB
el.back.addEventListener("click", back);
el.fab.addEventListener("click", finishCurrent);
el.listBtn.addEventListener("click", openList);
el.listClose.addEventListener("click", closeList);
el.listOverlay.addEventListener("click", (e) => { if (e.target === el.listOverlay) closeList(); });

// Mengen-Modal
el.qtyConfirm.addEventListener("click", confirmQty);
el.qtyCancel.addEventListener("click", closeQtyModal);
el.qtyModal.addEventListener("click", (e) => { if (e.target === el.qtyModal) closeQtyModal(); });
document.querySelectorAll(".step-btn").forEach((b) => {
  b.addEventListener("click", () => {
    const stepper = b.closest(".stepper");
    const input = stepper.querySelector("input");
    const allowNeg = stepper.dataset.field === "flaschen" && el.qtyModal.dataset.allowneg === "true";
    const min = allowNeg ? -999 : 0;
    const next = Math.max(min, (parseInt(input.value, 10) || 0) + parseInt(b.dataset.step, 10));
    input.value = next;
  });
});

// Listen-Aktionen (Delegation)
el.cards.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const cid = btn.dataset.cid;
  const c = state.customers.find((x) => x.id === cid);
  if (!c) return;

  switch (btn.dataset.act) {
    case "del-item":
      c.items = c.items.filter((i) => i.id !== btn.dataset.iid);
      save(); syncCustomer(c); renderCards(); render();
      break;
    case "edit-item": {
      const it = c.items.find((i) => i.id === btn.dataset.iid);
      if (it) openQtyModal({ ...it }, { focusFlaschen: it.kaesten === 0 && it.flaschen > 0 });
      break;
    }
    case "del-card":
      if (confirm(`Kunde ${c.nummer} wirklich löschen?`)) {
        state.customers = state.customers.filter((x) => x.id !== cid);
        if (state.currentId === cid) { state.currentId = null; navStack = [{ view: "start" }]; }
        save(); deleteCustomerRemote(cid); renderCards(); render();
        if (state.customers.length === 0) closeList();
      }
      break;
    case "finish-card":
      c.status = "fertig";
      if (state.currentId === cid) { state.currentId = null; navStack = [{ view: "start" }]; }
      save(); syncCustomer(c); renderCards(); render();
      break;
    case "reopen-card":
      // Anderen offenen Kunden ggf. behalten; diesen wieder aktiv setzen
      c.status = "offen";
      state.currentId = cid;
      navStack = [{ view: "kategorie" }];
      save(); syncCustomer(c); renderCards(); render();
      break;
    case "archive-card":
      if (confirm(`Auftrag von Kunde ${c.nummer} archivieren? Er verschwindet aus der Liste und wird ins Archiv verschoben.`)) {
        archiveCustomer(cid);
      }
      break;
  }
});

// =============================================================
//  INIT
//  Wird von auth.js aufgerufen, sobald sich ein Arbeiter anmeldet.
// =============================================================
window.startArbeiterApp = function () {
  load();
  // Nach Reload: offenen aktuellen Kunden fortsetzen, sonst Start
  const resume = currentCustomer();
  navStack = resume && resume.status === "offen" ? [{ view: "kategorie" }] : [{ view: "start" }];
  if (!resume) state.currentId = null;
  render();
  // Live-Abgleich mit der Datenbank starten (mehrere Arbeiter-Geräte).
  if (window.subscribeArbeiter) window.subscribeArbeiter();
};
