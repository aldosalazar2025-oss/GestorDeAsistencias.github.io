# Fase 10 — Exportación de reportes a Excel

`js/reportes-excel.js`. Mismo patrón que `js/estudiantes-excel.js` de la
Fase 4: `XLSX.utils.json_to_sheet` → `book_append_sheet` → `writeFile`.

## Regla heredada de la Fase 4

**Se exporta exactamente lo que el usuario está viendo.** Este módulo no
consulta Firestore ni recalcula nada: lee
`window.informeIndividualActual` y `window.reporteGeneralActual`, que
`reportes.js` ya dejó listos. Si el Excel pudiera discrepar de la
pantalla, el archivo dejaría de servir como respaldo de lo que se vio al
generarlo, que es justamente para lo que se imprime.

Los botones de exportar se crean dentro del HTML que genera
`reportes.js`, así que se escuchan **por delegación** en `document`; con
referencias directas habría que reenganchar el listener cada vez que se
regenera un reporte.

## Un archivo, varias hojas

El documento de requisitos pide poder exportar puntuales, tardíos,
ausentes, entradas/salidas y la lista de estudiantes. Se resolvió con un
solo libro de varias hojas en vez de un archivo por corte: en la
práctica quien pide uno pide los demás en la misma reunión, y así no hay
que reconciliar cinco archivos con criterios distintos.

### Reporte general

| Hoja | Contenido |
|---|---|
| Resumen | Tipo de periodo, filtros aplicados, totales del grupo, fecha de generación |
| Estudiantes | Lista de los estudiantes incluidos |
| Asistencia por estudiante | Una fila por estudiante con todos sus totales |
| Puntuales / Tardíos / Tempranos | Una fila **por día**, con fecha y hora de entrada |
| Ausentes | Una fila por día ausente |
| Salidas pendientes | Días con entrada y sin salida |
| Entradas y salidas | Detalle crudo: cada evento, con origen, motivo y responsable |

Los cortes de puntuales/tardíos/ausentes se listan **por día, no por
estudiante**: "los tardíos de mayo" es la lista de llegadas tarde con su
fecha y su hora, no una lista de alumnos con un contador.

### Informe individual

Tres hojas: `Resumen` (en vertical, concepto/valor, que es como se lee
un informe impreso), `Detalle diario` (un día por fila) y `Entradas y
salidas`.

## Detalles que evitan un archivo inservible

- **Anchos de columna** calculados según el contenido más largo, con
  tope de 40 caracteres. Sin esto todo se abre cortado en 8 caracteres.
- **Nombres de hoja recortados a 31 caracteres**, que es el límite de
  Excel; superarlo hace que el archivo no abra.
- **Hojas vacías con una fila explicativa** en vez de una hoja en
  blanco, para que se distinga "no hubo tardanzas" de "el reporte falló".
- **Ordenamiento por marca de tiempo real**, no por el texto de la hora:
  ordenado como cadena, "03:45 p. m." queda antes que "10:00 a. m.".
- **Origen, motivo y responsable** viajan en la hoja de detalle: un
  registro manual debe poder auditarse desde el propio Excel, sin
  volver al sistema.

## Lo que ya estaba

La exportación de la **lista de estudiantes** con sus filtros sigue en
`js/estudiantes-excel.js` (Fase 4), sin tocar. Aquí solo se agrega la
lista de los estudiantes incluidos en un reporte de asistencia, que es
otra cosa.
