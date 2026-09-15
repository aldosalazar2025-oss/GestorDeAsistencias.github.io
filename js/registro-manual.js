import {
    obtenerFechaHoy,
    obtenerHorarios,
    obtenerRegistrosDelDia,
    obtenerAsistenciasPorFecha,
    obtenerEstudiantesActivos,
    agruparPorEstudiante,
    decidirRegistro,
    guardarRegistro,
    resumirDia,
    clasificarEntrada,
    minutosDeFecha,
    formatoHora,
    aFecha,
    escapar,
    nombreCompleto,
    etiquetaTurno,
    badgeEstado,
    ESTADOS,
    ETIQUETAS_ESTADO
} from "./asistencia-core.js";

/* ===========================================================
   FASE 7 — REGISTRO MANUAL (requisito 19)
   -----------------------------------------------------------
   Alternativa al escáner cuando el QR no se puede leer. Busca al
   estudiante por nombre o DNI en vez de por cámara, pero aplica
   EXACTAMENTE las mismas reglas de negocio: decidirRegistro() y
   guardarRegistro() son las mismas funciones que usa escanear.js.

   Diferencias respecto al escaneo, todas deliberadas:
   - Exige un motivo (queda guardado en el documento).
   - Guarda quién lo registró (registradoPor / registradoPorNombre).
   - Permite ajustar la hora hacia atrás (nunca hacia adelante).
   - Permite FORZAR entrada o salida, saltándose la secuencia
     automática, porque el personal sí puede saber algo que el sistema
     no (por ejemplo: la entrada nunca se escaneó, así que el alumno
     que "entra" ahora en realidad está saliendo).
=========================================================== */

const buscador = document.getElementById("buscarEstudiante");
const resultadosBusqueda = document.getElementById("resultadosBusqueda");
const panelRegistro = document.getElementById("panelRegistro");
const fichaEstudiante = document.getElementById("fichaEstudiante");
const registrosDeHoy = document.getElementById("registrosDeHoy");
const selectTipo = document.getElementById("tipoRegistro");
const ayudaTipo = document.getElementById("ayudaTipo");
const inputHora = document.getElementById("horaRegistro");
const motivoRapido = document.getElementById("motivoRapido");
const motivoTexto = document.getElementById("motivoTexto");
const mensajeRegistro = document.getElementById("mensajeRegistro");
const btnGuardar = document.getElementById("btnGuardarRegistro");
const btnCancelar = document.getElementById("btnCancelar");

const listaPendientes = document.getElementById("listaPendientes");
const filtroTurnoPendientes = document.getElementById("filtroTurnoPendientes");
const btnRecargarPendientes = document.getElementById("btnRecargarPendientes");

let estudiantes = [];
let estudianteSeleccionado = null;
let registrosHoySeleccionado = [];
let horariosSeleccionado = null;

/* ===========================
   CARGA INICIAL
=========================== */

document.addEventListener("usuarioListo", async () => {

    try {
        estudiantes = await obtenerEstudiantesActivos();
    } catch (error) {
        console.error(error);
        resultadosBusqueda.innerHTML = `<p class="text-danger mb-0">No se pudo cargar la lista de estudiantes.</p>`;
    }

    await cargarPendientes();

});

/* ===========================
   BÚSQUEDA POR NOMBRE O DNI
   Se filtra en memoria: Firestore no hace búsqueda parcial de texto, y
   una consulta por prefijo obligaría a un índice por cada campo y aun
   así fallaría con "busca por apellido escribiendo el nombre".
=========================== */

