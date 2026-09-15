import {
    obtenerFechaHoy,
    obtenerHorarios,
    obtenerEstudiantesActivos,
    obtenerAsistenciasPorRango,
    agruparPorEstudiante,
    agruparPorFecha,
    resumirDia,
    rangoDeFechas,
    aFecha,
    formatoHora,
    escapar,
    nombreCompleto,
    etiquetaTurno,
    badgeEstado,
    ESTADOS
} from "./asistencia-core.js";

/* ===========================================================
   FASE 9 — REPORTES INDIVIDUALES Y GENERALES
   -----------------------------------------------------------
   Aquí es donde "ausente" y "salida pendiente" se calculan de verdad:
   comparando lo registrado contra los DÍAS ESPERADOS del periodo, no
   durante el escaneo.

   Los resultados se exponen en window.informeIndividualActual y
   window.reporteGeneralActual para que js/reportes-excel.js (Fase 10)
   exporte exactamente lo que el usuario está viendo, sin recalcular ni
   volver a consultar Firestore — el mismo patrón que ya se usó con
   window.listaEstudiantesFiltrados en las fases 4 y 5.
=========================================================== */

let estudiantes = [];
let horarios = { manana: null, tarde: null };
let estudianteIndividual = null;

/* ===========================
   ARRANQUE
=========================== */

document.addEventListener("usuarioListo", async () => {

    const hoy = obtenerFechaHoy();

    document.getElementById("hastaIndividual").value = hoy;
    document.getElementById("desdeIndividual").value = primerDiaDelMes(hoy);
    document.getElementById("desdeGeneral").value = hoy;
    document.getElementById("hastaGeneral").value = hoy;

    ["hastaIndividual", "desdeIndividual", "desdeGeneral", "hastaGeneral"].forEach((id) => {
        document.getElementById(id).max = hoy;
    });

    try {
        estudiantes = await obtenerEstudiantesActivos();
        horarios.manana = await obtenerHorarios("manana");
        horarios.tarde = await obtenerHorarios("tarde");
        llenarCatalogos();
        aplicarTipoPeriodo();
    } catch (error) {
        console.error(error);
        alert("No se pudieron cargar los datos base de los reportes.");
    }

});

function primerDiaDelMes(fecha) {
    return `${fecha.slice(0, 7)}-01`;
}

function llenarCatalogos() {

    const grados = [...new Set(estudiantes.map((e) => e.grado).filter(Boolean))].sort();
    const secciones = [...new Set(estudiantes.map((e) => e.seccion).filter(Boolean))].sort();

    document.getElementById("gradoGeneral").innerHTML = `<option value="">Todos</option>` +
        grados.map((g) => `<option value="${escapar(g)}">${escapar(g)}</option>`).join("");

    document.getElementById("seccionGeneral").innerHTML = `<option value="">Todas</option>` +
        secciones.map((s) => `<option value="${escapar(s)}">${escapar(s)}</option>`).join("");

}

/* ===========================================================
   DÍAS ESPERADOS
   -----------------------------------------------------------
   Un estudiante no puede estar "ausente" un domingo, ni un feriado, ni
   antes de estar matriculado. Sin esto, el porcentaje de asistencia
   sería siempre falso hacia abajo.

   Día esperado para un estudiante = día dentro del rango que cumple:
     a) hay al menos un registro de asistencia de ALGÚN estudiante de
        SU MISMO TURNO ese día — prueba de que hubo jornada para ese
        turno (un feriado, un domingo o una suspensión de clases no
        deja ningún registro y se descarta solo, sin obligar a nadie a
        mantener un calendario escolar);
     b) es igual o posterior a su fecha de registro en el sistema.

   El costo de esta regla es conocido y se documenta: si un día hubo
   clases pero NADIE escaneó (se cayó el sistema toda la jornada), ese
   día no cuenta como esperado y las ausencias de ese día no se ven.
   Se prefiere ese error al contrario — marcar ausente a media
   institución por una falla técnica.
=========================================================== */

