// Comportamiento en la app nativa (Capacitor) simulado con un puente falso: enlaces externos, enlaces para compartir y cabecera del área segura.
const { test, expect } = require('@playwright/test');

const puente = () => {
  window.__abiertos = [];
  window.__barra = [];
  /* Como en la app real: sin @capacitor/core, solo existe Capacitor.Plugins (no registerPlugin) */
  window.Capacitor = {
    isNativePlatform: () => true,
    Plugins: {
      Browser: { open: (o) => { window.__abiertos.push(o.url); return Promise.resolve(); } },
      StatusBar: { setStyle: (o) => { window.__barra.push(o.style); return Promise.resolve(); } },
      SignInWithApple: { authorize: () => Promise.reject(new Error('cancel')) },
    },
  };
};

test.beforeEach(async ({ page }) => { await page.addInitScript(puente); });

test('en la app, el juego arranca sin errores y ajusta la barra de estado', async ({ page }) => {
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message));
  await page.goto('/');
  await expect(page.locator('#s-home')).toBeVisible();
  expect(errores).toEqual([]);
  expect(await page.evaluate(() => window.__barra.length)).toBeGreaterThan(0);
});

test('en la app, Privacidad/Términos/Soporte se abren con Browser y URL absoluta', async ({ page }) => {
  await page.goto('/');
  const legal = page.locator('#s-home .legal a');
  await expect(legal).toHaveCount(3);
  for (const t of ['Privacidad', 'Términos', 'Soporte']) await page.locator('#s-home .legal a', { hasText: t }).click();
  expect(await page.evaluate(() => window.__abiertos)).toEqual([
    'https://puntostudio.es/privacidad/',
    'https://puntostudio.es/punto-falso/terminos.html',
    'https://puntostudio.es/soporte/',
  ]);
  expect(page.url()).not.toContain('puntostudio.es');
});

test('en la app, el enlace de sala apunta a la web pública', async ({ page }) => {
  await page.goto('/');
  expect(await page.evaluate(() => roomLink('ABCDE'))).toBe('https://puntostudio.es/punto-falso/?s=ABCDE');
  expect(await page.evaluate(() => linkFor('XYZ', ['a', 'b'], false))).toMatch(/^https:\/\/puntostudio\.es\/punto-falso\/#j=XYZ~a~b/);
});

test('la cabecera opaca existe y usa el área segura', async ({ page }) => {
  await page.goto('/');
  const c = await page.evaluate(() => { const s = getComputedStyle(document.body, '::before'); return { pos: s.position, bg: s.backgroundColor, z: s.zIndex }; });
  expect(c.pos).toBe('fixed');
  expect(c.bg).not.toBe('rgba(0, 0, 0, 0)');
  expect(+c.z).toBeGreaterThan(0);
});

test('en la web (sin puente), los enlaces legales siguen siendo normales', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:8383/');
  expect(await page.evaluate(() => [EN_APP, roomLink('ABCDE').startsWith(location.origin)])).toEqual([false, true]);
  await ctx.close();
});

test('en la app, Ajustes enseña la versión y abre los enlaces legales con Browser', async ({ page }) => {
  await page.goto('/');
  await page.click('#goSettings');
  await expect(page.locator('#sheet')).toContainText('versión 1.0');
  const legal = page.locator('#sheet .legal a');
  await expect(legal).toHaveCount(3);
  for (const t of ['Privacidad', 'Términos', 'Soporte']) await page.locator('#sheet .legal a', { hasText: t }).click();
  expect(await page.evaluate(() => window.__abiertos)).toEqual([
    'https://puntostudio.es/privacidad/',
    'https://puntostudio.es/punto-falso/terminos.html',
    'https://puntostudio.es/soporte/',
  ]);
});

test('en la app, el botón de Apple está siempre y sigue las guías en claro y en oscuro', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await page.click('#acct button');
  const apple = page.locator('#lgA');
  await expect(apple).toBeVisible();
  await expect(apple).toContainText('Apple');
  const est = () => apple.evaluate((el) => { const s = getComputedStyle(el); return { bg: s.backgroundColor, color: s.color, h: el.getBoundingClientRect().height }; });
  let e = await est();
  expect(e.bg).toBe('rgb(0, 0, 0)'); // claro: negro con logo blanco
  expect(e.color).toBe('rgb(255, 255, 255)');
  expect(e.h).toBeGreaterThanOrEqual(48);
  await page.emulateMedia({ colorScheme: 'dark' });
  e = await est();
  expect(e.bg).toBe('rgb(255, 255, 255)'); // oscuro: blanco con logo negro
  expect(e.color).toBe('rgb(0, 0, 0)');
  expect(await apple.locator('svg path').getAttribute('fill')).toBe('currentColor');
  // con el tema forzado a claro en Ajustes manda el tema, no el del sistema
  await page.evaluate(() => setSetting('theme', 'light'));
  expect((await est()).bg).toBe('rgb(0, 0, 0)');
});

test('en la app, el inicio de sesión ofrece recuperar la contraseña por correo y los enlaces vuelven a la web pública', async ({ page }) => {
  await page.goto('/');
  await page.click('#acct button');
  await expect(page.getByRole('button', { name: 'He olvidado la contraseña' })).toBeVisible();
  expect(await page.evaluate(() => WEB_VUELTA())).toBe('https://puntostudio.es/punto-falso/');
});

test('en la app, EN_LOCAL no vale aunque el host sea localhost (los parámetros de pruebas no actúan)', async ({ page }) => {
  await page.goto('/?grace=1&sblib=https://example.com/x.js');
  expect(await page.evaluate(() => [EN_APP, EN_LOCAL, HOST_GRACE, SB_LIB])).toEqual([true, false, 30000, 'vendor/supabase-js/supabase.js']);
});

test('en la web, localhost sigue siendo local para las pruebas', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:8383/?grace=1');
  expect(await page.evaluate(() => [EN_APP, EN_LOCAL, HOST_GRACE])).toEqual([false, true, 1000]);
  await ctx.close();
});
