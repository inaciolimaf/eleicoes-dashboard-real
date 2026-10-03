import { useQuery } from "@tanstack/react-query";
import type { Feature, FeatureCollection, Geometry, Position } from "geojson";

export type BBox = [number, number, number, number]; // minLon, minLat, maxLon, maxLat

export interface PropsGeo {
  uf: string; // maiúscula
  id?: string; // IBGE 7 dígitos (municípios)
  nome?: string;
}

export type FeatureGeo = Feature<Geometry, PropsGeo> & { bbox: BBox; chave: string };

export const BBOX_BRASIL: BBox = [-74.2, -33.9, -34.6, 5.4];

function estenderBBox(b: BBox, coords: unknown) {
  if (!Array.isArray(coords)) return;
  if (typeof coords[0] === "number") {
    const p = coords as Position;
    if (p[0] < b[0]) b[0] = p[0];
    if (p[1] < b[1]) b[1] = p[1];
    if (p[0] > b[2]) b[2] = p[0];
    if (p[1] > b[3]) b[3] = p[1];
    return;
  }
  for (const c of coords) estenderBBox(b, c);
}

function bboxGeometria(g: Geometry): BBox {
  const b: BBox = [Infinity, Infinity, -Infinity, -Infinity];
  if (g.type === "GeometryCollection") for (const gg of g.geometries) estenderBBox(b, (gg as { coordinates?: unknown }).coordinates);
  else estenderBBox(b, (g as { coordinates: unknown }).coordinates);
  return b;
}

export function unirBBox(lista: BBox[]): BBox | null {
  if (!lista.length) return null;
  const b: BBox = [Infinity, Infinity, -Infinity, -Infinity];
  for (const x of lista) {
    b[0] = Math.min(b[0], x[0]);
    b[1] = Math.min(b[1], x[1]);
    b[2] = Math.max(b[2], x[2]);
    b[3] = Math.max(b[3], x[3]);
  }
  return Number.isFinite(b[0]) ? b : null;
}

export function bboxPontos(pts: { lat: number; lon: number }[]): BBox | null {
  const b: BBox = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of pts) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
    b[0] = Math.min(b[0], p.lon);
    b[1] = Math.min(b[1], p.lat);
    b[2] = Math.max(b[2], p.lon);
    b[3] = Math.max(b[3], p.lat);
  }
  if (!Number.isFinite(b[0])) return null;
  if (b[2] - b[0] < 0.01) {
    b[0] -= 0.01;
    b[2] += 0.01;
  }
  if (b[3] - b[1] < 0.01) {
    b[1] -= 0.01;
    b[3] += 0.01;
  }
  return b;
}

export interface MalhaUF {
  features: FeatureGeo[];
  porUf: Map<string, FeatureGeo>;
}

export interface MalhaMun {
  features: FeatureGeo[];
  porId: Map<string, FeatureGeo>;
  porUf: Map<string, FeatureGeo[]>;
}

async function baixar(url: string): Promise<FeatureCollection<Geometry | null, PropsGeo>> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Falha ao carregar a malha ${url}`);
  return r.json();
}

function preparar(fc: FeatureCollection<Geometry | null, PropsGeo>, chave: (p: PropsGeo) => string): FeatureGeo[] {
  const out: FeatureGeo[] = [];
  for (const f of fc.features) {
    if (!f.geometry) continue; // feições sem geometria são ignoradas
    const props = { ...f.properties, uf: String(f.properties?.uf ?? "").toUpperCase() };
    out.push({
      ...(f as Feature<Geometry, PropsGeo>),
      properties: props,
      bbox: bboxGeometria(f.geometry),
      chave: chave(props),
    });
  }
  return out;
}

export function useMalhaUF() {
  return useQuery({
    queryKey: ["geo", "uf"],
    queryFn: async (): Promise<MalhaUF> => {
      const fc = await baixar("/geo/br-uf.json");
      const features = preparar(fc, (p) => p.uf.toLowerCase());
      return { features, porUf: new Map(features.map((f) => [f.chave, f])) };
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

export function useMalhaMun(enabled = true) {
  return useQuery({
    queryKey: ["geo", "mun"],
    queryFn: async (): Promise<MalhaMun> => {
      const fc = await baixar("/geo/br-mun.json");
      const features = preparar(fc, (p) => String(p.id ?? ""));
      const porUf = new Map<string, FeatureGeo[]>();
      for (const f of features) {
        const uf = f.properties.uf.toLowerCase();
        const l = porUf.get(uf);
        if (l) l.push(f);
        else porUf.set(uf, [f]);
      }
      return { features, porId: new Map(features.map((f) => [f.chave, f])), porUf };
    },
    staleTime: Infinity,
    gcTime: Infinity,
    enabled,
  });
}
