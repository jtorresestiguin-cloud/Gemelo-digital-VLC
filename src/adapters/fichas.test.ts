import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fichaHtml, matchFicha, type FichasDoc } from './fichas';

const doc = JSON.parse(readFileSync('public/data/fichas-vlc.json', 'utf8')) as FichasDoc;

describe('fichas de servicios de València', () => {
  it('solo trae puntos de la ciudad con nombre, tipo y fuente', () => {
    expect(doc.points.length).toBeGreaterThan(700);
    for (const f of doc.points) {
      expect(f.n && f.t).toBeTruthy();
      expect(f.ll[1]).toBeGreaterThan(39.27);
      expect(f.ll[1]).toBeLessThan(39.6);
      expect(f.src.every((k) => doc.sources[k])).toBe(true);
    }
  });

  it('empareja un punto con su ficha aunque el nombre varíe un poco y la posición no sea exacta', () => {
    const f = doc.points.find((p) => p.tr?.length && p.tel)!;
    const at: [number, number] = [f.ll[0] + 0.0003, f.ll[1] - 0.0002];
    expect(matchFicha(doc, f.n.toUpperCase(), at)).toBe(f);
    expect(matchFicha(doc, 'Nada que ver con esto', [-0.2, 39.2])).toBeUndefined();
  });

  it('la ficha es breve, enlaza teléfono y trámites y escapa el texto', () => {
    const f = doc.points.find((p) => p.tr?.length && p.tel)!;
    const html = fichaHtml({ ...f, n: 'A <b>B</b>' }, doc);
    expect(html).toContain('href="tel:');
    expect(html).toContain('Trámites (');
    expect(html).not.toContain('<b>B</b>');
    expect(html).toContain('Fuente:');
  });
});
