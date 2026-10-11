const { test, expect } = require('@playwright/test');
const { startSolo, peekCard, voteVoice, waitReveal, afterReveal } = require('./helpers');

const NAMES = ['Ana', 'Beto', 'Cris', 'Dani', 'Eva'];

async function deal(page, names) {
  for (let i = 0; i < names.length; i++) {
    await page.click('#shGo');
    await peekCard(page);
    await page.click('#scNext');
  }
  await expect(page.locator('#s-solo-debate')).toHaveClass(/on/);
  return page.evaluate(() => {
    const imps = soloImps();
    return { imps: imps.map((s) => SOLO.names[s - 1]), inns: SOLO.names.filter((_, i) => !imps.includes(i + 1)) };
  });
}
const scores = (page) => page.evaluate(() => JSON.stringify(SOLO.rank));

// La regla es única (computeVoteResult) y la usan el móvil único y la sala en línea.
test.describe('Regla de fin de ronda (función compartida)', () => {
  const cases = [
    // [jugadores, impostores, eliminado es impostor, resultado esperado]
    [3, 1, false, 'imp'], [4, 1, false, 'cont'], [5, 1, false, 'cont'],
    [5, 2, true, 'cont'], [5, 2, false, 'imp'], [4, 2, false, 'imp'], [4, 1, true, 'inn'], [3, 1, true, 'inn'],
  ];
  for (const [n, k, elimImp, out] of cases) {
    test(`${n} jugadores / ${k} impostor(es), eliminan ${elimImp ? 'impostor' : 'inocente'} → ${out}`, async ({ page }) => {
      await page.goto(process.env.TEST_PATH || '/');
      const r = await page.evaluate(({ n, k, elimImp }) => {
        const alive = Array.from({ length: n }, (_, i) => i + 1);
        const imps = alive.slice(0, k);
        const target = elimImp ? imps[0] : alive[n - 1];
        const votes = {};
        alive.forEach((a) => { if (a !== target) votes[a] = target; });
        votes[target] = alive.find((a) => a !== target);
        return computeVoteResult(alive, alive, false, votes, [], imps).out;
      }, { n, k, elimImp });
      expect(r).toBe(out);
    });
  }
  test('voto en voz alta: solo votan los "votantes", los vivos cuentan para el fin de ronda', async ({ page }) => {
    await page.goto(process.env.TEST_PATH || '/');
    const out = await page.evaluate(() => computeVoteResult([1, 2, 3, 4], [1, 2, 3, 4], false, { 0: 3 }, [], [1], [0]).out);
    expect(out).toBe('cont');
  });
});

test.describe('Un solo móvil, voto en voz alta', () => {
  test('3 jugadores / 1 impostor: votar a un inocente → ganan los impostores y suman puntos', async ({ page }) => {
    test.setTimeout(60000);
    const names = NAMES.slice(0, 3);
    await startSolo(page, names, { k: 1 });
    const { inns } = await deal(page, names);
    await voteVoice(page, inns[0]);
    await waitReveal(page);
    expect(await page.evaluate(() => SOLO.res.out)).toBe('imp');
    await expect(page.locator('#reveal .box h4').nth(1)).toHaveText('Ganan los impostores');
  });

  for (const n of [4, 5]) {
    test(`${n} jugadores / 1 impostor: votar a un inocente → se vuelve a votar sin el eliminado y sin puntos`, async ({ page }) => {
      test.setTimeout(60000);
      const names = NAMES.slice(0, n);
      await startSolo(page, names, { k: 1 });
      const { inns } = await deal(page, names);
      const before = await scores(page);
      await voteVoice(page, inns[0]);
      await waitReveal(page);
      expect(await page.evaluate(() => SOLO.res.out)).toBe('cont');
      await expect(page.locator('#reveal .box h4', { hasText: 'Ganan' })).toHaveCount(0);
      expect(await scores(page)).toBe(before);
      await afterReveal(page);
      await expect(page.locator('#s-solo-debate')).toHaveClass(/on/);
      await page.click('#sdVote');
      await expect(page.locator('#svList .vbtn')).toHaveCount(n - 1);
      await expect(page.locator('#svList .vbtn', { hasText: inns[0] })).toHaveCount(0);
    });
  }

  test('4 jugadores / 1 impostor: inocente eliminado y, a la segunda votación, pillan al impostor → ganan inocentes y suman', async ({ page }) => {
    test.setTimeout(60000);
    const names = NAMES.slice(0, 4);
    await startSolo(page, names, { k: 1 });
    const { imps, inns } = await deal(page, names);
    const before = await scores(page);
    await voteVoice(page, inns[0]);
    await waitReveal(page);
    expect(await page.evaluate(() => SOLO.res.out)).toBe('cont');
    await afterReveal(page);
    await voteVoice(page, imps[0]);
    await waitReveal(page);
    expect(await page.evaluate(() => SOLO.res.out)).toBe('inn');
    await expect(page.locator('#reveal .box h4').nth(1)).toHaveText('Ganan los inocentes');
    expect(await scores(page)).not.toBe(before);
  });

  test('5 jugadores / 2 impostores: eliminar un impostor → se sigue votando', async ({ page }) => {
    test.setTimeout(60000);
    await startSolo(page, NAMES, { k: 2 });
    const { imps } = await deal(page, NAMES);
    await voteVoice(page, imps[0]);
    await waitReveal(page);
    expect(await page.evaluate(() => SOLO.res.out)).toBe('cont');
    await afterReveal(page);
    await expect(page.locator('#s-solo-debate')).toHaveClass(/on/);
  });
});
