// Walkie apagado por defecto al crear sala en línea, y sesión de audio nativa (ambient / walkie) en la app.
const { test, expect } = require('@playwright/test');

const sw = (page) => page.locator('#remote2Sw');

test.describe('Walkie al crear una partida en grupo', () => {
  test('viene desactivado, se puede activar y se vuelve a desactivar al crear otra partida', async ({ page }) => {
    await page.goto('/');
    await page.click('#goCreate');
    await expect(sw(page)).toHaveAttribute('aria-checked', 'false');
    await sw(page).click();
    await expect(sw(page)).toHaveAttribute('aria-checked', 'true');
    expect(await page.evaluate(() => rs.remote)).toBe(true); // el anfitrión lo activa: se respeta
    await page.evaluate(() => show('s-home'));
    await page.click('#goCreate');
    await expect(sw(page)).toHaveAttribute('aria-checked', 'false');
  });
});

test.describe('Sesión de audio de la app', () => {
  test('el walkie pide playAndRecord al abrirse y ambient al cerrarse; en la web no hace nada', async ({ page }) => {
    const errores = [];
    page.on('pageerror', (e) => errores.push(e.message));
    await page.addInitScript(() => {
      window.__audio = [];
      window.Capacitor = {
        isNativePlatform: () => true,
        Plugins: {
          Browser: { open: () => Promise.resolve() },
          StatusBar: { setStyle: () => Promise.resolve() },
          SignInWithApple: { authorize: () => Promise.reject(new Error('cancel')) },
          Haptics: { impact: () => Promise.resolve(), vibrate: () => Promise.resolve() },
          AudioSesion: { modo: (o) => { window.__audio.push(o.modo); return Promise.resolve(); } },
        },
      };
    });
    await page.goto('/');
    await page.evaluate(() => { window.__audio = []; audioModo('walkie'); audioModo('ambient'); });
    expect(await page.evaluate(() => window.__audio)).toEqual(['walkie', 'ambient']);
    // si el plugin falla o no existe, no se rompe nada
    await page.evaluate(() => { window.Capacitor.Plugins.AudioSesion.modo = () => { throw new Error('boom'); }; audioModo('walkie'); delete window.Capacitor.Plugins.AudioSesion; audioModo('ambient'); });
    expect(errores).toEqual([]);
  });

  test('WK.abrir / WK.cerrar cambian la sesión de audio', async ({ page }) => {
    await page.addInitScript(() => {
      window.__audio = [];
      window.Capacitor = { isNativePlatform: () => true, Plugins: { AudioSesion: { modo: (o) => { window.__audio.push(o.modo); return Promise.resolve(); } } } };
    });
    await page.goto('/');
    await page.evaluate(() => { window.__audio = []; ROOM = { code: 'ABCDE', name: 'Ana', creator: true, remote: true, joined: Date.now() }; WK.abrir(); WK.cerrar(); });
    expect(await page.evaluate(() => window.__audio)).toEqual(['walkie', 'ambient']);
  });
});

test.describe('audioSession del WebView', () => {
  test('ambient al iniciar, play-and-record solo con el walkie abierto y ambient al cerrarlo (con registro AUDIO tipo=)', async ({ page }) => {
    const logs = [];
    page.on('console', (m) => { if (m.text().startsWith('AUDIO tipo=')) logs.push(m.text()); });
    await page.addInitScript(() => {
      window.Capacitor = { isNativePlatform: () => true, Plugins: {} };
      Object.defineProperty(navigator, 'audioSession', { value: { type: 'auto' }, configurable: true });
    });
    await page.goto('/');
    expect(await page.evaluate(() => navigator.audioSession.type)).toBe('ambient');
    await page.evaluate(() => { ROOM = { code: 'ABCDE', name: 'Ana', creator: true, remote: true, joined: Date.now() }; WK.abrir(); });
    expect(await page.evaluate(() => navigator.audioSession.type)).toBe('play-and-record');
    await page.evaluate(() => WK.cerrar());
    expect(await page.evaluate(() => navigator.audioSession.type)).toBe('ambient');
    expect(logs.map((l) => l.split(' ')[1])).toEqual(['tipo=ambient', 'tipo=play-and-record', 'tipo=ambient'].map((x) => x));
  });

  test('en la web no se toca audioSession', async ({ page }) => {
    await page.addInitScript(() => { Object.defineProperty(navigator, 'audioSession', { value: { type: 'auto' }, configurable: true }); });
    await page.goto('/');
    expect(await page.evaluate(() => navigator.audioSession.type)).toBe('auto');
  });
});

