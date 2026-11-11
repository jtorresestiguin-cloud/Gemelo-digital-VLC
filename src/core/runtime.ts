/**
 * Orquesta las fuentes: APIs públicas reales con respaldo simulado, más los
 * sistemas cerrados simulados en un Web Worker. Todo desemboca en el bus común.
 */
import { EventBus } from './bus';
import { CityStore } from './store';
import type { SourceId } from './types';
import { decodeRaw } from '../adapters/decoders';
import { fetchAir, fetchBikes, fetchTraffic, fetchWeather } from '../adapters/opendata';
import { approximateDistricts, fetchDistricts } from '../adapters/districts';
import { SERVICES_TTL, fetchServices, readServicesCache } from '../adapters/services';
import type { RawMessage, ScenarioName, SimSource, WorkerCommand } from '../sim/protocols';

const MIN = 60_000;

export class CityRuntime {
  readonly bus = new EventBus();
  readonly store = new CityStore();
  private worker?: Worker;
  private timers: ReturnType<typeof setInterval>[] = [];
  private unsubscribe?: () => void;

  start(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = this.bus.subscribe('*', (m) => this.store.apply(m));

    this.store.setDistricts(approximateDistricts(), false);
    fetchDistricts()
      .then((d) => this.store.setDistricts(d, true))
      .catch(() => { /* se mantienen los límites aproximados */ });

    this.worker = new Worker(new URL('../sim/sim.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<RawMessage>) => {
      for (const m of decodeRaw(e.data, Date.now())) this.bus.publish(m);
    };

    this.poll('traffic', 3 * MIN, async () => this.bus.publish({ source: 'traffic', protocol: 'REST', topic: 'traffic', data: await fetchTraffic(), live: true, ts: Date.now() }));
    this.poll('bikes', 2 * MIN, async () => this.bus.publish({ source: 'bikes', protocol: 'REST', topic: 'bikes', data: await fetchBikes(), live: true, ts: Date.now() }));
    this.poll('air', 10 * MIN, async () => this.bus.publish({ source: 'air', protocol: 'REST', topic: 'air', data: await fetchAir(), live: true, ts: Date.now() }));
    this.startServices();
    this.poll('weather', 10 * MIN, async () => this.bus.publish({ source: 'weather', protocol: 'REST', topic: 'weather', data: await fetchWeather(), live: true, ts: Date.now() }));
  }

  /** Servicios públicos: caché local de 24 h; se refrescan por API al caducar. */
  private startServices(): void {
    const publish = (data: import('./types').PublicService[], t: number) => {
      this.bus.publish({ source: 'services', protocol: 'REST', topic: 'services', data, live: true, ts: Date.now() });
      const h = Math.round((Date.now() - t) / 3600_000);
      this.store.setSourceStatus('services', { detail: `${data.length} equipamientos · actualizado ${h ? `hace ${h} h` : 'ahora'}; se refresca cada 24 h` });
    };
    const refresh = async () => {
      const cached = readServicesCache();
      if (cached && Date.now() - cached.t < SERVICES_TTL) {
        publish(cached.data, cached.t);
        return;
      }
      try {
        publish(await fetchServices(), Date.now());
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        if (cached) {
          publish(cached.data, cached.t);
          this.store.setSourceStatus('services', { detail: `API no disponible (${reason}); mostrando la última copia guardada` });
        } else {
          this.store.setSourceStatus('services', { mode: 'error', detail: `API no disponible (${reason}); se reintentará en 10 min` });
        }
      }
    };
    void refresh();
    // comprueba cada 10 min: reintenta tras un error y refresca cuando caduca la caché
    this.timers.push(setInterval(refresh, 10 * MIN));
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.timers.forEach(clearInterval);
    this.timers = [];
    this.worker?.terminate();
    this.worker = undefined;
  }

  private send(cmd: WorkerCommand) {
    this.worker?.postMessage(cmd);
  }

  /** Consulta periódica de una API real; si falla, activa el simulador equivalente hasta que vuelva. */
  private poll(id: SourceId, every: number, run: () => Promise<void>): void {
    const tick = async () => {
      try {
        await run();
        if (id !== 'weather') this.send({ type: 'disable', source: id as SimSource });
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        if (id === 'weather') {
          this.bus.publish({
            source: 'weather', protocol: 'REST', topic: 'weather', live: false, ts: Date.now(),
            data: { temperature: 19 + Math.random() * 4, precipitation: 0, windSpeed: 10, weatherCode: 1 },
          });
        } else {
          this.send({ type: 'enable', source: id as SimSource });
        }
        this.store.setSourceStatus(id, { detail: `API no disponible (${reason}); usando respaldo simulado` });
      }
    };
    void tick();
    this.timers.push(setInterval(tick, every));
  }

  triggerScenario(name: ScenarioName): void {
    const until = Date.now() + 5 * MIN;
    this.send({ type: 'scenario', name });
    switch (name) {
      case 'accidente-lluvia':
        this.store.setOverrides((o) => ({ ...o, rain: { mm: 22, until }, congest: [...o.congest, { zoneId: 'camins', until }] }));
        break;
      case 'episodio-no2':
        this.store.setOverrides((o) => ({ ...o, no2: { add: 140, until }, congest: [...o.congest, { zoneId: 'eixample', until }, { zoneId: 'extramurs', until }] }));
        break;
      case 'colapso-puerto':
        this.store.setOverrides((o) => ({ ...o, congest: [...o.congest, { zoneId: 'poblats-maritims', until }] }));
        break;
      case 'averia-metro':
        this.store.setOverrides((o) => ({
          ...o,
          congest: [...o.congest, ...['ciutat-vella', 'eixample', 'extramurs', 'pla-del-real', 'algiros', 'camins', 'quatre-carreres'].map((zoneId) => ({ zoneId, until }))],
        }));
        break;
      case 'reset':
        this.store.setOverrides(() => ({ congest: [] }));
        break;
    }
  }
}