buscador.addEventListener("input", () => {

    const texto = buscador.value.trim().toLowerCase();

    if (texto.length < 2) {
        resultadosBusqueda.innerHTML = `<p class="text-muted mb-0">Escribe al menos 2 caracteres.</p>`;
        return;
    }

    const coincidencias = estudiantes.filter((est) => {
        const completo = `${est.nombres || ""} ${est.apellidos || ""}`.toLowerCase();
        const alReves = `${est.apellidos || ""} ${est.nombres || ""}`.toLowerCase();
        return completo.includes(texto)
            || alReves.includes(texto)
            || (est.dni || "").includes(texto);
    }).slice(0, 12);

    if (coincidencias.length === 0) {
        resultadosBusqueda.innerHTML = `
            <p class="text-muted mb-0">
                Ningún estudiante activo coincide con “${escapar(buscador.value.trim())}”.
            </p>`;
        return;
    }

    resultadosBusqueda.innerHTML = coincidencias.map((est) => `
        <button type="button" class="resultado-estudiante" data-id="${escapar(est.id)}">
            <span>
                <strong>${escapar(est.apellidos)}, ${escapar(est.nombres)}</strong><br>
                <small class="text-muted">
                    DNI ${escapar(est.dni)} · ${escapar(est.grado)} "${escapar(est.seccion)}" ·
                    ${etiquetaTurno(est.turno)}
                </small>
            </span>
            <i class="fa-solid fa-chevron-right"></i>
        </button>
    `).join("");

    resultadosBusqueda.querySelectorAll("[data-id]").forEach((boton) => {
        boton.addEventListener("click", () => seleccionarEstudiante(boton.dataset.id));
    });

});

/* ===========================
   SELECCIÓN Y PREPARACIÓN DEL FORMULARIO
=========================== */

async function seleccionarEstudiante(id, tipoSugerido = "auto", motivoSugerido = "") {

    estudianteSeleccionado = estudiantes.find((e) => e.id === id);
    if (!estudianteSeleccionado) return;

    ocultarMensaje();
    panelRegistro.classList.remove("d-none");

    fichaEstudiante.innerHTML = `
        <div class="d-flex align-items-center gap-3">
            ${estudianteSeleccionado.fotoUrl
                ? `<img src="${escapar(estudianteSeleccionado.fotoUrl)}" class="foto-confirmacion" alt="">`
                : `<i class="fa-solid fa-user-graduate fa-2x text-muted"></i>`}
            <div>
                <h5 class="mb-0">${escapar(nombreCompleto(estudianteSeleccionado))}</h5>
                <small class="text-muted">
                    DNI ${escapar(estudianteSeleccionado.dni)} ·
                    ${escapar(estudianteSeleccionado.grado)} "${escapar(estudianteSeleccionado.seccion)}" ·
                    Turno ${etiquetaTurno(estudianteSeleccionado.turno)}
                </small>
            </div>
        </div>
    `;

    const ahora = new Date();
    inputHora.value = ahora.toTimeString().slice(0, 5);
    selectTipo.value = tipoSugerido;
    motivoRapido.value = motivoSugerido;
    motivoTexto.classList.add("d-none");
    motivoTexto.value = "";

    horariosSeleccionado = await obtenerHorarios(estudianteSeleccionado.turno);
    registrosHoySeleccionado = await obtenerRegistrosDelDia(estudianteSeleccionado.id, obtenerFechaHoy());

    mostrarRegistrosDeHoy();
    actualizarAyudaTipo();

    panelRegistro.scrollIntoView({ behavior: "smooth", block: "nearest" });

}

