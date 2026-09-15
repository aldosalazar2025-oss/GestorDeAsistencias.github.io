/* ===========================
   FASE 5 — DESCARGA MASIVA DE CÓDIGOS QR
   ---------------------------------------
   Esta fase NO genera códigos nuevos: el codigoQR ya se crea en
   Fase 3 al registrar/importar un estudiante ("EST-<timestamp>").
   Aquí solo se empaquetan, para imprimir, los QR de todos los
   estudiantes que coincidan con los filtros actuales de la tabla
   (buscador + grado + sección + turno), en dos formatos:

   - ZIP: un PNG por estudiante (para pegar uno por uno, ej. en
     carnés o cuadernos).
   - PDF: una cuadrícula de 3x4 por hoja A4, lista para imprimir y
     recortar.

   Regla de negocio de esta fase: solo se incluyen estudiantes con
   estado "activo". No tendría sentido imprimir el QR de alguien
   desactivado, y evita que se reutilice por error el QR de un
   estudiante que ya no está matriculado.
=========================== */

const btnDescargarZip = document.getElementById("btnDescargarQrZip");
const btnDescargarPdf = document.getElementById("btnDescargarQrPdf");
const contadorLoteQR = document.getElementById("contadorLoteQR");

const filtroGradoLote = document.getElementById("filtroGrado");
const filtroSeccionLote = document.getElementById("filtroSeccion");
const filtroTurnoLote = document.getElementById("filtroTurno");

/* ===========================
   CONTADOR EN VIVO
   Se refresca observando la tabla en vez de duplicar los listeners
   de estudiantes.js: la tabla se vuelve a pintar cada vez que cambia
   el filtro, la búsqueda o llega un snapshot nuevo de Firestore.
=========================== */

function obtenerSeleccionLote() {
    return (window.listaEstudiantesFiltrados || []).filter((e) => e.estado === "activo");
}

function actualizarContadorLote() {
    const cantidad = obtenerSeleccionLote().length;
    contadorLoteQR.textContent = cantidad === 1
        ? "1 estudiante activo coincide con el filtro actual"
        : `${cantidad} estudiantes activos coinciden con el filtro actual`;
}

new MutationObserver(actualizarContadorLote)
    .observe(document.getElementById("tablaEstudiantes"), { childList: true });

actualizarContadorLote();

/* ===========================
   ETIQUETA: QR + nombre + grado/sección/turno + código
=========================== */

function generarEtiquetaCanvas(est) {

    const tamanoQR = 400;
    const marco = Math.round(tamanoQR * 0.1);
    const altoTexto = 110;

    const anchoTotal = tamanoQR + marco * 2;
    const altoTotal = tamanoQR + marco * 2 + altoTexto;

    // Render temporal fuera de pantalla, reutilizando qrcodejs (igual que Fase 3)
    const temporal = document.createElement("div");
    temporal.style.position = "fixed";
    temporal.style.left = "-9999px";
    document.body.appendChild(temporal);

    new QRCode(temporal, {
        text: est.codigoQR,
        width: tamanoQR,
        height: tamanoQR,
        correctLevel: QRCode.CorrectLevel.M
    });

    const origenQR = temporal.querySelector("canvas") || temporal.querySelector("img");

    const canvas = document.createElement("canvas");
    canvas.width = anchoTotal;
    canvas.height = altoTotal;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, anchoTotal, altoTotal);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(origenQR, marco, marco, tamanoQR, tamanoQR);

    document.body.removeChild(temporal);

    ctx.textAlign = "center";

    const nombreCompleto = `${est.nombres || ""} ${est.apellidos || ""}`.trim();
    const anchoDisponible = anchoTotal - marco;

    let tamanoFuente = 28;
    ctx.font = `bold ${tamanoFuente}px Arial`;
    while (ctx.measureText(nombreCompleto).width > anchoDisponible && tamanoFuente > 14) {
        tamanoFuente -= 2;
        ctx.font = `bold ${tamanoFuente}px Arial`;
    }
    ctx.fillStyle = "#000000";
    ctx.fillText(nombreCompleto, anchoTotal / 2, tamanoQR + marco * 2 + 38);

    const turnoTexto = est.turno === "manana" ? "Mañana" : "Tarde";
    ctx.font = "20px Arial";
    ctx.fillText(`${est.grado || ""} "${est.seccion || ""}" · ${turnoTexto}`, anchoTotal / 2, tamanoQR + marco * 2 + 68);

    ctx.font = "14px Arial";
    ctx.fillStyle = "#666666";
    ctx.fillText(est.codigoQR, anchoTotal / 2, tamanoQR + marco * 2 + 92);

    return canvas;

}

