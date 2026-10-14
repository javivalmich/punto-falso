// Enlaces de sala: formato nuevo (?s=CODIGO) y antiguo (#s=CODIGO), en la web y en la app (arranque en frío con getLaunchUrl y con la app abierta con appUrlOpen),
// con y sin nombre guardado. Red falsa de tests/fake-red.js (nunca toca el Supabase real).
const { test, expect } = require('@playwright/test');
const { instalaRed, nuevoJugador, creaSala } = require('./fake-red');

test.describe.configure({ timeout: 90000 });
const abiertos = [];
test.afterEach(async () => { while (abiertos.length) { try { await abiertos.pop().close(); } catch (e) {} } }); // los contextos de browser.newContext() no se cierran solos entre pruebas
const BASE = process.env.TEST_PATH || '/';
const ENLACE_PUNTO = 'https://puntostudio.es/punto-falso/';

const puenteApp = ([lanzamiento]) => {
  window.__urlOpen = null;
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {
    App: { addListener: (ev, f) => { if (ev === 'appUrlOpen') window.__urlOpen = f; return Promise.resolve({ remove() {} }); },
      getLaunchUrl: () => Promise.resolve(lanzamiento ? { url: lanzamiento } : undefined), exitApp() {} },
    StatusBar: { setStyle() { return Promise.resolve(); } }, Browser: { open() {} } } };
};

// Una sala con su anfitrión; devuelve el contexto y el código.
async function conAnfitrion(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); abiertos.push(ctx);
  await instalaRed(ctx);
  const A = await nuevoJugador(ctx, 'pidAAAAAAAA');
  const codigo = await creaSala(A, 'Javi');
  return { ctx, A, codigo };
}

// Un jugador nuevo que abre `url` (con o sin nombre guardado).
async function abre(ctx, url, { nombre, app, lanzamiento } = {}) {
  const P = await ctx.newPage();
  await P.addInitScript(([n]) => { try { localStorage.setItem('impostor-pid', 'pidBBBBBBBB'); ['impostor-room', 'impostor-solo', 'impostor-v2'].forEach((k) => localStorage.removeItem(k)); if (n) localStorage.setItem('impostor-name', JSON.stringify(n)); else localStorage.removeItem('impostor-name'); } catch (e) {} }, [nombre || '']);
  if (app) await P.addInitScript(puenteApp, [lanzamiento || null]);
  await P.goto(url);
  return P;
}

test.describe('Formato del enlace', () => {
  test('el enlace de la web usa ?s= y se entienden el nuevo y el antiguo', async ({ page }) => {
    await page.goto(BASE);
    const r = await page.evaluate(() => ({ nuevo: roomLink('ABCDE'), a: codeFromInput('https://puntostudio.es/punto-falso/?s=ABCDE'), b: codeFromInput('https://puntostudio.es/punto-falso/#s=ABCDE'), c: codeFromInput('abcde') }));
    expect(r.nuevo).toBe(page.url().split('?')[0].split('#')[0] + '?s=ABCDE');
    expect([r.a, r.b, r.c]).toEqual(['ABCDE', 'ABCDE', 'ABCDE']);
  });
});

