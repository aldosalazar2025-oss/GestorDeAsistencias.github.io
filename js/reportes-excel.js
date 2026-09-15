import {
    aFecha,
    formatoHora,
    nombreCompleto,
    etiquetaTurno,
    ETIQUETAS_ESTADO
} from "./asistencia-core.js";

/* ===========================================================
   FASE 10 — EXPORTACIÓN DE REPORTES A EXCEL
   -----------------------------------------------------------
   Mismo patrón que js/estudiantes-excel.js (Fase 4):
   XLSX.utils.json_to_sheet → book_append_sheet → writeFile.

   Regla que se mantiene desde la Fase 4: se exporta EXACTAMENTE lo que
   el usuario está viendo. Este módulo no consulta Firestore ni
   recalcula nada; lee window.informeIndividualActual y
   window.reporteGeneralActual, que reportes.js ya dejó listos. Si el
   Excel y la pantalla pudieran discrepar, el reporte impreso dejaría
   de servir como respaldo de lo que se vio.

   Los botones se crean dentro del HTML que genera reportes.js, así que
   se escuchan por delegación en document en vez de por referencia
   directa (si no, habría que reenganchar el listener en cada
   generación).
=========================================================== */

document.addEventListener("click", (evento) => {

    if (evento.target.closest("#btnExportarIndividual")) exportarIndividual();
    if (evento.target.closest("#btnExportarGeneral")) exportarGeneral();

});

/* ===========================
   UTILIDADES
=========================== */

function etiquetaEstado(estado) {
    return ETIQUETAS_ESTADO[estado]?.texto || "SIN REGISTRO";
}

function nombreArchivo(base, periodo) {
    return `${base}_${periodo.desde}_a_${periodo.hasta}.xlsx`;
}

// Ancho de columna aproximado según el contenido, para que el archivo
// se abra legible en vez de con todo cortado en 8 caracteres.
function ajustarAnchos(hoja, filas) {

    if (filas.length === 0) return;

    hoja["!cols"] = Object.keys(filas[0]).map((clave) => {
        const anchoContenido = Math.max(
            clave.length,
            ...filas.map((f) => String(f[clave] ?? "").length)
        );
        return { wch: Math.min(Math.max(anchoContenido + 2, 10), 40) };
    });

}

function agregarHoja(libro, nombre, filas) {

    // Excel no acepta nombres de hoja de más de 31 caracteres.
    const nombreCorto = nombre.slice(0, 31);

    const hoja = XLSX.utils.json_to_sheet(
        filas.length > 0 ? filas : [{ "Sin datos": "No hay registros para este bloque" }]
    );

    ajustarAnchos(hoja, filas);
    XLSX.utils.book_append_sheet(libro, hoja, nombreCorto);

}

/* ===========================
   FILAS REUTILIZABLES
=========================== */

function filaEstudiante(est) {
    return {
        Apellidos: est.apellidos,
        Nombres: est.nombres,
        DNI: est.dni,
        Grado: est.grado,
        "Sección": est.seccion,
        Turno: etiquetaTurno(est.turno)
    };
}

function filasEntradasSalidas(informes) {

    const filas = [];

    informes.forEach(({ estudiante, detalle }) => {
        detalle.forEach((dia) => {
            dia.registros.forEach((registro) => {
                const hora = aFecha(registro.horaRegistrada);
                filas.push({
                    _orden: hora ? hora.getTime() : 0,
                    Fecha: dia.fecha,
                    Apellidos: estudiante.apellidos,
                    Nombres: estudiante.nombres,
                    DNI: estudiante.dni,
                    Grado: estudiante.grado,
                    "Sección": estudiante.seccion,
                    Turno: etiquetaTurno(estudiante.turno),
                    Tipo: registro.tipoRegistro === "entrada" ? "Entrada" : "Salida",
                    Hora: formatoHora(hora),
                    Estado: etiquetaEstado(registro.estado),
                    Origen: registro.origen === "manual" ? "Manual" : "QR",
                    Motivo: registro.motivo || "",
                    "Registrado por": registro.registradoPorNombre || ""
                });
            });
        });
    });

    // Se ordena por la marca de tiempo real, no por el texto de la hora:
    // "03:45 p. m." ordenado como cadena queda antes que "10:00 a. m.".
    return filas
        .sort((a, b) => a.Fecha.localeCompare(b.Fecha) || a._orden - b._orden)
        .map(({ _orden, ...fila }) => fila);

}

