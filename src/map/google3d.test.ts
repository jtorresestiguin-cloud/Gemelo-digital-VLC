import { describe, expect, it } from 'vitest';
import { collectCredits, ionErrorMessage, keyErrorMessage, tilesetFromIonEndpoint } from './google3d';

describe('vista fotorrealista de Google', () => {
  it('ordena las atribuciones por frecuencia y sin repetir', () => {
    expect(collectCredits(['Google; Airbus', 'Google', 'Landsat / Copernicus;Google', undefined, 'Airbus'])).toBe('Google; Airbus; Landsat / Copernicus');
    expect(collectCredits([])).toBe('');
  });

  it('explica los errores habituales de la clave', () => {
    expect(keyErrorMessage(200)).toBeUndefined();
    expect(keyErrorMessage(400, 'API key not valid. Please pass a valid API key.')).toBe('La clave no es válida.');
    expect(keyErrorMessage(403, 'Requests from referer https://x.github.io/ are blocked.')).toMatch(/dominio/);
    expect(keyErrorMessage(403, 'This API method requires billing to be enabled')).toMatch(/facturación/);
    expect(keyErrorMessage(403, 'Map Tiles API has not been used in project')).toMatch(/Map Tiles API/);
    expect(keyErrorMessage(429)).toMatch(/cuota/);
  });

  it('obtiene la URL de los modelos de Google a través de Cesium ion', () => {
    expect(tilesetFromIonEndpoint({ type: '3DTILES', externalType: '3DTILES', options: { url: 'https://tile.googleapis.com/v1/3dtiles/root.json?key=K' } }))
      .toBe('https://tile.googleapis.com/v1/3dtiles/root.json?key=K');
    expect(tilesetFromIonEndpoint({ type: '3DTILES', url: 'https://assets.ion.cesium.com/1/tileset.json', accessToken: 'T' }))
      .toBe('https://assets.ion.cesium.com/1/tileset.json?access_token=T');
    expect(() => tilesetFromIonEndpoint({ type: 'IMAGERY', url: 'x' })).toThrow(/3D Tiles/);
    expect(ionErrorMessage(404)).toMatch(/Asset Depot/);
    expect(ionErrorMessage(401)).toMatch(/no es válido/);
  });
});
