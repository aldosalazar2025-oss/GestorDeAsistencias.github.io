# Fase 6 — Panel de escaneo mediante cámara

## Ajuste de alcance acordado antes de programar

El requisito 4 pide que los horarios sean configurables por un admin
sin tocar código, pero ninguna fase anterior había construido esa
pantalla (solo estaba documentada en el modelo de datos de la
Fase 1). Sin eso, el escáner no tenía con qué clasificar
temprano/puntual/tarde. Se acordó agregar, dentro de esta misma fase:

- **`configuracion.html` + `js/configuracion.js`**: CRUD mínimo sobre
  `configuracionHorarios/{manana,tarde}` (solo admin — la regla de
  Firestore ya lo exigía desde la Fase 1). Incluye una validación de
  coherencia: `inicioTemprano < inicioPuntual < finPuntual`.

## Qué se agregó para el escáner

- **`escanear.html` + `js/escanear.js`**: usa `html5-qrcode` (nueva
  librería en el proyecto — `qrcodejs`, de las fases anteriores, solo
  sirve para *generar* QR, no para leerlos con cámara). El CSS de
  `.scanner-container` / `#reader` ya venía preparado en
  `estilos.css` desde el proyecto reciclado.
- Selecciona automáticamente la cámara trasera si el dispositivo
  tiene varias.
- Al detectar un QR: pausa el lector, procesa el registro, muestra la
  confirmación (foto, nombre, grado/sección, hora, tipo, estado) y
  reanuda automáticamente el escaneo después de 2 segundos — así se
  cumple "escaneos consecutivos sin recargar" sin registrar el mismo
  QR varias veces por accidente mientras sigue frente a la cámara.
- Beep de éxito/error con Web Audio API (sin archivos de audio que
  alojar). Se puede desactivar con un switch en la pantalla.
- Lista de los últimos 15 registros de la sesión actual (en memoria,
  se reinicia al recargar la página — no es el historial permanente,
  ese vive en `asistencias` y se consulta en fases posteriores).

## Decisiones de diseño

- **El turno se toma del estudiante, no de la hora del escaneo.**
  Cada estudiante ya tiene un `turno` fijo asignado (modelo de datos,
  Fase 1). Usar ese campo evita ambigüedad si alguien escanea fuera
  de su horario habitual.
- **Solo la entrada se clasifica en temprano/puntual/tarde.** El
  requisito 4 no define franjas equivalentes para la salida, solo un
  `horaSalida` de referencia. Por eso una salida se guarda con
  `estado: "salida_registrada"`, no con una de las tres franjas.
- **QR escaneado dos veces en el mismo día (ya tiene entrada Y
  salida):** el escáner avisa y NO crea un tercer registro. Corregir
  este caso (por ejemplo, permitir una nueva entrada si el estudiante
  salió y volvió a entrar) es explícitamente parte de la
  **Fase 7 — Sistema de entradas y salidas**, según tu propio orden
  de fases.
- **"Ausente" y "Salida pendiente" no se escriben durante el
  escaneo.** Son estados que solo tienen sentido calculados al cierre
  del día (¿quién no tiene ningún registro hoy? ¿quién tiene entrada
  sin salida?), así que se calculan en reportes (Fase 9), no aquí.

## Pendiente para fases siguientes

- Fase 7: reforzar la lógica de entrada/salida (el caso de doble
  registro de arriba, y cualquier otro caso límite de la sección 19
  del documento de requisitos que no aplique directamente al momento
  del escaneo).
- Fase 9: cálculo de "ausente" y "salida pendiente" para los reportes.
- Fase 15 (corrección manual): editar un registro ya guardado,
  guardando `auditoria` — las reglas de Firestore para `asistencias`
  ya lo exigen desde la Fase 1.