test.describe('Sala de espera: «‹ Volver»', () => {
  test('pide confirmación; «Quedarme» no sale y «Salir» vuelve a la portada y suelta la sala', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => { ROOM = { code: 'ABCDE', name: 'Ana', creator: true, remote: false, joined: Date.now() }; S = { host: PID, ph: 'lobby', pl: [], acc: [], pend: [], ban: [] }; show('s-lobby'); });
    await expect(page.locator('#lbBack')).toBeVisible();
    await page.click('#lbBack');
    await expect(page.locator('#sheet h3')).toHaveText('¿Salir de la sala?');
    await expect(page.locator('#sheet p')).toContainText('único en la sala');
    await page.click('#slNo');
    await expect(page.locator('#s-lobby')).toHaveClass(/on/);
    await page.click('#lbBack');
    await page.click('#slYes');
    await expect(page.locator('#s-home')).toHaveClass(/on/);
    expect(await page.evaluate(() => ROOM)).toBeNull();
  });

  test('también en la pantalla de espera de quien llega con la partida empezada', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => { ROOM = { code: 'ABCDE', name: 'Ana', creator: false, remote: false, joined: Date.now() }; show('s-wait'); });
    await page.click('#wtBack');
    await expect(page.locator('#sheet p')).toContainText('volver a entrar');
    await page.click('#slYes');
    await expect(page.locator('#s-home')).toHaveClass(/on/);
  });
});

test.describe('Sonido tras soltar el micro (app)', () => {
  const puente = () => {
    window.__ev = [];
    window.Capacitor = { isNativePlatform: () => true, Plugins: { AudioSesion: { modo: (o) => { window.__ev.push(o.modo); return Promise.resolve(); } } } };
    navigator.mediaDevices.getUserMedia = async () => ({
      active: true,
      getAudioTracks: () => [{ readyState: 'live' }],
      getTracks: () => [{ stop: () => window.__ev.push('micro-suelto') }],
    });
  };

  test('al salir de las pantallas del walkie con el micro abierto, «ambient» se vuelve a pedir con el micro ya suelto', async ({ page }) => {
    await page.addInitScript(puente);
    await page.goto('/');
    await page.evaluate(async () => {
      ROOM = { code: 'ABCDE', name: 'Ana', creator: true, remote: true, joined: Date.now() };
      WK.abrir(); await WK.micro(); window.__ev = [];
      show('s-home'); // cerrar() pide ambient con el micro aún abierto; soltar() lo libera
    });
    await page.waitForTimeout(700);
    const ev = await page.evaluate(() => window.__ev);
    const suelto = ev.indexOf('micro-suelto');
    expect(suelto).toBeGreaterThan(-1);
    expect(ev.slice(suelto + 1)).toEqual(['ambient', 'ambient']); // justo después y un instante más tarde
  });

  test('en un solo móvil (sin micro) no se toca la sesión de audio de más al cambiar de pantalla', async ({ page }) => {
    await page.addInitScript(puente);
    await page.goto('/');
    const ev = await page.evaluate(async () => { window.__ev = []; show('s-home'); show('s-home'); await new Promise((r) => setTimeout(r, 700)); return window.__ev; });
    expect(ev).toEqual(['ambient', 'ambient']); // solo el de cerrar(), una vez por cambio de pantalla, como antes
  });
});
