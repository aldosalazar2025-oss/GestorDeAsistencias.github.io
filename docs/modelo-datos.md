# Modelo de datos — Sistema de Asistencia Escolar QR

Base reciclada de "QrParaEventos" (Firebase Auth + Firestore), adaptada de
una colección única `Invitados` a un modelo con historial diario y roles.

## Colecciones

### `estudiantes/{id}`

| Campo | Tipo | Notas |
|---|---|---|
| codigoEstudiante | string | Código interno, opcional |
| dni | string | Identificador, único |
| nombres | string | |
| apellidos | string | |
| grado | string | Ej. "5º" |
| seccion | string | Ej. "A" |
| turno | string | "manana" \| "tarde" |
| fotoUrl | string | URL en Firebase Storage, opcional |
| codigoQR | string | Único, generado al crear (ej. `EST-<timestamp>`) |
| estado | string | "activo" \| "inactivo" |
| fechaRegistro | timestamp | |

### `usuarios/{uid}`

El `{uid}` es el mismo UID de Firebase Auth — así las reglas de
seguridad pueden leer el rol directamente sin una consulta extra.

| Campo | Tipo | Notas |
|---|---|---|
| nombre | string | |
| email | string | |
| rol | string | "admin" \| "encargado" |
| activo | boolean | |

### `configuracionHorarios/{turno}`

Documento por turno (`manana`, `tarde`). Nunca hardcodeado en el código.

| Campo | Tipo | Notas |
|---|---|---|
| inicioTemprano | string | Hora "HH:mm" |
| inicioPuntual | string | |
| finPuntual | string | Después de esta hora = "tarde" |
| horaSalida | string | Hora oficial de salida del turno |

### `asistencias/{id}`

Un documento por cada evento de entrada o salida (no un estado único
que se sobrescribe, a diferencia del proyecto original).

| Campo | Tipo | Notas |
|---|---|---|
| estudianteId | string | Referencia a `estudiantes/{id}` |
| fecha | string | "YYYY-MM-DD", para filtrar/agrupar fácil |
| turno | string | "manana" \| "tarde" |
| tipoRegistro | string | "entrada" \| "salida" |
| horaRegistrada | timestamp | |
| estado | string | "temprano" \| "puntual" \| "tarde" \| "ausente" \| "salida_pendiente" |
| origen | string | "qr" \| "manual" |
| auditoria | map \| null | Solo presente si el registro fue corregido |
| auditoria.registroOriginal | map | Copia del estado anterior |
| auditoria.usuarioModifico | string | UID de quien corrigió |
| auditoria.motivoModificacion | string | |
| auditoria.fechaModificacion | timestamp | |

## Por qué este diseño (vs. el proyecto reciclado)

- **`Invitados` (original) → `estudiantes` + `asistencias` (nuevo):** el
  proyecto de eventos guardaba un solo estado por invitado porque solo
  había un ingreso posible. Aquí necesitamos historial diario completo
  por estudiante, así que separamos "quién es el estudiante" de "qué
  pasó cada día".
- **`usuarios` con rol:** el proyecto original solo verificaba
  `request.auth != null`. Aquí necesitamos distinguir Administrador de
  Personal de asistencia, así que agregamos esta colección y las
  reglas la consultan con `get()`.
- **`configuracionHorarios` separado:** para que el admin edite los
  horarios sin tocar código, como pediste explícitamente.
- **Referencia por ID, no anidamiento:** evita duplicar datos del
  estudiante en cada registro de asistencia, y permite que la
  colección crezca con miles de registros sin volverse pesada.

## Índices compuestos necesarios

Ver `firebase/firestore.indexes.json`:
- `asistencias` por `estudianteId` + `fecha` → informe individual
- `asistencias` por `fecha` + `turno` + `estado` → dashboard y reportes generales
- `asistencias` por `estudianteId` + `turno` + `fecha` → historial por turno
- `estudiantes` por `grado` + `seccion` + `turno` → filtros del módulo de gestión

## Siguiente fase

Fase 2: Autenticación y usuarios — adaptar `login.js` y `auth-guard.js`
del proyecto reciclado, y construir la pantalla de gestión de usuarios
(solo accesible para admin) que escribe en la colección `usuarios`.
