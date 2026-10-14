// App Android (Capacitor) simulada con un puente falso: sin Sign in with Apple, plugin AudioSesion opcional, botón «atrás» del sistema y aviso de micro denegado.
const { test, expect } = require('@playwright/test');
const { startSolo } = require('./helpers');

const puente = ({ conAudioSesion }) => {
  window.__atras = null; window.__salida = 0; window.__ajustes = 0;
  const App = { addListener: (ev, f) => { if (ev === 'backButton') window.__atras = f; return Promise.resolve({ remove() {} }); }, exitApp: () => { window.__salida++; } };
  const Plugins = { App, Browser: { open: () => Promise.resolve() }, StatusBar: { setStyle: () => Promise.resolve() }, Haptics: { vibrate: () => Promise.resolve(), impact: () => Promise.resolve() } };
  if (conAudioSesion) Plugins.AudioSesion = { modo: () => Promise.resolve(), abrirAjustes: () => { window.__ajustes++; return Promise.resolve(); } };
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins };
};
const atras = (page) => page.evaluate(() => window.__atras());

test.describe('Android', () => {
  test.beforeEach(async ({ page }) => { await page.addInitScript(puente, { conAudioSesion: true }); });

  test('arranca sin errores, con la clase en-android y sin botón de Apple', async ({ page }) => {
    const errores = []; page.on('pageerror', (e) => errores.push(e.message));
    await page.goto('/');
    await expect(page.locator('#s-home')).toBeVisible();
    await expect(page.locator('html')).toHaveClass(/en-android/);
    await page.click('#acct button');
    await expect(page.locator('#sheet')).toContainText('Tu cuenta de Punto Ciego');
    await expect(page.locator('#lgMail')).toBeVisible();
    await expect(page.locator('#lgA')).toHaveCount(0);
    expect(errores).toEqual([]);
  });

  test('sin el plugin AudioSesion la app no falla (y el aviso de micro lo dice para Android)', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    const errores = []; page.on('pageerror', (e) => errores.push(e.message));
    await page.addInitScript(puente, { conAudioSesion: false });
    await page.goto('/');
    await expect(page.locator('#s-home')).toBeVisible();
    await page.evaluate(() => { audioModo('walkie'); audioModo('ambient', true); });
    expect(await page.locator('#wkMicOff p').textContent()).toContain('Aplicaciones');
    expect(errores).toEqual([]);
    await ctx.close();
  });

  test('«atrás»: vuelve como «‹ Volver» y cierra la app solo desde la portada sin partida', async ({ page }) => {
    await page.goto('/');
    await page.click('#goCreate');
    await expect(page.locator('#s-create')).toBeVisible();
    await atras(page);
    await expect(page.locator('#s-home')).toBeVisible();
    expect(await page.evaluate(() => window.__salida)).toBe(0);
    await atras(page);
    expect(await page.evaluate(() => window.__salida)).toBe(1);
  });

  test('«atrás» cierra primero las hojas y los menús', async ({ page }) => {
    await page.goto('/');
    await page.click('#goSettings');
    await expect(page.locator('#overlay')).toHaveClass(/on/);
    await atras(page);
    await expect(page.locator('#overlay')).not.toHaveClass(/on/);
    expect(await page.evaluate(() => window.__salida)).toBe(0);
  });

  test('«atrás» en mitad de una partida pregunta y no cierra la app', async ({ page }) => {
    await startSolo(page, ['Ana', 'Beto', 'Cris'], { k: 1 });
    await page.click('#shGo');
    await expect(page.locator('#s-solo-card')).toBeVisible();
    await atras(page);
    await expect(page.locator('#menuOverlay')).toHaveClass(/on/);
    await expect(page.locator('#menuSheetEl')).toContainText('¿Terminar la partida?');
    expect(await page.evaluate(() => window.__salida)).toBe(0);
    await atras(page);
    await expect(page.locator('#menuOverlay')).not.toHaveClass(/on/);
    expect(await page.evaluate(() => window.__salida)).toBe(0);
  });

  test('micro denegado en Android: aviso con «Abrir Ajustes» que llama al plugin', async ({ page }) => {
    await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' })); });
    await page.goto('/');
    await page.evaluate(() => { WK.denegado = true; WK.abierto = true; WK.pinta(); });
    await page.evaluate(() => { WK.abierto = false; });
    await page.locator('#wkAjustes').dispatchEvent('click');
    expect(await page.evaluate(() => window.__ajustes)).toBe(1);
  });
});
