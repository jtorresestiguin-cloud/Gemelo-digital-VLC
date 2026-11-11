/**
 * Extracción de geometría de un IFC con web-ifc (WebAssembly).
 * Independiente de three.js para poder probarla en Node.
 */
import type { IfcAPI } from 'web-ifc';

export interface IfcGeometry {
  /** xyz por vértice, en metros, eje Y hacia arriba (convención de web-ifc) */
  positions: Float32Array;
  normals: Float32Array;
  /** rgba por vértice */
  colors: Float32Array;
  indices: Uint32Array;
  elements: number;
  bbox: { min: [number, number, number]; max: [number, number, number] };
}

const applyMatrix = (m: number[], x: number, y: number, z: number): [number, number, number] => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
];

export function extractIfcGeometry(api: IfcAPI, bytes: Uint8Array): IfcGeometry {
  const modelID = api.OpenModel(bytes, { COORDINATE_TO_ORIGIN: true });
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  let elements = 0;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  try {
    api.StreamAllMeshes(modelID, (mesh) => {
      elements++;
      const n = mesh.geometries.size();
      for (let i = 0; i < n; i++) {
        const pg = mesh.geometries.get(i);
        const geom = api.GetGeometry(modelID, pg.geometryExpressID);
        const verts = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
        const index = api.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());
        const m = pg.flatTransformation;
        const base = pos.length / 3;
        for (let v = 0; v < verts.length; v += 6) {
          const p = applyMatrix(m, verts[v], verts[v + 1], verts[v + 2]);
          // las normales solo se rotan (sin traslación)
          const nx = m[0] * verts[v + 3] + m[4] * verts[v + 4] + m[8] * verts[v + 5];
          const ny = m[1] * verts[v + 3] + m[5] * verts[v + 4] + m[9] * verts[v + 5];
          const nz = m[2] * verts[v + 3] + m[6] * verts[v + 4] + m[10] * verts[v + 5];
          pos.push(...p);
          nor.push(nx, ny, nz);
          col.push(pg.color.x, pg.color.y, pg.color.z, pg.color.w);
          for (let k = 0; k < 3; k++) {
            min[k] = Math.min(min[k], p[k]);
            max[k] = Math.max(max[k], p[k]);
          }
        }
        for (let k = 0; k < index.length; k++) idx.push(base + index[k]);
        geom.delete();
      }
    });
  } finally {
    api.CloseModel(modelID);
  }

  return {
    positions: new Float32Array(pos),
    normals: new Float32Array(nor),
    colors: new Float32Array(col),
    indices: new Uint32Array(idx),
    elements,
    bbox: { min, max },
  };
}
