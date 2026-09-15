// ================================
// FIREBASE CONFIG — Sistema de Asistencia Escolar QR
// Reciclado de la base "QrParaEventos", adaptado al nuevo proyecto
// ================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";

import {
    getFirestore
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

import {
    getAuth
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

// 👉 Pega aquí los datos de TU proyecto:
//    Firebase Console → ⚙ Configuración del proyecto → Tus apps →
//    app web → "Configuración del SDK" → Config.
//    Paso a paso completo en docs/configurar-firebase.md
//
// Crea un proyecto Firebase NUEVO para este sistema. No reutilices el
// proyecto "registroqr" del sistema de eventos: son datos y reglas
// distintas, y mezclarlos haría que las reglas de uno rompan al otro.
//
// Sin storageBucket a propósito: este sistema no usa Cloud Storage.
const firebaseConfig = {
    apiKey: "AIzaSyAUne6AF_QMT5rdVbVK-EH84O4PK6Ct9nM",
    authDomain: "asitencias-9d013.firebaseapp.com",
    projectId: "asitencias-9d013",
    messagingSenderId: "1041532219276",
    appId: "1:1041532219276:web:8f08731fd1e36c1ffb70a9"
};

const app = initializeApp(firebaseConfig);

const db = getFirestore(app);
const auth = getAuth(app);
// Cloud Storage NO se usa: desde 2024 exige el plan de pago Blaze.
// Las fotos de estudiantes se guardan como miniaturas comprimidas
// dentro de Firestore (ver js/estudiantes.js) para que todo el sistema
// funcione en el plan gratuito Spark.

export { db, auth };
