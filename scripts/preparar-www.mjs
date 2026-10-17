/* Prepara `www/`, la carpeta que Capacitor mete en la app iOS.
   La web se sigue sirviendo tal cual desde la raíz del repo (GitHub Pages): aquí solo se COPIA lo que la app necesita,
   sin mover ni tocar nada. `beta/`, `tienda/`, `docs/`, `tests/`, `scripts/`, `ios/`, `node_modules/` y el service worker
   (`sw.js`, que en la app no se usa), `soporte.html` y `terminos.html` (la app abre las versiones de puntostudio.es con @capacitor/browser, nunca estas copias) se quedan fuera. */
import { cpSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const destino = join(raiz, 'www');
const incluir = ['index.html', 'manifest.json', 'privacidad.html', 'fonts', 'img', 'vendor', 'icons', 'assets'];

rmSync(destino, { recursive: true, force: true });
mkdirSync(destino);
for (const p of incluir) {
  if (!existsSync(join(raiz, p))) throw new Error('Falta ' + p);
  cpSync(join(raiz, p), join(destino, p), { recursive: true, filter: (o) => !/vista-previa|-1024\.png$/.test(o) });
}
console.log('www/ listo: ' + incluir.join(', '));