function calcularDiasLectivosPorTurno(registros, desde, hasta) {

    const porFecha = agruparPorFecha(registros);
    const porTurno = { manana: new Set(), tarde: new Set() };

    rangoDeFechas(desde, hasta).forEach((fecha) => {
        (porFecha.get(fecha) || []).forEach((r) => {
            if (porTurno[r.turno]) porTurno[r.turno].add(fecha);
        });
    });

    return porTurno;

}

function diasEsperadosDe(estudiante, diasLectivosPorTurno) {

    const dias = [...(diasLectivosPorTurno[estudiante.turno] || [])];
    const alta = aFecha(estudiante.fechaRegistro);

    if (!alta) return dias.sort();

    const fechaAlta = alta.toLocaleDateString("en-CA");

    return dias.filter((f) => f >= fechaAlta).sort();

}

/* ===========================
   RESUMEN DE UN ESTUDIANTE EN UN PERIODO
=========================== */

function resumirPeriodo(estudiante, registrosDelEstudiante, diasEsperados) {

    const porFecha = agruparPorFecha(registrosDelEstudiante);

    const detalle = diasEsperados.map((fecha) => {
        const resumen = resumirDia(porFecha.get(fecha) || [], horarios[estudiante.turno], { fecha });
        return { fecha, ...resumen };
    });

    const totales = {
        diasEsperados: diasEsperados.length,
        presentes: 0,
        ausentes: 0,
        puntuales: 0,
        tardanzas: 0,
        tempranas: 0,
        salidasRegistradas: 0,
        salidasPendientes: 0,
        reingresos: 0,
        registrosManuales: 0
    };

    detalle.forEach((dia) => {

        if (!dia.presente) {
            totales.ausentes++;
            return;
        }

        totales.presentes++;

        if (dia.estadoEntrada === ESTADOS.PUNTUAL) totales.puntuales++;
        if (dia.estadoEntrada === ESTADOS.TARDE) totales.tardanzas++;
        if (dia.estadoEntrada === ESTADOS.TEMPRANO) totales.tempranas++;

        if (dia.horaSalida) totales.salidasRegistradas++;
        if (dia.salidaPendiente) totales.salidasPendientes++;

        totales.reingresos += dia.reingresos;
        totales.registrosManuales += dia.registros.filter((r) => r.origen === "manual").length;

    });

    totales.porcentajeAsistencia = totales.diasEsperados > 0
        ? Math.round((totales.presentes / totales.diasEsperados) * 1000) / 10
        : 0;

    return { estudiante, detalle, totales };

}

/* ===========================================================
   INFORME INDIVIDUAL
=========================================================== */

const buscarIndividual = document.getElementById("buscarIndividual");
const resultadosIndividual = document.getElementById("resultadosIndividual");
const estudianteElegido = document.getElementById("estudianteElegido");
const btnGenerarIndividual = document.getElementById("btnGenerarIndividual");
const resultadoIndividual = document.getElementById("resultadoIndividual");

buscarIndividual.addEventListener("input", () => {

    const texto = buscarIndividual.value.trim().toLowerCase();

    if (texto.length < 2) {
        resultadosIndividual.innerHTML = "";
        return;
    }

    const coincidencias = estudiantes.filter((est) => {
        const completo = `${est.nombres || ""} ${est.apellidos || ""}`.toLowerCase();
        const alReves = `${est.apellidos || ""} ${est.nombres || ""}`.toLowerCase();
        return completo.includes(texto) || alReves.includes(texto) || (est.dni || "").includes(texto);
    }).slice(0, 8);

    resultadosIndividual.innerHTML = coincidencias.map((est) => `
        <button type="button" class="resultado-estudiante" data-id="${escapar(est.id)}">
            <span>
                <strong>${escapar(est.apellidos)}, ${escapar(est.nombres)}</strong><br>
                <small class="text-muted">
                    ${escapar(est.grado)} "${escapar(est.seccion)}" · ${etiquetaTurno(est.turno)}
                </small>
            </span>
            <i class="fa-solid fa-chevron-right"></i>
        </button>
    `).join("");

    resultadosIndividual.querySelectorAll("[data-id]").forEach((boton) => {
        boton.addEventListener("click", () => {
            estudianteIndividual = estudiantes.find((e) => e.id === boton.dataset.id);
            estudianteElegido.innerHTML = `
                Seleccionado: <strong>${escapar(nombreCompleto(estudianteIndividual))}</strong>
                (${escapar(estudianteIndividual.grado)} "${escapar(estudianteIndividual.seccion)}",
                ${etiquetaTurno(estudianteIndividual.turno)})`;
            btnGenerarIndividual.disabled = false;
            resultadosIndividual.innerHTML = "";
            buscarIndividual.value = "";
        });
    });

});

