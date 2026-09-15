# Fase 11 — Pruebas, validaciones, seguridad y corrección de errores

Una advertencia antes de empezar: **el documento de requisitos con la
sección 19 completa lo tienes tú, no está en el proyecto.** Esta matriz
cubre los casos límite que el código efectivamente maneja hoy, deducidos
de lo que las fases anteriores fueron dejando marcado. Contrástala línea
por línea con tu sección 19 y agrega los que falten antes de dar la fase
por cerrada.

---

## 1. Reglas de Firestore endurecidas

Hasta la Fase 10 las reglas comprobaban que los campos **existieran**.
Ahora validan su **contenido**, que es donde estaban los agujeros.

### `asistencias`

| Regla nueva | Por qué |
|---|---|
| `tipoRegistro in ["entrada","salida"]` | Un valor libre rompería `resumirDia()` en silencio: el registro no contaría ni como entrada ni como salida |
| `estado` solo entre los 5 almacenables | **`ausente` y `salida_pendiente` quedan prohibidos como valores guardados.** Son derivados (Fase 7); si alguien los escribiera, los reportes los contarían dos veces |
| `origen in ["qr","manual"]` | El distintivo MANUAL del dashboard y la auditoría del Excel dependen de este campo |
| `registradoPor == request.auth.uid` | Nadie puede registrar a nombre de otro usuario |
| Manual exige `motivo` no vacío | Es la única vía por la que alguien afirma una asistencia sin que el estudiante escanee nada; sin motivo no es auditable |
| `fecha` string de 10 caracteres, `horaRegistrada` timestamp | Evita registros que las consultas por rango nunca encontrarían |
| En `update`: no se puede cambiar `estudianteId` ni `fecha` | Eso no es corregir un registro, es fabricar uno nuevo |
| En `update`: `motivoModificacion` no vacío | El bloque de auditoría existía desde la Fase 1 pero admitía un motivo en blanco |

### `usuarios`

- **Un admin no puede quitarse su propio rol ni desactivarse.** Sin
  esto, el único administrador de la institución se deja fuera con dos
  clics y ya no hay quien gestione usuarios ni horarios. Tampoco puede
  borrar su propio documento.
- `rol` restringido a `admin` / `encargado`.

### `estudiantes`

- DNI obligatorio de 8 caracteres, turno y estado con valores cerrados.
- **`codigoQR` inmutable en los updates.** Regla de negocio de la Fase 3
  que hasta ahora solo vivía en el código: si cambiara, un carné ya
  impreso apuntaría a otro estudiante.

### Transversal

`estaActivo()`: un usuario desactivado ya no puede escribir aunque su
sesión de Auth siga viva. `auth-guard.js` lo expulsa, pero el cliente no
es una barrera de seguridad — quien tenga la consola abierta puede
saltárselo.

---

## 2. Permisos por rol — matriz a verificar

Probar con dos cuentas reales, una de cada rol.

| Acción | admin | encargado |
|---|---|---|
| Ver dashboard y tabla en tiempo real | Sí | Sí |
| Escanear / registrar manualmente | Sí | Sí |
| Cerrar salidas pendientes | Sí | Sí |
| Ver y exportar reportes | Sí | Sí |
| Alta/edición/baja de estudiantes | Sí | **No** |
| Importar Excel / generar QR en lote | Sí | **No** |
| Editar horarios | Sí | **No** |
| Gestionar usuarios | Sí | **No** |
| Eliminar un registro de asistencia | Sí | **No** |

Prueba que no basta con la interfaz: con sesión de `encargado`, intentar
un `addDoc` a `estudiantes` desde la consola del navegador. Debe fallar
con *permission denied*. Si pasa, las reglas no están desplegadas —
`firebase deploy --only firestore:rules`.

---

## 3. Casos límite a probar

### Escaneo y registro

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | QR inexistente | "Código QR no reconocido", sin escritura |
| 2 | QR de estudiante inactivo | Rechazado con su nombre, sin escritura |
| 3 | Primer escaneo del día | Entrada, clasificada por horario |
| 4 | Segundo escaneo (>2 min) | Salida |
| 5 | **Tercer escaneo: ya tiene entrada y salida** | Entrada nueva con estado `reingreso`; la puntualidad del día **no** cambia |
| 6 | Dos escaneos seguidos (<2 min) | Segundo rechazado por antirrebote, sin escritura |
| 7 | Once registros en un día | El undécimo rechazado por tope diario |
| 8 | Turno sin horarios configurados | Mensaje que deriva a Configuración, sin escritura |
| 9 | Escaneo fuera del horario del turno | Se registra igual, con el turno del estudiante (no el de la hora) |
| 10 | Escanear con la cámara bloqueada | Mensaje que deriva al registro manual |

### Registro manual

| # | Caso | Resultado esperado |
|---|---|---|
| 11 | Sin motivo | Bloqueado en el cliente **y** por las reglas |
| 12 | Hora futura | Rechazado |
| 13 | Forzar salida sin entrada previa | Se permite (el personal sabe algo que el sistema no); queda anotado en el motivo |
| 14 | Escaneo en otro dispositivo entre la búsqueda y el clic | Se relee el día antes de escribir: no se duplica |
| 15 | Buscar por apellido escribiendo el nombre | Encuentra igual (búsqueda en memoria, en ambos órdenes) |
| 16 | Estudiante inactivo | No aparece en la búsqueda |

