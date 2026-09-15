import { db } from "./firebase.js";

import {
    collection,
    query,
    where,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

import {
    obtenerFechaHoy,
    obtenerHorarios,
    obtenerEstudiantesActivos,
    obtenerAsistenciasPorRango,
    agruparPorEstudiante,
    agruparPorFecha,
    resumirDia,
    rangoDeFechas,
    formatoHora,
    escapar,
    nombreCompleto,
    etiquetaTurno,
    badgeEstado,
    ESTADOS
} from "./asistencia-core.js";

/* ===========================================================
   FASE 8 — DASHBOARD Y ESTADÍSTICAS
   -----------------------------------------------------------
   Tres bloques que comparten la misma fuente de datos:
     1. Tarjetas del día
     2. Gráficos (Chart.js)
     3. Tabla de asistencia con filtros (requisito 13)

   Todo se calcula con resumirDia() del núcleo de la Fase 7, así que el
   "ausente" y la "salida pendiente" que se ven aquí significan
   exactamente lo mismo que en los reportes de la Fase 9.

   Nota sobre "ausente" en esta pantalla: es una foto del momento. A
   primera hora del turno casi todos figuran ausentes simplemente
   porque todavía no han llegado. El cálculo formal de ausencias,
   contra los días esperados, es cosa de los reportes (Fase 9).
=========================================================== */

/* ===========================
   ELEMENTOS
=========================== */

const filtroFecha = document.getElementById("filtroFecha");
const filtroTurno = document.getElementById("filtroTurno");
const filtroGrado = document.getElementById("filtroGrado");
const filtroSeccion = document.getElementById("filtroSeccion");
const filtroEstado = document.getElementById("filtroEstado");
const filtroEstudiante = document.getElementById("filtroEstudiante");
const tablaAsistencia = document.getElementById("tablaAsistencia");
const contadorTabla = document.getElementById("contadorTabla");

/* ===========================
   ESTADO EN MEMORIA
=========================== */

let estudiantes = [];
let registrosDelDia = [];
let horarios = { manana: null, tarde: null };
let cancelarEscucha = null;
const graficos = {};

/* ===========================
   PALETA (la misma de estilos.css)
=========================== */

const COLORES = {
    verde: "#2be392",
    ambar: "#ffb020",
    coral: "#ff5470",
    azul: "#4da3ff",
    cian: "#20e3d2",
    violeta: "#8b6bff",
    gris: "#7480a0"
};

/* ===========================
   ARRANQUE
=========================== */

document.addEventListener("usuarioListo", async (evento) => {

    document.getElementById("nombreUsuario").textContent =
        `${evento.detail.nombre} (${evento.detail.rol === "admin" ? "Administrador" : "Personal de asistencia"})`;

    // El escáner, el registro manual y los reportes los usan ambos roles.
    document.getElementById("linkEscanear").classList.remove("d-none");
    document.getElementById("linkManual").classList.remove("d-none");
    document.getElementById("linkReportes").classList.remove("d-none");

    if (evento.detail.rol === "admin") {
        document.getElementById("linkUsuarios").classList.remove("d-none");
        document.getElementById("linkEstudiantes").classList.remove("d-none");
        document.getElementById("linkConfiguracion").classList.remove("d-none");
    }

    configurarChartJs();

    filtroFecha.value = obtenerFechaHoy();
    filtroFecha.max = obtenerFechaHoy(); // no se puede consultar el futuro

    try {

        estudiantes = await obtenerEstudiantesActivos();
        horarios.manana = await obtenerHorarios("manana");
        horarios.tarde = await obtenerHorarios("tarde");

        llenarFiltrosDeCatalogo();
        escucharFecha(filtroFecha.value);
        await dibujarGraficosHistoricos();

    } catch (error) {
        console.error(error);
        tablaAsistencia.innerHTML = `
            <tr><td colspan="7" class="text-center text-danger">
                No se pudieron cargar los datos del panel.
            </td></tr>`;
    }

});

/* ===========================
   FILTROS
=========================== */

function llenarFiltrosDeCatalogo() {

    const grados = [...new Set(estudiantes.map((e) => e.grado).filter(Boolean))].sort();
    const secciones = [...new Set(estudiantes.map((e) => e.seccion).filter(Boolean))].sort();

    filtroGrado.innerHTML = `<option value="">Todos</option>` +
        grados.map((g) => `<option value="${escapar(g)}">${escapar(g)}</option>`).join("");

    filtroSeccion.innerHTML = `<option value="">Todas</option>` +
        secciones.map((s) => `<option value="${escapar(s)}">${escapar(s)}</option>`).join("");

}

[filtroTurno, filtroGrado, filtroSeccion, filtroEstado].forEach((el) => {
    el.addEventListener("change", refrescarVista);
});

filtroEstudiante.addEventListener("input", refrescarVista);

filtroFecha.addEventListener("change", async () => {
    escucharFecha(filtroFecha.value);
    await dibujarGraficosHistoricos();
});

/* ===========================
   ESCUCHA EN TIEMPO REAL
   Un solo listener sobre la fecha seleccionada. Los filtros de
   grado/sección/turno/estado se aplican en memoria: filtrarlos en la
   consulta obligaría a un índice compuesto por cada combinación y a
   recrear el listener en cada cambio de filtro.
=========================== */

function escucharFecha(fecha) {

    if (cancelarEscucha) cancelarEscucha();

    const consulta = query(collection(db, "asistencias"), where("fecha", "==", fecha));

    cancelarEscucha = onSnapshot(consulta, (snapshot) => {

        registrosDelDia = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        refrescarVista();

    }, (error) => {
        console.error(error);
        tablaAsistencia.innerHTML = `
            <tr><td colspan="7" class="text-center text-danger">
                Se perdió la conexión en tiempo real. Recarga la página.
            </td></tr>`;
    });

}

/* ===========================
   CÁLCULO CENTRAL
   Devuelve una fila por estudiante que pasa los filtros de catálogo,
   con su resumen del día ya calculado.
=========================== */

function construirFilas() {

    const fecha = filtroFecha.value || obtenerFechaHoy();
    const texto = filtroEstudiante.value.trim().toLowerCase();

    const porEstudiante = agruparPorEstudiante(registrosDelDia);

    return estudiantes
        .filter((est) => {
            if (filtroTurno.value && est.turno !== filtroTurno.value) return false;
            if (filtroGrado.value && est.grado !== filtroGrado.value) return false;
            if (filtroSeccion.value && est.seccion !== filtroSeccion.value) return false;

            if (texto) {
                const completo = `${est.nombres || ""} ${est.apellidos || ""}`.toLowerCase();
                const alReves = `${est.apellidos || ""} ${est.nombres || ""}`.toLowerCase();
                if (!completo.includes(texto) && !alReves.includes(texto) && !(est.dni || "").includes(texto)) {
                    return false;
                }
            }

            return true;
        })
        .map((est) => ({
            estudiante: est,
            resumen: resumirDia(porEstudiante.get(est.id) || [], horarios[est.turno], { fecha })
        }))
        .sort((a, b) =>
            `${a.estudiante.apellidos} ${a.estudiante.nombres}`
                .localeCompare(`${b.estudiante.apellidos} ${b.estudiante.nombres}`, "es")
        );

}

function calcularMetricas(filas) {

    const metricas = {
        total: filas.length,
        presentes: 0,
        ausentes: 0,
        puntuales: 0,
        tardanzas: 0,
        tempranas: 0,
        salidas: 0,
        pendientes: 0,
        reingresos: 0
    };

    filas.forEach(({ resumen }) => {

        if (!resumen.presente) {
            metricas.ausentes++;
            return;
        }

        metricas.presentes++;

        if (resumen.estadoEntrada === ESTADOS.PUNTUAL) metricas.puntuales++;
        if (resumen.estadoEntrada === ESTADOS.TARDE) metricas.tardanzas++;
        if (resumen.estadoEntrada === ESTADOS.TEMPRANO) metricas.tempranas++;

        if (resumen.horaSalida) metricas.salidas++;
        if (resumen.salidaPendiente) metricas.pendientes++;

        metricas.reingresos += resumen.reingresos;

    });

    return metricas;

}

/* ===========================
   REFRESCO DE LA VISTA
=========================== */

function refrescarVista() {

    const filas = construirFilas();
    const metricas = calcularMetricas(filas);

    pintarTarjetas(metricas);
    dibujarGraficosDelDia(metricas, filas);

    // El filtro de estado se aplica solo a la tabla: las tarjetas y los
    // gráficos deben seguir mostrando el total del grupo, si no,
    // filtrar por "tarde" haría que el 100% aparezca como tardanza.
    const filasTabla = filtroEstado.value
        ? filas.filter(({ resumen }) => coincideEstado(resumen, filtroEstado.value))
        : filas;

    pintarTabla(filasTabla);
    contadorTabla.textContent = `· ${filasTabla.length} de ${filas.length} estudiantes`;

}

function coincideEstado(resumen, estadoBuscado) {

    if (estadoBuscado === ESTADOS.AUSENTE) return !resumen.presente;
    if (estadoBuscado === ESTADOS.SALIDA_PENDIENTE) return resumen.salidaPendiente;

    return resumen.presente && resumen.estadoEntrada === estadoBuscado;

}

function pintarTarjetas(m) {
    document.getElementById("mTotal").textContent = m.total;
    document.getElementById("mPresentes").textContent = m.presentes;
    document.getElementById("mAusentes").textContent = m.ausentes;
    document.getElementById("mPuntuales").textContent = m.puntuales;
    document.getElementById("mTardanzas").textContent = m.tardanzas;
    document.getElementById("mTempranas").textContent = m.tempranas;
    document.getElementById("mSalidas").textContent = m.salidas;
    document.getElementById("mPendientes").textContent = m.pendientes;
}

function pintarTabla(filas) {

    if (filas.length === 0) {
        tablaAsistencia.innerHTML = `
            <tr><td colspan="7" class="text-center text-muted">
                Ningún estudiante coincide con los filtros.
            </td></tr>`;
        return;
    }

    tablaAsistencia.innerHTML = filas.map(({ estudiante, resumen }) => {

        const hayManual = resumen.registros.some((r) => r.origen === "manual");

        return `
            <tr>
                <td>
                    <strong>${escapar(nombreCompleto(estudiante))}</strong><br>
                    <small class="text-muted">${escapar(estudiante.dni)}</small>
                </td>
                <td>${escapar(estudiante.grado)} "${escapar(estudiante.seccion)}"</td>
                <td>${etiquetaTurno(estudiante.turno)}</td>
                <td>${formatoHora(resumen.horaEntrada)}</td>
                <td>${formatoHora(resumen.horaSalida)}</td>
                <td>
                    ${badgeEstado(resumen.estadoResumen || "sin_registro")}
                    ${hayManual ? `<span class="origen-manual ms-1">MANUAL</span>` : ""}
                </td>
                <td>
                    ${resumen.totalRegistros}
                    ${resumen.reingresos > 0
                        ? `<small class="text-muted">(${resumen.reingresos} reingreso${resumen.reingresos > 1 ? "s" : ""})</small>`
                        : ""}
                </td>
            </tr>
        `;

    }).join("");

}

/* ===========================
   CHART.JS
=========================== */

function configurarChartJs() {

    Chart.defaults.color = "#aab3cc";
    Chart.defaults.borderColor = "rgba(120,160,255,.14)";
    Chart.defaults.font.family = "'JetBrains Mono', monospace";
    Chart.defaults.font.size = 11;
    Chart.defaults.plugins.legend.labels.boxWidth = 12;

}

function pintarGrafico(id, configuracion) {

    const canvas = document.getElementById(id);
    if (!canvas) return;

    // Chart.js no reutiliza un canvas ya ocupado: hay que destruir la
    // instancia anterior o el gráfico queda "fantasma" al refiltrar.
    if (graficos[id]) graficos[id].destroy();

    graficos[id] = new Chart(canvas, configuracion);

}

const opcionesDona = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: "bottom" } },
    cutout: "58%"
};

