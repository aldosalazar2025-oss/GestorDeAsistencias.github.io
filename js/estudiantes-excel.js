import { db } from "./firebase.js";

import {
    collection,
    doc,
    writeBatch,
    Timestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const btnImportar = document.getElementById("btnImportarExcel");
const inputImportar = document.getElementById("inputImportarExcel");
const btnExportar = document.getElementById("btnExportarExcel");
const btnPlantilla = document.getElementById("btnDescargarPlantilla");

const modalPreviewEl = document.getElementById("modalPreviewImport");
const modalPreview = new bootstrap.Modal(modalPreviewEl);
const tablaPreview = document.getElementById("tablaPreviewImport");
const resumenPreview = document.getElementById("resumenPreviewImport");
const btnConfirmarImport = document.getElementById("btnConfirmarImport");

let filasListasParaImportar = [];

/* ============================================================
   PASO 1 — LEER Y VALIDAR EL ARCHIVO (sin escribir nada aún)
============================================================ */

btnImportar.addEventListener("click", () => inputImportar.click());

inputImportar.addEventListener("change", async (evento) => {

    const archivo = evento.target.files[0];
    if (!archivo) return;

    try {

        const datos = await archivo.arrayBuffer();
        const libro = XLSX.read(datos, { type: "array" });
        const hoja = libro.Sheets[libro.SheetNames[0]];
        const filas = XLSX.utils.sheet_to_json(hoja, { defval: "" });

        if (filas.length === 0) {
            alert("El archivo no contiene datos para importar");
            return;
        }

        // Columnas esperadas — si faltan todas, probablemente no es
        // el formato correcto de plantilla
        const columnasEsperadas = ["Nombres", "Apellidos", "DNI", "Grado", "Sección", "Turno"];
        const columnasEncontradas = Object.keys(filas[0]);
        const tieneAlgunaColumna = columnasEsperadas.some((c) =>
            columnasEncontradas.some((enc) => enc.toLowerCase().includes(c.toLowerCase().slice(0, 4)))
        );

        if (!tieneAlgunaColumna) {
            alert(
                "No se reconocen las columnas del archivo.\n\n" +
                "Se esperan: Nombres, Apellidos, DNI, Grado, Sección, Turno.\n" +
                "Descarga la plantilla para ver el formato exacto."
            );
            inputImportar.value = "";
            return;
        }

        procesarVistaPrevia(filas);

    } catch (error) {

        console.error(error);
        alert("Error al leer el archivo. Verifica que sea un Excel válido (.xlsx o .xls).");

    } finally {

        inputImportar.value = "";

    }

});

/* ============================================================
   PASO 2 — VALIDAR FILA POR FILA Y ARMAR LA VISTA PREVIA
============================================================ */

function procesarVistaPrevia(filas) {

    const dnisExistentes = new Set(
        (window.listaEstudiantesActual || []).map((e) => (e.dni || "").trim())
    );
    const dnisVistosEnArchivo = new Set();

    filasListasParaImportar = [];
    let nuevos = 0, duplicados = 0, invalidos = 0;

    const filasProcesadas = filas.map((fila, i) => {

        const numeroFila = i + 2;

        const nombres = String(fila["Nombres"] ?? fila["nombres"] ?? "").trim();
        const apellidos = String(fila["Apellidos"] ?? fila["apellidos"] ?? "").trim();
        const dni = String(fila["DNI"] ?? fila["dni"] ?? "").trim();
        const grado = String(fila["Grado"] ?? fila["grado"] ?? "").trim();
        const seccion = String(fila["Sección"] ?? fila["Seccion"] ?? fila["seccion"] ?? "").trim();
        let turno = String(fila["Turno"] ?? fila["turno"] ?? "").trim().toLowerCase();
        turno = turno.startsWith("tarde") ? "tarde" : "manana";

        let error = null;

        if (!nombres || !apellidos) error = "Falta nombre o apellido";
        else if (!/^\d{8}$/.test(dni)) error = `DNI inválido ("${dni}")`;
        else if (!grado || !seccion) error = "Falta grado o sección";
        else if (dnisExistentes.has(dni)) error = "DNI ya registrado en el sistema";
        else if (dnisVistosEnArchivo.has(dni)) error = "DNI repetido dentro del archivo";

        const registro = { numeroFila, nombres, apellidos, dni, grado, seccion, turno, error };

        if (error) {
            if (error.includes("ya registrado") || error.includes("repetido")) duplicados++;
            else invalidos++;
        } else {
            nuevos++;
            dnisVistosEnArchivo.add(dni);
            filasListasParaImportar.push(registro);
        }

        return registro;

    });

    resumenPreview.innerHTML = `
        <strong>${filas.length}</strong> filas leídas &nbsp;·&nbsp;
        <span class="text-success">${nuevos} nuevos</span> &nbsp;·&nbsp;
        <span class="text-warning">${duplicados} duplicados</span> &nbsp;·&nbsp;
        <span class="text-danger">${invalidos} con error</span>
    `;

    tablaPreview.innerHTML = filasProcesadas.map((f) => `
        <tr class="${f.error ? "table-danger" : "table-success"}">
            <td>${f.numeroFila}</td>
            <td>${escapar(f.nombres)} ${escapar(f.apellidos)}</td>
            <td>${escapar(f.dni)}</td>
            <td>${escapar(f.grado)} "${escapar(f.seccion)}"</td>
            <td>${f.turno === "manana" ? "Mañana" : "Tarde"}</td>
            <td>${f.error ? escapar(f.error) : "<i class=\"fa-solid fa-check text-success\"></i> Listo para importar"}</td>
        </tr>
    `).join("");

    btnConfirmarImport.disabled = nuevos === 0;
    btnConfirmarImport.textContent = `Confirmar importación (${nuevos})`;

    modalPreview.show();

}

/* ============================================================
   PASO 3 — CONFIRMAR: recién aquí se escribe en Firestore
============================================================ */

btnConfirmarImport.addEventListener("click", async () => {

    if (filasListasParaImportar.length === 0) return;

    btnConfirmarImport.disabled = true;
    btnConfirmarImport.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Importando…`;

    try {

        const TAMANO_LOTE = 450; // límite de Firestore por batch es 500
        const marcaTiempo = Date.now();

        for (let i = 0; i < filasListasParaImportar.length; i += TAMANO_LOTE) {

            const lote = writeBatch(db);
            const grupo = filasListasParaImportar.slice(i, i + TAMANO_LOTE);

            grupo.forEach((registro, indice) => {

                const nuevoDoc = doc(collection(db, "estudiantes"));
                const codigoQR = `EST-${marcaTiempo}-${i + indice}`;

                lote.set(nuevoDoc, {
                    nombres: registro.nombres,
                    apellidos: registro.apellidos,
                    dni: registro.dni,
                    grado: registro.grado,
                    seccion: registro.seccion,
                    turno: registro.turno,
                    fotoUrl: "",
                    codigoQR,
                    estado: "activo",
                    fechaRegistro: Timestamp.now()
                });

            });

            await lote.commit();

        }

        alert(`${filasListasParaImportar.length} estudiante(s) importado(s) correctamente.`);
        modalPreview.hide();

    } catch (error) {

        console.error(error);
        alert("Ocurrió un error durante la importación. Revisa la consola para más detalle.");

    } finally {

        btnConfirmarImport.disabled = false;
        filasListasParaImportar = [];

    }

});

/* ============================================================
   PLANTILLA DESCARGABLE (formato exacto esperado)
============================================================ */

btnPlantilla.addEventListener("click", () => {

    const datosEjemplo = [
        { Nombres: "Juan", Apellidos: "Pérez", DNI: "12345678", Grado: "5º", "Sección": "A", Turno: "Mañana" },
        { Nombres: "María", Apellidos: "López", DNI: "23456789", Grado: "5º", "Sección": "A", Turno: "Mañana" }
    ];

    const hoja = XLSX.utils.json_to_sheet(datosEjemplo);
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Estudiantes");
    XLSX.writeFile(libro, "plantilla_estudiantes.xlsx");

});

/* ============================================================
   EXPORTAR — la lista actualmente filtrada/visible
============================================================ */

btnExportar.addEventListener("click", () => {

    const lista = window.listaEstudiantesFiltrados || [];

    if (lista.length === 0) {
        alert("No hay estudiantes para exportar con los filtros actuales");
        return;
    }

    const datos = lista.map((est) => ({
        Nombres: est.nombres,
        Apellidos: est.apellidos,
        DNI: est.dni,
        Grado: est.grado,
        "Sección": est.seccion,
        Turno: est.turno === "manana" ? "Mañana" : "Tarde",
        Estado: est.estado === "activo" ? "Activo" : "Inactivo",
        "Código QR": est.codigoQR
    }));

    const hoja = XLSX.utils.json_to_sheet(datos);
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Estudiantes");
    XLSX.writeFile(libro, `estudiantes_${new Date().toISOString().slice(0, 10)}.xlsx`);

});

function escapar(texto) {
    const div = document.createElement("div");
    div.textContent = texto ?? "";
    return div.innerHTML;
}