btnGenerarIndividual.addEventListener("click", async () => {

    if (!estudianteIndividual) return;

    const desde = document.getElementById("desdeIndividual").value;
    const hasta = document.getElementById("hastaIndividual").value;

    if (!desde || !hasta || desde > hasta) {
        alert("Revisa el rango de fechas: la fecha inicial no puede ser posterior a la final.");
        return;
    }

    btnGenerarIndividual.disabled = true;
    resultadoIndividual.innerHTML = `<p class="text-muted">Calculando…</p>`;

    try {

        const registros = await obtenerAsistenciasPorRango(desde, hasta);
        const diasLectivos = calcularDiasLectivosPorTurno(registros, desde, hasta);
        const diasEsperados = diasEsperadosDe(estudianteIndividual, diasLectivos);

        const porEstudiante = agruparPorEstudiante(registros);
        const informe = resumirPeriodo(
            estudianteIndividual,
            porEstudiante.get(estudianteIndividual.id) || [],
            diasEsperados
        );

        informe.periodo = { desde, hasta };

        // Para la Fase 10 (exportación a Excel)
        window.informeIndividualActual = informe;

        pintarInformeIndividual(informe);

    } catch (error) {
        console.error(error);
        resultadoIndividual.innerHTML = `<div class="alert alert-danger">No se pudo generar el informe.</div>`;
    } finally {
        btnGenerarIndividual.disabled = false;
    }

});

