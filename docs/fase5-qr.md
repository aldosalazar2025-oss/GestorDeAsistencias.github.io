# Fase 5 — Generación de códigos QR

## Por qué esta fase quedó reducida

La generación individual del código QR ya se resolvió en la Fase 3:
se crea automáticamente al registrar o importar un estudiante
(`codigoQR = "EST-<timestamp>"`), se dibuja en pantalla con
`qrcodejs`, y `descargarQR()` permite bajarlo con marco blanco
imprimible. Repetir eso aquí no aportaba nada nuevo.

Lo que sí faltaba, y es lo que pedía el requisito 6 del documento
("Descargar/imprimir el código QR"), era el caso real de uso:
imprimir de una sola vez todos los QR de un grado/sección antes del
inicio de clases, sin tener que descargar estudiante por estudiante.

## Qué se agregó

- **`js/estudiantes-qr-lote.js`**: nuevo módulo, no toca
  `estudiantes.js`. Lee `window.listaEstudiantesFiltrados` (ya
  expuesto por Fase 3/4) para tomar exactamente los estudiantes que
  el admin está viendo con los filtros de grado/sección/turno y el
  buscador.
- **Descarga en ZIP** (`JSZip`): un PNG por estudiante, nombrado
  `<codigoQR>_<APELLIDOS>_<NOMBRES>.png`.
- **Descarga en PDF** (`jsPDF`): cuadrícula de 3×4 por hoja A4, lista
  para imprimir y recortar.
- **Etiqueta común a ambos formatos**: QR + nombre completo + grado
  "sección" · turno + código, en vez de solo el QR — para que la
  hoja impresa sirva también como carné/etiqueta identificable sin
  tener que escanear cada una para saber de quién es.
- **Contador en vivo** sobre la tabla, para que el admin vea cuántos
  QR va a generar antes de hacer clic.

## Regla de negocio agregada en esta fase

Solo se incluyen estudiantes con `estado === "activo"`. No tiene
sentido imprimir el QR de alguien desactivado, y evita reutilizar
por error el QR de un estudiante que ya no está matriculado. Esto no
estaba explícito en el documento de requisitos — se aplica aquí
porque es consistente con la regla de Fase 3 de nunca reasignar el
`codigoQR` de un estudiante inactivo.

## Pendiente para fases siguientes

- El escáner (Fase 6) es quien realmente valida el `codigoQR` contra
  Firestore; esta fase no agrega ni cambia validación, solo empaqueta
  para imprimir.
