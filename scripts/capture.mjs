// Abre la web PUBLICADA, activa la ciudad fotorrealista y guarda capturas de varios puntos.
// Se ejecuta en GitHub Actions (workflow «Capturas de la web»).
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const URL = process.env.SITE_URL ?? 'https://jtorresestiguin-cloud.github.io/Gemelo-digital-VLC/';
const OUT = 'capturas';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const stats = { tiles: 0, tileErrors: 0, ion: 0, errors: [] };
page.on('response', (r) => {
  const u = r.url();
  if (u.includes('tile.googleapis.com')) (r.ok() ? stats.tiles++ : stats.tileErrors++);
  if (u.includes('api.cesium.com')) stats.ion = r.status();
});
page.on('pageerror', (e) => stats.errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') stats.errors.push(m.text().slice(0, 200)); });

await page.goto(`${URL}?video=1`, { waitUntil: 'networkidle', timeout: 90_000 });
await page.waitForTimeout(4000);
// la ciudad fotorrealista se activa sola al abrir (modo simple)
await page.waitForTimeout(40_000);
const shot = async (file) => {
  try {
    await page.screenshot({ path: `${OUT}/${file}`, timeout: 180_000 });
    console.log('captura', file);
  } catch (e) {
    console.log('sin captura', file, e.message.split('\n')[0]);
  }
};
await shot('01-inicio.png');
console.log('Aviso en pantalla:', await page.locator('.toast').allInnerTexts().catch(() => []));

for (const [name, label] of [['02-centro', 'Centro'], ['03-ciutat-arts', 'Ciutat de les Arts'], ['04-port', 'Port']]) {
  await page.click(`.goto >> text=${label}`);
  await page.waitForTimeout(30_000);
  await page.keyboard.press('r'); // solo el mapa
  await page.waitForTimeout(1000);
  await shot(`${name}.png`);
  await page.keyboard.press('r');
}
// «Ciudad en vivo»: tráfico, aire y Valenbisi sobre la ciudad fotorrealista
for (const t of ['Tráfico', 'Calidad del aire', 'Valenbisi']) await page.locator('.live .switch', { hasText: t }).click().catch(() => console.log('sin interruptor', t));
// más capas: se activan en una segunda tanda de capturas
const MORE = ['Aparcamientos públicos', 'Obras', 'Metro', 'Ruido', 'Playas'];
await page.waitForTimeout(15_000);
await shot('05-en-vivo-panel.png');
for (const [name, label] of [['06-en-vivo-centro', 'Centro'], ['07-en-vivo-ciudad', 'Toda la ciudad']]) {
  await page.click(`.goto >> text=${label}`);
  await page.waitForTimeout(30_000);
  await page.keyboard.press('r');
  await page.waitForTimeout(1000);
  await shot(`${name}.png`);
  await page.keyboard.press('r');
}
console.log('En vivo:', await page.locator('.live').innerText().catch(() => ''));
for (const t of ['Tráfico', 'Calidad del aire', 'Valenbisi', ...MORE]) await page.locator('.live .switch', { hasText: t }).click().catch(() => console.log('sin interruptor', t));
await page.waitForTimeout(15_000);
await shot('08-mas-capas-panel.png');
for (const [name, label] of [['09-mas-capas-centro', 'Centro'], ['10-mas-capas-russafa', 'Russafa'], ['11-mas-capas-ciudad', 'Toda la ciudad']]) {
  await page.click(`.goto >> text=${label}`);
  await page.waitForTimeout(30_000);
  await page.keyboard.press('r');
  await page.waitForTimeout(1000);
  await shot(`${name}.png`);
  await page.keyboard.press('r');
}
// ficha de una estación de metro (próximos trenes)
await page.click('.goto >> text=Centro');
await page.waitForTimeout(20_000);
const metro = await page.evaluate(() => {
  const m = window.__map;
  if (!m) return null;
  const f = m.queryRenderedFeatures({ layers: ['vlc-x-metro'] })[0];
  return f ? m.project(f.geometry.coordinates) : null;
});
console.log('metro en pantalla:', metro);
if (metro) {
  await page.mouse.click(metro.x, metro.y + 60);
  await page.waitForTimeout(4000);
  await shot('12-metro-ficha.png');
  console.log('Ficha metro:', await page.locator('.maplibregl-popup').innerText().catch(() => ''));
}
console.log('Más capas:', await page.locator('.live').innerText().catch(() => ''));
writeFileSync(`${OUT}/stats.json`, JSON.stringify(stats, null, 2));
console.log(JSON.stringify(stats, null, 2));
await browser.close();