/* ===========================
   NOMBRE DE ARCHIVO SEGÚN EL FILTRO ACTIVO
=========================== */

function normalizarParaArchivo(texto) {
    return (texto || "")
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "")
        .toUpperCase();
}

function nombreBaseArchivo() {
    const grado = normalizarParaArchivo(filtroGradoLote.value) || "TODOS";
    const seccion = normalizarParaArchivo(filtroSeccionLote.value);
    const turno = filtroTurnoLote.value === "manana"
        ? "MANANA"
        : filtroTurnoLote.value === "tarde" ? "TARDE" : "";
    return ["QR", grado + seccion, turno].filter(Boolean).join("_");
}

function alternarCargando(boton, cargando, textoOriginal) {
    boton.disabled = cargando;
    boton.innerHTML = cargando
        ? `<span class="spinner-border spinner-border-sm"></span> Generando…`
        : textoOriginal;
}

/* ===========================
   ZIP: un PNG por estudiante
=========================== */

btnDescargarZip.addEventListener("click", async () => {

    const seleccion = obtenerSeleccionLote();

    if (seleccion.length === 0) {
        alert("No hay estudiantes activos que coincidan con el filtro actual.");
        return;
    }

    if (!confirm(`Se generarán ${seleccion.length} códigos QR en un archivo ZIP. ¿Continuar?`)) {
        return;
    }

    const textoOriginal = btnDescargarZip.innerHTML;
    alternarCargando(btnDescargarZip, true, textoOriginal);

    try {

        const zip = new JSZip();

        seleccion.forEach((est) => {
            const canvas = generarEtiquetaCanvas(est);
            const base64 = canvas.toDataURL("image/png").split(",")[1];
            const apellidos = normalizarParaArchivo(est.apellidos);
            const nombres = normalizarParaArchivo(est.nombres);
            zip.file(`${est.codigoQR}_${apellidos}_${nombres}.png`, base64, { base64: true });
        });

        const contenidoZip = await zip.generateAsync({ type: "blob" });

        const enlace = document.createElement("a");
        enlace.href = URL.createObjectURL(contenidoZip);
        enlace.download = `${nombreBaseArchivo()}.zip`;
        document.body.appendChild(enlace);
        enlace.click();
        enlace.remove();

    } catch (error) {
        console.error(error);
        alert("Ocurrió un error generando el archivo ZIP");
    } finally {
        alternarCargando(btnDescargarZip, false, textoOriginal);
    }

});

/* ===========================
   PDF: cuadrícula 3x4 lista para imprimir (A4)
=========================== */

btnDescargarPdf.addEventListener("click", async () => {

    const seleccion = obtenerSeleccionLote();

    if (seleccion.length === 0) {
        alert("No hay estudiantes activos que coincidan con el filtro actual.");
        return;
    }

    if (!confirm(`Se generarán ${seleccion.length} códigos QR en un archivo PDF. ¿Continuar?`)) {
        return;
    }

    const textoOriginal = btnDescargarPdf.innerHTML;
    alternarCargando(btnDescargarPdf, true, textoOriginal);

    try {

        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

        const margen = 10;
        const columnas = 3;
        const filas = 4;
        const anchoCelda = (210 - margen * 2) / columnas;
        const altoCelda = (297 - margen * 2) / filas;
        const porPagina = columnas * filas;

        seleccion.forEach((est, indice) => {

            const posicionEnPagina = indice % porPagina;

            if (indice > 0 && posicionEnPagina === 0) {
                pdf.addPage();
            }

            const fila = Math.floor(posicionEnPagina / columnas);
            const columna = posicionEnPagina % columnas;

            const canvas = generarEtiquetaCanvas(est);
            const dataUrl = canvas.toDataURL("image/png");

            const relacionAspecto = canvas.height / canvas.width;
            const relleno = 4;

            let anchoImagen = anchoCelda - relleno * 2;
            let altoImagen = anchoImagen * relacionAspecto;

            if (altoImagen > altoCelda - relleno * 2) {
                altoImagen = altoCelda - relleno * 2;
                anchoImagen = altoImagen / relacionAspecto;
            }

            const x = margen + columna * anchoCelda + (anchoCelda - anchoImagen) / 2;
            const y = margen + fila * altoCelda + (altoCelda - altoImagen) / 2;

            pdf.addImage(dataUrl, "PNG", x, y, anchoImagen, altoImagen);

        });

        pdf.save(`${nombreBaseArchivo()}.pdf`);

    } catch (error) {
        console.error(error);
        alert("Ocurrió un error generando el archivo PDF");
    } finally {
        alternarCargando(btnDescargarPdf, false, textoOriginal);
    }

});
