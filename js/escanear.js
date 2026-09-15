import { db } from "./firebase.js";

import {
    collection,
    query,
    where,
    getDocs
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

import {
    obtenerFechaHoy,
    obtenerHorarios,
    obtenerRegistrosDelDia,
    decidirRegistro,
    guardarRegistro,
    formatoHora,
    escapar,
    ETIQUETAS_ESTADO
} from "./asistencia-core.js";

/* ===========================
   PANEL DE ESCANEO (Fase 6, actualizado en Fase 7)
   ---------------------------------------
   La lógica de negocio —qué se registra, cómo se clasifica, qué es un
   reingreso— se movió a js/asistencia-core.js, para que el registro
   manual (Fase 7) aplique exactamente las mismas reglas en vez de
   duplicarlas. Este archivo se ocupa ya solo de la cámara y la
   interfaz.

   Cambio de comportamiento frente a la Fase 6: un estudiante que ya
   tiene entrada Y salida hoy YA NO es rechazado. Se le registra una
   nueva entrada con estado "reingreso", sin volver a evaluar la
   puntualidad. Ver docs/fase7-entradas-salidas.md.
=========================== */

const resultadoDiv = document.getElementById("resultado");
const listaRecientes = document.getElementById("listaRecientes");
const chkSonido = document.getElementById("chkSonido");

let html5QrCode;
let procesando = false;
const historialSesion = [];

// Catálogo único de etiquetas (núcleo Fase 7): antes estaba duplicado
// aquí y no incluía "reingreso" ni "salida pendiente".
const etiquetasEstado = ETIQUETAS_ESTADO;

/* ===========================
   INICIO DEL LECTOR
   Se arranca recién cuando auth-guard confirma la sesión (evita
   pedir permiso de cámara a alguien que igual será redirigido).
=========================== */

document.addEventListener("usuarioListo", iniciarLector);

function iniciarLector() {

    html5QrCode = new Html5Qrcode("reader");

    Html5Qrcode.getCameras().then((camaras) => {

        if (!camaras || camaras.length === 0) {
            mostrarError("No se encontró ninguna cámara en este dispositivo.");
            return;
        }

        const camaraElegida = camaras.find((c) => /back|trasera|rear|posterior/i.test(c.label)) || camaras[0];

        html5QrCode.start(
            camaraElegida.id,
            { fps: 10, qrbox: { width: 250, height: 250 } },
            onEscaneoExitoso,
            () => { /* "no se detectó QR en este frame": se ignora, es normal */ }
        );

    }).catch((error) => {
        console.error(error);
        mostrarError("No se pudo acceder a la cámara. Revisa los permisos del navegador.");
    });

}

/* ===========================
   CALLBACK DE LECTURA
   Se pausa el lector mientras se procesa y se muestra el resultado,
   para no disparar el mismo QR varias veces seguidas, y se reanuda
   solo después de un par de segundos.
=========================== */

async function onEscaneoExitoso(codigoDetectado) {

    if (procesando) return;
    procesando = true;

    try {
        await html5QrCode.pause(true);
    } catch (error) {
        // en algunas cámaras el pause puede fallar si el frame ya cambió; se ignora
    }

    await registrarAsistencia(codigoDetectado.trim());

    setTimeout(() => {
        try {
            html5QrCode.resume();
        } catch (error) {
            console.warn("No se pudo reanudar el escáner automáticamente", error);
        }
        procesando = false;
    }, 2000);

}

/* ===========================
   REGISTRO DE ASISTENCIA
=========================== */

async function registrarAsistencia(codigoQR) {

    try {

        const consultaEstudiante = query(collection(db, "estudiantes"), where("codigoQR", "==", codigoQR));
        const resultado = await getDocs(consultaEstudiante);

        if (resultado.empty) {
            reproducirBeep(false);
            mostrarError("Código QR no reconocido.");
            return;
        }

        const estudianteDoc = resultado.docs[0];
        const estudiante = { id: estudianteDoc.id, ...estudianteDoc.data() };

        if (estudiante.estado !== "activo") {
            reproducirBeep(false);
            mostrarError(`${estudiante.nombres} ${estudiante.apellidos} está desactivado. No se registró asistencia.`);
            return;
        }

        // El turno es el asignado al estudiante (fijo, ver modelo de datos),
        // no se infiere de la hora actual del escaneo.
        const horarios = await obtenerHorarios(estudiante.turno);

        if (!horarios) {
            reproducirBeep(false);
            mostrarError(`No hay horarios configurados para el turno "${estudiante.turno}". Ve a Configuración de horarios.`);
            return;
        }

        const registrosHoy = await obtenerRegistrosDelDia(estudiante.id, obtenerFechaHoy());
        const ahora = new Date();

        // Toda la decisión (entrada / salida / reingreso / rebote /
        // tope diario) vive en el núcleo, compartida con el registro manual.
        const decision = decidirRegistro(registrosHoy, ahora, horarios);

        if (!decision.permitido) {
            reproducirBeep(false);
            mostrarAdvertencia(`${estudiante.nombres} ${estudiante.apellidos}: ${decision.mensaje}`);
            return;
        }

        await guardarRegistro({
            estudiante,
            tipoRegistro: decision.tipoRegistro,
            estado: decision.estado,
            origen: "qr",
            usuario: window.usuarioActual,
            hora: ahora
        });

        reproducirBeep(true);
        mostrarConfirmacion(estudiante, decision, ahora);
        agregarAHistorial(estudiante, decision, ahora);

    } catch (error) {
        console.error(error);
        reproducirBeep(false);
        mostrarError("Ocurrió un error registrando la asistencia. Intenta de nuevo.");
    }

}

/* ===========================
   INTERFAZ: CONFIRMACIÓN Y ERRORES
=========================== */

// Escapado y formato de hora viven en el núcleo: duplicarlos aquí haría
// que el escáner y el registro manual pudieran divergir con el tiempo.
const escaparTexto = escapar;

function mostrarError(mensaje) {
    resultadoDiv.innerHTML = `
        <div class="alert alert-danger mb-0">
            <i class="fa-solid fa-triangle-exclamation"></i> ${escaparTexto(mensaje)}
        </div>
    `;
}

function mostrarAdvertencia(mensaje) {
    resultadoDiv.innerHTML = `
        <div class="alert alert-warning mb-0">
            <i class="fa-solid fa-circle-exclamation"></i> ${escaparTexto(mensaje)}
        </div>
    `;
}

function mostrarConfirmacion(estudiante, decision, hora) {

    const estadoInfo = etiquetasEstado[decision.estado] || etiquetasEstado.sin_registro;

    const titulo = decision.esReingreso
        ? "Reingreso"
        : decision.tipoRegistro === "entrada" ? "Entrada" : "Salida";

    resultadoDiv.innerHTML = `
        <div class="card p-3">
            <div class="d-flex align-items-center gap-3">
                ${estudiante.fotoUrl
                    ? `<img src="${estudiante.fotoUrl}" style="width:64px;height:64px;border-radius:50%;object-fit:cover;">`
                    : `<i class="fa-solid fa-user-graduate fa-2x text-muted"></i>`}
                <div>
                    <h5 class="mb-0">${escaparTexto(estudiante.nombres)} ${escaparTexto(estudiante.apellidos)}</h5>
                    <small class="text-muted">${escaparTexto(estudiante.grado)} "${escaparTexto(estudiante.seccion)}"</small>
                </div>
            </div>
            <hr>
            <div class="d-flex justify-content-between align-items-center">
                <span>${titulo}: <strong>${formatoHora(hora)}</strong></span>
                <span class="estado ${estadoInfo.clase}">${estadoInfo.texto}</span>
            </div>
            ${decision.esReingreso
                ? `<small class="text-muted d-block mt-2">
                     Ya había salido hoy. Se registró una nueva entrada; la
                     puntualidad del día sigue siendo la de su primera entrada.
                   </small>`
                : ""}
        </div>
    `;

}

/* ===========================
   HISTORIAL DE ESTA SESIÓN (solo en memoria, se pierde al recargar)
=========================== */

function agregarAHistorial(estudiante, decision, hora) {

    const estadoInfo = etiquetasEstado[decision.estado] || etiquetasEstado.sin_registro;

    historialSesion.unshift({
        nombre: `${estudiante.nombres} ${estudiante.apellidos}`,
        hora: formatoHora(hora),
        tipoTexto: decision.esReingreso
            ? "Reingreso"
            : decision.tipoRegistro === "entrada" ? "Entrada" : "Salida",
        estadoTexto: estadoInfo.texto,
        estadoClase: estadoInfo.clase
    });

    if (historialSesion.length > 15) historialSesion.pop();

    listaRecientes.innerHTML = historialSesion.map((r) => `
        <tr>
            <td>${escaparTexto(r.nombre)}</td>
            <td>${r.hora}</td>
            <td>${r.tipoTexto}</td>
            <td><span class="estado ${r.estadoClase}">${r.estadoTexto}</span></td>
        </tr>
    `).join("");

}

/* ===========================
   SONIDO (Web Audio API — sin archivos externos que alojar)
=========================== */

function reproducirBeep(exito) {

    if (!chkSonido.checked) return;

    try {
        const contexto = new (window.AudioContext || window.webkitAudioContext)();
        const oscilador = contexto.createOscillator();
        const ganancia = contexto.createGain();
        oscilador.connect(ganancia);
        ganancia.connect(contexto.destination);
        oscilador.type = "sine";
        oscilador.frequency.value = exito ? 880 : 220;
        ganancia.gain.setValueAtTime(0.15, contexto.currentTime);
        oscilador.start();
        oscilador.stop(contexto.currentTime + (exito ? 0.15 : 0.3));
    } catch (error) {
        console.warn("No se pudo reproducir el sonido de confirmación", error);
    }

}
