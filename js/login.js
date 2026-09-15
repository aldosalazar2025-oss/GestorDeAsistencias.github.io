import { auth, db } from "./firebase.js";

import {
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const formLogin = document.getElementById("formLogin");
const mensajeError = document.getElementById("mensajeError");

/* =================================
   SI YA HAY SESIÓN VÁLIDA, SALTAR LOGIN
================================= */

onAuthStateChanged(auth, async (usuario) => {

    if (usuario) {
        const esValido = await verificarUsuarioActivo(usuario.uid);
        if (esValido) {
            window.location.href = "index.html";
        }
    }

});

/* =================================
   VERIFICAR QUE EL USUARIO EXISTE
   EN /usuarios Y ESTÁ ACTIVO
   (el rol vive en Firestore, no en Auth)
================================= */

async function verificarUsuarioActivo(uid) {

    try {

        const referencia = doc(db, "usuarios", uid);
        const snap = await getDoc(referencia);

        if (!snap.exists() || snap.data().activo !== true) {
            await signOut(auth);
            mostrarError(
                "Tu cuenta no está habilitada. Contacta a un administrador."
            );
            return false;
        }

        return true;

    } catch (error) {
        console.error(error);
        await signOut(auth);
        mostrarError("No se pudo verificar tu cuenta. Intenta de nuevo.");
        return false;
    }

}

/* =================================
   INICIAR SESIÓN
================================= */

formLogin.addEventListener("submit", async (e) => {

    e.preventDefault();
    ocultarError();

    const correo = document.getElementById("correo").value.trim();
    const password = document.getElementById("password").value;

    try {

        const credencial = await signInWithEmailAndPassword(auth, correo, password);
        const esValido = await verificarUsuarioActivo(credencial.user.uid);

        if (esValido) {
            window.location.href = "index.html";
        }

    } catch (error) {

        console.error(error);
        mostrarError("Correo o contraseña incorrectos");

    }

});

function mostrarError(mensaje) {
    mensajeError.textContent = mensaje;
    mensajeError.classList.remove("d-none");
}

function ocultarError() {
    mensajeError.classList.add("d-none");
}
