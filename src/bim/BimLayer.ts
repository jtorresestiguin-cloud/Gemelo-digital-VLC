/**
 * Capa personalizada de MapLibre que dibuja un modelo IFC con three.js
 * compartiendo el contexto WebGL del mapa (se integra con edificios y cámara).
 */
import * as THREE from 'three';
import type { CustomLayerInterface, CustomRenderMethodInput, Map as MlMap } from 'maplibre-gl';
import type { IfcGeometry } from './ifc';
import type { LngLat } from '../core/types';

export interface BimPlacement {
  anchor: LngLat;
  /** rotación respecto al norte, en grados (sentido horario) */
  rotationDeg: number;
  /** elevación de la base en metros */
  altitude?: number;
}

export function buildBimMesh(geom: IfcGeometry): THREE.Mesh {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(geom.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(geom.normals, 3));
  g.setAttribute('color', new THREE.BufferAttribute(geom.colors, 4));
  g.setIndex(new THREE.BufferAttribute(geom.indices, 1));
  // Centrar en planta y apoyar la base en el suelo (web-ifc devuelve Y arriba)
  const { min, max } = geom.bbox;
  g.translate(-(min[0] + max[0]) / 2, -min[1], -(min[2] + max[2]) / 2);
  const hasAlpha = geom.colors.some((v, i) => i % 4 === 3 && v < 0.999);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: hasAlpha, side: THREE.DoubleSide });
  return new THREE.Mesh(g, mat);
}

export class BimLayer implements CustomLayerInterface {
  readonly type = 'custom' as const;
  readonly renderingMode = '3d' as const;
  private map?: MlMap;
  private renderer?: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.Camera();
  private root = new THREE.Group();

  constructor(readonly id: string, mesh: THREE.Mesh, private placement: BimPlacement) {
    // web-ifc entrega X = este, Y = arriba, Z = sur: el mismo convenio que el espacio
    // de modelo de MapLibre (getMatrixForModel), así que no hace falta reorientar.
    this.root.add(mesh);
    this.applyRotation();
    this.scene.add(this.root);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(-60, -90, 120);
    this.scene.add(sun);
  }

  private applyRotation() {
    // giro horario visto desde arriba = ángulo negativo alrededor de Y
    this.root.rotation.y = (-this.placement.rotationDeg * Math.PI) / 180;
  }

  setPlacement(p: BimPlacement) {
    this.placement = p;
    this.applyRotation();
    this.map?.triggerRepaint();
  }

  onAdd(map: MlMap, gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl as WebGL2RenderingContext, antialias: true });
    this.renderer.autoClear = false;
  }

  onRemove() {
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    this.renderer?.dispose();
  }

  render(_gl: WebGLRenderingContext | WebGL2RenderingContext, args: CustomRenderMethodInput) {
    if (!this.map || !this.renderer) return;
    const model = this.map.transform.getMatrixForModel(this.placement.anchor, this.placement.altitude ?? 0);
    const m = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix as unknown as number[]);
    const l = new THREE.Matrix4().fromArray(model as unknown as number[]);
    this.camera.projectionMatrix = m.multiply(l);
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
  }
}

/** Carga perezosa de web-ifc (≈1 MB de WebAssembly) solo cuando el usuario abre un modelo. */
export async function loadIfc(bytes: Uint8Array): Promise<IfcGeometry> {
  const [{ IfcAPI }, { extractIfcGeometry }, wasm] = await Promise.all([
    import('web-ifc'),
    import('./ifc'),
    import('web-ifc/web-ifc.wasm?url'),
  ]);
  const api = new IfcAPI();
  await api.Init(() => wasm.default, true);
  try {
    return extractIfcGeometry(api, bytes);
  } finally {
    api.Dispose();
  }
}