### Salidas pendientes

| # | Caso | Resultado esperado |
|---|---|---|
| 17 | Entrada sin salida, antes de `horaSalida` + 30 min | **No** figura como pendiente (sigue en clase) |
| 18 | Entrada sin salida, después de ese margen | Figura como pendiente, en el panel y en los reportes |
| 19 | Entrada sin salida de un día ya pasado | Pendiente definitivo |
| 20 | Cerrar una pendiente desde el panel | Crea una salida `manual` con motivo y responsable — nunca automática |

### Reportes

| # | Caso | Resultado esperado |
|---|---|---|
| 21 | Rango que incluye domingos y feriados | Esos días **no** cuentan como esperados |
| 22 | Estudiante matriculado a mitad del rango | Solo se le cuentan días desde su `fechaRegistro` |
| 23 | Rango sin ningún registro | Aviso de "no hay días esperados", no un 0% falso |
| 24 | Fecha inicial posterior a la final | Rechazado |
| 25 | Turno con día sin clases | Solo afecta a ese turno, no al otro |
| 26 | Día con reingresos | Cuenta como **un** día presente, con los reingresos aparte |

### Exportación

| # | Caso | Resultado esperado |
|---|---|---|
| 27 | Exportar sin generar el reporte antes | Aviso, no un archivo vacío |
| 28 | Corte sin datos (ningún tardío) | Hoja con "no hay registros", no hoja en blanco |
| 29 | Abrir el .xlsx en Excel y en LibreOffice | Columnas legibles, tildes correctas |
| 30 | Registros manuales en el detalle | Motivo y responsable visibles |

---

## 4. Prueba con volumen real

Genera con la importación de Excel (Fase 4) una carga realista —
digamos 600 estudiantes y un mes de registros — y mide:

- **Escaneo:** debe seguir siendo instantáneo. Solo consulta los
  registros de *un* estudiante en *un* día.
- **Dashboard:** carga todos los registros de la fecha. Con 600 alumnos
  y 2 registros cada uno son ~1.200 documentos por día; sin problema.
- **Reportes mensuales:** ~26.000 documentos en una consulta. Funciona,
  pero es el punto que primero se va a doler.

### Qué hacer cuando duela

1. **Reportes anuales:** partir la consulta por meses y acumular, en
   vez de un solo rango gigante.
2. **Agregados diarios:** una colección `resumenDiario/{fecha}` escrita
   al cierre del día con los totales ya calculados. El dashboard
   histórico y los reportes largos leerían 30 documentos en vez de
   26.000. Es la evolución natural, pero no vale la pena antes de tener
   datos reales.
3. **Lista de estudiantes:** hoy se carga completa en memoria en el
   dashboard, el registro manual y los reportes. Con más de ~2.000
   alumnos conviene paginarla.

También conviene medir el **costo en lecturas de Firestore**: el plan
gratuito da 50.000 lecturas diarias, y un dashboard abierto todo el día
en tiempo real consume más de lo que parece.

---

## 5. Correcciones aplicadas ("al final corregiremos")

| Qué | Dónde | Detalle |
|---|---|---|
| Caché de horarios que no se invalidaba nunca | `escanear.js` → núcleo | Un cambio de horarios no tenía efecto hasta recargar la página. Ahora `configuracion.js` llama a `limpiarCacheHorarios()` al guardar |
| `horaSalida` nunca validada | `configuracion.js` | Se guardaba sin comprobar nada. Desde la Fase 7 decide cuándo algo es "salida pendiente", así que ahora se exige posterior al límite de puntualidad |
| Colisión de la clase `.card` | `escanear.js` + `estilos.css` | La confirmación del escáner usaba la clase `.card` de Bootstrap, pero `estilos.css` la reescribe (centrada, padding 28px). Ahora usa `.tarjeta-confirmacion` |
| Lógica de negocio duplicable | núcleo Fase 7 | Estaba toda dentro de `escanear.js`; cuatro pantallas la necesitaban |
| Helpers duplicados | `escanear.js` | `formatoHora` y el escapado de HTML existían en dos archivos y podían divergir |
| Índices que ya nadie consultaba | `firestore.indexes.json` | Se retiraron `fecha+turno+estado` y `estudianteId+turno+fecha`: esos cortes se hacen en memoria. Cada índice cuesta escritura y almacenamiento |
| Etiqueta de salida con color de "puntual" | `estilos.css` | Una salida se pintaba verde como si fuera puntualidad; ahora tiene su propio color |

---

## 6. Lo que queda abierto, a propósito

- **Corrección manual de un registro ya guardado (Fase 15).** Las reglas
  ya la soportan y la exigen con auditoría completa; falta la pantalla.
- **Recuperación de contraseña**, si tu documento la pide.
- **Días no lectivos declarados.** Hoy se deducen de la ausencia de
  registros (Fase 9). Si la institución quiere declarar feriados por
  adelantado, haría falta una colección `calendarioEscolar` — decisión
  de producto, no un bug.
- **Zona horaria.** Todo usa la hora local del dispositivo. Correcto
  para una institución en una sola zona; si algún día se escanea desde
  otra, hay que fijar la zona en el servidor.
