# Prometido Pro — CRM del Ciclo

Web app instalable (PWA) para acompañar el ciclo hormonal de tu pareja: fases, misiones diarias,
dossier de notas, calendario, traductor de frases y calculadora de fechas futuras.

- 📲 **Se instala en el celular** como una app (Android y iPhone), sin tiendas.
- ✈️ **Funciona sin internet** después de abrirla una vez.
- 💾 **Autoguardado local**: cada cambio se guarda al instante en el teléfono. Copia de seguridad (.json) desde ⚙️.

## Publicarla (gratis) para instalarla en el celular

Para poder instalarla se necesita una dirección `https://`. Dos opciones:

### Opción A — GitHub Pages
1. En GitHub: **Settings → Pages**.
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

## Estructura

```
index.html            Pantalla (HTML)
js/data.js            Textos: fases, notas de ejemplo, traductor
js/app.js             Lógica, cálculo del ciclo y autoguardado
css/input.css         Estilos fuente  → css/styles.css (compilado, no editar)
sw.js                 Service worker (modo sin internet)
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
(ej. `v4.0.0` → `v4.0.1`). Así los celulares detectan la nueva versión y muestran "Actualizar".

## Aviso
Las fases y días fértiles son estimaciones por calendario. No es un método anticonceptivo
ni sustituye la consulta médica.
