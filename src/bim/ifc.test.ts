import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { extractIfcGeometry } from './ifc';

const { IfcAPI } = createRequire(import.meta.url)('web-ifc') as typeof import('web-ifc');

describe('extracción de geometría IFC (web-ifc / WebAssembly)', () => {
  it('lee el modelo de ejemplo de la terminal', async () => {
    const api = new IfcAPI();
    api.SetWasmPath(resolve('node_modules/web-ifc') + '/', true);
    await api.Init();
    const bytes = new Uint8Array(readFileSync(resolve('public/bim/ejemplo-terminal.ifc')));
    const g = extractIfcGeometry(api as never, bytes);
    expect(g.elements).toBe(5);
    expect(g.indices.length % 3).toBe(0);
    expect(g.positions.length / 3).toBe(g.colors.length / 4);
    // Y arriba: altura total ≈ 37 m (torre 32 + cabina 5)
    expect(g.bbox.max[1] - g.bbox.min[1]).toBeCloseTo(37, 0);
    // planta: la nave mide 82 m (cubierta) y la torre está desplazada → extensión > 100 m
    expect(g.bbox.max[0] - g.bbox.min[0]).toBeGreaterThan(100);
  });
});
