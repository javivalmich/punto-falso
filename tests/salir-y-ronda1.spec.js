// Partida a distancia (rama app/beta): ronda 1 tras un solo móvil, «Salir» de la sala y botón flotante del walkie.
// Usa una red falsa en memoria (tests/fake-red.js): varias páginas del mismo contexto hacen de jugadores.
const { test, expect } = require('@playwright/test');
const { instalaRed, nuevoJugador, creaSala, unirse } = require('./fake-red');
const { startSolo, peekCard } = require('./helpers');

test.describe.configure({ timeout: 90000 }); // varias páginas por prueba

const ver = (page) => page.evaluate(() => ({
  pantalla: document.querySelector('.screen.on').id,
  room: ROOM && ROOM.code,
  anfitrion: iAmHost(),
}));
const esAnfitrion = (...paginas) => async () => {
  for (const p of paginas) if (await p.evaluate(() => iAmHost())) return true;
  return false;
};

async function sala(browser, { walkie = false, soloAntes = false, viewport } = {}) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 390, height: 844 } });
  await instalaRed(ctx);
  const A = await nuevoJugador(ctx, 'pidAAAAAAAA', { limpio: false });
  if (soloAntes) {
    // una partida de un solo móvil repartida y a medias; se vuelve a la portada sin pulsar «Terminar»
    await startSolo(A, ['Jugador 1', 'Jugador 2', 'Jugador 3']);
    for (let i = 0; i < 3; i++) { await A.click('#shGo'); await peekCard(A); await A.waitForTimeout(150); await A.click('#scNext'); }
    expect(await A.evaluate(() => !!SOLO)).toBe(true);
    await A.evaluate(() => show('s-home'));
  }
  const codigo = await creaSala(A, 'Javi', { walkie });
  const B = await nuevoJugador(ctx, 'pidBBBBBBBB'); await unirse(B, codigo, 'Ana');
  const C = await nuevoJugador(ctx, 'pidCCCCCCCC'); await unirse(C, codigo, 'Beto');
  await expect(A.locator('#lbList .pl')).toHaveCount(3);
  return { ctx, A, B, C, codigo };
}

async function suma(A, nombres) {
  const codigo = await A.evaluate(() => ROOM.code);
  const ps = [];
  for (const n of nombres) {
    const P = await nuevoJugador(A.context(), 'pid' + n.padEnd(8, 'X')); await unirse(P, codigo, n); ps.push(P);
  }
  return ps;
}

async function empieza(A) {
  await A.click('[data-a="start"]');
  await expect(A.locator('#s-game')).toHaveClass(/on/);
}

test.describe('Ronda 1 de una partida a distancia', () => {
  test('tras jugar en un solo móvil sale mi nombre y mi tarjeta desde el primer momento', async ({ browser }) => {
    const { A } = await sala(browser, { soloAntes: true });
    await empieza(A);
    // sin esperar a la ronda 2: ya está todo pintado
    await expect(A.locator('#meOut')).toHaveText('Javi');
    await expect(A.locator('#roundBtn')).toHaveText('Ronda 1');
    await expect(A.locator('#legacyBox')).toBeHidden();
    expect(await A.locator('#back').innerHTML()).toMatch(/Tu palabra|IMPOSTOR/);
    // y no queda nada de la partida de un solo móvil
    const resto = await A.evaluate(() => ({ solo: !!SOLO, reveal: document.getElementById('reveal').className, nombres: game.names }));
    expect(resto).toEqual({ solo: false, reveal: '', nombres: ['Javi', 'Ana', 'Beto'] });
  });

  test('si falla un trozo del pintado, el resto de la partida se pinta igualmente', async ({ browser }) => {
    const { A } = await sala(browser);
    await A.evaluate(() => { renderNet = () => { throw new Error('prueba'); }; });
    await empieza(A);
    await expect(A.locator('#meOut')).toHaveText('Javi');
    await expect(A.locator('#back')).toContainText(/Tu palabra|IMPOSTOR/);
  });
});

