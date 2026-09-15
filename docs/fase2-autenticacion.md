# Fase 2 — Autenticación y usuarios

## Qué se recicló de "QrParaEventos"

- `auth-guard.js`: se amplió para además leer el rol desde
  `usuarios/{uid}` y exponerlo como `window.usuarioActual`, y para
  soportar `data-rol-requerido="admin"` en el `<body>` de una página.
- `login.js`: mismo flujo de `signInWithEmailAndPassword`, con el
  agregado de verificar que el usuario tenga un documento en
  `usuarios` y esté `activo` antes de dejarlo entrar.
- `login.html` / estilo: mismo tema visual ("terminal de acceso"),
  sin el logo de marca del proyecto original.

## Nuevo en esta fase

- **`usuarios.html` + `usuarios.js`**: panel exclusivo de admin para
  crear cuentas, asignarles rol (`admin` / `encargado`) y
  activar/desactivar (nunca se elimina un usuario, para no perder
  el rastro de auditoría de quién hizo cada corrección más adelante).
- Truco de la **app secundaria de Firebase**: crear un usuario con el
  SDK de cliente inicia sesión automáticamente como ese usuario nuevo,
  lo que sacaría al admin de su propia sesión. `usuarios.js` crea una
  instancia temporal de la app solo para el alta, y la destruye
  después — así el admin nunca pierde su sesión.
  *(Más adelante, si prefieres algo más robusto, esto se puede mover
  a una Cloud Function con el Admin SDK — quedó anotado como mejora
  de la Fase 11.)*

## ⚠️ Arranque: cómo crear el primer administrador

`usuarios.html` exige ya estar logueado como admin — así que el
primerísimo usuario hay que crearlo a mano, una sola vez:

1. Firebase Console → **Authentication → Users → Add user** (correo + contraseña)
2. Copiar el **UID** que Firebase le asignó
3. Firebase Console → **Firestore Database** → crear la colección
   `usuarios` → documento con **ID = ese mismo UID** → campos:
   ```
   nombre: "Tu nombre"
   email: "tu correo"
   rol: "admin"
   activo: true
   ```
4. Iniciar sesión en `login.html` con ese correo — desde ahí ya
   puedes crear al resto del personal desde `usuarios.html`.

## Pendiente para fases siguientes

- Fase 3 reutilizará el patrón de `registro.js` (validación de
  duplicados) para el alta de **estudiantes**, no de usuarios.
- El botón "Usuarios" en `index.html` ya está condicionado a
  `rol === "admin"`, así que el placeholder del dashboard (Fase 8)
  puede seguir creciendo sobre esta misma base.
