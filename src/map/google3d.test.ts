import { describe, expect, it } from 'vitest';
import { collectCredits, keyErrorMessage } from './google3d';

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
});
