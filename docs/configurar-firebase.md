# Conectar el sistema a Firebase (plan gratuito)

Todo el sistema funciona en el **plan Spark (gratuito, sin tarjeta)**.
Sigue los pasos en orden; el único que puede trabarte es el 6.

---

## 1. Crear el proyecto

1. Entra a <https://console.firebase.google.com> con tu cuenta de Google.
2. **Agregar proyecto** → nombre, por ejemplo `asistencia-escolar`.
3. Google Analytics: **desactívalo**. No aporta nada aquí y agrega
   pasos de configuración.
4. Crear proyecto → esperar → Continuar.

Crea un proyecto **nuevo**. No reutilices el de "QrParaEventos": las
reglas de seguridad son distintas y al desplegar unas se borran las
otras.

---

## 2. Registrar la app web y copiar las claves

1. En la pantalla principal del proyecto, ícono **`</>`** (Web).
2. Apodo: `asistencia-web`. **No** marques Firebase Hosting todavía.
3. Firebase te muestra un bloque `const firebaseConfig = { ... }`.
4. Copia esos valores a **`js/firebase.js`**, reemplazando los
   `TU_API_KEY`, `TU_PROYECTO`, etc.

Si cierras la pantalla, lo recuperas en
**⚙ Configuración del proyecto → Tus apps → Configuración del SDK**.

> **¿Es peligroso que la `apiKey` quede a la vista en el código?** No.
> En Firebase web esa clave es pública por diseño: solo identifica al
> proyecto. Lo que protege tus datos son las reglas de Firestore, no la
> clave. Por eso la Fase 11 les dedicó tanto trabajo.

---

## 3. Activar Authentication

1. Menú lateral → **Compilación → Authentication** → Comenzar.
2. Pestaña **Sign-in method** → **Correo electrónico/contraseña** →
   habilitar el primero (el de "Vínculo por correo" déjalo apagado) →
   Guardar.

---

## 4. Crear Firestore

1. **Compilación → Firestore Database** → Crear base de datos.
2. Ubicación: `southamerica-east1` (São Paulo) o `us-central1`. **No se
   puede cambiar después.**
3. Empieza en **modo de producción** (bloqueado). Las reglas buenas se
   suben en el paso 5; el modo de prueba deja la base abierta a
   cualquiera durante 30 días.

---

## 5. Subir las reglas y los índices

**Opción A — a mano (sin instalar nada):**

- Firestore → pestaña **Reglas** → pega el contenido de
  `firebase/firestore.rules` → Publicar.
- Los índices los pedirá Firestore solo: cuando una consulta falte, la
  consola del navegador muestra un enlace directo para crearla con un
  clic.

**Opción B — con la CLI (recomendada, y te da el hosting gratis):**

```bash
npm install -g firebase-tools
firebase login
cd asistencia-escolar
firebase use --add            # elige tu proyecto, alias: default
firebase deploy --only firestore:rules,firestore:indexes
```

El `firebase.json` ya está incluido y apunta a los archivos correctos.

---

## 6. Las fotos y Cloud Storage — lee esto

**Cloud Storage ya no es gratis.** Desde el 30/10/2024 hace falta el
plan de pago Blaze (con tarjeta) para crear un bucket nuevo, y desde el
03/02/2026 también para seguir usando los antiguos.

Como tu requisito es que sea gratuito, **cambié cómo se guardan las
fotos de los estudiantes**: en vez de subirlas a Storage, el navegador
las recorta en cuadrado, las reduce a 200×200 en JPEG (~20 KB) y las
guarda como *data URL* dentro del propio documento del estudiante en
Firestore. El resto del sistema no notó el cambio: `fotoUrl` se sigue
usando igual en `<img src="...">`.

Qué implica:

- **No hay que activar Storage.** Ni tocar ese menú.
- El límite real es el tamaño de documento de Firestore, 1 MB. Con
  ~20 KB por foto sobra margen.
- Las fotos originales no se conservan, solo la miniatura. Suficiente
  para identificar a alguien en el escáner, que es para lo que están.
- Si algún día pasas a Blaze, `firebase/storage.rules` sigue en el
  proyecto para volver atrás.

---

## 7. Crear el primer usuario administrador

Problema del huevo y la gallina: la pantalla de usuarios exige ser
admin, y todavía no hay ninguno. Se hace una sola vez a mano.

1. **Authentication → Users → Agregar usuario**: tu correo y una
   contraseña. Copia el **UID** que aparece en la lista.
2. **Firestore Database → Iniciar colección**:
   - ID de colección: `usuarios`
   - ID del documento: **pega ese UID exacto** (no uses "ID
     automático" — las reglas buscan el documento por UID)
   - Campos:
     | Campo | Tipo | Valor |
     |---|---|---|
     | `nombre` | string | tu nombre |
     | `email` | string | tu correo |
     | `rol` | string | `admin` |
     | `activo` | boolean | `true` |
3. Guardar. Desde ahora los demás usuarios los creas desde
   `usuarios.html`.

---

## 8. Configurar los horarios

Entra al sistema → **Horarios** y llena los dos turnos. Sin esto el
escáner no puede clasificar temprano/puntual/tarde y rechaza cada
lectura con un aviso. Recuerda que la hora de salida debe ser posterior
al límite de puntualidad (validación de la Fase 11), porque es la que
decide cuándo algo pasa a ser "salida pendiente".

---

## 9. Publicar la web (gratis)

```bash
firebase deploy --only hosting
```

Te queda en `https://TU-PROYECTO.web.app`. El hosting gratuito da 10 GB
de almacenamiento y 360 MB/día de transferencia — de sobra.

**Esto importa para el escáner:** la cámara del navegador solo funciona
en HTTPS o en `localhost`. Si abres los archivos con doble clic
(`file:///...`) el escáner **no** va a pedir permiso de cámara, y los
módulos ES6 tampoco cargan. Para probar en tu PC:

```bash
firebase serve        # o:  npx serve .
```

---

## 10. Vigilar el consumo

El plan Spark da **50.000 lecturas y 20.000 escrituras por día**. Para
una institución normal sobra, pero dos costumbres lo queman rápido:

- Dejar el **dashboard abierto todo el día**: el listener en tiempo real
  consume lecturas cada vez que alguien escanea.
- Generar **reportes mensuales** repetidamente: cada uno lee todos los
  registros del rango.

Mira el consumo en **Uso y facturación** dentro de la consola. Si se
acerca al límite, la salida está en las notas de volumen de
`docs/fase11-pruebas.md` (colección `resumenDiario` con totales
precalculados).

---

## Errores frecuentes

| Síntoma | Causa |
|---|---|
| `Missing or insufficient permissions` | Falta publicar las reglas, o tu documento en `usuarios` no tiene `rol`/`activo`, o el ID del documento no es tu UID |
| Te expulsa al login apenas entras | `activo` no es booleano `true`, sino la cadena `"true"` |
| El escáner no pide cámara | Estás abriendo el archivo con `file://` en vez de un servidor |
| `The query requires an index` | Haz clic en el enlace del error: crea el índice solo |
| Error 402/403 al subir foto | Estás en una versión vieja que aún usaba Storage; este proyecto ya no lo hace |
