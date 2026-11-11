/** Perfil automático de rendimiento según la GPU / CPU / memoria del dispositivo. */
export type PerfProfile = 'alto' | 'medio' | 'bajo';

export interface PerfSettings {
  profile: PerfProfile;
  pixelRatio: number;
  antialias: boolean;
  /** zoom mínimo al que se dibujan los edificios 3D (LOD) */
  buildingsMinZoom: number;
  maxPitch: number;
  renderer: string;
}

export function detectPerformance(): PerfSettings {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency || 4;
  const memory = nav.deviceMemory ?? 4;
  const mobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  let renderer = 'desconocida';
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    if (gl && ext) renderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
  } catch {
    /* sin WebGL debug info */
  }
  const weakGpu = /Mali-4|Adreno \(TM\) [1-4]\d\d|PowerVR SGX|SwiftShader|llvmpipe/i.test(renderer);
  let profile: PerfProfile = 'alto';
  if (weakGpu || cores <= 2 || memory <= 2) profile = 'bajo';
  else if (mobile || cores <= 4 || memory <= 4) profile = 'medio';

  const dpr = window.devicePixelRatio || 1;
  return {
    profile,
    renderer,
    pixelRatio: profile === 'alto' ? Math.min(dpr, 2) : profile === 'medio' ? Math.min(dpr, 1.5) : 1,
    antialias: profile === 'alto',
    buildingsMinZoom: profile === 'alto' ? 13 : profile === 'medio' ? 14 : 15,
    maxPitch: profile === 'bajo' ? 60 : 75,
  };
}
