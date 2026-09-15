import { auth, db } from "./firebase.js";

import {
    initializeApp,
    deleteApp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";

import {
    getAuth,
    createUserWithEmailAndPassword,
    signOut as signOutSecundario
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
    collection,
    doc,
    setDoc,
    updateDoc,
    onSnapshot,
    Timestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

// La configuración de Firebase la reutilizamos desde firebase.js
// mediante la propiedad .options de la app ya inicializada.
import { getApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";

const formUsuario = document.getElementById("formUsuario");
const tablaUsuarios = document.getElementById("tablaUsuarios");
const mensajeUsuario = document.getElementById("mensajeUsuario");

/* =================================
   CREAR USUARIO SIN CERRAR LA SESIÓN
   DEL ADMINISTRADOR
   ---------------------------------
   Firebase Auth, al crear un usuario en el cliente,
   inicia sesión automáticamente como ese usuario nuevo.
   Para evitar que esto saque al admin de su sesión,
   usamos una segunda instancia temporal de la app.
================================= */

async function crearUsuarioSinPerderSesion(email, password) {

    const appPrincipal = getApp();
    const appSecundaria = initializeApp(appPrincipal.options, "secundaria-" + Date.now());
    const authSecundaria = getAuth(appSecundaria);

    try {

        const credencial = await createUserWithEmailAndPassword(authSecundaria, email, password);
        await signOutSecundario(authSecundaria);
        return credencial.user.uid;

    } finally {

        await deleteApp(appSecundaria);

    }

}

/* =================================
   ALTA DE USUARIO
================================= */

formUsuario.addEventListener("submit", async (e) => {

    e.preventDefault();
    ocultarMensaje();

    const nombre = document.getElementById("nombre").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const rol = document.getElementById("rol").value;

    if (password.length < 6) {
        mostrarMensaje("La contraseña temporal debe tener al menos 6 caracteres", "danger");
        return;
    }

    try {

        const uid = await crearUsuarioSinPerderSesion(email, password);

        await setDoc(doc(db, "usuarios", uid), {
            nombre,
            email,
            rol,
            activo: true,
            fechaRegistro: Timestamp.now()
        });

        mostrarMensaje(`Usuario "${nombre}" creado correctamente`, "success");
        formUsuario.reset();

    } catch (error) {

        console.error(error);

        const mensajes = {
            "auth/email-already-in-use": "Ese correo ya está registrado",
            "auth/invalid-email": "El correo no es válido",
            "auth/weak-password": "La contraseña es demasiado débil"
        };

        mostrarMensaje(
            mensajes[error.code] || "No se pudo crear el usuario",
            "danger"
        );

    }

});

/* =================================
   LISTADO DE USUARIOS EN TIEMPO REAL
================================= */

const usuariosRef = collection(db, "usuarios");

onSnapshot(usuariosRef, (snapshot) => {

    if (snapshot.empty) {
        tablaUsuarios.innerHTML = `<tr><td colspan="4" class="text-center">Sin usuarios registrados</td></tr>`;
        return;
    }

    tablaUsuarios.innerHTML = snapshot.docs.map((documento) => {

        const u = documento.data();

        return `
            <tr>
                <td>${escapar(u.nombre)}</td>
                <td>${escapar(u.email)}</td>
                <td>${u.rol === "admin" ? "Administrador" : "Personal de asistencia"}</td>
                <td>
                    <button
                        class="btn btn-sm ${u.activo ? "btn-outline-danger" : "btn-outline-success"}"
                        data-uid="${documento.id}"
                        data-activo="${u.activo}">
                        ${u.activo ? "Desactivar" : "Activar"}
                    </button>
                </td>
            </tr>
        `;

    }).join("");

});

/* =================================
   ACTIVAR / DESACTIVAR USUARIO
   (nunca se elimina, para no perder
   el historial de quién hizo qué)
================================= */

tablaUsuarios.addEventListener("click", async (e) => {

    const boton = e.target.closest("button[data-uid]");
    if (!boton) return;

    const uid = boton.dataset.uid;
    const activoActual = boton.dataset.activo === "true";

    try {
        await updateDoc(doc(db, "usuarios", uid), { activo: !activoActual });
    } catch (error) {
        console.error(error);
        alert("No se pudo actualizar el estado del usuario");
    }

});

function escapar(texto) {
    const div = document.createElement("div");
    div.textContent = texto ?? "";
    return div.innerHTML;
}

function mostrarMensaje(texto, tipo) {
    mensajeUsuario.textContent = texto;
    mensajeUsuario.className = `alert alert-${tipo}`;
    mensajeUsuario.classList.remove("d-none");
}

function ocultarMensaje() {
    mensajeUsuario.classList.add("d-none");
}
