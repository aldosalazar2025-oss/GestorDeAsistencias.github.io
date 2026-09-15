import { db } from "./firebase.js";

import {
    collection,
    query,
    where,
    orderBy,
    getDocs,
    addDoc,
    doc,
    getDoc,
    Timestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

/* ===========================================================
   FASE 7 — NÚCLEO DE ENTRADAS Y SALIDAS
   -----------------------------------------------------------
   Este módulo concentra TODA la lógica de negocio de asistencia
   para que el escáner (Fase 6), el registro manual (Fase 7),
   el dashboard (Fase 8) y los reportes (Fase 9) usen exactamente
   las mismas reglas. Antes esta lógica vivía dentro de
   escanear.js y no era reutilizable.

   Nadie más debería decidir "esto es una entrada o una salida":
   se pregunta a decidirRegistro().
=========================================================== */

/* ===========================
   CONSTANTES DE NEGOCIO
=========================== */

// Estados posibles de un registro de asistencia.
export const ESTADOS = {
    TEMPRANO: "temprano",
    PUNTUAL: "puntual",
    TARDE: "tarde",
    REINGRESO: "reingreso",
    SALIDA_REGISTRADA: "salida_registrada",
    // Derivados (NO se guardan en Firestore, se calculan al leer):
    AUSENTE: "ausente",
    SALIDA_PENDIENTE: "salida_pendiente"
};

export const ETIQUETAS_ESTADO = {
    temprano: { texto: "TEMPRANO", clase: "temprano" },
    puntual: { texto: "PUNTUAL", clase: "puntual" },
    tarde: { texto: "TARDE", clase: "tarde" },
    reingreso: { texto: "REINGRESO", clase: "reingreso" },
    salida_registrada: { texto: "SALIDA", clase: "salida-registrada" },
    ausente: { texto: "AUSENTE", clase: "ausente" },
    salida_pendiente: { texto: "SALIDA PENDIENTE", clase: "salida-pendiente" },
    sin_registro: { texto: "SIN REGISTRO", clase: "sin-registro" }
};

// Tiempo mínimo entre dos registros del mismo estudiante. Evita que un
// QR sostenido frente a la cámara, o un doble clic en el registro
// manual, genere una salida falsa un segundo después de la entrada.
export const MINUTOS_ANTIRREBOTE = 2;

// Tope defensivo por estudiante y día. Con entradas/salidas ilimitadas
// un QR fotocopiado podría inflar la colección; 10 eventos cubren de
// sobra 5 ciclos entrada-salida en una jornada real.
export const MAX_REGISTROS_DIA = 10;

// Margen después de la hora oficial de salida antes de considerar que
// una entrada sin salida es realmente una "salida pendiente" y no
// simplemente alguien que todavía no ha salido del local.
export const MINUTOS_TOLERANCIA_SALIDA = 30;

/* ===========================
   FECHAS Y HORAS
=========================== */

export function obtenerFechaHoy() {
    return new Date().toLocaleDateString("en-CA"); // "YYYY-MM-DD" en hora local
}

export function aCadenaFecha(fecha) {
    return fecha.toLocaleDateString("en-CA");
}

export function horaEnMinutos(horaTexto) {
    const [h, m] = (horaTexto || "0:0").split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
}

export function minutosDeFecha(fecha) {
    return fecha.getHours() * 60 + fecha.getMinutes();
}

export function formatoHora(fecha) {
    if (!fecha) return "—";
    return fecha.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
}

// Firestore devuelve Timestamp; el registro recién creado en memoria
// puede traer un Date. Esta función normaliza ambos casos.
export function aFecha(valor) {
    if (!valor) return null;
    if (valor instanceof Date) return valor;
    if (typeof valor.toDate === "function") return valor.toDate();
    return new Date(valor);
}

// Lista de fechas "YYYY-MM-DD" entre dos fechas, inclusive.
export function rangoDeFechas(desde, hasta) {
    const fechas = [];
    const actual = new Date(`${desde}T00:00:00`);
    const fin = new Date(`${hasta}T00:00:00`);

    while (actual <= fin) {
        fechas.push(aCadenaFecha(actual));
        actual.setDate(actual.getDate() + 1);
    }

    return fechas;
}

export function esFinDeSemana(fechaTexto) {
    const dia = new Date(`${fechaTexto}T00:00:00`).getDay();
    return dia === 0 || dia === 6;
}

/* ===========================
   HORARIOS CONFIGURADOS
   Se cachean en memoria porque el escáner los consulta en cada lectura.
   limpiarCacheHorarios() existe para que Configuración pueda invalidar
   el caché sin obligar a recargar la página (bug detectado en Fase 6:
   el caché no se invalidaba nunca).
=========================== */

const cacheHorarios = {};

export function limpiarCacheHorarios() {
    Object.keys(cacheHorarios).forEach((k) => delete cacheHorarios[k]);
}

export async function obtenerHorarios(turno) {

    if (cacheHorarios[turno]) return cacheHorarios[turno];

    const snap = await getDoc(doc(db, "configuracionHorarios", turno));
    if (!snap.exists()) return null;

    cacheHorarios[turno] = snap.data();
    return cacheHorarios[turno];

}

/* ===========================
   CLASIFICACIÓN DE LA ENTRADA
   Solo la PRIMERA entrada del día se clasifica en
   temprano/puntual/tarde. Ver decidirRegistro() para el porqué.
=========================== */

export function clasificarEntrada(minutosActuales, horarios) {

    const inicioPuntual = horaEnMinutos(horarios.inicioPuntual);
    const finPuntual = horaEnMinutos(horarios.finPuntual);

    if (minutosActuales < inicioPuntual) return ESTADOS.TEMPRANO;
    if (minutosActuales <= finPuntual) return ESTADOS.PUNTUAL;
    return ESTADOS.TARDE;

}

/* ===========================
   CONSULTA DE REGISTROS DEL DÍA
=========================== */

export function ordenarPorHora(registros) {
    return [...registros].sort((a, b) => {
        const fa = aFecha(a.horaRegistrada);
        const fb = aFecha(b.horaRegistrada);
        return (fa?.getTime() || 0) - (fb?.getTime() || 0);
    });
}

export async function obtenerRegistrosDelDia(estudianteId, fecha) {

    const consulta = query(
        collection(db, "asistencias"),
        where("estudianteId", "==", estudianteId),
        where("fecha", "==", fecha)
    );

    const snap = await getDocs(consulta);

    return ordenarPorHora(snap.docs.map((d) => ({ id: d.id, ...d.data() })));

}

/* ===========================================================
   DECISIÓN: ¿QUÉ SE REGISTRA EN ESTE MOMENTO?
   -----------------------------------------------------------
   Esta es la respuesta al caso límite que quedó abierto en la
   Fase 6 ("el estudiante ya tiene entrada Y salida hoy").

   Regla adoptada: la jornada se modela como una SECUENCIA de
   eventos alternados, no como un par fijo entrada/salida. Se mira
   únicamente el ÚLTIMO registro del día:

     - sin registros        → ENTRADA (clasificada por horario)
     - último = entrada     → SALIDA
     - último = salida      → ENTRADA nueva, estado "reingreso"

   Así un estudiante que salió a media mañana (permiso, emergencia,
   taller fuera del aula) y volvió, queda correctamente registrado en
   vez de recibir "ya tiene entrada y salida hoy" y quedar contado
   como si nunca hubiera vuelto.

   Por qué "reingreso" y no volver a clasificar puntualidad: la
   puntualidad describe LA LLEGADA AL TURNO, y esa ya se evaluó en la
   primera entrada. Si se reclasificara, cualquiera que reingrese
   después del límite de puntualidad aparecería como "tarde" y
   arruinaría la estadística del requisito 16. La primera entrada del
   día es la única que define puntualidad — esto es lo que después
   asume resumirDia() y, con ella, el dashboard y los reportes.
=========================================================== */

export function decidirRegistro(registrosDelDia, ahora, horarios) {

    const registros = ordenarPorHora(registrosDelDia);

    if (registros.length >= MAX_REGISTROS_DIA) {
        return {
            permitido: false,
            codigo: "limite_diario",
            mensaje: `Este estudiante ya tiene ${registros.length} registros hoy. Revisa el historial antes de agregar otro.`
        };
    }

    const ultimo = registros[registros.length - 1];

    if (!ultimo) {
        return {
            permitido: true,
            tipoRegistro: "entrada",
            estado: clasificarEntrada(minutosDeFecha(ahora), horarios),
            esReingreso: false
        };
    }

    const horaUltimo = aFecha(ultimo.horaRegistrada);
    const minutosTranscurridos = horaUltimo ? (ahora - horaUltimo) / 60000 : Infinity;

    if (minutosTranscurridos < MINUTOS_ANTIRREBOTE) {
        return {
            permitido: false,
            codigo: "antirrebote",
            mensaje: `Ya se registró su ${ultimo.tipoRegistro} hace menos de ${MINUTOS_ANTIRREBOTE} minutos (${formatoHora(horaUltimo)}). No se registró nada nuevo.`
        };
    }

    if (ultimo.tipoRegistro === "entrada") {
        return {
            permitido: true,
            tipoRegistro: "salida",
            estado: ESTADOS.SALIDA_REGISTRADA,
            esReingreso: false
        };
    }

    return {
        permitido: true,
        tipoRegistro: "entrada",
        estado: ESTADOS.REINGRESO,
        esReingreso: true
    };

}

/* ===========================
   ESCRITURA DEL REGISTRO
   Un único punto de escritura para escáner y registro manual, así las
   dos vías guardan exactamente los mismos campos y las reglas de
   Firestore pueden exigirlos sin excepciones.
=========================== */

export async function guardarRegistro({
    estudiante,
    tipoRegistro,
    estado,
    origen,          // "qr" | "manual"
    usuario,         // window.usuarioActual
    motivo = null,   // obligatorio cuando origen === "manual"
    hora = new Date()
}) {

    if (origen === "manual" && !motivo) {
        throw new Error("Un registro manual necesita un motivo.");
    }

    const datos = {
        estudianteId: estudiante.id,
        fecha: aCadenaFecha(hora),
        turno: estudiante.turno,
        tipoRegistro,
        horaRegistrada: Timestamp.fromDate(hora),
        estado,
        origen,
        registradoPor: usuario?.uid || null
    };

    if (origen === "manual") {
        datos.motivo = motivo;
        datos.registradoPorNombre = usuario?.nombre || null;
    }

    const referencia = await addDoc(collection(db, "asistencias"), datos);

    return { id: referencia.id, ...datos };

}

/* ===========================================================
   RESUMEN DEL DÍA DE UN ESTUDIANTE
   -----------------------------------------------------------
   "Salida pendiente" queda formalizada aquí, y SOLO aquí, como un
   estado DERIVADO: nunca se escribe en Firestore. Un registro guardado
   describe un hecho que ocurrió (alguien escaneó a tal hora); "salida
   pendiente" describe algo que NO ocurrió, y eso cambia con el paso
   del tiempo. Si se guardara, habría que reescribirlo en cuanto el
   estudiante saliera.

   Definición: el estudiante tiene al menos una entrada y su último
   evento del día es una entrada (nunca cerró el ciclo), y además:
     - si la fecha ya pasó → es definitivo, quedó pendiente;
     - si la fecha es hoy → solo cuenta como pendiente una vez pasada
       la hora oficial de salida del turno más MINUTOS_TOLERANCIA_SALIDA;
       antes de eso el estudiante simplemente sigue en clase.
=========================================================== */

export function resumirDia(registrosDelDia, horarios, opciones = {}) {

    const ahora = opciones.ahora || new Date();
    const fecha = opciones.fecha || obtenerFechaHoy();
    const registros = ordenarPorHora(registrosDelDia);

    const entradas = registros.filter((r) => r.tipoRegistro === "entrada");
    const salidas = registros.filter((r) => r.tipoRegistro === "salida");

    const primeraEntrada = entradas[0] || null;
    const ultimaSalida = salidas[salidas.length - 1] || null;
    const ultimo = registros[registros.length - 1] || null;

    const presente = entradas.length > 0;

    // Solo la primera entrada define la puntualidad del día.
    const estadoEntrada = primeraEntrada ? primeraEntrada.estado : null;

    const cicloAbierto = presente && ultimo?.tipoRegistro === "entrada";

    let salidaPendiente = false;

    if (cicloAbierto) {
        if (fecha < aCadenaFecha(ahora)) {
            salidaPendiente = true; // día cerrado: ya no puede registrarse
        } else if (fecha === aCadenaFecha(ahora) && horarios?.horaSalida) {
            const limite = horaEnMinutos(horarios.horaSalida) + MINUTOS_TOLERANCIA_SALIDA;
            salidaPendiente = minutosDeFecha(ahora) > limite;
        }
    }

    return {
        fecha,
        presente,
        registros,
        totalRegistros: registros.length,
        horaEntrada: primeraEntrada ? aFecha(primeraEntrada.horaRegistrada) : null,
        horaSalida: ultimaSalida ? aFecha(ultimaSalida.horaRegistrada) : null,
        estadoEntrada,
        reingresos: Math.max(0, entradas.length - 1),
        cicloAbierto,
        salidaPendiente,
        // Estado único para mostrar en tablas y tarjetas
        estadoResumen: !presente
            ? ESTADOS.AUSENTE
            : (salidaPendiente ? ESTADOS.SALIDA_PENDIENTE : estadoEntrada)
    };

}

/* ===========================
   AGRUPACIÓN MASIVA
   Para dashboard y reportes: recibe TODOS los registros de una fecha
   (o rango) y los agrupa por estudiante, sin una consulta por alumno.
=========================== */

export function agruparPorEstudiante(registros) {

    const mapa = new Map();

    registros.forEach((r) => {
        if (!mapa.has(r.estudianteId)) mapa.set(r.estudianteId, []);
        mapa.get(r.estudianteId).push(r);
    });

    return mapa;

}

export function agruparPorFecha(registros) {

    const mapa = new Map();

    registros.forEach((r) => {
        if (!mapa.has(r.fecha)) mapa.set(r.fecha, []);
        mapa.get(r.fecha).push(r);
    });

    return mapa;

}

/* ===========================
   CONSULTAS REUTILIZABLES
=========================== */

export async function obtenerAsistenciasPorFecha(fecha) {

    const consulta = query(collection(db, "asistencias"), where("fecha", "==", fecha));
    const snap = await getDocs(consulta);

    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));

}

