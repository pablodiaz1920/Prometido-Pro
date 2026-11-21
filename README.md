# Prometido Pro — CRM del Ciclo

Web app instalable (PWA) para acompañar el ciclo hormonal de tu pareja: fases, misiones diarias,
dossier de notas, calendario, traductor de frases y calculadora de fechas futuras.

- 📲 **Se instala en el celular** como una app (Android y iPhone), sin tiendas.
- ✈️ **Funciona sin internet** después de abrirla una vez.
- 💾 **Autoguardado local**: cada cambio se guarda al instante en el teléfono. Copia de seguridad (.json) desde ⚙️.
- 📝 **Bitácora diaria**: flujo, ánimo, energía, síntomas y nota de cada día.
- 📊 **Estadísticas**: duración real de cada ciclo, regularidad, días de sangrado y síntomas frecuentes por fase.
- 🔔 **Aviso diario** con la fase, la regla de oro y una misión.
- ☁️ **Nube opcional** (Firebase gratuito) para respaldar y compartir entre dos celulares.

## Publicarla (gratis) para instalarla en el celular

Para poder instalarla se necesita una dirección `https://`. Dos opciones:

### Opción A — GitHub Pages
1. En GitHub: **Settings → Pages** (si el repositorio es privado, antes: **Settings → General →
   Danger Zone → Change visibility → Public**, o tener GitHub Pro).
2. En *Source* elige **Deploy from a branch**, rama `main` y carpeta `/ (root)` → **Save**.
3. A los ~2 minutos estará en `https://<tu-usuario>.github.io/Prometido-Pro/`.

> GitHub Pages en cuentas gratuitas requiere que el repositorio sea **público**. Tus datos personales
> NO están en el repositorio (viven solo en tu teléfono), pero los textos de la app sí serían visibles.

### Opción B — Netlify Drop (repositorio privado, sin configurar nada)
1. Descarga el repositorio como ZIP y descomprímelo.
2. Entra a https://app.netlify.com/drop y arrastra la carpeta.
3. Te da una URL `https://...netlify.app`.

### Instalar en el teléfono
- **Android (Chrome):** abre la URL → botón **📲 App** → *Instalar ahora* (o menú ⋮ → *Instalar aplicación*).
- **iPhone (Safari):** abre la URL → botón Compartir → *Agregar a pantalla de inicio*.

## Activar la nube (opcional, gratis)

La app funciona perfectamente sin esto. Sirve para tener respaldo automático y para que
**dos celulares compartan los mismos datos** (los dos inician sesión con la misma cuenta).

1. Entra a https://console.firebase.google.com → **Crear proyecto** (puedes desactivar Analytics).
2. **Authentication** → *Comenzar* → pestaña *Sign-in method* → activa **Correo electrónico/contraseña**.
3. **Firestore Database** → *Crear base de datos* → modo **producción** → elige la región más cercana.
4. En Firestore → pestaña **Reglas**, reemplaza todo por esto y pulsa *Publicar*:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{uid}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```
   (Así solo tu cuenta puede leer y escribir tus datos.)
5. ⚙️ (Configuración del proyecto) → *Tus apps* → icono **</>** (Web) → registra la app →
   copia el bloque `firebaseConfig = { ... }`.
6. En Prometido Pro: **⚙️ → Sincronización en la nube** → pega el bloque → *Guardar configuración* →
   **Crear cuenta** (la primera vez) o **Iniciar sesión** (en el segundo celular, con la misma cuenta).

Cómo funciona: todo se sigue guardando primero en el teléfono; cuando hay internet se sincroniza
solo (unos segundos después de cada cambio, al abrir la app y al recuperar conexión). Si los dos
celulares cambian cosas a la vez, se fusionan: no se pierde ninguna nota ni día de bitácora.

> La `apiKey` de Firebase no es secreta (identifica el proyecto); la seguridad la dan las reglas del paso 4.

## Notificaciones

⚙️ → **Aviso diario** → activar y elegir la hora.
- **Android (Chrome, app instalada):** el aviso puede llegar aunque no abras la app (Chrome decide el
  momento exacto según el uso, así que a veces se retrasa).
- **iPhone:** requiere la app instalada en la pantalla de inicio (iOS 16.4+) y el aviso aparece al abrirla.
- Para recordatorios 100% puntuales: **Exportar Calendario (.ics)** — incluye alarmas.

## Estructura

```
index.html            Pantalla (HTML)
js/data.js            Textos: fases, misiones, notas de ejemplo, traductor
js/cycle.js           Cálculo del ciclo (compartido con el service worker)
js/sync.js            Sincronización con Firebase y fusión de datos
js/app.js             Interfaz, autoguardado, bitácora, estadísticas, avisos
css/input.css         Estilos fuente  → css/styles.css (compilado, no editar)
sw.js                 Service worker (modo sin internet + aviso diario)
manifest.webmanifest  Datos de la app instalable
icons/, fonts/        Íconos y fuentes locales
```

## Hacer cambios

```bash
npm install          # una sola vez
npm run build:css    # después de cambiar clases en index.html o js/
npm run serve        # probar en http://localhost:8080
```

**Importante:** cada vez que publiques cambios, sube el número `VERSION` en `sw.js`
(ej. `v5.0.0` → `v5.0.1`). Así los celulares detectan la nueva versión y muestran "Actualizar".

## Aviso
Las fases y días fértiles son estimaciones por calendario. No es un método anticonceptivo
ni sustituye la consulta médica.
