// «Salir» no depende de la red y la sala se reconecta sola al volver a la app (rama app/beta).
// Red falsa de tests/fake-red.js: muere() deja el canal «joined» pero sin socket (como un móvil que estuvo en segundo plano): no recibe nada y send/track/leave no contestan.
const { test, expect } = require('@playwright/test');
const { instalaRed, nuevoJugador, creaSala, unirse } = require('./fake-red');

test.describe.configure({ timeout: 90000 });
const abiertos = [];
test.afterEach(async () => { while (abiertos.length) { try { await abiertos.pop().close(); } catch (e) {} } }); // los contextos de browser.newContext() no se cierran solos entre pruebas

const puenteApp = () => {
  window.__estado = null;
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {
    App: { addListener: (ev, f) => { if (ev === 'appStateChange') window.__estado = f; return Promise.resolve({ remove() {} }); }, exitApp() {} },
    StatusBar: { setStyle() { return Promise.resolve(); } }, Browser: { open() {} } } };
};

const oculta = (P) => P.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
const visible = (P) => P.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
const pantalla = (P) => P.evaluate(() => document.querySelector('.screen.on').id);

async function sala(browser, jugadores = 3) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); abiertos.push(ctx);
  await instalaRed(ctx);
  const A = await nuevoJugador(ctx, 'pidAAAAAAAA');
  const codigo = await creaSala(A, 'Javi');
  const B = await nuevoJugador(ctx, 'pidBBBBBBBB'); await unirse(B, codigo, 'Ana');
  const P = [A, B];
  if (jugadores > 2) { const C = await nuevoJugador(ctx, 'pidCCCCCCCC'); await unirse(C, codigo, 'Beto'); P.push(C); }
  await expect(A.locator('#lbList .pl')).toHaveCount(jugadores);
  return { ctx, P, codigo };
}

// Se va a segundo plano con el canal muerto y se vuelve: así llega el móvil a la app.
async function iseYvuelve(P, segundos = 3.5) {
  await P.evaluate(() => window.__fakeRed.muere());
  await oculta(P);
  await P.waitForTimeout(segundos * 1000);
  await visible(P);
}

async function salirDeLaSalaDeEspera(P) {
  const t0 = Date.now();
  await P.click('#lbBack');
  await P.click('#slYes');
  await expect(P.locator('#s-home')).toHaveClass(/on/, { timeout: 1500 });
  expect(Date.now() - t0).toBeLessThan(3000);
  expect(await P.evaluate(() => ROOM)).toBeNull();
}

test.describe('«Salir» con la conexión caída', () => {
  test('sala de espera, sin ser anfitrión: al volver del segundo plano, Salir lleva a la portada al momento', async ({ browser }) => {
    const { P: [, B] } = await sala(browser);
    await iseYvuelve(B);
    await salirDeLaSalaDeEspera(B);
  });

  test('sala de espera, siendo anfitrión: Salir va a la portada aunque no se pueda avisar ni ceder el puesto', async ({ browser }) => {
    const { P: [A] } = await sala(browser);
    await iseYvuelve(A);
    await salirDeLaSalaDeEspera(A);
  });

  test('sin volver a reconectar todavía (el canal sigue muerto): Salir no espera a la red', async ({ browser }) => {
    const { P: [, B] } = await sala(browser);
    await B.evaluate(() => window.__fakeRed.muere());
    await salirDeLaSalaDeEspera(B);
  });

  for (const anfitrion of [false, true]) {
    test(`con la partida empezada, ${anfitrion ? 'siendo' : 'sin ser'} anfitrión: Salir en el menú va a la portada`, async ({ browser }) => {
      const { P } = await sala(browser);
      await P[0].click('[data-a="start"]');
      for (const J of P) await expect(J.locator('#s-game')).toHaveClass(/on/);
      const yo = P[anfitrion ? 0 : 1];
      await iseYvuelve(yo);
      await yo.click('#gameMenu');
      await yo.click('[data-a="menuExit"]');
      const t0 = Date.now();
      await yo.click('[data-a="menuExitYes"]');
      await expect(yo.locator('#s-home')).toHaveClass(/on/, { timeout: 1500 });
      expect(Date.now() - t0).toBeLessThan(3000);
      expect(await yo.evaluate(() => [ROOM, game])).toEqual([null, null]);
    });
  }

  test('si algo falla al avisar a los demás, Salir sigue llevando a la portada', async ({ browser }) => {
    const { P: [, B] } = await sala(browser);
    await B.evaluate(() => { NET.ch.send = () => { throw new Error('socket roto'); }; NET.ch.track = () => { throw new Error('socket roto'); }; });
    await salirDeLaSalaDeEspera(B);
  });

  test('tras salir con el canal colgado se puede volver a entrar a la misma sala enseguida', async ({ browser }) => {
    const { P: [, B], codigo } = await sala(browser);
    await B.evaluate(() => window.__fakeRed.muere());
    await salirDeLaSalaDeEspera(B);
    await B.evaluate(() => window.__fakeRed.reinicia());
    await unirse(B, codigo, 'Ana'); // el canal viejo sigue en la lista de supabase-js: sin purgarlo, .on() fallaría
    expect(await B.evaluate(() => NET.st)).toBe('up');
  });
});

test.describe('Al volver a la app, la sala se reconecta sola', () => {
  for (const [titulo, vuelve] of [['visibilitychange (web)', (P) => visible(P)], ['appStateChange de Capacitor (app)', (P) => P.evaluate(() => window.__estado({ isActive: true }))]]) {
    test(`tras estar en segundo plano con el canal muerto, ${titulo}`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); abiertos.push(ctx);
      await instalaRed(ctx);
      const A = await nuevoJugador(ctx, 'pidAAAAAAAA');
      const codigo = await creaSala(A, 'Javi');
      const B = await nuevoJugador(ctx, 'pidBBBBBBBB');
      await B.addInitScript(puenteApp);
      await B.reload();
      await unirse(B, codigo, 'Ana');
      await expect(A.locator('#lbList .pl')).toHaveCount(2);
      await B.evaluate(() => window.__fakeRed.muere());
      if (titulo.startsWith('appState')) await B.evaluate(() => window.__estado({ isActive: false })); else await oculta(B);
      await B.waitForTimeout(3500);
      await B.evaluate(() => window.__fakeRed.reinicia());
      await vuelve(B);
      await expect.poll(() => B.evaluate(() => NET.st), { timeout: 15000 }).toBe('up');
      await expect.poll(() => B.evaluate(() => Object.keys(roster()).length), { timeout: 15000 }).toBe(2);
      await expect(A.locator('#lbList .pl')).toHaveCount(2);
      await expect(B.locator('#lbList .pl')).toHaveCount(2);
    });
  }
});