test.describe('Salir de la sala', () => {
  for (const [titulo, soloAntes] of [['desde la sala de espera, siendo el anfitrión', false], ['igual, con una partida de un solo móvil sin terminar', true]]) {
    test(`${titulo}: voy a la portada, el anfitrión pasa a otro y no vuelvo a la sala`, async ({ browser }) => {
      const { A, B, C } = await sala(browser, { soloAntes });
      await A.click('#lobbyMenu');
      await A.click('[data-a="menuExit"]');
      await expect(A.locator('#menuSheetEl h3')).toHaveText('¿Salir de la partida?');
      await A.click('[data-a="menuExitYes"]');
      await expect(A.locator('#s-home')).toHaveClass(/on/);
      expect(await ver(A)).toMatchObject({ room: null, anfitrion: false });
      // el anfitrión pasa a otro jugador al momento, sin esperar a que lo releven por ausencia
      await expect.poll(esAnfitrion(B, C), { timeout: 5000 }).toBe(true);
      await expect(B.locator('#lbList .pl')).toHaveCount(2);
      // y no me vuelve a meter solo en la sala
      await A.waitForTimeout(2500);
      expect(await ver(A)).toMatchObject({ pantalla: 's-home', room: null });
      await expect(B.locator('#lbList .pl')).toHaveCount(2);
    });
  }

  test('con «‹ Volver» de la sala de espera pasa lo mismo', async ({ browser }) => {
    const { A, B, C } = await sala(browser);
    await A.click('#lbBack'); await A.click('#slYes');
    await expect(A.locator('#s-home')).toHaveClass(/on/);
    await expect.poll(esAnfitrion(B, C), { timeout: 5000 }).toBe(true);
  });

  test('con la partida empezada, un jugador que no es el anfitrión sale y el resto sigue', async ({ browser }) => {
    const { A, B } = await sala(browser);
    await suma(A, ['Cris']); // con 4 jugadores la partida sigue sin él
    await expect(A.locator('#lbList .pl')).toHaveCount(4);
    await empieza(A);
    await expect(B.locator('#s-game')).toHaveClass(/on/);
    await B.click('#gameMenu'); await B.click('[data-a="menuExit"]');
    await expect(B.locator('#menuSheetEl h3')).toHaveText('¿Salir de la partida?');
    await B.click('[data-a="menuExitYes"]');
    await expect(B.locator('#s-home')).toHaveClass(/on/);
    expect(await ver(B)).toMatchObject({ room: null });
    await expect.poll(() => A.evaluate(() => S.left.length), { timeout: 5000 }).toBe(1);
    expect(await ver(A)).toMatchObject({ pantalla: 's-game', anfitrion: true });
  });

  test('con la partida empezada, el anfitrión sale y pasa el puesto', async ({ browser }) => {
    const { A, B, C } = await sala(browser);
    const [D] = await suma(A, ['Cris']);
    await expect(A.locator('#lbList .pl')).toHaveCount(4);
    await empieza(A);
    await A.click('#gameMenu'); await A.click('[data-a="menuExit"]'); await A.click('[data-a="menuExitYes"]');
    await expect(A.locator('#s-home')).toHaveClass(/on/);
    expect(await ver(A)).toMatchObject({ room: null, anfitrion: false });
    await expect.poll(esAnfitrion(B, C, D), { timeout: 5000 }).toBe(true);
    await A.waitForTimeout(2000);
    expect(await ver(A)).toMatchObject({ pantalla: 's-home', room: null });
  });
});

test.describe('Botón flotante del walkie en la sala de espera', () => {
  for (const [nombre, viewport] of [['iPhone pequeño', { width: 375, height: 667 }], ['iPhone grande', { width: 430, height: 932 }]]) {
    test(`${nombre}: «Bloquear» y «✕» de ningún jugador quedan debajo del micro`, async ({ browser }) => {
      const { A } = await sala(browser, { walkie: true, viewport });
      await suma(A, ['Cris', 'Dani', 'Eva']);
      await expect(A.locator('#lbList .pl')).toHaveCount(6);
      await A.evaluate(() => WK.cerrar());
      await expect(A.locator('#wkFab')).toBeVisible();
      await A.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await A.waitForTimeout(300);
      const choques = await A.evaluate(() => {
        const f = document.getElementById('wkFab').getBoundingClientRect();
        return [...document.querySelectorAll('#lbList .pl button')].filter((b) => {
          const r = b.getBoundingClientRect();
          return r.width && r.left < f.right && r.right > f.left && r.top < f.bottom && r.bottom > f.top;
        }).length;
      });
      expect(choques).toBe(0);
    });
  }
});
