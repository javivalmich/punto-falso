// Recuperación de la sala a distancia cuando Supabase Realtime falla (channel_crash, presence_state vacío).
// Usa la red falsa de tests/fake-red.js, que sabe simular la caída del canal. Nunca toca el Supabase real.
const { test, expect } = require('@playwright/test');
const { instalaRed, nuevoJugador, creaSala } = require('./fake-red');

test.describe.configure({ timeout: 120000 }); // varias páginas por prueba y esperas de reintento

async function unirseSinEsperar(page, codigo, nombre) {
  await page.click('#goJoin');
  await page.fill('#codeIn', codigo);
  await page.fill('#joinName', nombre);
  await page.click('#doJoin');
}

async function sala(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await instalaRed(ctx);
  const A = await nuevoJugador(ctx, 'pidAAAAAAAA');
  const codigo = await creaSala(A, 'Javi');
  return { ctx, A, codigo };
}

async function salaDeTres(browser) {
  const { ctx, A, codigo } = await sala(browser);
  const B = await nuevoJugador(ctx, 'pidBBBBBBBB'); await unirseSinEsperar(B, codigo, 'Ana');
  const C = await nuevoJugador(ctx, 'pidCCCCCCCC'); await unirseSinEsperar(C, codigo, 'Beto');
  for (const P of [A, B, C]) await expect(P.locator('#lbList .pl')).toHaveCount(3);
  return { ctx, A, B, C, codigo };
}

const conectados = (P) => P.evaluate(() => Object.keys(roster()).length);
const enLinea = (P) => P.evaluate(() => NET.st);

test.describe('Unirse a una sala', () => {
  test('se une aunque el canal caiga mientras espera al anfitrión (reintenta)', async ({ browser }) => {
    const { A, ctx, codigo } = await sala(browser);
    // el anfitrión se cae y tarda 7 s en volver: el primer intento de B (≈6 s) no lo ve
    await A.evaluate(() => { window.__fakeRed.rejoinMs = 7000; window.__fakeRed.crash(); });
    const B = await nuevoJugador(ctx, 'pidBBBBBBBB');
    await unirseSinEsperar(B, codigo, 'Ana');
    await expect(B.locator('#s-lobby')).toHaveClass(/on/, { timeout: 40000 });
    expect(await B.locator('#joinErr').textContent()).toBe('');
    await expect(A.locator('#lbList .pl')).toHaveCount(2, { timeout: 15000 });
  });

  test('«No encuentro esa partida» solo sale de verdad cuando la sala no existe', async ({ browser }) => {
    const { ctx, codigo } = await sala(browser);
    const B = await nuevoJugador(ctx, 'pidBBBBBBBB');
    // una sala que existe y está sana: entra a la primera, sin error
    await unirseSinEsperar(B, codigo, 'Ana');
    await expect(B.locator('#s-lobby')).toHaveClass(/on/, { timeout: 15000 });
    // una sala que no existe: tras agotar los intentos, el aviso
    const C = await nuevoJugador(ctx, 'pidCCCCCCCC');
    await unirseSinEsperar(C, 'ZZZZ2', 'Beto');
    await expect(C.locator('#joinErr')).toHaveText('No encuentro esa partida, revisa el código.', { timeout: 60000 });
    await expect(C.locator('#s-join')).toHaveClass(/on/);
    expect(await C.evaluate(() => ROOM)).toBeNull();
  });
});

test.describe('La sala se recupera sola', () => {
  for (const [titulo, silencioso] of [['tras una caída del canal (CHANNEL_ERROR y presence_state vacío)', false], ['tras perder la presencia sin ningún aviso', true]]) {
    test(`en la sala de espera, ${titulo}`, async ({ browser }) => {
      const { A, B, C } = await salaDeTres(browser);
      await A.evaluate((s) => window.__fakeRed.crash(s), silencioso);
      for (const P of [A, B, C]) {
        await expect.poll(() => conectados(P), { timeout: 15000 }).toBe(3);
        expect(await enLinea(P)).toBe('up');
        await expect(P.locator('#lbList .pl')).toHaveCount(3);
      }
    });
  }

  for (const [titulo, silencioso] of [['con una caída del canal', false], ['perdiendo la presencia sin aviso', true]]) {
    test(`en mitad de una votación, ${titulo}: los votos llegan y la sala vuelve a verse entera`, async ({ browser }) => {
      const { A, B, C } = await salaDeTres(browser);
      await A.click('[data-a="start"]');
      for (const P of [A, B, C]) await expect(P.locator('#s-game')).toHaveClass(/on/);
      await A.evaluate(() => castStartVote());
      for (const P of [A, B, C]) await expect.poll(() => P.evaluate(() => S.ph)).toBe('vote');
      // se cae justo cuando se vota; los votos se emiten durante la caída
      await A.evaluate((s) => { window.__fakeRed.rejoinMs = 1500; window.__fakeRed.crash(s); }, silencioso);
      for (const P of [B, C, A]) await P.evaluate(() => castVote(game.me === 1 ? 2 : 1));
      // el anfitrión cierra la votación cuando han votado todos
      await expect.poll(() => A.evaluate(() => !!S.res || S.round > 1), { timeout: 30000 }).toBe(true);
      for (const P of [A, B, C]) await expect.poll(() => conectados(P), { timeout: 15000 }).toBe(3);
    });
  }
});
