/* Imágenes de la ficha de Google Play en tienda/google-play/ (icono 512×512 y gráfico de funciones 1024×500), a partir del logo del repo.
   Uso: node scripts/ficha-play.mjs   (usa Playwright y la tipografía Outfit del proyecto) */
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const salida = join(raiz, 'tienda', 'google-play');
mkdirSync(salida, { recursive: true });
const b64 = (f) => readFileSync(join(raiz, f)).toString('base64');
const logo = 'data:image/png;base64,' + b64('icons/icon-1024.png');
const fuente = 'data:font/woff2;base64,' + b64('fonts/outfit-latin.woff2');

const base = `@font-face{font-family:Outfit;font-weight:400 900;src:url(${fuente}) format('woff2')}
*{margin:0;box-sizing:border-box}html,body{background:#070706}`;
const icono = `<style>${base}body{width:512px;height:512px;overflow:hidden}img{display:block;width:512px;height:512px}</style><img src="${logo}">`;
const grafico = `<style>${base}
body{width:1024px;height:500px;overflow:hidden;position:relative;font-family:Outfit,system-ui,sans-serif;color:#f3eee6;
  background:radial-gradient(520px 380px at 250px 250px,rgba(224,18,15,.28),transparent 70%),#070706}
.logo{position:absolute;left:90px;top:50px;width:400px;height:400px;
  -webkit-mask-image:radial-gradient(circle at 50% 50%,#000 58%,transparent 71%);mask-image:radial-gradient(circle at 50% 50%,#000 58%,transparent 71%)}
.t{position:absolute;left:500px;right:70px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center}
h1{font-weight:900;font-size:86px;line-height:1;letter-spacing:.05em;white-space:nowrap}
p{margin-top:18px;color:#ff2a24;font-weight:700;font-size:24px;letter-spacing:.05em;white-space:nowrap}
.l{width:84px;height:6px;background:#e0120f;border-radius:3px;margin-top:26px}</style>
<img class="logo" src="${logo}"><div class="t"><h1>PUNTO<br>FALSO</h1><div class="l"></div><p>EL JUEGO SOCIAL DEL IMPOSTOR</p></div>`;

const nav = await chromium.launch();
for (const [nombre, html, w, h] of [['icono-512.png', icono, 512, 512], ['grafico-funciones-1024x500.png', grafico, 1024, 500]]) {
  const p = await nav.newPage({ viewport: { width: w, height: h } });
  await p.setContent(html);
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: join(salida, nombre), omitBackground: false });
  await p.close();
}
await nav.close();
console.log('listo en ' + salida);