function dibujarGraficosDelDia(m, filas) {

    // 1. Puntualidad vs. tardanzas
    pintarGrafico("graficoPuntualidad", {
        type: "doughnut",
        data: {
            labels: ["Temprano", "Puntual", "Tarde"],
            datasets: [{
                data: [m.tempranas, m.puntuales, m.tardanzas],
                backgroundColor: [COLORES.azul, COLORES.verde, COLORES.ambar],
                borderWidth: 0
            }]
        },
        options: opcionesDona
    });

    // 2. Presentes vs. ausentes
    pintarGrafico("graficoPresencia", {
        type: "doughnut",
        data: {
            labels: ["Presentes", "Ausentes"],
            datasets: [{
                data: [m.presentes, m.ausentes],
                backgroundColor: [COLORES.verde, COLORES.coral],
                borderWidth: 0
            }]
        },
        options: opcionesDona
    });

    // 3. Comparación mañana / tarde
    const porTurno = {
        manana: calcularMetricas(filas.filter(({ estudiante }) => estudiante.turno === "manana")),
        tarde: calcularMetricas(filas.filter(({ estudiante }) => estudiante.turno === "tarde"))
    };

    pintarGrafico("graficoTurnos", {
        type: "bar",
        data: {
            labels: ["Puntuales", "Tardanzas", "Ausentes"],
            datasets: [
                {
                    label: "Mañana",
                    data: [porTurno.manana.puntuales, porTurno.manana.tardanzas, porTurno.manana.ausentes],
                    backgroundColor: COLORES.cian
                },
                {
                    label: "Tarde",
                    data: [porTurno.tarde.puntuales, porTurno.tarde.tardanzas, porTurno.tarde.ausentes],
                    backgroundColor: COLORES.violeta
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: "bottom" } },
            scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
        }
    });

}

