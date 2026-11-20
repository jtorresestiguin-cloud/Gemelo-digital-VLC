/**
 * Modo realista sin cuentas: ciudad 3D renderizada con three.js dentro del mapa (capa
 * personalizada de MapLibre), solo con datos abiertos:
 *  - Ortofoto PNOA (IGN) proyectada desde arriba sobre el suelo y los tejados.
 *  - Edificios de OpenStreetMap con su altura y fachadas con ventanas por planta.
 *  - Arbolado municipal (158.000 árboles con altura, copa y tipo; palmeras incluidas).
 *  - Sol real según la hora en València, cielo, sombras y luces de ventanas al anochecer.
 */
import * as THREE from 'three';
import type { CustomLayerInterface, CustomRenderMethodInput, Map as MlMap } from 'maplibre-gl';
import type { LngLat } from '../core/types';
import { VALENCIA_CENTER } from '../data/static';
import { buildBuildingArrays } from './buildings';
import { lngLatToTile, madridLocalToDate, sunPosition, tileToLngLat, toLocal, fromLocal, type TreeSpec } from './geo';
import { OrthoMosaic } from './mosaic';
import { fetchBuildingTile, fetchTrees } from './sources';

export interface RealisticOptions {
  /** hora local (0–24) para el sol; null = hora actual */
  hour: number | null;
  shadows: boolean;
}

export interface RealisticStatus {
  buildings: number;
  trees: number;
  loading: boolean;
  error?: string;
}

const BUILDING_ZOOM = 14;
const EARTH = 40075016.686;

const triangulate = (c: [number, number][], h: [number, number][][]) =>
  THREE.ShapeUtils.triangulateShape(c.map(([x, y]) => new THREE.Vector2(x, y)), h.map((r) => r.map(([x, y]) => new THREE.Vector2(x, y))));

