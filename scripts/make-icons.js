// Genera los íconos de la app a partir de un SVG (anillo con diamante).
// Uso: npm run icons
const sharp = require('sharp');
const path = require('path');

const out = (f) => path.join(__dirname, '..', 'icons', f);

// pad = margen interno (los íconos "maskable" de Android necesitan más margen)
function svg(size, { pad = 0.16, rounded = true } = {}) {
  const r = rounded ? size * 0.22 : 0;
  const s = size * (1 - pad * 2);
  const o = size * pad;
  const u = s / 100; // unidad
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="#e11d48"/><stop offset="1" stop-color="#fb7185"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${r}" fill="url(#g)"/>
  <g transform="translate(${o},${o})">
    <circle cx="${50 * u}" cy="${62 * u}" r="${27 * u}" fill="none" stroke="#fff" stroke-width="${8 * u}"/>
    <polygon points="${50 * u},${44 * u} ${34 * u},${24 * u} ${40 * u},${12 * u} ${60 * u},${12 * u} ${66 * u},${24 * u}" fill="#fff"/>
    <polygon points="${40 * u},${12 * u} ${50 * u},${24 * u} ${60 * u},${12 * u}" fill="#fecdd3"/>
  </g>
</svg>`;
}

(async () => {
  const jobs = [
    ['icon-192.png', 192, {}],
    ['icon-512.png', 512, {}],
    ['icon-maskable-512.png', 512, { pad: 0.24, rounded: false }],
    ['apple-touch-icon.png', 180, { pad: 0.16, rounded: false }]
  ];
  for (const [file, size, opts] of jobs) {
    await sharp(Buffer.from(svg(size, opts))).png().toFile(out(file));
    console.log('✔', file);
  }
})();
