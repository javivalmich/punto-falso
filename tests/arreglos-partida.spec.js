// Arreglos de noviembre de 2026 (fallos encontrados jugando con las apps):
// 1) la partida de ayer seguía en pantalla al abrir el juego;
// 2) la votación desaparecía (hoja cerrada sin forma de volver a ella);
// 3) a veces no respondía el botón de votar (la hoja se rehacía a mitad del toque);
// 4) al bloquear el móvil se pasaba al modo sin conexión y el anfitrión que volvía pisaba al nuevo.
// Usa la red falsa de tests/fake-red.js: nunca toca el Supabase real.
const { test, expect } = require('@playwright/test');
const { instalaRed, creaSala } = require('./fake-red');
const { startSolo, peekCard } = require('./helpers');

test.describe.configure({ timeout: 120000 });
const BASE = process.env.TEST_PATH || '/'; // TEST_PATH=/beta/ para probar la copia beta

// Un jugador = una página con su identificador. ?grace=3 acorta a 3 s el relevo del anfitrión (solo en local).
async function jugador(ctx, pid, { limpio = true, grace = 0 } = {}) {
  const page = await ctx.newPage();
  await page.addInitScript(([p, L]) => {
    try {
      localStorage.setItem('impostor-pid', JSON.stringify(p)); // lsGet lee JSON: así el PID es fijo y se conserva al recargar
      // solo al abrir la página, no al recargarla (una recarga tiene que encontrar la partida guardada)
      if (L && !sessionStorage.getItem('t-abierta')) ['impostor-room', 'impostor-solo', 'impostor-v2'].forEach((k) => localStorage.removeItem(k));
      sessionStorage.setItem('t-abierta', '1');
    } catch (e) {}
  }, [pid, limpio]);
  await page.goto(BASE + (grace ? '?grace=' + grace : ''));
  return page;
}

// Como unirse() de fake-red, con más margen para entrar en la sala.
async function unirse(page, codigo, nombre) {
  await page.click('#goJoin');
  // «Unirme» se abre ~100 ms después del toque (efecto al pulsar) y a los 50 ms pone el foco en el código: se espera a eso antes de
  // escribir, o el foco puede saltar a mitad de escribir el nombre y acabar en el campo del código («RUEARAna»).
  await page.locator('#s-join.on').waitFor();
  await page.waitForTimeout(120);
  await page.fill('#codeIn', codigo);
  await page.fill('#joinName', nombre);
  await page.click('#doJoin');
  await page.locator('#s-lobby.on').waitFor({ timeout: 30000 });
}

