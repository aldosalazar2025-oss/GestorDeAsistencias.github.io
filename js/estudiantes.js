import { db } from "./firebase.js";

import {
    collection,
    addDoc,
    doc,
    updateDoc,
    onSnapshot,
    query,
    where,
    getDocs,
    Timestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

/* ===========================
   FOTOS SIN CLOUD STORAGE
   ---------------------------------------
   Cloud Storage for Firebase ya no funciona en el plan gratuito Spark:
   desde el 30/10/2024 hace falta el plan Blaze (con tarjeta) para crear
   un bucket, y desde el 03/02/2026 también para seguir usando los
   buckets antiguos.

   Para que el sistema siga siendo 100% gratuito, la foto del estudiante
   se reduce a una miniatura cuadrada de 200x200 en JPEG y se guarda como
   data URL dentro del propio documento del estudiante. El resto del
   código no cambia: `fotoUrl` se sigue usando tal cual en <img src="...">,
   y un data URL funciona igual que una URL de Storage.

   Límite a respetar: un documento de Firestore no puede pasar de 1 MB.
   Una miniatura de 200x200 al 70% de calidad pesa ~15-25 KB, así que
   sobra margen — pero por eso se comprime en vez de guardar el archivo
   original, que puede traer varios MB desde la cámara de un celular.
=========================== */

const TAMANO_MINIATURA = 200;
const CALIDAD_JPEG = 0.7;

function generarMiniatura(archivo) {

    return new Promise((resolver, rechazar) => {

        const lector = new FileReader();

        lector.onload = () => {

            const imagen = new Image();

            imagen.onload = () => {

                // Recorte cuadrado centrado: la foto se muestra siempre
                // dentro de un círculo, así que recortar aquí evita que
                // salga deformada en la tabla y en el escáner.
                const lado = Math.min(imagen.width, imagen.height);
                const origenX = (imagen.width - lado) / 2;
                const origenY = (imagen.height - lado) / 2;

                const lienzo = document.createElement("canvas");
                lienzo.width = TAMANO_MINIATURA;
                lienzo.height = TAMANO_MINIATURA;

                const contexto = lienzo.getContext("2d");
                contexto.drawImage(
                    imagen,
                    origenX, origenY, lado, lado,
                    0, 0, TAMANO_MINIATURA, TAMANO_MINIATURA
                );

                resolver(lienzo.toDataURL("image/jpeg", CALIDAD_JPEG));

            };

            imagen.onerror = () => rechazar(new Error("El archivo no es una imagen válida"));
            imagen.src = lector.result;

        };

        lector.onerror = () => rechazar(new Error("No se pudo leer el archivo"));
        lector.readAsDataURL(archivo);

    });

}

const formEstudiante = document.getElementById("formEstudiante");
const tabla = document.getElementById("tablaEstudiantes");
const buscador = document.getElementById("buscar");
const filtroGrado = document.getElementById("filtroGrado");
const filtroSeccion = document.getElementById("filtroSeccion");
const filtroTurno = document.getElementById("filtroTurno");
const mensajeEstudiante = document.getElementById("mensajeEstudiante");

let listaEstudiantes = [];

/* ===========================
   ESCAPAR HTML
=========================== */

function escapar(texto) {
    const div = document.createElement("div");
    div.textContent = texto ?? "";
    return div.innerHTML;
}

/* ===========================
   ALTA DE ESTUDIANTE
=========================== */

formEstudiante.addEventListener("submit", async (e) => {

    e.preventDefault();
    ocultarMensaje();

    const nombres = document.getElementById("nombres").value.trim();
    const apellidos = document.getElementById("apellidos").value.trim();
    const dni = document.getElementById("dni").value.trim();
    const grado = document.getElementById("grado").value.trim();
    const seccion = document.getElementById("seccion").value.trim();
    const turno = document.getElementById("turno").value;
    const archivoFoto = document.getElementById("foto").files[0];

    if (!/^\d{8}$/.test(dni)) {
        mostrarMensaje("El DNI debe tener 8 dígitos numéricos", "danger");
        return;
    }

    const botonGuardar = formEstudiante.querySelector("button[type=submit]");
    botonGuardar.disabled = true;

    try {

        // Evitar DNI duplicado
        const consultaDni = query(collection(db, "estudiantes"), where("dni", "==", dni));
        const resultadoDni = await getDocs(consultaDni);

        if (!resultadoDni.empty) {
            mostrarMensaje("Ya existe un estudiante registrado con ese DNI", "danger");
            botonGuardar.disabled = false;
            return;
        }

        const codigoQR = "EST-" + Date.now();

        let fotoUrl = "";
        if (archivoFoto) {
            try {
                fotoUrl = await generarMiniatura(archivoFoto);
            } catch (error) {
                console.error(error);
                mostrarMensaje("No se pudo procesar la foto. El estudiante no se guardó.", "danger");
                botonGuardar.disabled = false;
                return;
            }
        }

        await addDoc(collection(db, "estudiantes"), {
            nombres,
            apellidos,
            dni,
            grado,
            seccion,
            turno,
            fotoUrl,
            codigoQR,
            estado: "activo",
            fechaRegistro: Timestamp.now()
        });

        mostrarMensaje(`Estudiante "${nombres} ${apellidos}" registrado correctamente`, "success");
        formEstudiante.reset();

    } catch (error) {

        console.error(error);
        mostrarMensaje("Error al guardar el estudiante", "danger");

    } finally {

        botonGuardar.disabled = false;

    }

});

/* ===========================
   LISTADO EN TIEMPO REAL
=========================== */

onSnapshot(collection(db, "estudiantes"), (snapshot) => {

    listaEstudiantes = snapshot.docs.map((documento) => ({
        id: documento.id,
        ...documento.data()
    }));

    // Expuesto para que js/estudiantes-excel.js pueda reutilizar
    // la misma lista (evita mantener dos listeners de Firestore)
    window.listaEstudiantesActual = listaEstudiantes;

    actualizarOpcionesFiltro();
    aplicarFiltros();

});

function actualizarOpcionesFiltro() {

    const grados = [...new Set(listaEstudiantes.map((e) => e.grado).filter(Boolean))].sort();
    const secciones = [...new Set(listaEstudiantes.map((e) => e.seccion).filter(Boolean))].sort();

    llenarSelectFiltro(filtroGrado, grados);
    llenarSelectFiltro(filtroSeccion, secciones);

}

function llenarSelectFiltro(select, valores) {

    const seleccionActual = select.value;

    select.innerHTML = `<option value="">Todos</option>` +
        valores.map((v) => `<option value="${escapar(v)}">${escapar(v)}</option>`).join("");

    if (valores.includes(seleccionActual)) {
        select.value = seleccionActual;
    }

}

/* ===========================
   FILTROS + BÚSQUEDA
=========================== */

function aplicarFiltros() {

    const texto = buscador.value.toLowerCase();
    const grado = filtroGrado.value;
    const seccion = filtroSeccion.value;
    const turno = filtroTurno.value;

    const filtrados = listaEstudiantes.filter((est) => {

        const nombreCompleto = `${est.nombres || ""} ${est.apellidos || ""}`.toLowerCase();
        const dni = (est.dni || "").toLowerCase();

        const coincideTexto = nombreCompleto.includes(texto) || dni.includes(texto);
        const coincideGrado = !grado || est.grado === grado;
        const coincideSeccion = !seccion || est.seccion === seccion;
        const coincideTurno = !turno || est.turno === turno;

        return coincideTexto && coincideGrado && coincideSeccion && coincideTurno;

    });

    // Expuesto para exportar exactamente lo que el admin está viendo
    window.listaEstudiantesFiltrados = filtrados;

    mostrarEstudiantes(filtrados);

}

[buscador, filtroGrado, filtroSeccion, filtroTurno].forEach((el) => {
    el.addEventListener("input", aplicarFiltros);
    el.addEventListener("change", aplicarFiltros);
});

/* ===========================
   RENDER DE LA TABLA
=========================== */

function mostrarEstudiantes(lista) {

    if (lista.length === 0) {
        tabla.innerHTML = `<tr><td colspan="7" class="text-center text-muted">No se encontraron estudiantes</td></tr>`;
        return;
    }

    tabla.innerHTML = lista.map((est) => `
        <tr>
            <td>
                ${est.fotoUrl
                    ? `<img src="${est.fotoUrl}" class="foto-estudiante" alt="">`
                    : `<i class="fa-solid fa-user-graduate fa-lg text-muted"></i>`}
            </td>
            <td>
                <strong>${escapar(est.nombres)} ${escapar(est.apellidos)}</strong><br>
                <small class="text-muted">${escapar(est.dni)}</small>
            </td>
            <td>${escapar(est.grado)} "${escapar(est.seccion)}"</td>
            <td>${est.turno === "manana" ? "Mañana" : "Tarde"}</td>
            <td>
                <div class="qr-marco">
                    <div id="qr-${est.id}"></div>
                </div>
                <button class="btn btn-sm btn-outline-secondary mt-1" onclick="descargarQR('${est.id}', '${est.codigoQR}')">
                    <i class="fa-solid fa-download"></i>
                </button>
            </td>
            <td>
                <span class="badge ${est.estado === "activo" ? "bg-success" : "bg-secondary"}">
                    ${est.estado === "activo" ? "Activo" : "Inactivo"}
                </span>
            </td>
            <td>
                <button class="btn btn-sm btn-outline-primary" onclick="editar('${est.id}')" title="Editar">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button class="btn btn-sm ${est.estado === "activo" ? "btn-outline-danger" : "btn-outline-success"}"
                        onclick="cambiarEstado('${est.id}', '${est.estado}')"
                        title="${est.estado === "activo" ? "Desactivar" : "Activar"}">
                    <i class="fa-solid ${est.estado === "activo" ? "fa-user-slash" : "fa-user-check"}"></i>
                </button>
            </td>
        </tr>
    `).join("");

    // Dibujar cada QR después de insertar el HTML
    lista.forEach((est) => {
        const contenedor = document.getElementById(`qr-${est.id}`);
        if (contenedor) {
            contenedor.innerHTML = "";
            new QRCode(contenedor, { text: est.codigoQR, width: 70, height: 70 });
        }
    });

}

/* ===========================
   DESCARGAR QR (con marco blanco imprimible)
=========================== */

window.descargarQR = (id, codigo) => {

    const contenedor = document.getElementById(`qr-${id}`);
    if (!contenedor) return;

    const origen = contenedor.querySelector("canvas") || contenedor.querySelector("img");
    if (!origen) return;

    const tamanoQR = 480;
    const marco = Math.round(tamanoQR * 0.12);
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = tamanoQR + marco * 2;
    exportCanvas.height = tamanoQR + marco * 2;

    const ctx = exportCanvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(origen, marco, marco, tamanoQR, tamanoQR);

    const enlace = document.createElement("a");
    enlace.download = `${codigo}.png`;
    enlace.href = exportCanvas.toDataURL("image/png");
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();

};

/* ===========================
   EDITAR (modal)
=========================== */

window.editar = (id) => {

    const est = listaEstudiantes.find((e) => e.id === id);
    if (!est) return;

    document.getElementById("editarId").value = est.id;
    document.getElementById("editarNombres").value = est.nombres || "";
    document.getElementById("editarApellidos").value = est.apellidos || "";
    document.getElementById("editarGrado").value = est.grado || "";
    document.getElementById("editarSeccion").value = est.seccion || "";
    document.getElementById("editarTurno").value = est.turno || "manana";

    const modal = new bootstrap.Modal(document.getElementById("modalEditar"));
    modal.show();

};

document.getElementById("formEditar").addEventListener("submit", async (e) => {

    e.preventDefault();

    const id = document.getElementById("editarId").value;

    const datosActualizados = {
        nombres: document.getElementById("editarNombres").value.trim(),
        apellidos: document.getElementById("editarApellidos").value.trim(),
        grado: document.getElementById("editarGrado").value.trim(),
        seccion: document.getElementById("editarSeccion").value.trim(),
        turno: document.getElementById("editarTurno").value
    };

    try {

        await updateDoc(doc(db, "estudiantes", id), datosActualizados);
        bootstrap.Modal.getInstance(document.getElementById("modalEditar")).hide();

    } catch (error) {

        console.error(error);
        alert("Error al actualizar el estudiante");

    }

});

/* ===========================
   ACTIVAR / DESACTIVAR
   (nunca se elimina físicamente, para no
   romper el historial de asistencias)
=========================== */

window.cambiarEstado = async (id, estadoActual) => {

    const nuevoEstado = estadoActual === "activo" ? "inactivo" : "activo";

    try {
        await updateDoc(doc(db, "estudiantes", id), { estado: nuevoEstado });
    } catch (error) {
        console.error(error);
        alert("No se pudo cambiar el estado del estudiante");
    }

};

function mostrarMensaje(texto, tipo) {
    mensajeEstudiante.textContent = texto;
    mensajeEstudiante.className = `alert alert-${tipo}`;
    mensajeEstudiante.classList.remove("d-none");
}

function ocultarMensaje() {
    mensajeEstudiante.classList.add("d-none");
}
