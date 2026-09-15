# Fase 7 — Sistema de entradas y salidas

Cierra los tres casos que la Fase 6 dejó marcados.

## Lo primero: un núcleo compartido

Antes de resolver los casos límite había un problema estructural: toda
la lógica de negocio vivía dentro de `escanear.js`. El registro manual
de esta misma fase la necesita igual, y el dashboard (Fase 8) y los
reportes (Fase 9) también. Duplicarla habría garantizado que las tres
pantallas terminaran discrepando entre sí.

Por eso esta fase empieza con **`js/asistencia-core.js`**, y
`escanear.js` pasa a ocuparse solo de la cámara y la interfaz. Todo lo
que decide *qué se registra* y *qué significa* está en un solo archivo:
`decidirRegistro()`, `guardarRegistro()`, `resumirDia()`,
`clasificarEntrada()` y las consultas reutilizables.

## Caso 1 — Ya tiene entrada y salida hoy

**Decisión: sí se permite una nueva entrada.**

La jornada se modela como una **secuencia de eventos alternados**, no
como un par fijo entrada/salida. Solo se mira el último registro del
día:

| Último registro | Qué se registra ahora |
|---|---|
| (ninguno) | entrada → `temprano` / `puntual` / `tarde` |
| entrada | salida → `salida_registrada` |
| salida | entrada → `reingreso` |

El caso real existe: un estudiante sale por permiso médico, por una
emergencia familiar o por un taller fuera del aula, y vuelve. Con la
regla de la Fase 6 quedaba rechazado y el sistema lo daba por retirado
el resto del día.

**Por qué el reingreso no vuelve a clasificar puntualidad.** La
puntualidad describe *la llegada al turno*, y eso ya se evaluó en la
primera entrada. Si se reclasificara, todo reingreso posterior al
límite de puntualidad aparecería como "tarde" y arruinaría la
estadística del requisito 16: un alumno puntual que salió al médico
volvería convertido en tardanza. Regla fija: **solo la primera entrada
del día define la puntualidad**. `resumirDia()` lo asume, y con ella el
dashboard y los reportes.

### Dos protecciones nuevas

- **Antirrebote (`MINUTOS_ANTIRREBOTE = 2`):** con la secuencia
  alternada, un QR sostenido frente a la cámara ya no sería ignorado
  como antes — generaría una salida falsa segundos después de la
  entrada. Dos registros del mismo estudiante separados por menos de
  dos minutos se rechazan con aviso.
- **Tope diario (`MAX_REGISTROS_DIA = 10`):** sin él, un QR fotocopiado
  podría inflar la colección sin límite. Diez eventos cubren cinco
  ciclos completos en una jornada real.

## Caso 2 — Registro manual (requisito 19)

**`registro-manual.html` + `js/registro-manual.js`**, enlazado desde el
escáner y desde el panel. Lo usan los mismos roles que escanean.

- Busca por **nombres, apellidos o DNI**, en memoria: Firestore no hace
  búsqueda parcial de texto, y una consulta por prefijo fallaría en el
  caso más común ("buscar por apellido escribiendo el nombre"). La
  lista de estudiantes activos se carga una vez al abrir la pantalla.
- Muestra los registros que el estudiante ya tiene hoy **antes** de
  guardar, para que el personal no registre a ciegas.
- Aplica `decidirRegistro()` — las mismas reglas que el escáner — y
  anuncia qué va a pasar antes del clic.
- **Motivo obligatorio** (lista de motivos frecuentes + campo libre).
- Guarda `origen: "manual"`, `motivo`, `registradoPor` y
  `registradoPorNombre`. Un registro manual siempre se puede auditar
  después; uno por QR no necesita justificación.
- **Hora ajustable hacia atrás**, nunca hacia adelante: un registro de
  asistencia describe algo que ya ocurrió.
- **Permite forzar entrada o salida.** El personal puede saber algo que
  el sistema no — por ejemplo, que la entrada de la mañana nunca se
  escaneó, así que quien "entra" ahora en realidad está saliendo. El
  tipo forzado queda anotado dentro del motivo. El antirrebote y el
  tope diario se respetan igual al forzar: son protecciones contra
  duplicados, no una clasificación opinable.
- Antes de escribir **se relee el día**: entre la búsqueda y el clic
  pudo pasar un escaneo del mismo estudiante en otro dispositivo.

## Caso 3 — "Salida pendiente" formalizada

**Es un estado derivado. Nunca se escribe en Firestore.**

Un documento de `asistencias` describe un hecho que ocurrió (alguien
registró algo a tal hora). "Salida pendiente" describe algo que **no**
ocurrió, y eso cambia solo con el paso del tiempo: si se guardara,
habría que reescribirlo en cuanto el estudiante saliera, y habría que
recorrer toda la colección cada tarde para crear esos documentos.

Definición implementada en `resumirDia()`: el estudiante tiene al menos
una entrada, su último evento del día es una entrada (ciclo abierto), y
además

- si la fecha ya pasó → es definitivo, quedó pendiente;
- si la fecha es hoy → solo cuenta como pendiente después de la hora
  oficial de salida del turno más `MINUTOS_TOLERANCIA_SALIDA` (30). Antes
  de eso el estudiante simplemente sigue en clase, y marcarlo como
  pendiente sería ruido.

Esto le da también su contraparte operativa: el panel **"Salidas
pendientes de hoy"** en el registro manual lista los ciclos abiertos por
turno, con un botón para cerrarlos. Cerrar no es un arreglo automático
— crea un registro de salida manual, con motivo y responsable. **El
sistema nunca inventa una salida por su cuenta**; si lo hiciera, el dato
de "a qué hora se retiró" dejaría de ser confiable.

`configuracionHorarios.horaSalida`, que hasta ahora solo se guardaba,
por fin se usa para algo.

## Cambios en archivos existentes

- `js/escanear.js`: adelgazado; ya no decide ni clasifica, delega en el
  núcleo. Corregido de paso un bug de la Fase 6: el caché de horarios
  no se invalidaba nunca, así que un cambio de horarios no tenía efecto
  hasta recargar (`limpiarCacheHorarios()`).
- `escanear.html`: botón hacia el registro manual, y los mensajes de
  error de cámara ahora derivan hacia ahí.
- `css/estilos.css`: estados `reingreso`, `salida-registrada` y
  `salida-pendiente`, más los estilos del buscador y de la lista de
  pendientes.

## Campos nuevos en `asistencias`

| Campo | Cuándo | Notas |
|---|---|---|
| origen | siempre | `"qr"` \| `"manual"` (ya estaba en el modelo, ahora siempre se escribe) |
| registradoPor | siempre | UID de quien registró, también en los escaneos |
| motivo | solo manual | obligatorio |
| registradoPorNombre | solo manual | copia del nombre para no resolver el UID en cada reporte |

Las reglas de Firestore se endurecen para exigirlos en la Fase 11.
