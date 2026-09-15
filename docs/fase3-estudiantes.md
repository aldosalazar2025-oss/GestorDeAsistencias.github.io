# Fase 3 — Gestión de estudiantes

## Qué se recicló de "QrParaEventos" (`asistencia.js` / `registro.js`)

- Validación de duplicados antes de guardar (allí por DNI en
  `Invitados`, aquí por DNI en `estudiantes`).
- Generación de código único al registrar (`INV-<timestamp>` →
  `EST-<timestamp>`).
- Renderizado del QR en pantalla con la librería `qrcodejs`
  (`new QRCode(...)`) y la función `descargarQR` que dibuja una copia
  en un `<canvas>` con marco blanco de 480px — pensada para imprimir.
- Patrón de tabla + modal de edición + `escapar()` para evitar
  inyección de HTML al mostrar nombres.
- Buscador por texto sobre nombre/DNI.

## Nuevo en esta fase

- **Filtros por grado, sección y turno** (además del buscador),
  requeridos explícitamente en el documento de requisitos — el
  proyecto original no los tenía porque no manejaba esos campos.
- **Foto del estudiante** subida a Firebase Storage
  (`estudiantes/{codigoQR}.jpg`), con `firebase/storage.rules` nuevas:
  solo admin sube/reemplaza, el personal de asistencia solo puede
  leer (lo necesitará en el panel de escaneo, Fase 6).
- **Desactivar en vez de eliminar**: el requisito pide poder
  "desactivar estudiantes", no borrarlos — a diferencia del proyecto
  de eventos, que sí permitía eliminar. Aquí nunca se borra un
  estudiante, porque perdería la trazabilidad de su historial de
  asistencias (Fase 9).
- Página restringida a admin (`data-rol-requerido="admin"`), porque
  las reglas de Firestore ya exigen rol admin para escribir en
  `estudiantes`.

## Pendiente para fases siguientes

- La importación masiva desde Excel (Fase 4) reutilizará este mismo
  formulario de validación de duplicados, pero por lotes — el
  proyecto reciclado ya trae esa lógica completa en `asistencia.js`
  (SheetJS + resumen de importados/duplicados/inválidos), lista para
  adaptar a los campos de estudiante.
- El escáner (Fase 6) va a consultar `estudiantes` por `codigoQR` para
  identificar a quién pertenece cada lectura.