function filaResumenEstudiante({ estudiante, totales }) {
    return {
        ...filaEstudiante(estudiante),
        "Días esperados": totales.diasEsperados,
        Presentes: totales.presentes,
        Ausentes: totales.ausentes,
        Puntuales: totales.puntuales,
        Tardanzas: totales.tardanzas,
        Tempranas: totales.tempranas,
        "Salidas registradas": totales.salidasRegistradas,
        "Salidas pendientes": totales.salidasPendientes,
        Reingresos: totales.reingresos,
        "Registros manuales": totales.registrosManuales,
        "% Asistencia": totales.porcentajeAsistencia
    };
}

/* ===========================================================
   INFORME INDIVIDUAL
=========================================================== */

function exportarIndividual() {

    const informe = window.informeIndividualActual;

    if (!informe) {
        alert("Genera primero el informe individual.");
        return;
    }

    const { estudiante, detalle, totales, periodo } = informe;
    const libro = XLSX.utils.book_new();

    // Hoja 1: resumen en vertical (etiqueta / valor), que es como se lee
    // un informe individual impreso.
    agregarHoja(libro, "Resumen", [
        { Concepto: "Estudiante", Valor: nombreCompleto(estudiante) },
        { Concepto: "DNI", Valor: estudiante.dni },
        { Concepto: "Grado y sección", Valor: `${estudiante.grado} "${estudiante.seccion}"` },
        { Concepto: "Turno", Valor: etiquetaTurno(estudiante.turno) },
        { Concepto: "Periodo", Valor: `${periodo.desde} a ${periodo.hasta}` },
        { Concepto: "Días esperados", Valor: totales.diasEsperados },
        { Concepto: "Días presentes", Valor: totales.presentes },
        { Concepto: "Días ausentes", Valor: totales.ausentes },
        { Concepto: "Días puntuales", Valor: totales.puntuales },
        { Concepto: "Días con tardanza", Valor: totales.tardanzas },
        { Concepto: "Días con entrada temprana", Valor: totales.tempranas },
        { Concepto: "Salidas registradas", Valor: totales.salidasRegistradas },
        { Concepto: "Salidas pendientes", Valor: totales.salidasPendientes },
        { Concepto: "Reingresos", Valor: totales.reingresos },
        { Concepto: "Registros manuales", Valor: totales.registrosManuales },
        { Concepto: "Total de tardanzas", Valor: totales.tardanzas },
        { Concepto: "% de asistencia", Valor: `${totales.porcentajeAsistencia}%` }
    ]);

    // Hoja 2: un día por fila
    agregarHoja(libro, "Detalle diario", detalle.map((dia) => ({
        Fecha: dia.fecha,
        Entrada: dia.horaEntrada ? formatoHora(dia.horaEntrada) : "",
        Salida: dia.horaSalida ? formatoHora(dia.horaSalida) : "",
        Estado: etiquetaEstado(dia.estadoResumen),
        Reingresos: dia.reingresos,
        "Total registros": dia.totalRegistros,
        "Salida pendiente": dia.salidaPendiente ? "Sí" : "No"
    })));

    // Hoja 3: cada evento
    agregarHoja(libro, "Entradas y salidas", filasEntradasSalidas([informe]));

    XLSX.writeFile(libro, nombreArchivo(
        `informe_${estudiante.apellidos}_${estudiante.nombres}`.replace(/\s+/g, "_"),
        periodo
    ));

}

/* ===========================================================
   REPORTE GENERAL
   Un solo archivo con varias hojas en vez de un archivo por tipo de
   reporte: el documento de requisitos pide poder exportar puntuales,
   tardíos, ausentes y entradas/salidas, y en la práctica quien pide uno
   pide los demás en la misma reunión.
=========================================================== */

