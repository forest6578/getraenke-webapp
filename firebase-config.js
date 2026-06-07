// =============================================================
//  Firebase-Konfiguration + Initialisierung
//  -------------------------------------------------------------
//  Der apiKey ist KEIN Geheimnis – die Absicherung passiert über
//  die Firestore-Sicherheitsregeln (siehe firestore.rules).
//  Wird vor products.js / app.js / kasse.js / auth.js geladen.
// =============================================================

const firebaseConfig = {
  apiKey:            "AIzaSyAuwsmUMtqb8T3LE5W9JOklz-EEcjER2e4",
  authDomain:        "fir-test-app-4bd80.firebaseapp.com",
  projectId:         "fir-test-app-4bd80",
  storageBucket:     "fir-test-app-4bd80.firebasestorage.app",
  messagingSenderId: "908210179985",
  appId:             "1:908210179985:web:13219320ebfc86169f1430",
};

// UID des Arbeiter-Kontos (vorher „Schreiber"). Nur dieses Konto darf
// in die Datenbank schreiben – alle anderen angemeldeten Konten (Kasse)
// dürfen nur lesen. Dieselbe Regel steht in firestore.rules.
const ARBEITER_UID = "e0fQWeqgdVM28gy0vGeNsJmQZ3x2";

// Name der Firestore-Sammlung mit den Kundenaufträgen.
const KUNDEN_COLLECTION = "kunden";

firebase.initializeApp(firebaseConfig);

// Global verfügbar machen, damit app.js / kasse.js / auth.js sie nutzen.
window.auth = firebase.auth();
window.db   = firebase.firestore();
window.ARBEITER_UID = ARBEITER_UID;
window.KUNDEN_COLLECTION = KUNDEN_COLLECTION;

// Rollen-Status (wird von auth.js gesetzt, von app.js gelesen).
window.isArbeiter = false;
window.currentUid = null;