function pintarInformeIndividual({ estudiante, detalle, totales, periodo }) {

    if (totales.diasEsperados === 0) {
        resultadoIndividual.innerHTML = `
            <div class="alert alert-warning">
                No hubo días con asistencia registrada para el turno
                ${etiquetaTurno(estudiante.turno)} entre ${periodo.desde} y ${periodo.hasta},
                así que no hay días esperados contra los cuales comparar.
            </div>`;
        return;
    }

    resultadoIndividual.innerHTML = `
        <div class="tabla">

            <h3><i class="fa-solid fa-user"></i> ${escapar(nombreCompleto(estudiante))}</h3>
            <p class="text-muted">
                DNI ${escapar(estudiante.dni)} ·
                ${escapar(estudiante.grado)} "${escapar(estudiante.seccion)}" ·
                Turno ${etiquetaTurno(estudiante.turno)} ·
                Periodo ${periodo.desde} → ${periodo.hasta}
            </p>

            <div class="fila-resumen">
                ${dato(totales.diasEsperados, "Días esperados")}
                ${dato(totales.presentes, "Días presentes")}
                ${dato(totales.ausentes, "Días ausentes")}
                ${dato(totales.puntuales, "Puntuales")}
                ${dato(totales.tardanzas, "Tardanzas")}
                ${dato(totales.tempranas, "Tempranas")}
                ${dato(`${totales.porcentajeAsistencia}%`, "% asistencia")}
                ${dato(totales.salidasPendientes, "Salidas pendientes")}
            </div>

            <button class="btn btn-outline-success btn-sm mb-3" id="btnExportarIndividual">
                <i class="fa-solid fa-file-excel"></i> Exportar a Excel
            </button>

            <div class="table-responsive">
                <table class="table align-middle">
                    <thead>
                        <tr>
                            <th>Fecha</th>
                            <th>Entrada</th>
                            <th>Salida</th>
                            <th>Estado</th>
                            <th>Registros</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${detalle.map((dia) => `
                            <tr>
                                <td>${dia.fecha}</td>
                                <td>${formatoHora(dia.horaEntrada)}</td>
                                <td>${formatoHora(dia.horaSalida)}</td>
                                <td>
                                    ${badgeEstado(dia.estadoResumen || "sin_registro")}
                                    ${dia.registros.some((r) => r.origen === "manual")
                                        ? `<span class="origen-manual ms-1">MANUAL</span>` : ""}
                                </td>
                                <td>${dia.totalRegistros}${dia.reingresos > 0 ? ` <small class="text-muted">(+${dia.reingresos} reingreso)</small>` : ""}</td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            </div>

        </div>
    `;

}

function dato(valor, texto) {
    return `
        <div class="dato-resumen">
            <div class="numero">${valor}</div>
            <div class="texto">${texto}</div>
        </div>`;
}

/* ===========================================================
   REPORTE GENERAL
=========================================================== */

const tipoPeriodo = document.getElementById("tipoPeriodo");
const desdeGeneral = document.getElementById("desdeGeneral");
const hastaGeneral = document.getElementById("hastaGeneral");
const resultadoGeneral = document.getElementById("resultadoGeneral");

tipoPeriodo.addEventListener("change", aplicarTipoPeriodo);
desdeGeneral.addEventListener("change", aplicarTipoPeriodo);

// El tipo de periodo solo precarga fechas coherentes; "rango" deja
// ambas libres. Así "semana" y "mes" no obligan a contar días a mano.
function aplicarTipoPeriodo() {

    const base = desdeGeneral.value || obtenerFechaHoy();
    const tipo = tipoPeriodo.value;

    hastaGeneral.disabled = tipo !== "rango";

    if (tipo === "dia") {
        hastaGeneral.value = base;
        return;
    }

    if (tipo === "semana") {
        const inicio = new Date(`${base}T00:00:00`);
        const diaSemana = (inicio.getDay() + 6) % 7; // lunes = 0
        inicio.setDate(inicio.getDate() - diaSemana);
        const fin = new Date(inicio);
        fin.setDate(fin.getDate() + 6);

        desdeGeneral.value = inicio.toLocaleDateString("en-CA");
        hastaGeneral.value = minimo(fin.toLocaleDateString("en-CA"), obtenerFechaHoy());
        return;
    }

    if (tipo === "mes") {
        const inicio = `${base.slice(0, 7)}-01`;
        const ultimo = new Date(Number(base.slice(0, 4)), Number(base.slice(5, 7)), 0);

        desdeGeneral.value = inicio;
        hastaGeneral.value = minimo(ultimo.toLocaleDateString("en-CA"), obtenerFechaHoy());
    }

}

function minimo(a, b) {
    return a < b ? a : b;
}

document.getElementById("btnGenerarGeneral").addEventListener("click", async () => {

    const desde = desdeGeneral.value;
    const hasta = hastaGeneral.value;

    if (!desde || !hasta || desde > hasta) {
        alert("Revisa el rango de fechas.");
        return;
    }

    const boton = document.getElementById("btnGenerarGeneral");
    boton.disabled = true;
    resultadoGeneral.innerHTML = `<p class="text-muted">Calculando…</p>`;

    try {

        const turno = document.getElementById("turnoGeneral").value;
        const grado = document.getElementById("gradoGeneral").value;
        const seccion = document.getElementById("seccionGeneral").value;
        const texto = document.getElementById("estudianteGeneral").value.trim().toLowerCase();

        const seleccionados = estudiantes.filter((est) => {
            if (turno && est.turno !== turno) return false;
            if (grado && est.grado !== grado) return false;
            if (seccion && est.seccion !== seccion) return false;
            if (texto) {
                const completo = `${est.nombres || ""} ${est.apellidos || ""}`.toLowerCase();
                const alReves = `${est.apellidos || ""} ${est.nombres || ""}`.toLowerCase();
                if (!completo.includes(texto) && !alReves.includes(texto) && !(est.dni || "").includes(texto)) {
                    return false;
                }
            }
            return true;
        });

        const registros = await obtenerAsistenciasPorRango(desde, hasta);
        const diasLectivos = calcularDiasLectivosPorTurno(registros, desde, hasta);
        const porEstudiante = agruparPorEstudiante(registros);

        const informes = seleccionados.map((est) => resumirPeriodo(
            est,
            porEstudiante.get(est.id) || [],
            diasEsperadosDe(est, diasLectivos)
        ));

        const reporte = {
            periodo: { desde, hasta, tipo: tipoPeriodo.value },
            filtros: { turno, grado, seccion, texto },
            informes,
            totales: sumarTotales(informes)
        };

        window.reporteGeneralActual = reporte;

        pintarReporteGeneral(reporte);

    } catch (error) {
        console.error(error);
        resultadoGeneral.innerHTML = `<div class="alert alert-danger">No se pudo generar el reporte.</div>`;
    } finally {
        boton.disabled = false;
    }

});

function sumarTotales(informes) {

    const suma = {
        estudiantes: informes.length,
        presentes: 0,
        ausentes: 0,
        puntuales: 0,
        tardanzas: 0,
        tempranas: 0,
        salidasRegistradas: 0,
        salidasPendientes: 0,
        reingresos: 0,
        registrosManuales: 0,
        diasEsperados: 0
    };

    informes.forEach(({ totales }) => {
        suma.presentes += totales.presentes;
        suma.ausentes += totales.ausentes;
        suma.puntuales += totales.puntuales;
        suma.tardanzas += totales.tardanzas;
        suma.tempranas += totales.tempranas;
        suma.salidasRegistradas += totales.salidasRegistradas;
        suma.salidasPendientes += totales.salidasPendientes;
        suma.reingresos += totales.reingresos;
        suma.registrosManuales += totales.registrosManuales;
        suma.diasEsperados += totales.diasEsperados;
    });

    suma.porcentajeAsistencia = suma.diasEsperados > 0
        ? Math.round((suma.presentes / suma.diasEsperados) * 1000) / 10
        : 0;

    return suma;

}

function pintarReporteGeneral({ periodo, informes, totales }) {

    if (informes.length === 0) {
        resultadoGeneral.innerHTML = `
            <div class="alert alert-warning">Ningún estudiante coincide con los filtros.</div>`;
        return;
    }

    resultadoGeneral.innerHTML = `
        <div class="tabla">

            <h3><i class="fa-solid fa-users"></i> Reporte general</h3>
            <p class="text-muted">
                ${periodo.desde} → ${periodo.hasta} ·
                ${informes.length} estudiante${informes.length > 1 ? "s" : ""}
            </p>

            <div class="fila-resumen">
                ${dato(totales.presentes, "Asistencias")}
                ${dato(totales.ausentes, "Ausencias")}
                ${dato(totales.puntuales, "Puntuales")}
                ${dato(totales.tardanzas, "Tardanzas")}
                ${dato(totales.tempranas, "Tempranas")}
                ${dato(totales.salidasPendientes, "Salidas pendientes")}
                ${dato(`${totales.porcentajeAsistencia}%`, "% asistencia")}
                ${dato(totales.registrosManuales, "Registros manuales")}
            </div>

            <button class="btn btn-outline-success btn-sm mb-3" id="btnExportarGeneral">
                <i class="fa-solid fa-file-excel"></i> Exportar a Excel
            </button>

            <div class="table-responsive">
                <table class="table align-middle">
                    <thead>
                        <tr>
                            <th>Estudiante</th>
                            <th>Grado / Sección</th>
                            <th>Turno</th>
                            <th>Esperados</th>
                            <th>Presentes</th>
                            <th>Ausentes</th>
                            <th>Puntuales</th>
                            <th>Tardanzas</th>
                            <th>Pendientes</th>
                            <th>% Asist.</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${informes.map(({ estudiante, totales: t }) => `
                            <tr>
                                <td>
                                    <strong>${escapar(estudiante.apellidos)}, ${escapar(estudiante.nombres)}</strong><br>
                                    <small class="text-muted">${escapar(estudiante.dni)}</small>
                                </td>
                                <td>${escapar(estudiante.grado)} "${escapar(estudiante.seccion)}"</td>
                                <td>${etiquetaTurno(estudiante.turno)}</td>
                                <td>${t.diasEsperados}</td>
                                <td>${t.presentes}</td>
                                <td>${t.ausentes > 0 ? `<span class="text-danger">${t.ausentes}</span>` : 0}</td>
                                <td>${t.puntuales}</td>
                                <td>${t.tardanzas > 0 ? `<span class="text-warning">${t.tardanzas}</span>` : 0}</td>
                                <td>${t.salidasPendientes}</td>
                                <td>${t.porcentajeAsistencia}%</td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            </div>

        </div>
    `;

}
