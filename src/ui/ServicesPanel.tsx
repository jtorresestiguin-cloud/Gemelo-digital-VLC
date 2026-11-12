import { useMemo, useState } from 'react';
import { SERVICE_CATEGORIES } from '../adapters/services';
import type { LngLat, PublicService, ServiceCategory, SourceStatus } from '../core/types';
import { ZONE_BY_ID } from '../data/static';

interface Props {
  services: PublicService[];
  status?: SourceStatus;
  enabled: ServiceCategory[];
  onChange: (cats: ServiceCategory[]) => void;
  onFocus: (p: LngLat) => void;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function ServicesPanel({ services, status, enabled, onChange, onFocus }: Props) {
  const [query, setQuery] = useState('');
  const counts = useMemo(() => {
    const m = new Map<ServiceCategory, number>();
    services.forEach((s) => m.set(s.category, (m.get(s.category) ?? 0) + 1));
    return m;
  }, [services]);

  const results = useMemo(() => {
    const q = norm(query.trim());
    if (q.length < 2) return [];
    return services
      .filter((s) => enabled.includes(s.category))
      .filter((s) => norm(`${s.name} ${s.kind} ${s.address ?? ''} ${ZONE_BY_ID[s.zoneId]?.name ?? ''}`).includes(q))
      .slice(0, 40);
  }, [query, services, enabled]);

  const toggle = (c: ServiceCategory) => onChange(enabled.includes(c) ? enabled.filter((x) => x !== c) : [...enabled, c]);
  const color = (c: ServiceCategory) => SERVICE_CATEGORIES.find((x) => x.id === c)!.color;

  return (
    <div className="services">
      <h4>Servicios públicos {services.length > 0 && <span className="muted">({services.length.toLocaleString('es-ES')})</span>}</h4>
      {!services.length && (
        <p className="muted small">{status?.mode === 'error' ? status.detail : 'Descargando equipamientos municipales…'}</p>
      )}
      <div className="cat-list">
        {SERVICE_CATEGORIES.map((c) => (
          <label key={c.id}>
            <input type="checkbox" checked={enabled.includes(c.id)} onChange={() => toggle(c.id)} />
            <i style={{ background: c.color }} />
            <span>{c.label}</span>
            <span className="muted">{counts.get(c.id) ?? 0}</span>
          </label>
        ))}
      </div>
      <div className="row">
        <button className="link" onClick={() => onChange(SERVICE_CATEGORIES.map((c) => c.id))}>Todas</button>
        <button className="link" onClick={() => onChange([])}>Ninguna</button>
      </div>
      <input
        className="search"
        type="search"
        placeholder="Buscar: hospital, biblioteca, Russafa…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {query.trim().length >= 2 && (
        <ul className="results">
          {results.length === 0 && <li className="muted small">Sin resultados en las categorías activas.</li>}
          {results.map((s) => (
            <li key={s.id}>
              <button onClick={() => onFocus(s.lngLat)}>
                <i style={{ background: color(s.category) }} />
                <span>
                  <strong>{s.name}</strong>
                  <span className="muted">{s.kind} · {ZONE_BY_ID[s.zoneId]?.name}{s.address ? ` · ${s.address}` : ''}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