/** Inyecta en un MeshStandardMaterial la ortofoto proyectada desde arriba (tres niveles de detalle). */
function orthoProjected(mat: THREE.MeshStandardMaterial, mosaics: OrthoMosaic[]) {
  mat.onBeforeCompile = (shader) => {
    mosaics.forEach((m, i) => {
      shader.uniforms[`uOrtho${i}`] = { value: m.texture };
      shader.uniforms[`uBounds${i}`] = { value: m.bounds };
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vOrthoXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOrthoXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    const decl = mosaics.map((_, i) => `uniform sampler2D uOrtho${i};\nuniform vec4 uBounds${i};`).join('\n');
    const sample = mosaics.map((_, i) => `
      {
        vec2 uv = (vOrthoXZ - uBounds${i}.xy) / (uBounds${i}.zw - uBounds${i}.xy);
        vec2 edge = min(uv, 1.0 - uv);
        float w = smoothstep(0.0, 0.03, min(edge.x, edge.y));
        ortho = mix(ortho, texture2D(uOrtho${i}, vec2(uv.x, 1.0 - uv.y)).rgb, w);
      }`).join('');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec2 vOrthoXZ;\n${decl}`)
      .replace('#include <map_fragment>', `vec3 ortho = vec3(0.32, 0.34, 0.30);${sample}\ndiffuseColor.rgb *= ortho;`);
  };
  mat.customProgramCacheKey = () => `ortho-${mosaics.length}`;
}

/** Fachadas: ventanas por planta, bajos comerciales, cornisas y luces de noche. */
function facadeMaterial(night: { value: number }): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = night;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 facade;\nvarying vec2 vFacade;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFacade = facade;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec2 vFacade;
uniform float uNight;
float hash12(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float box(vec2 c, vec2 lo, vec2 hi, vec2 aa) {
  vec2 a = smoothstep(lo - aa, lo + aa, c) * (1.0 - smoothstep(hi - aa, hi + aa, c));
  return a.x * a.y;
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  float floorH = 3.15;
  float bayW = 3.3;
  vec2 g = vec2(vFacade.x / bayW, vFacade.y / floorH);
  vec2 cell = fract(g);
  vec2 aa = max(fwidth(g), vec2(1e-4)) * 0.8;
  float row = floor(g.y);
  float bay = floor(g.x);
  float upper = step(0.5, row);
  // nivel de detalle: de lejos las ventanas se funden en un tono medio (sin efecto cuadrícula)
  float lod = 1.0 - smoothstep(0.10, 0.32, max(aa.x, aa.y));
  float win = box(cell, vec2(0.24, 0.30), vec2(0.76, 0.86), aa) * upper * lod;
  float shop = box(cell, vec2(0.10, 0.06), vec2(0.92, 0.80), aa) * (1.0 - upper) * lod;
  diffuseColor.rgb *= mix(0.86, 1.0, lod);
  float rnd = hash12(vec2(bay, row));
  diffuseColor.rgb *= 0.92 + 0.16 * hash12(vec2(bay * 0.13, 7.0));
  diffuseColor.rgb *= 1.0 - 0.10 * box(cell, vec2(-0.1, 0.94), vec2(1.1, 1.1), aa);
  vec3 glass = mix(vec3(0.08, 0.11, 0.15), vec3(0.22, 0.27, 0.32), rnd * 0.5);
  diffuseColor.rgb = mix(diffuseColor.rgb, glass, win * 0.9);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.12, 0.12, 0.12), shop * 0.75);
  float vWin = win;
  float vLit = step(0.72, rnd) * (win + shop * 0.8) + (1.0 - lod) * 0.10;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = mix(roughnessFactor, 0.15, vWin);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  totalEmissiveRadiance += vec3(1.0, 0.74, 0.42) * vLit * uNight * 1.1;`);
  };
  mat.customProgramCacheKey = () => 'facade';
  return mat;
}

interface TileEntry {
  group: THREE.Group;
  count: number;
}

export class RealisticLayer implements CustomLayerInterface {
  readonly id = 'vlc-realistic';
  readonly type = 'custom' as const;
  readonly renderingMode = '3d' as const;

  private map?: MlMap;
  private renderer?: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera();
  private origin: LngLat = VALENCIA_CENTER;
  private sun = new THREE.DirectionalLight(0xffffff, 3);
  private hemi = new THREE.HemisphereLight(0xcfe3ff, 0x6b6250, 0.9);
  private night = { value: 0 };
  private mosaics: OrthoMosaic[] = [];
  private tiles = new Map<string, TileEntry | 'loading'>();
  private trees = new THREE.Group();
  private treesCenter: LngLat | null = null;
  private treeCount = 0;
  private roofMat = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0 });
  private groundMat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
  private wallMat: THREE.MeshStandardMaterial;
  private tilesTemplate?: string;
  private abort = new AbortController();
  private sunTimer?: ReturnType<typeof setInterval>;

  constructor(private options: RealisticOptions, private onStatus: (s: RealisticStatus) => void) {
    this.wallMat = facadeMaterial(this.night);
  }

  setOptions(o: RealisticOptions) {
    this.options = o;
    if (this.renderer) {
      this.renderer.shadowMap.enabled = o.shadows;
      this.sun.castShadow = o.shadows;
      this.renderer.shadowMap.needsUpdate = true;
      this.scene.traverse((obj) => { if ((obj as THREE.Mesh).material) ((obj as THREE.Mesh).material as THREE.Material).needsUpdate = true; });
    }
    this.updateSun();
    this.map?.triggerRepaint();
  }

  onAdd(map: MlMap, gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.map = map;
    const renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl as WebGL2RenderingContext, antialias: true });
    renderer.autoClear = false;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = this.options.shadows;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer = renderer;

    const repaint = () => map.triggerRepaint();
    this.mosaics = [new OrthoMosaic(this.origin, 14, 6, repaint), new OrthoMosaic(this.origin, 16, 8, repaint), new OrthoMosaic(this.origin, 18, 8, repaint)];
    orthoProjected(this.groundMat, this.mosaics);
    orthoProjected(this.roofMat, this.mosaics);

    // suelo: un plano grande; la textura sale del mosaico según la posición
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(30_000, 30_000).rotateX(-Math.PI / 2), this.groundMat);
    ground.receiveShadow = true;
    ground.position.y = -0.05;
    this.scene.add(ground);

    this.sun.castShadow = this.options.shadows;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -700; sc.right = 700; sc.top = 700; sc.bottom = -700; sc.near = 10; sc.far = 4000;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.6;
    this.scene.add(this.sun, this.sun.target, this.hemi, this.trees);
    this.scene.fog = new THREE.Fog(0xcfdbe6, 3500, 14_000);

    this.camera.matrixAutoUpdate = false;
    this.camera.matrixWorldAutoUpdate = false;

    const src = map.getSource('openmaptiles') as { tiles?: string[] } | undefined;
    this.tilesTemplate = src?.tiles?.[0];
    if (!this.tilesTemplate) this.onStatus({ buildings: 0, trees: 0, loading: false, error: 'Sin acceso a los edificios de OpenStreetMap: se muestran solo la ortofoto y los árboles.' });

    map.on('moveend', this.onMoveEnd);
    this.updateSun();
    this.sunTimer = setInterval(() => this.updateSun(), 60_000);
    this.onMoveEnd();
  }

  onRemove() {
    this.abort.abort();
    clearInterval(this.sunTimer);
    this.map?.off('moveend', this.onMoveEnd);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
    });
    this.mosaics.forEach((m) => m.texture.dispose());
    this.renderer?.dispose();
  }

  /** Sol, cielo y luces según la hora (real o elegida). */
  private updateSun() {
    const now = new Date();
    const date = this.options.hour === null ? now : madridLocalToDate(now, this.options.hour);
    const { altitude, azimuth } = sunPosition(date, this.origin[1], this.origin[0]);
    const alt = (Math.max(altitude, -6) * Math.PI) / 180, az = (azimuth * Math.PI) / 180;
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(alt), Math.sin(alt), -Math.cos(az) * Math.cos(alt));
    this.sun.userData.dir = dir;
    const day = THREE.MathUtils.clamp(altitude / 12, 0, 1);
    const golden = 1 - THREE.MathUtils.clamp(altitude / 25, 0, 1);
    this.sun.intensity = 2.8 * day;
    this.sun.color.setRGB(1, 0.93 - 0.25 * golden, 0.85 - 0.45 * golden);
    this.hemi.intensity = 0.2 + 1.5 * THREE.MathUtils.clamp((altitude + 6) / 20, 0, 1);
    this.hemi.color.setRGB(0.55 + 0.25 * day, 0.65 + 0.25 * day, 0.85 + 0.1 * day);
    this.night.value = 1 - THREE.MathUtils.clamp((altitude + 2) / 8, 0, 1);
    const fog = new THREE.Color().setRGB(0.80 * day + 0.06, 0.86 * day + 0.08, 0.92 * day + 0.14);
    if (golden > 0.6 && day > 0) fog.lerp(new THREE.Color(0.95, 0.72, 0.52), (golden - 0.6) * 1.5);
    (this.scene.fog as THREE.Fog).color.copy(fog);
    try {
      this.map?.setSky({
        'sky-color': `#${new THREE.Color().setRGB(0.25 * day + 0.02, 0.45 * day + 0.03, 0.85 * day + 0.08).getHexString()}`,
        'horizon-color': `#${fog.getHexString()}`,
        'fog-color': `#${fog.getHexString()}`,
        'sky-horizon-blend': 0.7, 'horizon-fog-blend': 0.8, 'fog-ground-blend': 0.6,
      });
      if (this.map?.getLayer('background')) this.map.setPaintProperty('background', 'background-color', `#${fog.getHexString()}`);
    } catch {
      /* sin cielo en esta versión */
    }
    this.map?.triggerRepaint();
  }

  private centerLocal(): { p: LngLat; xz: [number, number] } {
    const p = this.map!.getCenter().toArray() as LngLat;
    return { p, xz: toLocal(this.origin, p) };
  }

  private onMoveEnd = () => {
    if (!this.map) return;
    const { p } = this.centerLocal();
    const zoom = this.map.getZoom();
    this.mosaics[0].center(p);
    this.mosaics[1].center(p);
    if (zoom >= 14.5) this.mosaics[2].center(p);
    this.loadBuildings(p);
    if (zoom >= 14) this.loadTrees(p);
  };

  private status(loading: boolean, error?: string) {
    let buildings = 0;
    for (const t of this.tiles.values()) if (t !== 'loading') buildings += t.count;
    this.onStatus({ buildings, trees: this.treeCount, loading, error });
  }

  private loadBuildings(center: LngLat) {
    if (!this.tilesTemplate) return;
    const [fx, fy] = lngLatToTile(center, BUILDING_ZOOM);
    const cx = Math.floor(fx), cy = Math.floor(fy);
    const wanted = new Set<string>();
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) wanted.add(`${cx + dx}/${cy + dy}`);
    // descargar teselas lejanas
    for (const [key, entry] of this.tiles) {
      const [x, y] = key.split('/').map(Number);
      if (Math.abs(x - cx) > 2 || Math.abs(y - cy) > 2) {
        if (entry !== 'loading') {
          this.scene.remove(entry.group);
          entry.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
        }
        this.tiles.delete(key);
      }
    }
    const todo = [...wanted].filter((k) => !this.tiles.has(k));
    if (!todo.length) return;
    this.status(true);
    let left = todo.length;
    for (const key of todo) {
      this.tiles.set(key, 'loading');
      const [x, y] = key.split('/').map(Number);
      fetchBuildingTile(this.tilesTemplate, BUILDING_ZOOM, x, y, this.abort.signal)
        .then(({ buildings }) => {
          if (this.tiles.get(key) !== 'loading') return;
          // muros artificiales en el borde de recorte de la tesela: se omiten
          const nw = toLocal(this.origin, tileToLngLat(x, y, BUILDING_ZOOM));
          const se = toLocal(this.origin, tileToLngLat(x + 1, y + 1, BUILDING_ZOOM));
          const [w, e, n, s] = [nw[0], se[0], -nw[1], -se[1]];
          const near = (a: number, b: number) => Math.abs(a - b) < 1.2;
          const clip = (e0: number, n0: number, e1: number, n1: number) =>
            (near(e0, w) && near(e1, w)) || (near(e0, e) && near(e1, e)) || (near(n0, n) && near(n1, n)) || (near(n0, s) && near(n1, s));
          const a = buildBuildingArrays(this.origin, buildings, triangulate, clip);
          const group = new THREE.Group();
          const walls = new THREE.BufferGeometry();
          walls.setAttribute('position', new THREE.BufferAttribute(a.wallPositions, 3));
          walls.setAttribute('normal', new THREE.BufferAttribute(a.wallNormals, 3));
          walls.setAttribute('facade', new THREE.BufferAttribute(a.wallUvs, 2));
          walls.setAttribute('color', new THREE.BufferAttribute(a.wallColors, 3));
          walls.computeBoundingSphere();
          const wallMesh = new THREE.Mesh(walls, this.wallMat);
          wallMesh.castShadow = wallMesh.receiveShadow = true;
          const roofs = new THREE.BufferGeometry();
          roofs.setAttribute('position', new THREE.BufferAttribute(a.roofPositions, 3));
          roofs.setIndex(new THREE.BufferAttribute(a.roofIndices, 1));
          roofs.computeVertexNormals();
          roofs.computeBoundingSphere();
          const roofMesh = new THREE.Mesh(roofs, this.roofMat);
          roofMesh.castShadow = roofMesh.receiveShadow = true;
          group.add(wallMesh, roofMesh);
          this.scene.add(group);
          this.tiles.set(key, { group, count: buildings.length });
        })
        .catch((err: unknown) => {
          if (this.tiles.get(key) === 'loading') this.tiles.delete(key);
          if ((err as Error)?.name !== 'AbortError') console.warn('Edificios no disponibles para la tesela', key, err);
        })
        .finally(() => {
          left--;
          this.status(left > 0);
          this.map?.triggerRepaint();
        });
    }
  }

  private loadTrees(center: LngLat) {
    if (this.treesCenter && Math.hypot(...toLocal(this.treesCenter, center)) < 500) return;
    this.treesCenter = center;
    const R = 1300;
    const sw = fromLocal(this.origin, toLocal(this.origin, center)[0] - R, toLocal(this.origin, center)[1] + R);
    const ne = fromLocal(this.origin, toLocal(this.origin, center)[0] + R, toLocal(this.origin, center)[1] - R);
    fetchTrees(sw[0], sw[1], ne[0], ne[1], 40_000, this.abort.signal)
      .then((trees) => {
        this.buildTrees(trees);
        this.status(false);
        this.map?.triggerRepaint();
      })
      .catch((err: unknown) => {
        if ((err as Error)?.name !== 'AbortError') console.warn('Arbolado no disponible', err);
      });
  }

  private buildTrees(trees: TreeSpec[]) {
    this.trees.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.trees.clear();
    this.treeCount = trees.length;
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5b4636, roughness: 0.95 });
    const crownMat = new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true });
    const kinds = {
      broadleaf: { crown: new THREE.IcosahedronGeometry(0.5, 1), trunkH: 0.38 },
      conifer: { crown: new THREE.ConeGeometry(0.5, 1, 7).translate(0, 0, 0), trunkH: 0.18 },
      palm: { crown: new THREE.IcosahedronGeometry(0.5, 0).scale(1, 0.35, 1), trunkH: 0.86 },
    } as const;
    const trunkGeo = new THREE.CylinderGeometry(0.5, 0.65, 1, 6).translate(0, 0.5, 0);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), t = new THREE.Vector3(), c = new THREE.Color();
    for (const kind of ['broadleaf', 'conifer', 'palm'] as const) {
      const list = trees.filter((x) => x.kind === kind);
      if (!list.length) continue;
      const k = kinds[kind];
      const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, list.length);
      const crowns = new THREE.InstancedMesh(k.crown, crownMat, list.length);
      list.forEach((tr, i) => {
        const [x, z] = toLocal(this.origin, tr.lngLat);
        const trunkH = tr.height * k.trunkH;
        const trunkR = kind === 'palm' ? 0.22 : 0.12 + tr.height * 0.012;
        m.compose(t.set(x, 0, z), q.identity(), s.set(trunkR, trunkH, trunkR));
        trunks.setMatrixAt(i, m);
        const crownH = kind === 'palm' ? tr.crown * 0.45 : Math.max(1.5, tr.height - trunkH);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (i * 2.399) % (Math.PI * 2));
        m.compose(t.set(x, trunkH + crownH * (kind === 'palm' ? 0.1 : 0.5), z), q, s.set(tr.crown, crownH, tr.crown));
        crowns.setMatrixAt(i, m);
        const h = kind === 'palm' ? 0.24 : kind === 'conifer' ? 0.30 : 0.27;
        c.setHSL(h + ((i * 0.618) % 1) * 0.04, 0.42, 0.20 + ((i * 0.37) % 1) * 0.08);
        crowns.setColorAt(i, c);
      });
      trunks.castShadow = crowns.castShadow = true;
      crowns.receiveShadow = true;
      this.trees.add(trunks, crowns);
    }
  }

  render(gl: WebGLRenderingContext | WebGL2RenderingContext, args: CustomRenderMethodInput) {
    const map = this.map, renderer = this.renderer;
    if (!map || !renderer) return;

    // Cámara real en metros locales (para luces, reflejos y niebla correctos)
    const tr = map.transform as unknown as { cameraToCenterDistance: number; worldSize: number };
    const center = map.getCenter();
    const [cx, cz] = toLocal(this.origin, [center.lng, center.lat]);
    const mpp = (EARTH * Math.cos((center.lat * Math.PI) / 180)) / tr.worldSize;
    const dist = tr.cameraToCenterDistance * mpp;
    const pitch = (map.getPitch() * Math.PI) / 180, bearing = (map.getBearing() * Math.PI) / 180;
    const fwd = new THREE.Vector3(Math.sin(bearing), 0, -Math.cos(bearing));
    const target = new THREE.Vector3(cx, 0, cz);
    const pos = target.clone().addScaledVector(fwd, -dist * Math.sin(pitch)).setY(dist * Math.cos(pitch));
    const up = new THREE.Vector3(0, 1, 0);
    if (pitch < 0.01) up.copy(fwd);
    const world = new THREE.Matrix4().lookAt(pos, target, up).setPosition(pos);
    this.camera.matrixWorld.copy(world);
    this.camera.matrixWorldInverse.copy(world).invert();
    const model = new THREE.Matrix4().fromArray(map.transform.getMatrixForModel(this.origin, 0) as unknown as number[]);
    const main = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix as unknown as number[]);
    this.camera.projectionMatrix.copy(main).multiply(model).multiply(world);
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();

    // el sol sigue al centro de la vista (las sombras cubren lo que se ve)
    const dir = (this.sun.userData.dir as THREE.Vector3 | undefined) ?? new THREE.Vector3(0.3, 0.8, 0.4);
    this.sun.target.position.copy(target);
    this.sun.position.copy(target).addScaledVector(dir, 2000);
    this.sun.target.updateMatrixWorld();
    this.sun.updateMatrixWorld();
    const shadowSize = THREE.MathUtils.clamp(dist * 1.6, 300, 1400);
    const sc = this.sun.shadow.camera;
    if (Math.abs(sc.right - shadowSize) > 50) {
      sc.left = -shadowSize; sc.right = shadowSize; sc.top = shadowSize; sc.bottom = -shadowSize;
      sc.updateProjectionMatrix();
    }

    renderer.resetState();
    renderer.setViewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    renderer.render(this.scene, this.camera);
  }
}
