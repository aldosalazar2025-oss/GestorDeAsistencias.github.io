import { auth, db } from "./firebase.js";

import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

/* =================================
   PROTEGER LA PÁGINA
   - Si no hay sesión, redirige a login.html
   - Si la página exige un rol (data-rol-requerido="admin"
     en <body>) y el usuario no lo tiene, redirige a index.html
   - Deja disponible window.usuarioActual = { uid, nombre, rol }
     para que otros scripts de la página lo usen
================================= */

onAuthStateChanged(auth, async (usuario) => {

    if (!usuario) {
        window.location.href = "login.html";
        return;
    }

    try {

        const snap = await getDoc(doc(db, "usuarios", usuario.uid));

        if (!snap.exists() || snap.data().activo !== true) {
            await signOut(auth);
            window.location.href = "login.html";
            return;
        }

        const datosUsuario = snap.data();

        window.usuarioActual = {
            uid: usuario.uid,
            nombre: datosUsuario.nombre || usuario.email,
            rol: datosUsuario.rol
        };

        const rolRequerido = document.body.dataset.rolRequerido;

        if (rolRequerido && datosUsuario.rol !== rolRequerido) {
            window.location.href = "index.html";
            return;
        }

        document.dispatchEvent(new CustomEvent("usuarioListo", {
            detail: window.usuarioActual
        }));

    } catch (error) {
        console.error("Error al verificar el usuario:", error);
        await signOut(auth);
        window.location.href = "login.html";
    }

});

/* =================================
   CERRAR SESIÓN
   Se engancha automáticamente a cualquier
   elemento con id="btnLogout"
================================= */

document.addEventListener("DOMContentLoaded", () => {

    const btnLogout = document.getElementById("btnLogout");

    if (btnLogout) {
        btnLogout.addEventListener("click", async () => {
            try {
                await signOut(auth);
                window.location.href = "login.html";
            } catch (error) {
                console.error(error);
                alert("Error al cerrar sesión");
            }
        });
    }

});
