import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchLayer, layerQueryUrl } from './geoportal';

afterEach(() => vi.unstubAllGlobals());

describe('cliente del Geoportal', () => {
  it('pide WGS84 en GeoJSON con paginación', () => {
    const u = new URL(layerQueryUrl('Trafico/MapServer/192', 2000));
    expect(u.pathname).toContain('/OPENDATA/Trafico/MapServer/192/query');
    expect(u.searchParams.get('outSR')).toBe('4326');
    expect(u.searchParams.get('f')).toBe('geojson');
    expect(u.searchParams.get('resultOffset')).toBe('2000');
  });

  it('sigue pidiendo páginas mientras el servidor indica que hay más', async () => {
    const page = (n: number, more: boolean) => ({
      type: 'FeatureCollection',
      features: Array.from({ length: n }, () => ({ type: 'Feature', geometry: null, properties: {} })),
      ...(more ? { exceededTransferLimit: true } : {}),
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => page(1000, true) })
      .mockResolvedValueOnce({ ok: true, json: async () => page(1000, true) })
      .mockResolvedValueOnce({ ok: true, json: async () => page(925, false) });
    vi.stubGlobal('fetch', fetchMock);
    const fc = await fetchLayer('SociedadBienestar/MapServer/1');
    expect(fc.features).toHaveLength(2925);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[2][0])).toContain('resultOffset=2000');
  });

  it('propaga los errores de ArcGIS aunque la respuesta sea HTTP 200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ error: { code: 400, message: 'Invalid query' } }) }));
    await expect(fetchLayer('x/MapServer/1')).rejects.toThrow('Invalid query');
  });
});
