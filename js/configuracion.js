import { db } from "./firebase.js";

import {
    doc,
    getDoc,
    setDoc
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

import { limpiarCacheHorarios } from "./asistencia-core.js";

/* ===========================
   CONFIGURACIÓN DE HORARIOS
   Un documento por turno en configuracionHorarios/{turno}.
   Lo lee el escáner (Fase 6) para clasificar temprano/puntual/tarde
   sin depender de valores escritos en el código.
=========================== */

const turnos = ["manana", "tarde"];

/* ===========================
   CARGAR VALORES ACTUALES
=========================== */

async function cargarHorario(turno) {

    try {

        const snap = await getDoc(doc(db, "configuracionHorarios", turno));

        if (!snap.exists()) return; // primera vez: se queda vacío hasta que el admin guarde

        const datos = snap.data();

        document.getElementById(`inicioTemprano-${turno}`).value = datos.inicioTemprano || "";
        document.getElementById(`inicioPuntual-${turno}`).value = datos.inicioPuntual || "";
        document.getElementById(`finPuntual-${turno}`).value = datos.finPuntual || "";
        document.getElementById(`horaSalida-${turno}`).value = datos.horaSalida || "";

    } catch (error) {
        console.error(error);
    }

}

turnos.forEach(cargarHorario);

/* ===========================
   GUARDAR
=========================== */

turnos.forEach((turno) => {

    document.getElementById(`form-${turno}`).addEventListener("submit", async (e) => {

        e.preventDefault();

        const mensaje = document.getElementById(`mensaje-${turno}`);
        const boton = e.target.querySelector("button[type=submit]");

        const inicioTemprano = document.getElementById(`inicioTemprano-${turno}`).value;
        const inicioPuntual = document.getElementById(`inicioPuntual-${turno}`).value;
        const finPuntual = document.getElementById(`finPuntual-${turno}`).value;
        const horaSalida = document.getElementById(`horaSalida-${turno}`).value;

        // Validación de coherencia: temprano < puntual < fin puntual
        if (inicioTemprano >= inicioPuntual || inicioPuntual >= finPuntual) {
            mensaje.textContent = "El orden debe ser: inicio temprano < inicio de puntualidad < hora límite de puntualidad.";
            mensaje.className = "alert alert-danger";
            mensaje.classList.remove("d-none");
            return;
        }

        // Fase 11: hasta la Fase 6 la hora de salida solo se guardaba y
        // no se validaba. Desde la Fase 7 decide cuándo una entrada sin
        // salida pasa a ser "salida pendiente", así que una hora de
        // salida anterior al límite de puntualidad marcaría como
        // pendiente a estudiantes que recién están entrando.
        if (!horaSalida || horaSalida <= finPuntual) {
            mensaje.textContent = "La hora de salida debe ser posterior a la hora límite de puntualidad.";
            mensaje.className = "alert alert-danger";
            mensaje.classList.remove("d-none");
            return;
        }

        boton.disabled = true;

        try {

            await setDoc(doc(db, "configuracionHorarios", turno), {
                inicioTemprano,
                inicioPuntual,
                finPuntual,
                horaSalida
            }, { merge: true });

            // El escáner y los reportes cachean los horarios en memoria;
            // sin esto, un cambio no tenía efecto hasta recargar (bug
            // detectado en la Fase 7).
            limpiarCacheHorarios();

            mensaje.textContent = "Horarios guardados correctamente.";
            mensaje.className = "alert alert-success";
            mensaje.classList.remove("d-none");

        } catch (error) {

            console.error(error);
            mensaje.textContent = "No se pudo guardar. Intenta de nuevo.";
            mensaje.className = "alert alert-danger";
            mensaje.classList.remove("d-none");

        } finally {
            boton.disabled = false;
        }

    });

});
