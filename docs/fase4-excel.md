# Fase 4 — Importación y exportación de Excel

## Qué se recicló de "QrParaEventos" (`asistencia.js`)

- Lectura del archivo con **SheetJS** (`XLSX.read` + `sheet_to_json`)
- Validación fila por fila con mensajes de error específicos
- Conteo de resumen (importados / duplicados / inválidos)
- Procesamiento por lotes con `writeBatch` (máx. 450 por lote, el
  límite real de Firestore es 500) — igual patrón que usaba
  `btnEliminarTodos` en el proyecto original

## Diferencia importante frente al original

El proyecto de eventos **importaba directamente** y mostraba el
resumen recién al final (con un `alert`). Tu documento de requisitos
pide explícitamente una **vista previa antes de confirmar** — así que
aquí el flujo se dividió en dos pasos:

1. **`procesarVistaPrevia()`**: solo lee y valida el archivo, no
   escribe nada en Firestore. Muestra un modal con cada fila marcada
   en verde (lista) o rojo (con el motivo del error), más el resumen
   de conteos.
2. **`btnConfirmarImport`**: recién aquí se ejecuta el `writeBatch`
   con las filas válidas. Si el admin cierra el modal, no se guarda
   nada.

## Nuevo en esta fase

- **Plantilla descargable** (`btnDescargarPlantilla`): genera un
  `.xlsx` de ejemplo con las columnas exactas esperadas
  (Nombres, Apellidos, DNI, Grado, Sección, Turno), para que el
  admin no tenga que adivinar el formato.
- **Exportación de estudiantes**: exporta exactamente la lista que
  el admin está viendo en ese momento (respeta los filtros de
  grado/sección/turno/búsqueda ya aplicados), no siempre la lista
  completa.
- Detección de **duplicados dentro del mismo archivo** (no solo
  contra la base de datos), que el proyecto original no verificaba.

## Pendiente para fases siguientes

Los reportes de **asistencia** (diaria/semanal/mensual, puntuales/
tardíos/ausentes, entradas y salidas) todavía no se pueden exportar
porque la colección `asistencias` aún no existe — eso llega con el
escáner (Fase 6) y las entradas/salidas (Fase 7). La exportación de
esos reportes está planificada para la Fase 10, reutilizando el mismo
patrón de `XLSX.utils.json_to_sheet` que ya se usó aquí.