test.describe('Web: abrir un enlace de sala', () => {
  for (const [formato, sufijo] of [['nuevo (?s=)', (c) => `?s=${c}`], ['antiguo (#s=)', (c) => `#s=${c}`]]) {
    test(`con nombre guardado entra directamente en la sala (${formato})`, async ({ browser }) => {
      const { ctx, A, codigo } = await conAnfitrion(browser);
      const B = await abre(ctx, BASE + sufijo(codigo), { nombre: 'Ana' });
      await expect(B.locator('#s-lobby')).toHaveClass(/on/, { timeout: 20000 });
      expect(await B.evaluate(() => ROOM && ROOM.name)).toBe('Ana');
      await expect(A.locator('#lbList .pl')).toHaveCount(2);
      expect(B.url()).not.toMatch(/[?&#]s=/); // el enlace se limpia
    });

    test(`sin nombre guardado va a «Unirme» con el código puesto (${formato})`, async ({ browser }) => {
      const { ctx, codigo } = await conAnfitrion(browser);
      const B = await abre(ctx, BASE + sufijo(codigo));
      await expect(B.locator('#s-join')).toHaveClass(/on/);
      await expect(B.locator('#codeIn')).toHaveValue(codigo);
      await expect(B.locator('#joinName')).toHaveValue('');
      expect(await B.evaluate(() => ROOM)).toBeNull();
    });
  }
});

test.describe('App: abrir un enlace de sala', () => {
  for (const [formato, sufijo] of [['nuevo (?s=)', (c) => `?s=${c}`], ['antiguo (#s=)', (c) => `#s=${c}`]]) {
    test(`arranque en frío (getLaunchUrl) con nombre guardado entra en la sala (${formato})`, async ({ browser }) => {
      const { ctx, A, codigo } = await conAnfitrion(browser);
      const B = await abre(ctx, BASE, { nombre: 'Ana', app: true, lanzamiento: ENLACE_PUNTO + sufijo(codigo) });
      await expect(B.locator('#s-lobby')).toHaveClass(/on/, { timeout: 20000 });
      await expect(A.locator('#lbList .pl')).toHaveCount(2);
    });

    test(`arranque en frío sin nombre guardado va a «Unirme» con el código (${formato})`, async ({ browser }) => {
      const { ctx, codigo } = await conAnfitrion(browser);
      const B = await abre(ctx, BASE, { app: true, lanzamiento: ENLACE_PUNTO + sufijo(codigo) });
      await expect(B.locator('#s-join')).toHaveClass(/on/);
      await expect(B.locator('#codeIn')).toHaveValue(codigo);
    });

    test(`con la app abierta (appUrlOpen) con nombre guardado entra en la sala (${formato})`, async ({ browser }) => {
      const { ctx, A, codigo } = await conAnfitrion(browser);
      const B = await abre(ctx, BASE, { nombre: 'Ana', app: true });
      await expect(B.locator('#s-home')).toHaveClass(/on/);
      await B.evaluate((u) => window.__urlOpen({ url: u }), ENLACE_PUNTO + sufijo(codigo));
      await expect(B.locator('#s-lobby')).toHaveClass(/on/, { timeout: 20000 });
      await expect(A.locator('#lbList .pl')).toHaveCount(2);
    });

    test(`con la app abierta sin nombre guardado va a «Unirme» con el código (${formato})`, async ({ browser }) => {
      const { ctx, codigo } = await conAnfitrion(browser);
      const B = await abre(ctx, BASE, { app: true });
      await B.evaluate((u) => window.__urlOpen({ url: u }), ENLACE_PUNTO + sufijo(codigo));
      await expect(B.locator('#s-join')).toHaveClass(/on/);
      await expect(B.locator('#codeIn')).toHaveValue(codigo);
    });
  }

  test('un enlace de otro dominio no hace nada, y con otra sala abierta nunca entra solo', async ({ browser }) => {
    const { ctx, codigo } = await conAnfitrion(browser);
    const B = await abre(ctx, BASE, { nombre: 'Ana', app: true });
    await B.evaluate((c) => window.__urlOpen({ url: 'https://ejemplo.com/punto-falso/?s=' + c }), codigo);
    await B.waitForTimeout(500);
    await expect(B.locator('#s-home')).toHaveClass(/on/);
    // ya hay una sala abierta: el enlace de otra solo lleva a «Unirme»
    await B.evaluate(() => { ROOM = { code: 'ZZZZ2', name: 'Ana', creator: true, remote: true, joined: Date.now() }; });
    await B.evaluate((u) => window.__urlOpen({ url: u }), ENLACE_PUNTO + `?s=${codigo}`);
    await expect(B.locator('#s-join')).toHaveClass(/on/);
    await expect(B.locator('#codeIn')).toHaveValue(codigo);
    expect(await B.evaluate(() => ROOM.code)).toBe('ZZZZ2');
  });
});