function exportarGeneral() {

    const reporte = window.reporteGeneralActual;

    if (!reporte) {
        alert("Genera primero el reporte general.");
        return;
    }

    const { periodo, informes, totales, filtros } = reporte;
    const libro = XLSX.utils.book_new();

    const descripcionPeriodo = {
        dia: "Diario",
        semana: "Semanal",
        mes: "Mensual",
        rango: "Rango personalizado"
    }[periodo.tipo] || "Rango";

    // Hoja 1: resumen general
    agregarHoja(libro, "Resumen", [
        { Concepto: "Tipo de reporte", Valor: descripcionPeriodo },
        { Concepto: "Periodo", Valor: `${periodo.desde} a ${periodo.hasta}` },
        { Concepto: "Turno", Valor: filtros.turno ? etiquetaTurno(filtros.turno) : "Todos" },
        { Concepto: "Grado", Valor: filtros.grado || "Todos" },
        { Concepto: "Sección", Valor: filtros.seccion || "Todas" },
        { Concepto: "Estudiantes incluidos", Valor: totales.estudiantes },
        { Concepto: "Días-estudiante esperados", Valor: totales.diasEsperados },
        { Concepto: "Asistencias", Valor: totales.presentes },
        { Concepto: "Ausencias", Valor: totales.ausentes },
        { Concepto: "Puntuales", Valor: totales.puntuales },
        { Concepto: "Tardanzas", Valor: totales.tardanzas },
        { Concepto: "Tempranas", Valor: totales.tempranas },
        { Concepto: "Salidas registradas", Valor: totales.salidasRegistradas },
        { Concepto: "Salidas pendientes", Valor: totales.salidasPendientes },
        { Concepto: "Reingresos", Valor: totales.reingresos },
        { Concepto: "Registros manuales", Valor: totales.registrosManuales },
        { Concepto: "% de asistencia", Valor: `${totales.porcentajeAsistencia}%` },
        { Concepto: "Generado", Valor: new Date().toLocaleString("es-PE") }
    ]);

    // Hoja 2: lista de estudiantes incluidos
    agregarHoja(libro, "Estudiantes", informes.map(({ estudiante }) => filaEstudiante(estudiante)));

    // Hoja 3: una fila por estudiante con todos sus totales
    agregarHoja(libro, "Asistencia por estudiante", informes.map(filaResumenEstudiante));

    // Hojas 4-6: los tres cortes que pide el documento de requisitos.
    // Se listan por DÍA, no por estudiante: "los tardíos" de un mes es
    // la lista de llegadas tarde, con su fecha y su hora.
    const porDia = [];

    informes.forEach(({ estudiante, detalle }) => {
        detalle.forEach((dia) => {
            porDia.push({ estudiante, dia });
        });
    });

    const filaDia = ({ estudiante, dia }) => ({
        Fecha: dia.fecha,
        ...filaEstudiante(estudiante),
        Entrada: dia.horaEntrada ? formatoHora(dia.horaEntrada) : "",
        Salida: dia.horaSalida ? formatoHora(dia.horaSalida) : "",
        Estado: etiquetaEstado(dia.estadoResumen)
    });

    agregarHoja(libro, "Puntuales",
        porDia.filter(({ dia }) => dia.presente && dia.estadoEntrada === "puntual").map(filaDia));

    agregarHoja(libro, "Tardíos",
        porDia.filter(({ dia }) => dia.presente && dia.estadoEntrada === "tarde").map(filaDia));

    agregarHoja(libro, "Tempranos",
        porDia.filter(({ dia }) => dia.presente && dia.estadoEntrada === "temprano").map(filaDia));

    agregarHoja(libro, "Ausentes",
        porDia.filter(({ dia }) => !dia.presente).map(filaDia));

    agregarHoja(libro, "Salidas pendientes",
        porDia.filter(({ dia }) => dia.salidaPendiente).map(filaDia));

    // Hoja final: el detalle crudo, evento por evento
    agregarHoja(libro, "Entradas y salidas", filasEntradasSalidas(informes));

    XLSX.writeFile(libro, nombreArchivo(`reporte_${periodo.tipo}`, periodo));

}
