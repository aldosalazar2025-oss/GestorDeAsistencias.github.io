# Fase 8 — Dashboard y estadísticas

`index.html` deja de ser la pantalla provisional de la Fase 2 y pasa a
ser el panel real. Lógica en **`js/dashboard.js`**; los cálculos son
los del núcleo de la Fase 7, no una segunda implementación.

## Tarjetas

Total de estudiantes, presentes, ausentes, puntuales, tardanzas,
tempranas, salidas registradas y salidas pendientes. Se calculan sobre
el grupo que pasa los filtros de turno/grado/sección/estudiante, para
que un subdirector pueda mirar solo "5º B tarde" y las cifras
correspondan a ese grupo.

**"Ausente" aquí es una foto del momento.** A primera hora del turno
casi todos figuran ausentes porque todavía no han llegado, y eso es
correcto para una pantalla en vivo. El cálculo formal de ausencias
—contra los días esperados en un rango— es de la Fase 9. Están
deliberadamente separados: mezclarlos daría un porcentaje de asistencia
que empeora y mejora durante la mañana.

## Gráficos (Chart.js 4)

Se eligió Chart.js por lo que ya estaba puesto: la paleta de
`estilos.css` (verde puntual, ámbar tarde, azul temprano, rojo ausente,
violeta reingreso) se pasa tal cual a los datasets, y los valores por
defecto de Chart.js se reconfiguran una sola vez
(`configurarChartJs()`) para el fondo oscuro y la tipografía
monoespaciada del tema.

| Gráfico | Tipo | Fuente |
|---|---|---|
| Puntualidad del día | dona | registros de la fecha seleccionada |
| Presentes vs. ausentes | dona | idem |
| Mañana vs. tarde | barras agrupadas | idem, particionado por turno |
| Asistencia por día | barras | rango de 20 días, últimos 7 lectivos |
| Tendencia de asistencia | línea | % de asistencia del rango completo |

Detalle que cuesta un rato descubrir: Chart.js **no reutiliza** un
canvas ya ocupado. `pintarGrafico()` destruye la instancia anterior
antes de crear la nueva; si no, al cambiar un filtro el gráfico viejo
queda "fantasma" debajo y los tooltips se mezclan.

### Días lectivos sin calendario escolar

Los gráficos históricos necesitan saber qué días hubo clase. En vez de
pedir un calendario que nadie va a mantener, se toma como día lectivo
**todo día con al menos un registro en toda la institución**. Un
domingo o un feriado no tiene ninguno y se descarta solo. La misma
regla se reutiliza en la Fase 9 para los días esperados.

## Tabla en tiempo real (requisito 13)

`onSnapshot` sobre `asistencias` con `where("fecha", "==", ...)`: un
único listener, sobre la fecha seleccionada. Los filtros de
turno/grado/sección/estado/estudiante se aplican **en memoria**, no en
la consulta, porque filtrarlos en Firestore exigiría un índice
compuesto por cada combinación y recrear el listener en cada cambio de
filtro.

La fila muestra entrada, salida, estado resumido y cuántos registros
tiene el estudiante ese día (con el número de reingresos, si los hay).
Un distintivo **MANUAL** marca las filas que incluyen algún registro
hecho a mano en la Fase 7 — quien mira la tabla debe poder ver de un
vistazo qué se escaneó y qué se escribió.

**El filtro de estado se aplica solo a la tabla**, no a las tarjetas ni
a los gráficos. Si afectara a todo, filtrar por "tarde" haría que las
tarjetas mostraran 100% de tardanzas, que es exactamente lo contrario
de lo que quiere ver quien filtra.

## Límites conocidos

- La lista de estudiantes se carga una vez al abrir. Si el admin da de
  alta un estudiante en otra pestaña, aparece al recargar. Los
  **registros** sí son en vivo, que es lo que importa durante el
  ingreso.
- El rango histórico está fijado en 20 días. Con muchos años de datos
  conviene recortarlo o mover el cálculo a agregados diarios; ver las
  notas de volumen en la Fase 11.
