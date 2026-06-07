// =============================================================
//  Anmeldung & Rollen-Routing
//  -------------------------------------------------------------
//  - Nicht angemeldet      -> Login-Screen
//  - Angemeldet = Arbeiter -> Erfassungs-App (#app)
//  - Angemeldet = Kasse    -> Live-Ansicht der Aufträge (#kasse)
// =============================================================

"use strict";

const authEl = {
  screen:   document.getElementById("auth-screen"),
  email:    document.getElementById("auth-email"),
  password: document.getElementById("auth-password"),
  submit:   document.getElementById("auth-submit"),
  error:    document.getElementById("auth-error"),
  form:     document.getElementById("auth-form"),
  app:      document.getElementById("app"),
  kasse:    document.getElementById("kasse"),
};

let arbeiterStarted = false;

// ---- Screen-Umschaltung ---------------------------------------
function showAuth() {
  authEl.screen.hidden = false;
  authEl.app.hidden    = true;
  authEl.kasse.hidden  = true;
  authEl.error.textContent = "";
  authEl.password.value = "";
  if (window.stopKasse) window.stopKasse();
}

function showArbeiter(user) {
  window.isArbeiter = true;
  window.currentUid = user.uid;
  authEl.screen.hidden = true;
  authEl.kasse.hidden  = true;
  authEl.app.hidden    = false;

  // Erfassungs-App starten (einmalig); danach lokal vorhandene
  // Aufträge des heutigen Tages in die Datenbank hochladen.
  if (!arbeiterStarted && window.startArbeiterApp) {
    window.startArbeiterApp();
    arbeiterStarted = true;
  }
  if (window.syncAllToday) window.syncAllToday();
}

function showKasse(user) {
  window.isArbeiter = false;
  window.currentUid = user.uid;
  authEl.screen.hidden = true;
  authEl.app.hidden    = true;
  authEl.kasse.hidden  = false;
  if (window.startKasse) window.startKasse(user);
}

// ---- Auth-Status beobachten -----------------------------------
window.auth.onAuthStateChanged((user) => {
  if (!user) { showAuth(); return; }
  if (user.uid === window.ARBEITER_UID) showArbeiter(user);
  else                                  showKasse(user);
});

// ---- Login ----------------------------------------------------
function doLogin() {
  const email = authEl.email.value.trim();
  const pass  = authEl.password.value;
  authEl.error.textContent = "";

  if (!email || !pass) {
    authEl.error.textContent = "Bitte E-Mail und Passwort eingeben.";
    return;
  }

  authEl.submit.disabled = true;
  authEl.submit.textContent = "Anmelden …";
  window.auth.signInWithEmailAndPassword(email, pass)
    .catch((err) => { authEl.error.textContent = mapAuthError(err.code); })
    .finally(() => {
      authEl.submit.disabled = false;
      authEl.submit.textContent = "Anmelden";
    });
}

// Logout – global, damit App- und Kasse-Ansicht ihn aufrufen können.
window.logout = function () { window.auth.signOut(); };

function mapAuthError(code) {
  const msgs = {
    "auth/invalid-email":      "Ungültige E-Mail-Adresse.",
    "auth/user-not-found":     "Kein Konto mit dieser E-Mail gefunden.",
    "auth/wrong-password":     "Falsches Passwort.",
    "auth/invalid-credential": "E-Mail oder Passwort falsch.",
    "auth/too-many-requests":  "Zu viele Versuche. Bitte kurz warten.",
    "auth/network-request-failed": "Keine Verbindung. Internet prüfen.",
    "auth/unauthorized-domain": "Diese Domain ist in Firebase nicht freigegeben.",
  };
  return msgs[code] || ("Anmeldung fehlgeschlagen (" + code + ").");
}

// ---- Events ---------------------------------------------------
authEl.form.addEventListener("submit", (e) => { e.preventDefault(); doLogin(); });