function mostrarRegistrosDeHoy() {

    if (registrosHoySeleccionado.length === 0) {
        registrosDeHoy.innerHTML = `
            <div class="alert alert-secondary mb-0 py-2">
                Sin registros hoy. El siguiente registro será su <strong>entrada</strong>.
            </div>`;
        return;
    }

    const resumen = resumirDia(registrosHoySeleccionado, horariosSeleccionado, { fecha: obtenerFechaHoy() });

    registrosDeHoy.innerHTML = `
        <div class="table-responsive">
            <table class="table table-sm align-middle mb-2">
                <thead><tr><th>Hora</th><th>Tipo</th><th>Estado</th><th>Origen</th></tr></thead>
                <tbody>
                    ${registrosHoySeleccionado.map((r) => `
                        <tr>
                            <td>${formatoHora(aFecha(r.horaRegistrada))}</td>
                            <td>${r.tipoRegistro === "entrada" ? "Entrada" : "Salida"}</td>
                            <td>${badgeEstado(r.estado)}</td>
                            <td><small class="text-muted">${r.origen === "manual" ? "Manual" : "QR"}</small></td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
        ${resumen.salidaPendiente
            ? `<div class="alert alert-warning py-2 mb-0">
                 <i class="fa-solid fa-door-open"></i> Tiene una
                 <strong>salida pendiente</strong>: entró a las
                 ${formatoHora(resumen.horaEntrada)} y no registró salida.
               </div>`
            : ""}
    `;

}

function actualizarAyudaTipo() {

    if (!horariosSeleccionado) {
        ayudaTipo.textContent = "No hay horarios configurados para este turno; no se puede clasificar la puntualidad.";
        return;
    }

    const decision = decidirRegistro(registrosHoySeleccionado, obtenerHoraElegida(), horariosSeleccionado);

    if (!decision.permitido) {
        ayudaTipo.textContent = decision.mensaje;
        return;
    }

    const etiqueta = ETIQUETAS_ESTADO[decision.estado]?.texto || decision.estado;

    ayudaTipo.textContent = decision.esReingreso
        ? `Se registrará un REINGRESO (ya salió hoy).`
        : `Se registrará ${decision.tipoRegistro === "entrada" ? "una entrada" : "una salida"} · ${etiqueta}`;

}

selectTipo.addEventListener("change", actualizarAyudaTipo);
inputHora.addEventListener("change", actualizarAyudaTipo);

motivoRapido.addEventListener("change", () => {
    const esOtro = motivoRapido.value === "otro";
    motivoTexto.classList.toggle("d-none", !esOtro);
    if (esOtro) motivoTexto.focus();
});

btnCancelar.addEventListener("click", () => {
    panelRegistro.classList.add("d-none");
    estudianteSeleccionado = null;
    buscador.value = "";
    resultadosBusqueda.innerHTML = "";
});

/* ===========================
   HORA ELEGIDA
   Se construye sobre la fecha de hoy. No se permite una hora futura:
   un registro de asistencia describe algo que ya pasó.
=========================== */

function obtenerHoraElegida() {

    const ahora = new Date();
    if (!inputHora.value) return ahora;

    const [h, m] = inputHora.value.split(":").map(Number);
    const elegida = new Date();
    elegida.setHours(h || 0, m || 0, 0, 0);

    return elegida;

}

/* ===========================
   GUARDAR
=========================== */

btnGuardar.addEventListener("click", async () => {

    if (!estudianteSeleccionado) return;

    ocultarMensaje();

    const motivo = motivoRapido.value === "otro"
        ? motivoTexto.value.trim()
        : motivoRapido.value;

    if (!motivo) {
        mostrarMensaje("Indica el motivo del registro manual.", "danger");
        return;
    }

    if (!horariosSeleccionado) {
        mostrarMensaje(
            `No hay horarios configurados para el turno "${estudianteSeleccionado.turno}". ` +
            `Pide al administrador que los defina antes de registrar.`,
            "danger"
        );
        return;
    }

    const hora = obtenerHoraElegida();

    if (hora > new Date()) {
        mostrarMensaje("La hora del registro no puede estar en el futuro.", "danger");
        return;
    }

    // Se relee el día justo antes de guardar: entre la búsqueda y el
    // clic pudo haber pasado un escaneo del mismo estudiante en otro
    // dispositivo.
    registrosHoySeleccionado = await obtenerRegistrosDelDia(estudianteSeleccionado.id, obtenerFechaHoy());

    const decision = decidirRegistro(registrosHoySeleccionado, hora, horariosSeleccionado);
    const forzado = selectTipo.value !== "auto";

    // El antirrebote y el tope diario se respetan incluso al forzar: son
    // protecciones contra duplicados, no una clasificación opinable.
    if (!decision.permitido) {
        mostrarRegistrosDeHoy();
        mostrarMensaje(decision.mensaje, "warning");
        return;
    }

    let tipoRegistro = decision.tipoRegistro;
    let estado = decision.estado;

    if (forzado) {
        tipoRegistro = selectTipo.value;

        if (tipoRegistro === "salida") {
            estado = ESTADOS.SALIDA_REGISTRADA;
        } else {
            const yaTieneEntrada = registrosHoySeleccionado.some((r) => r.tipoRegistro === "entrada");
            estado = yaTieneEntrada
                ? ESTADOS.REINGRESO
                : clasificarEntrada(minutosDeFecha(hora), horariosSeleccionado);
        }
    }

    btnGuardar.disabled = true;

    try {

        await guardarRegistro({
            estudiante: estudianteSeleccionado,
            tipoRegistro,
            estado,
            origen: "manual",
            usuario: window.usuarioActual,
            motivo: forzado ? `${motivo} (tipo forzado a ${tipoRegistro})` : motivo,
            hora
        });

        mostrarMensaje(
            `Registro guardado: ${tipoRegistro} de ${nombreCompleto(estudianteSeleccionado)} ` +
            `a las ${formatoHora(hora)}.`,
            "success"
        );

        registrosHoySeleccionado = await obtenerRegistrosDelDia(estudianteSeleccionado.id, obtenerFechaHoy());
        mostrarRegistrosDeHoy();
        actualizarAyudaTipo();
        await cargarPendientes();

    } catch (error) {
        console.error(error);
        mostrarMensaje("No se pudo guardar el registro. Intenta de nuevo.", "danger");
    } finally {
        btnGuardar.disabled = false;
    }

});

function mostrarMensaje(texto, tipo) {
    mensajeRegistro.textContent = texto;
    mensajeRegistro.className = `alert alert-${tipo} mt-3`;
    mensajeRegistro.classList.remove("d-none");
}

function ocultarMensaje() {
    mensajeRegistro.classList.add("d-none");
}

/* ===========================================================
   SALIDAS PENDIENTES DEL DÍA
   -----------------------------------------------------------
   Aquí "salida pendiente" deja de ser solo un concepto de reporte y se
   vuelve una tarea operativa: la lista de ciclos sin cerrar, con un
   botón para cerrarlos manualmente.

   Importante: cerrar una salida pendiente NO es un arreglo automático.
   Crea un registro de salida manual, con motivo y responsable, igual
   que cualquier otro registro manual. El sistema nunca inventa una
   salida por su cuenta.
=========================================================== */

async function cargarPendientes() {

    listaPendientes.innerHTML = `<p class="text-muted text-center mb-0">Cargando…</p>`;

    try {

        const fecha = obtenerFechaHoy();
        const registros = await obtenerAsistenciasPorFecha(fecha);
        const porEstudiante = agruparPorEstudiante(registros);

        const horarios = {
            manana: await obtenerHorarios("manana"),
            tarde: await obtenerHorarios("tarde")
        };

        const turnoFiltro = filtroTurnoPendientes.value;
        const pendientes = [];

        porEstudiante.forEach((registrosDelDia, estudianteId) => {

            const estudiante = estudiantes.find((e) => e.id === estudianteId);
            if (!estudiante) return;
            if (turnoFiltro && estudiante.turno !== turnoFiltro) return;

            const resumen = resumirDia(registrosDelDia, horarios[estudiante.turno], { fecha });

            if (resumen.salidaPendiente) {
                pendientes.push({ estudiante, resumen });
            }

        });

        if (pendientes.length === 0) {
            listaPendientes.innerHTML = `
                <p class="text-muted text-center mb-0">
                    <i class="fa-solid fa-circle-check"></i>
                    No hay salidas pendientes en este momento.
                </p>`;
            return;
        }

        pendientes.sort((a, b) => (a.resumen.horaEntrada || 0) - (b.resumen.horaEntrada || 0));

        listaPendientes.innerHTML = pendientes.map(({ estudiante, resumen }) => `
            <div class="item-pendiente">
                <div>
                    <strong>${escapar(nombreCompleto(estudiante))}</strong><br>
                    <small class="text-muted">
                        ${escapar(estudiante.grado)} "${escapar(estudiante.seccion)}" ·
                        ${etiquetaTurno(estudiante.turno)} ·
                        Entró ${formatoHora(resumen.horaEntrada)}
                    </small>
                </div>
                <button class="btn btn-sm btn-outline-warning" data-cerrar="${escapar(estudiante.id)}">
                    <i class="fa-solid fa-door-closed"></i> Cerrar
                </button>
            </div>
        `).join("");

        listaPendientes.querySelectorAll("[data-cerrar]").forEach((boton) => {
            boton.addEventListener("click", () => {
                seleccionarEstudiante(boton.dataset.cerrar, "salida", "Cierre de salida pendiente");
            });
        });

    } catch (error) {
        console.error(error);
        listaPendientes.innerHTML = `<p class="text-danger mb-0">No se pudieron cargar las salidas pendientes.</p>`;
    }

}

filtroTurnoPendientes.addEventListener("change", cargarPendientes);
btnRecargarPendientes.addEventListener("click", cargarPendientes);