async function partidaDeTres(browser, { grace = 0 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await instalaRed(ctx);
  const A = await jugador(ctx, 'pidAAAAAAAA', { grace });
  const codigo = await creaSala(A, 'Javi');
  const B = await jugador(ctx, 'pidBBBBBBBB', { grace }); await unirse(B, codigo, 'Ana');
  const C = await jugador(ctx, 'pidCCCCCCCC', { grace }); await unirse(C, codigo, 'Beto');
  await expect(A.locator('#lbList .pl')).toHaveCount(3);
  await A.click('[data-a="start"]');
  for (const P of [A, B, C]) await expect(P.locator('#s-game')).toHaveClass(/on/);
  return { ctx, A, B, C, codigo };
}

async function abreVotacion(A, todos) {
  await A.click('#phaseBox [data-a="startVote"]');
  for (const P of todos) await expect(P.locator('#overlay')).toHaveClass(/on/);
  for (const P of todos) await expect(P.locator('#sheet .vbtn').first()).toBeVisible();
}

test.describe('La votación no se pierde', () => {
  test('si la hoja se cierra (tocar fuera), «Ir a la votación» la vuelve a abrir y se puede votar', async ({ browser }) => {
    const { A, B, C } = await partidaDeTres(browser);
    await abreVotacion(A, [A, B, C]);
    // B toca fuera de la hoja (p. ej. para usar el walkie): la hoja se cierra
    await B.mouse.click(195, 40);
    await expect(B.locator('#overlay')).not.toHaveClass(/on/);
    // en la pantalla queda el acceso a la votación
    await expect(B.locator('#phaseBox')).toContainText('Votación abierta');
    await B.click('#phaseBox [data-a="openVote"]');
    await expect(B.locator('#overlay')).toHaveClass(/on/);
    await B.locator('#sheet .vbtn').first().click();
    await expect.poll(() => A.evaluate(() => S.vt && S.vt.voted.length)).toBe(1);
  });

  test('los votos de los demás no rehacen los botones (un toque a medias no se pierde)', async ({ browser }) => {
    const { A, B, C } = await partidaDeTres(browser);
    await abreVotacion(A, [A, B, C]);
    // B empieza a pulsar un nombre…
    const btn = B.locator('#sheet .vbtn').first();
    await btn.evaluate((el) => { el.__mismo = true; });
    const box = await btn.boundingBox();
    await B.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await B.mouse.down();
    // …mientras A y C votan (el recuento de la hoja de B cambia dos veces)
    await A.locator('#sheet .vbtn').first().click();
    await C.locator('#sheet .vbtn').first().click();
    await expect(B.locator('#sheet .vprog')).toContainText('2 de 3');
    // el botón es el mismo nodo (no se ha rehecho) y al soltar el dedo el voto cuenta
    expect(await btn.evaluate((el) => !!el.__mismo)).toBe(true);
    await B.mouse.up();
    await expect(btn).toHaveAttribute('aria-pressed', 'true');
    // con los tres votos, el anfitrión cierra sola la votación
    await expect.poll(() => A.evaluate(() => S.ph), { timeout: 10000 }).toBe('reveal');
  });

  test('cambiar el voto sigue funcionando y la hoja marca el elegido', async ({ browser }) => {
    const { A, B, C } = await partidaDeTres(browser);
    await abreVotacion(A, [A, B, C]);
    const bs = B.locator('#sheet .vbtn');
    await bs.nth(0).click();
    await expect(bs.nth(0)).toHaveClass(/\bon\b/);
    await bs.nth(1).click();
    await expect(bs.nth(1)).toHaveClass(/\bon\b/);
    await expect(bs.nth(0)).not.toHaveClass(/\bon\b/);
    await expect.poll(() => A.evaluate(() => HV && Object.keys(HV.map).length)).toBe(1);
  });
});

test.describe('Un corte corto no saca de la partida', () => {
  test('mientras se reconecta, la votación sigue en pantalla y no aparece el modo sin conexión', async ({ browser }) => {
    const { A, B, C } = await partidaDeTres(browser);
    await abreVotacion(A, [A, B, C]);
    // B se queda sin red (como al bloquear el móvil): el canal cae y aún no ha vuelto
    await B.evaluate(() => { NET.st = 'down'; NET.downAt = Date.now() + 60000; renderAll(); });
    await expect(B.locator('#netLine')).toContainText('Reconectando');
    await expect(B.locator('#overlay')).toHaveClass(/on/);
    await expect(B.locator('#legacyBox')).toBeHidden();
    await expect(B.locator('#showSol')).toBeHidden();
    // vota durante el corte; al volver la conexión el voto llega solo
    await B.locator('#sheet .vbtn').first().click();
    await B.evaluate(() => { NET.downAt = Date.now() - 4000; });
    await expect.poll(() => A.evaluate(() => S.vt && S.vt.voted.length), { timeout: 20000 }).toBe(1);
    await expect.poll(() => B.evaluate(() => NET.st)).toBe('up');
  });

  test('si el corte dura más de la gracia, pasa al modo sin conexión como antes', async ({ browser }) => {
    const { B } = await partidaDeTres(browser);
    await B.evaluate(() => { NET.st = 'down'; NET.downAt = Date.now() + 60000; NET.okAt = Date.now() - NET_GRACIA - 1000; renderAll(); });
    await expect(B.locator('#legacyBox')).toBeVisible();
    await expect(B.locator('#netLine')).toContainText('Sin conexión');
  });

  test('al volver, el anfitrión antiguo no pisa al nuevo aunque tarde en llegarle su estado', async ({ browser }) => {
    const { A, B, C } = await partidaDeTres(browser, { grace: 3 });
    // A (anfitrión) se va: cierra su canal (como un móvil bloqueado que pierde la conexión)
    await A.evaluate(() => netLeave());
    await expect.poll(() => B.evaluate(() => iAmHost()), { timeout: 20000 }).toBe(true);
    // el nuevo anfitrión (B) pasa de ronda mientras A no está
    await B.evaluate(() => hNextRound());
    await expect.poll(() => C.evaluate(() => S.round)).toBe(2);
    // A vuelve con su estado viejo (ronda 1, se cree anfitrión). Al volver, los estados le llegan con retraso (3 s).
    await A.evaluate(() => {
      const real = onState, hasta = Date.now() + 3000;
      window.onState = (m) => { if (Date.now() < hasta) return; real(m); };
      netJoin(ROOM.code);
    });
    // nadie vuelve a la ronda 1 y A acaba con el estado del nuevo anfitrión
    await expect.poll(() => A.evaluate(() => S.round), { timeout: 20000 }).toBe(2);
    for (const P of [A, B, C]) {
      expect(await P.evaluate(() => S.round)).toBe(2);
      expect(await P.evaluate(() => S.host)).toBe('pidBBBBBBBB');
    }
    expect(await A.evaluate(() => iAmHost())).toBe(false);
  });
});

test.describe('Partida guardada al abrir el juego', () => {
  test('al recargar se vuelve directamente a la partida (como antes)', async ({ browser }) => {
    const { B } = await partidaDeTres(browser);
    await B.reload();
    await expect(B.locator('#s-game')).toHaveClass(/on/);
    await expect(B.locator('#meOut')).toHaveText('Ana');
  });

  test('al abrir en frío (app cerrada del todo) empieza en la portada con «Volver a la partida»', async ({ browser }) => {
    const { ctx, B, codigo } = await partidaDeTres(browser);
    await B.close();
    const B2 = await jugador(ctx, 'pidBBBBBBBB', { limpio: false });
    await expect(B2.locator('#s-home')).toHaveClass(/on/);
    await expect(B2.locator('#pendBox')).toBeVisible();
    await expect(B2.locator('#pendTxt')).toContainText(codigo);
    expect(await B2.evaluate(() => ROOM)).toBeNull();
    await B2.click('#pendGo');
    await expect(B2.locator('#s-game')).toHaveClass(/on/);
    await expect(B2.locator('#meOut')).toHaveText('Ana');
    await expect.poll(() => B2.evaluate(() => NET.st)).toBe('up');
  });

  test('«Descartarla» y empezar otra cosa olvidan la partida guardada', async ({ browser }) => {
    const { ctx, B } = await partidaDeTres(browser);
    await B.close();
    const B2 = await jugador(ctx, 'pidBBBBBBBB', { limpio: false });
    await expect(B2.locator('#pendBox')).toBeVisible();
    await B2.click('#pendNo');
    await expect(B2.locator('#pendBox')).toBeHidden();
    expect(await B2.evaluate(() => localStorage.getItem('impostor-room'))).toBeNull();
    // y al recargar ya no vuelve
    await B2.reload();
    await expect(B2.locator('#s-home')).toHaveClass(/on/);
    await expect(B2.locator('#pendBox')).toBeHidden();
  });

  test('con más de 5 h sin abrir el juego, se olvida y se empieza en la portada (también al recargar)', async ({ browser }) => {
    const { ctx, A, B, C } = await partidaDeTres(browser);
    for (const P of [A, C]) await P.evaluate(() => { VUELTA.fuera = 1; }); // que sus intervalos no renueven la marca de uso
    await B.close();
    // en frío
    await ctx.addInitScript(() => { try { if (!sessionStorage.getItem('t-viejo')) { sessionStorage.setItem('t-viejo', '1'); localStorage.setItem('impostor-vivo', String(Date.now() - 6 * 3600e3)); } } catch (e) {} });
    const B2 = await jugador(ctx, 'pidBBBBBBBB', { limpio: false });
    await expect(B2.locator('#s-home')).toHaveClass(/on/);
    await expect(B2.locator('#pendBox')).toBeHidden();
    expect(await B2.evaluate(() => localStorage.getItem('impostor-room'))).toBeNull();
  });

  test('una recarga tras más de 5 h tampoco vuelve a la partida', async ({ browser }) => {
    const { A, B, C } = await partidaDeTres(browser);
    for (const P of [A, B, C]) await P.evaluate(() => { VUELTA.fuera = 1; }); // que los intervalos no renueven la marca de uso
    await C.evaluate(() => { localStorage.setItem('impostor-vivo', String(Date.now() - 6 * 3600e3)); });
    await C.reload();
    await expect(C.locator('#s-home')).toHaveClass(/on/);
    expect(await C.evaluate(() => ROOM)).toBeNull();
  });

  test('al volver a la app tras más de 5 h en segundo plano, se va a la portada', async ({ browser }) => {
    const { B } = await partidaDeTres(browser);
    await B.evaluate(() => { alIrse(); localStorage.setItem('impostor-vivo', String(Date.now() - 6 * 3600e3)); VUELTA.ult = 0; alVolver(); });
    await expect(B.locator('#s-home')).toHaveClass(/on/);
    expect(await B.evaluate(() => ({ room: ROOM, saved: localStorage.getItem('impostor-room') }))).toEqual({ room: null, saved: null });
    await expect(B.locator('#pendBox')).toBeHidden();
  });

  test('al volver a la app tras poco rato, la partida sigue', async ({ browser }) => {
    const { B } = await partidaDeTres(browser);
    await B.evaluate(() => { alIrse(); VUELTA.ult = 0; alVolver(); });
    await expect(B.locator('#s-game')).toHaveClass(/on/);
    await expect.poll(() => B.evaluate(() => NET.st)).toBe('up');
  });

  test('un solo móvil: en frío ofrece volver y la recupera', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const P = await ctx.newPage();
    await startSolo(P, ['Ana', 'Beto', 'Cris']);
    await P.click('#shGo'); await peekCard(P); await P.click('#scNext');
    const ronda = await P.evaluate(() => SOLO.deal.idx);
    await P.close();
    const P2 = await ctx.newPage();
    await P2.goto(BASE);
    await expect(P2.locator('#pendBox')).toBeVisible();
    await expect(P2.locator('#pendTxt')).toContainText('un solo móvil');
    await P2.click('#pendGo');
    await expect.poll(() => P2.evaluate(() => SOLO && SOLO.deal && SOLO.deal.idx)).toBe(ronda);
    await expect(P2.locator('#s-home')).not.toHaveClass(/on/);
  });

  test('un solo móvil: empezar otra partida con la guardada pendiente la sustituye', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const P = await ctx.newPage();
    await startSolo(P, ['Ana', 'Beto', 'Cris']);
    await expect.poll(() => P.evaluate(() => !!SOLO)).toBe(true);
    await P.close();
    const P2 = await ctx.newPage();
    await P2.goto(BASE);
    await expect(P2.locator('#pendBox')).toBeVisible();
    await P2.evaluate(() => localStorage.removeItem('impostor-names')); // que no se sumen los nombres recordados de la anterior
    await startSolo(P2, ['Dani', 'Eva', 'Fran', 'Gema']);
    await expect.poll(() => P2.evaluate(() => SOLO && SOLO.names.length)).toBe(4);
    await P2.reload();
    expect(await P2.evaluate(() => SOLO && SOLO.names.join(','))).toBe('Dani,Eva,Fran,Gema');
  });
});