/* ===========================
   GRÁFICOS HISTÓRICOS
   Una sola consulta por rango, no una por día. Se recalcula al cambiar
   la fecha, no en cada cambio de filtro: son datos que no dependen del
   filtro de estado ni del buscador.
=========================== */

async function dibujarGraficosHistoricos() {

    const hasta = filtroFecha.value || obtenerFechaHoy();
    const desdeFecha = new Date(`${hasta}T00:00:00`);
    desdeFecha.setDate(desdeFecha.getDate() - 20);
    const desde = desdeFecha.toLocaleDateString("en-CA");

    try {

        const registros = await obtenerAsistenciasPorRango(desde, hasta);
        const porFecha = agruparPorFecha(registros);

        // Días lectivos = días con al menos un registro en toda la
        // institución. Un feriado o un domingo no tiene ninguno, así que
        // se descarta solo, sin necesidad de un calendario escolar.
        const diasLectivos = rangoDeFechas(desde, hasta)
            .filter((f) => (porFecha.get(f) || []).length > 0);

        const serie = diasLectivos.map((fecha) => {

            const porEstudiante = agruparPorEstudiante(porFecha.get(fecha) || []);
            let presentes = 0;
            let tardanzas = 0;
            let universo = 0;

            estudiantes.forEach((est) => {

                if (filtroTurno.value && est.turno !== filtroTurno.value) return;
                if (filtroGrado.value && est.grado !== filtroGrado.value) return;
                if (filtroSeccion.value && est.seccion !== filtroSeccion.value) return;

                universo++;

                const resumen = resumirDia(porEstudiante.get(est.id) || [], horarios[est.turno], { fecha });
                if (resumen.presente) presentes++;
                if (resumen.estadoEntrada === ESTADOS.TARDE) tardanzas++;

            });

            return {
                fecha,
                etiqueta: fecha.slice(5), // "MM-DD"
                presentes,
                tardanzas,
                porcentaje: universo > 0 ? Math.round((presentes / universo) * 100) : 0
            };

        });

        const ultimos7 = serie.slice(-7);

        // 4. Asistencia por día
        pintarGrafico("graficoPorDia", {
            type: "bar",
            data: {
                labels: ultimos7.map((d) => d.etiqueta),
                datasets: [
                    { label: "Presentes", data: ultimos7.map((d) => d.presentes), backgroundColor: COLORES.verde },
                    { label: "Tardanzas", data: ultimos7.map((d) => d.tardanzas), backgroundColor: COLORES.ambar }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: "bottom" } },
                scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
            }
        });

        // 5. Tendencia del porcentaje de asistencia
        pintarGrafico("graficoTendencia", {
            type: "line",
            data: {
                labels: serie.map((d) => d.etiqueta),
                datasets: [{
                    label: "% de asistencia",
                    data: serie.map((d) => d.porcentaje),
                    borderColor: COLORES.cian,
                    backgroundColor: "rgba(32,227,210,.15)",
                    fill: true,
                    tension: .3,
                    pointRadius: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, max: 100, ticks: { callback: (v) => `${v}%` } } }
            }
        });

    } catch (error) {
        console.error("No se pudieron calcular los gráficos históricos", error);
    }

}
