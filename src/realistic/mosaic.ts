/**
 * Mosaico de ortofoto del IGN dibujado en un lienzo y usado como textura que se proyecta
 * desde arriba sobre el suelo y los tejados. Se recentra cuando la cámara se aleja.
 */
import * as THREE from 'three';
import type { LngLat } from '../core/types';
import { lngLatToTile, pnoaTileUrl, tileToLngLat, toLocal } from './geo';

const imageCache = new Map<string, Promise<HTMLImageElement | null>>();

function loadTile(url: string): Promise<HTMLImageElement | null> {
  let p = imageCache.get(url);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
    imageCache.set(url, p);
    if (imageCache.size > 900) imageCache.delete(imageCache.keys().next().value!);
  }
  return p;
}

export class OrthoMosaic {
  readonly texture: THREE.CanvasTexture;
  /** límites en metros locales: x0 (oeste), z0 (norte), x1 (este), z1 (sur) */
  readonly bounds = new THREE.Vector4(0, 0, 0, 0);
  private ctx: CanvasRenderingContext2D;
  private key = '';
  private generation = 0;

  constructor(private origin: LngLat, readonly zoom: number, private tilesAcross: number, private onUpdate: () => void) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = tilesAcross * 256;
    this.ctx = canvas.getContext('2d')!;
    this.ctx.fillStyle = '#7d8277';
    this.ctx.fillRect(0, 0, canvas.width, canvas.height);
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.texture.generateMipmaps = true;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
  }

  /** Recentra el mosaico en un punto (solo si ha cambiado la tesela central). */
  center(p: LngLat): void {
    const [fx, fy] = lngLatToTile(p, this.zoom);
    const half = this.tilesAcross / 2;
    const x0 = Math.round(fx - half), y0 = Math.round(fy - half);
    const key = `${x0}/${y0}`;
    if (key === this.key) return;
    this.key = key;
    const gen = ++this.generation;
    const nw = toLocal(this.origin, tileToLngLat(x0, y0, this.zoom));
    const se = toLocal(this.origin, tileToLngLat(x0 + this.tilesAcross, y0 + this.tilesAcross, this.zoom));
    this.bounds.set(nw[0], nw[1], se[0], se[1]);
    const { ctx } = this;
    ctx.fillStyle = '#7d8277';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    this.texture.needsUpdate = true;
    let pending = 0;
    // primero las teselas centrales
    const order: [number, number][] = [];
    for (let j = 0; j < this.tilesAcross; j++) for (let i = 0; i < this.tilesAcross; i++) order.push([i, j]);
    order.sort((a, b) => Math.hypot(a[0] - half, a[1] - half) - Math.hypot(b[0] - half, b[1] - half));
    for (const [i, j] of order) {
      pending++;
      loadTile(pnoaTileUrl(this.zoom, x0 + i, y0 + j)).then((img) => {
        if (gen !== this.generation) return;
        if (img) ctx.drawImage(img, i * 256, j * 256);
        pending--;
        // actualizar la textura por lotes para no subirla a la GPU en cada tesela
        if (pending % 8 === 0) {
          this.texture.needsUpdate = true;
          this.onUpdate();
        }
      });
    }
  }
}
