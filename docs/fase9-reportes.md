# Fase 9 — Reportes individuales y generales

`reportes.html` + `js/reportes.js`. Dos pestañas sobre el mismo motor de
cálculo: informe individual y reporte general.

## El problema de fondo: los días esperados

Un porcentaje de asistencia solo significa algo si se sabe contra qué
se compara. "Presente 12 días" no dice nada sin saber si hubo 13 días
de clase o 20. Y "ausente" no se puede deducir de la ausencia de
registros: nadie está ausente un domingo.

**Regla implementada.** Un día cuenta como esperado para un estudiante
si cumple las dos condiciones:

1. Hay al menos un registro de asistencia de **algún estudiante de su
   mismo turno** ese día. Es la prueba de que hubo jornada para ese
   turno. Un domingo, un feriado o una suspensión de clases no deja
   ningún registro y se descarta solo, sin obligar a nadie a mantener
   un calendario escolar que en la práctica nunca se actualiza. Se
   evalúa **por turno**, no por institución: si la tarde no tuvo clases
   un día, sus alumnos no cargan con esa ausencia.
2. Es igual o posterior a su `fechaRegistro`. Un estudiante matriculado
   en mayo no acumula ausencias de marzo.

**El costo de esta regla, explícito:** si un día hubo clases pero nadie
escaneó —se cayó el sistema toda la jornada, se olvidaron las tablets—
ese día no cuenta como esperado y sus ausencias no aparecen. Se prefiere
ese error al contrario: marcar ausente a media institución por una falla
técnica genera desconfianza en todo el sistema y desmiente reportes ya
firmados.

## Informe individual

Estudiante (buscado por nombre o DNI) + rango de fechas. Devuelve:

- **Resumen:** días esperados, presentes, ausentes, puntuales,
  tardanzas, tempranas, % de asistencia y salidas pendientes.
- **Detalle diario:** una fila por día esperado, con entrada, salida,
  estado, número de registros y reingresos. Los días con algún registro
  manual quedan marcados.

El % de asistencia es `presentes / días esperados`, redondeado a un
decimal.

## Reporte general

Periodo (día / semana / mes / rango personalizado) cruzado con turno,
grado, sección y —opcionalmente— un estudiante concreto. El selector de
periodo solo **precarga fechas coherentes**: "semana" toma la semana de
lunes a domingo que contiene la fecha inicial, "mes" el mes completo, y
ambos se recortan en la fecha de hoy porque no tiene sentido contar
como esperados días que aún no han ocurrido.

La tabla lista un estudiante por fila con sus totales, y arriba van los
totales del grupo. Los "días-estudiante esperados" del resumen son la
suma de los días esperados de cada estudiante, que es el denominador
correcto cuando se mezclan turnos con calendarios distintos.

## Reutilización

Todos los cálculos por día salen de `resumirDia()` del núcleo de la
Fase 7 — los mismos que usa el dashboard. No hay una segunda definición
de "presente", "tarde" o "salida pendiente" en el proyecto.

El resultado queda en `window.informeIndividualActual` y
`window.reporteGeneralActual` para que la Fase 10 exporte exactamente
lo mostrado, con el mismo patrón de `window.listaEstudiantesFiltrados`
de las fases 4 y 5.

## Rendimiento

Una sola consulta por rango (`fecha >= desde && fecha <= hasta`) y todo
el agrupamiento en memoria, en vez de una consulta por estudiante. Para
un mes de una institución mediana son unos pocos miles de documentos,
que Firestore devuelve en una sola pasada. Para rangos anuales, ver las
notas de volumen de la Fase 11.