export async function obtenerAsistenciasPorRango(desde, hasta) {

    // Firestore permite rango sobre un único campo; "fecha" es string
    // "YYYY-MM-DD", que ordena igual que una fecha real.
    const consulta = query(
        collection(db, "asistencias"),
        where("fecha", ">=", desde),
        where("fecha", "<=", hasta),
        orderBy("fecha", "asc")
    );

    const snap = await getDocs(consulta);

    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));

}

export async function obtenerEstudiantesActivos() {

    const consulta = query(collection(db, "estudiantes"), where("estado", "==", "activo"));
    const snap = await getDocs(consulta);

    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));

}

/* ===========================
   UTILIDADES DE PRESENTACIÓN
=========================== */

export function escapar(texto) {
    const div = document.createElement("div");
    div.textContent = texto ?? "";
    return div.innerHTML;
}

export function nombreCompleto(estudiante) {
    if (!estudiante) return "Estudiante no encontrado";
    return `${estudiante.nombres || ""} ${estudiante.apellidos || ""}`.trim();
}

export function etiquetaTurno(turno) {
    return turno === "manana" ? "Mañana" : turno === "tarde" ? "Tarde" : "—";
}

export function badgeEstado(estado) {
    const info = ETIQUETAS_ESTADO[estado] || ETIQUETAS_ESTADO.sin_registro;
    return `<span class="estado ${info.clase}">${info.texto}</span>`;
}
