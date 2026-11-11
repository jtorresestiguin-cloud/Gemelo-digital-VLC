/// <reference lib="webworker" />
/** Ejecuta la simulación fuera del hilo principal para no penalizar el render en móviles. */
import { CitySimulator } from './simulator';
import type { WorkerCommand } from './protocols';

const sim = new CitySimulator();
const ctx = self as unknown as DedicatedWorkerGlobalScope;

const flush = (msgs: ReturnType<CitySimulator['tick']>) => {
  for (const m of msgs) ctx.postMessage(m);
};

ctx.onmessage = (e: MessageEvent<WorkerCommand>) => flush(sim.command(e.data, Date.now()));
setInterval(() => flush(sim.tick(Date.now())), 1000);
flush(sim.tick(Date.now()));
