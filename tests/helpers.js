// Ayudas comunes para probar el modo "un solo móvil" con interacciones reales de UI
// (no llama a las funciones internas salvo para leer el estado, nunca para saltarse pasos).

async function goHome(page) {
  await page.goto(process.env.TEST_PATH || '/');
}

async function openSoloSetup(page) {
  await page.click('#goCreateOff');
}

async function addPlayers(page, names) {
  for (const n of names) {
    await page.fill('#nameIn', n);
    await page.click('#addName');
    // el efecto al pulsar retrasa ~100 ms el clic de "Añadir": se espera a que el nombre esté en la lista antes de escribir el siguiente
    await page.locator('.names .nm', { hasText: n }).first().waitFor();
  }
}

async function clearPlayers(page) {
  // quita del tirón los nombres que hubiera de una partida anterior en este "móvil"
  while (await page.locator('.names .nm button').count()) {
    await page.locator('.names .nm button').first().click();
  }
}

async function setImpostors(page, k) {
  for (let i = 1; i < k; i++) await page.click('#kPlus');
}

async function startSolo(page, names, { k = 1, secret = false } = {}) {
  await goHome(page);
  await openSoloSetup(page);
  await clearPlayers(page);
  await addPlayers(page, names);
  await setImpostors(page, k);
  if (secret) await page.click('#secretSw');
  await page.click('#doCreate');
}

// Mantiene pulsada la tarjeta un instante (como un dedo real) y dice si era el impostor.
async function peekCard(page, cardSel = '#card2') {
  const card = page.locator(cardSel);
  await card.waitFor(); // la pantalla llega ~100 ms después del clic (efecto al pulsar)
  const box = await card.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(120);
  const isImp = await card.evaluate((el) => el.classList.contains('imp'));
  const bodyRed = await page.evaluate(() => document.body.classList.contains('red'));
  await page.mouse.up();
  return { isImp, bodyRed };
}

async function voteVoice(page, name) {
  await page.click('#sdVote');
  await page.locator('#svList .vbtn', { hasText: name }).click();
  await page.click('#svClose');
}

async function waitReveal(page) {
  await page.waitForSelector('#reveal.on [data-a="solo-after"]', { timeout: 9000 });
}

async function afterReveal(page) {
  await page.click('#reveal [data-a="solo-after"]');
}

module.exports = {
  goHome, openSoloSetup, addPlayers, clearPlayers, setImpostors, startSolo,
  peekCard, voteVoice, waitReveal, afterReveal,
};
