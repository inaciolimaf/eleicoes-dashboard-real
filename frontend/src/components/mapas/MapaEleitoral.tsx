import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MapGL, { useControl, type MapRef, NavigationControl } from "react-map-gl/maplibre";
import { MapboxOverlay, type MapboxOverlayProps } from "@deck.gl/mapbox";
import { GeoJsonLayer, ScatterplotLayer } from "@deck.gl/layers";
import { HexagonLayer } from "@deck.gl/aggregation-layers";
import { FillStyleExtension } from "@deck.gl/extensions";
import type { Layer, PickingInfo } from "@deck.gl/core";
import type { IControl } from "maplibre-gl";
import { Badge, Box, Group, Loader, Paper, Select, Stack, Text, useComputedColorScheme } from "@mantine/core";
import { useElementSize } from "@mantine/hooks";
import type { ChildrenDto, ChildItemDto, MapPollingPlaceDto, Level } from "../../api/models";
import { useFilhos, useLocaisMapa } from "../../api/hooks";
import { useFiltroEfetivo } from "../../lib/filtro-efetivo";
import { useLive } from "../../realtime/useLive";
import { topic } from "../../realtime/topics";
import {
  BBOX_BRASIL,
  bboxPontos,
  unirBBox,
  useMalhaMun,
  useMalhaUF,
  type BBox,
  type FeatureGeo,
} from "../../lib/geo";
import { municipioDoId, ufDoId, zonaDoId, UF_POR_SIGLA } from "../../lib/recortes";
import {
  COR_STATUS,
  ROTULO_STATUS,
  alphaMargem,
  corDivergente,
  corSequencial,
  hexToRgb,
} from "../../lib/cores";
import { fmtInt, fmtPP, fmtPct } from "../../lib/format";
import { useCorCandidato } from "../../lib/useCor";
import { usePrefs } from "../../store/prefs";
import { ErroView } from "../common/Estados";
import { Legenda, type ItemLegenda } from "./Legenda";
import type { TipoMapa } from "./tipos";
import { asLevel } from "../../lib/recortes";

const ESTILO_CLARO = "https://tiles.openfreemap.org/styles/positron";
const ESTILO_ESCURO = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

type RGBA = [number, number, number, number];

function estiloFundo(escuro: boolean) {
  return {
    version: 8 as const,
    sources: {},
    layers: [
      {
        id: "fundo",
        type: "background" as const,
        paint: { "background-color": escuro ? "#0B1220" : "#EEF1F6" },
      },
    ],
  };
}

function DeckOverlay(props: MapboxOverlayProps) {
  const overlay = useControl(
    () => new MapboxOverlay(props) as unknown as IControl,
  ) as unknown as MapboxOverlay;
  overlay.setProps(props);
  return null;
}

export interface MapaEleitoralProps {
  tipo: TipoMapa;
  nivel: Level;
  id: string;
  /** com nivel=br: desenha todos os municípios do Brasil em vez das UFs */
  todosMunicipios?: boolean;
  candidatoA?: string | null;
  candidatoB?: string | null;
  onCandidatos?: (a: string | null, b: string | null) => void;
  onSelecionar?: (nivel: Level, id: string, nome: string) => void;
  legenda?: boolean;
  seletorCandidatos?: boolean;
  basemap?: boolean;
  altura?: number | string;
  /** sobrescreve turno/cargo/t do filtro efetivo */
  cargo?: number;
}

type Hover =
  | { x: number; y: number; tipo: "regiao"; nome: string; item: ChildItemDto | null }
  | { x: number; y: number; tipo: "local"; local: MapPollingPlaceDto }
  | { x: number; y: number; tipo: "hex"; pct: number; n: number };

function semDados(it: ChildItemDto | undefined | null): boolean {
  return !it || (it.status === "not_received" && !it.valid_votes) || (!it.pct_sections && !it.valid_votes);
}

export default function MapaEleitoral(props: MapaEleitoralProps) {
  const {
    tipo,
    nivel,
    id,
    todosMunicipios,
    onSelecionar,
    legenda = true,
    seletorCandidatos = true,
    altura = "100%",
  } = props;
  const f = useFiltroEfetivo();
  const cargo = props.cargo ?? f.cargo;
  const { turno, t } = f;
  const corCand = useCorCandidato();
  const escuro = useComputedColorScheme("dark") === "dark";
  const basemapPref = usePrefs((s) => s.basemap);
  const usarBasemap = props.basemap ?? basemapPref;

  const modo: "uf" | "mun" | "pontos" =
    nivel === "country" ? (todosMunicipios ? "mun" : "uf") : nivel === "state" ? "mun" : "pontos";
  const uf = ufDoId(nivel, id);
  const munId = municipioDoId(nivel, id);
  const filhosNivel: Level | null = nivel === "country" && modo === "mun" ? "municipality" : null;

  // ---------------------------------------------------------------- dados
  const malhaUF = useMalhaUF();
  const malhaMun = useMalhaMun(modo !== "uf");
  const base = useFilhos({ turno, cargo, nivel, id, t, filhos: filhosNivel }, modo !== "pontos");

  const [candA, setCandA] = useState<string | null>(props.candidatoA ?? null);
  const [candB, setCandB] = useState<string | null>(props.candidatoB ?? null);
  useEffect(() => setCandA(props.candidatoA ?? null), [props.candidatoA]);
  useEffect(() => setCandB(props.candidatoB ?? null), [props.candidatoB]);
  const candsBase = base.data?.candidates;
  const precisaValores = tipo === "desempenho" || tipo === "comparativo";
  const efA = candA ?? candsBase?.[0]?.tse_candidate_id ?? null;
  const efB = candB ?? candsBase?.find((c) => c.tse_candidate_id !== efA)?.tse_candidate_id ?? null;
  const pedidos = tipo === "desempenho" ? [efA] : tipo === "comparativo" ? [efA, efB] : [];
  const comValores = useFilhos(
    { turno, cargo, nivel, id, t, filhos: filhosNivel, candidatos: pedidos.filter((x): x is string => !!x) },
    modo !== "pontos" && precisaValores && !!efA,
  );

  const precisaLocais = modo === "pontos" || tipo === "locais";
  const locais = useLocaisMapa(
    { turno, cargo, uf: modo === "pontos" ? null : uf, municipio: modo === "pontos" ? munId : null, t },
    precisaLocais,
  );
  // contorno do município (para o modo de pontos): pega o cd_ibge na lista de municípios da UF
  const munsDaUf = useFilhos(
    { turno, cargo, nivel: "state", id: uf ?? "", t: null },
    modo === "pontos" && !!uf,
  );

  useLive([
    modo !== "pontos" && topic.children(turno, cargo, nivel, id, filhosNivel),
    modo === "pontos" && munId && topic.pollingPlaces(turno, cargo, munId),
  ]);

  const dados: ChildrenDto | undefined = (precisaValores ? comValores.data : undefined) ?? base.data;

  // destaque da legenda
  const [destaque, setDestaque] = useState<string | null>(null);
  useEffect(() => setDestaque(null), [nivel, id, cargo, tipo]);
  // contagem de municípios vencidos (só quando um candidato é destacado no mapa de UFs)
  const munBr = useFilhos(
    { turno, cargo, nivel: "country", id: "br", t, filhos: "municipality" },
    modo === "uf" && !!destaque && tipo === "vencedores",
  );

  // ---------------------------------------------------------------- junção
  const chaveItem = useCallback(
    (it: ChildItemDto) =>
      modo === "uf" ? (it.state_code || it.id).toLowerCase() : String(it.ibge_code ?? ""),
    [modo],
  );
  const itensPorChave = useMemo(() => {
    const m = new Map<string, ChildItemDto>();
    for (const it of dados?.items ?? []) m.set(chaveItem(it), it);
    return m;
  }, [dados, chaveItem]);

  const features: FeatureGeo[] = useMemo(() => {
    if (modo === "uf") return malhaUF.data?.features ?? [];
    if (modo === "mun") {
      if (!malhaMun.data) return [];
      return nivel === "country" ? malhaMun.data.features : (malhaMun.data.porUf.get(uf ?? "") ?? []);
    }
    // pontos: só o contorno do município
    const item = munsDaUf.data?.items.find((i) => i.id === munId);
    const feat = item?.ibge_code ? malhaMun.data?.porId.get(String(item.ibge_code)) : undefined;
    return feat ? [feat] : [];
  }, [modo, nivel, uf, malhaUF.data, malhaMun.data, munsDaUf.data, munId]);

  // ---------------------------------------------------------------- escalas
  const escala = useMemo(() => {
    const itens = dados?.items ?? [];
    if (tipo === "desempenho" && efA) {
      const max = Math.max(1, ...itens.map((i) => i.values?.[efA] ?? 0));
      return { min: 0, max: Math.ceil(max / 5) * 5, sufixo: "%" };
    }
    if (tipo === "comparativo" && efA && efB) {
      const max = Math.max(1, ...itens.map((i) => Math.abs((i.values?.[efA] ?? 0) - (i.values?.[efB] ?? 0))));
      return { min: -Math.ceil(max), max: Math.ceil(max), sufixo: " p.p." };
    }
    if (tipo === "comparecimento") {
      const v = itens
        .filter((i) => i.electorate > 0 && i.turnout > 0)
        .map((i) => (i.turnout / i.electorate) * 100);
      if (!v.length) return { min: 0, max: 100, sufixo: "%" };
      return { min: Math.floor(Math.min(...v)), max: Math.ceil(Math.max(...v)), sufixo: "%" };
    }
    return { min: 0, max: 100, sufixo: "%" };
  }, [dados, tipo, efA, efB]);

  const corA = efA ? corCand(efA, candsBase?.find((c) => c.tse_candidate_id === efA)?.color) : undefined;
  const corB = efB ? corCand(efB, candsBase?.find((c) => c.tse_candidate_id === efB)?.color) : undefined;

  const corRegiao = useCallback(
    (it: ChildItemDto | undefined): RGBA => {
      if (tipo === "locais") return [0, 0, 0, 0];
      if (semDados(it) || !it) return escuro ? [70, 80, 100, 70] : [170, 175, 185, 90];
      switch (tipo) {
        case "vencedores": {
          if (!it.leader) return [128, 128, 128, 60];
          if (destaque && it.leader.tse_candidate_id !== destaque)
            return escuro ? [60, 68, 88, 90] : [200, 204, 212, 140];
          const [r, g, b] = hexToRgb(corCand(it.leader.tse_candidate_id, it.leader.color));
          return [r, g, b, Math.round(alphaMargem(it.margin_pp) * 255)];
        }
        case "desempenho": {
          const v = efA ? it.values?.[efA] : undefined;
          if (v === undefined) return [128, 128, 128, 60];
          const [r, g, b] = corSequencial(v / (escala.max || 100));
          return [r, g, b, 225];
        }
        case "comparativo": {
          const a = efA ? it.values?.[efA] : undefined;
          const b2 = efB ? it.values?.[efB] : undefined;
          if (a === undefined || b2 === undefined) return [128, 128, 128, 60];
          const [r, g, b] = corDivergente((a - b2) / (escala.max || 1), corA, corB);
          return [r, g, b, 230];
        }
        case "progresso": {
          const [r, g, b] = corSequencial(it.pct_sections / 100);
          return [r, g, b, 225];
        }
        case "comparecimento": {
          if (!it.electorate) return [128, 128, 128, 60];
          const p = (it.turnout / it.electorate) * 100;
          const [r, g, b] = corSequencial((p - escala.min) / Math.max(1, escala.max - escala.min));
          return [r, g, b, 225];
        }
        case "partido": {
          if (!it.leader_party) return [128, 128, 128, 60];
          const [r, g, b] = hexToRgb(it.leader_party.color);
          return [r, g, b, 215];
        }
      }
      return [128, 128, 128, 60];
    },
    [tipo, escuro, destaque, corCand, efA, efB, escala, corA, corB],
  );

  const corLocal = useCallback(
    (l: MapPollingPlaceDto): RGBA => {
      if (tipo === "vencedores" || tipo === "partido" || tipo === "desempenho" || tipo === "comparativo") {
        if (!l.leader) {
          const [r, g, b] = hexToRgb(COR_STATUS[l.status]);
          return [r, g, b, 200];
        }
        if (destaque && l.leader.tse_candidate_id !== destaque) return [120, 128, 145, 110];
        const [r, g, b] = hexToRgb(corCand(l.leader.tse_candidate_id, l.leader.color));
        return [r, g, b, Math.round(Math.max(0.55, alphaMargem(l.margin_pp)) * 255)];
      }
      const [r, g, b] = hexToRgb(COR_STATUS[l.status]);
      return [r, g, b, 230];
    },
    [tipo, destaque, corCand],
  );

  // ---------------------------------------------------------------- mapa base
  const urlBase = escuro ? ESTILO_ESCURO : ESTILO_CLARO;
  const [falhas, setFalhas] = useState<Record<string, boolean>>({});
  const usarUrl = usarBasemap && !falhas[urlBase];
  const estilo = useMemo(() => (usarUrl ? urlBase : estiloFundo(escuro)), [usarUrl, urlBase, escuro]);
  const carregouRef = useRef(false);
  useEffect(() => {
    carregouRef.current = false;
    if (!usarUrl) return;
    const id = setTimeout(() => {
      if (!carregouRef.current) setFalhas((f) => ({ ...f, [urlBase]: true }));
    }, 9000);
    return () => clearTimeout(id);
  }, [usarUrl, urlBase]);

  const mapRef = useRef<MapRef | null>(null);
  const { ref: caixaRef, width: larguraCaixa, height: alturaCaixa } = useElementSize();
  const [zoom, setZoom] = useState(3.4);

  // ---------------------------------------------------------------- enquadramento
  const alvo: BBox | null = useMemo(() => {
    if (modo === "uf" || (modo === "mun" && nivel === "country")) return BBOX_BRASIL;
    if (modo === "mun") return unirBBox(features.map((f) => f.bbox));
    const pts = (locais.data?.items ?? []).filter((l) => {
      if (nivel === "zone") return l.id.startsWith(id);
      if (nivel === "polling_place") return l.id === id;
      return true;
    });
    const coords = (l: MapPollingPlaceDto) => ({ lat: l.lat ?? NaN, lon: l.lon ?? NaN });
    if ((nivel === "polling_place" || nivel === "zone") && pts.length) return bboxPontos(pts.map(coords));
    return features[0]?.bbox ?? bboxPontos((pts.length ? pts : (locais.data?.items ?? [])).map(coords));
  }, [modo, nivel, id, features, locais.data]);
  const alvoKey = alvo ? alvo.map((n) => n.toFixed(3)).join(",") : "";
  const [mapaPronto, setMapaPronto] = useState(false);
  useEffect(() => {
    if (!alvo || !mapRef.current || !mapaPronto) return;
    try {
      mapRef.current.fitBounds(
        [
          [alvo[0], alvo[1]],
          [alvo[2], alvo[3]],
        ],
        { padding: 24, duration: 700, maxZoom: 15 },
      );
    } catch {
      /* mapa ainda sem tamanho */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alvoKey, mapaPronto]);

  // ---------------------------------------------------------------- camadas
  const [hover, setHover] = useState<Hover | null>(null);
  const versao = dados ? dados.items.length + ":" + (base.dataUpdatedAt + comValores.dataUpdatedAt) : "0";

  const linha = useMemo<RGBA>(() => (escuro ? [11, 18, 32, 220] : [255, 255, 255, 230]), [escuro]);
  const layers = useMemo(() => {
    const ls: Layer[] = [];
    const semDadosFeats =
      tipo === "locais" ? [] : features.filter((f) => semDados(itensPorChave.get(f.chave)));
    ls.push(
      new GeoJsonLayer<FeatureGeo["properties"]>({
        id: "regioes",
        data: features as never,
        filled: true,
        stroked: true,
        pickable: tipo !== "locais" || modo === "pontos" ? modo !== "pontos" : true,
        autoHighlight: modo !== "pontos",
        highlightColor: [255, 255, 255, 50],
        getFillColor: (ft) => corRegiao(itensPorChave.get((ft as unknown as FeatureGeo).chave)),
        getLineColor:
          modo === "pontos"
            ? escuro
              ? [140, 160, 200, 220]
              : [60, 70, 90, 220]
            : tipo === "locais"
              ? escuro
                ? [90, 110, 150, 160]
                : [120, 130, 150, 160]
              : linha,
        getLineWidth: modo === "pontos" ? 2 : 1,
        lineWidthUnits: "pixels",
        lineWidthMinPixels: modo === "mun" && nivel === "country" ? 0.2 : 0.6,
        updateTriggers: { getFillColor: [versao, corRegiao], getLineColor: [escuro, tipo] },
        transitions: { getFillColor: 500 },
      }),
    );
    if (semDadosFeats.length) {
      ls.push(
        new GeoJsonLayer({
          id: "hachura",
          data: semDadosFeats as never,
          filled: true,
          stroked: false,
          pickable: false,
          getFillColor: escuro ? [150, 160, 180, 120] : [110, 115, 125, 120],
          extensions: [new FillStyleExtension({ pattern: true })],
          fillPatternMapping: { hachura: { type: "hatch", angle: 45, strokeWidth: 1.5, gap: 4 } },
          fillPatternSizeUnits: "pixels",
          getFillPattern: () => "hachura",
          getFillPatternScale: 1,
          updateTriggers: { getFillColor: [escuro] },
        } as never),
      );
    }
    const pontos = locais.data?.items ?? [];
    if (precisaLocais && pontos.length) {
      const usarHex = tipo === "locais" && modo !== "pontos" && zoom < 8.5;
      if (usarHex) {
        ls.push(
          new HexagonLayer<MapPollingPlaceDto>({
            id: "hex",
            data: pontos,
            getPosition: (d) => [d.lon ?? 0, d.lat ?? 0],
            radius: modo === "uf" || nivel === "country" ? 22000 : 6000,
            coverage: 0.9,
            extruded: false,
            pickable: true,
            opacity: 0.85,
            colorAggregation: "MEAN",
            getColorWeight: (d) => (d.status === "tallied" ? 1 : 0),
            colorDomain: [0, 1],
            colorRange: [
              [100, 116, 139],
              [150, 140, 100],
              [245, 165, 36],
              [190, 190, 60],
              [110, 200, 90],
              [34, 197, 94],
            ],
            updateTriggers: { getColorWeight: [versao, locais.dataUpdatedAt] },
          }),
        );
      } else {
        const zonaSel = zonaDoId(nivel, id);
        ls.push(
          new ScatterplotLayer<MapPollingPlaceDto>({
            id: "locais",
            data: pontos,
            getPosition: (d) => [d.lon ?? 0, d.lat ?? 0],
            getRadius: (d) => {
              const base = Math.min(11, 3 + Math.sqrt(Math.max(1, d.sections_total)) * 1.3);
              if (nivel === "polling_place") return d.id === id ? base + 5 : base * 0.7;
              if (nivel === "zone" && zonaSel) return d.id.startsWith(zonaSel) ? base : base * 0.6;
              return base;
            },
            radiusUnits: "pixels",
            getFillColor: (d) => {
              const c = corLocal(d);
              if (
                (nivel === "zone" && zonaSel && !d.id.startsWith(zonaSel)) ||
                (nivel === "polling_place" && d.id !== id)
              )
                return [c[0], c[1], c[2], 70];
              return c;
            },
            stroked: true,
            getLineColor: escuro ? [11, 18, 32, 230] : [255, 255, 255, 230],
            lineWidthMinPixels: 1,
            pickable: true,
            autoHighlight: true,
            highlightColor: [255, 255, 255, 90],
            updateTriggers: {
              getFillColor: [locais.dataUpdatedAt, corLocal, nivel, id],
              getRadius: [nivel, id],
            },
            transitions: { getFillColor: 400 },
          }),
        );
      }
    }
    return ls;
  }, [
    features,
    itensPorChave,
    corRegiao,
    corLocal,
    locais.data,
    locais.dataUpdatedAt,
    precisaLocais,
    tipo,
    modo,
    zoom,
    nivel,
    id,
    escuro,
    versao,
    linha,
  ]);

  const onHover = useCallback(
    (info: PickingInfo) => {
      if (!info.object || info.x < 0) {
        setHover(null);
        return;
      }
      const layerId = info.layer?.id;
      if (layerId === "locais")
        setHover({ x: info.x, y: info.y, tipo: "local", local: info.object as MapPollingPlaceDto });
      else if (layerId === "hex") {
        const o = info.object as { colorValue?: number; count?: number };
        setHover({ x: info.x, y: info.y, tipo: "hex", pct: (o.colorValue ?? 0) * 100, n: o.count ?? 0 });
      } else if (layerId === "regioes") {
        const ft = info.object as FeatureGeo;
        const it = itensPorChave.get(ft.chave) ?? null;
        const nome = it?.name ?? ft.properties.nome ?? UF_POR_SIGLA[ft.chave]?.nome ?? ft.properties.uf;
        setHover({ x: info.x, y: info.y, tipo: "regiao", nome, item: it });
      }
    },
    [itensPorChave],
  );

  const onClick = useCallback(
    (info: PickingInfo) => {
      if (!info.object || !onSelecionar) return;
      const layerId = info.layer?.id;
      if (layerId === "locais") {
        const l = info.object as MapPollingPlaceDto;
        onSelecionar("polling_place", l.id, l.name);
      } else if (layerId === "hex") {
        const o = info.object as { position?: [number, number] };
        if (o.position && mapRef.current)
          mapRef.current.flyTo({ center: o.position, zoom: 10, duration: 800 });
      } else if (layerId === "regioes") {
        const ft = info.object as FeatureGeo;
        const it = itensPorChave.get(ft.chave);
        if (it) onSelecionar(asLevel(it.level), it.id, it.name);
        else if (modo === "uf")
          onSelecionar("state", ft.chave, UF_POR_SIGLA[ft.chave]?.nome ?? ft.chave.toUpperCase());
      }
    },
    [onSelecionar, itensPorChave, modo],
  );

  // ---------------------------------------------------------------- legenda
  const itensLegenda: ItemLegenda[] = useMemo(() => {
    if (modo === "pontos") {
      const m = new Map<string, ItemLegenda>();
      for (const l of locais.data?.items ?? []) {
        if (!l.leader) continue;
        const x = m.get(l.leader.tse_candidate_id);
        if (x) x.vitorias++;
        else
          m.set(l.leader.tse_candidate_id, {
            sqcand: l.leader.tse_candidate_id,
            rotulo: l.leader.ballot_name,
            cor: corCand(l.leader.tse_candidate_id, l.leader.color),
            vitorias: 1,
          });
      }
      return [...m.values()].sort((a, b) => b.vitorias - a.vitorias);
    }
    return (dados?.candidates ?? [])
      .map((c) => ({
        sqcand: c.tse_candidate_id,
        rotulo: `${c.ballot_name} (${c.ballot_number})`,
        cor: corCand(c.tse_candidate_id, c.color, c.ballot_number),
        vitorias: c.wins,
      }))
      .sort((a, b) => b.vitorias - a.vitorias);
  }, [modo, locais.data, dados, corCand]);

  const vitoriasMun = useMemo(() => {
    if (!munBr.data) return null;
    return new Map(munBr.data.candidates.map((c) => [c.tse_candidate_id, c.wins]));
  }, [munBr.data]);

  const contagemStatus = useMemo(() => {
    const c: Record<string, number> = {};
    for (const l of locais.data?.items ?? []) c[l.status] = (c[l.status] ?? 0) + 1;
    return c;
  }, [locais.data]);

  const partidos = useMemo(() => {
    const m = new Map<string, { sigla: string; cor: string; n: number }>();
    for (const it of dados?.items ?? []) {
      if (!it.leader_party) continue;
      const x = m.get(it.leader_party.abbreviation);
      if (x) x.n++;
      else
        m.set(it.leader_party.abbreviation, {
          sigla: it.leader_party.abbreviation,
          cor: it.leader_party.color,
          n: 1,
        });
    }
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [dados]);

  const unidade = modo === "uf" ? "UFs" : modo === "mun" ? "municípios" : "locais";
  const carregando =
    (modo === "uf" && malhaUF.isLoading) ||
    (modo !== "uf" && malhaMun.isLoading) ||
    (modo !== "pontos" && base.isLoading) ||
    (precisaLocais && locais.isLoading);
  const erro =
    (modo !== "pontos" ? base.error : null) ??
    (precisaLocais ? locais.error : null) ??
    malhaUF.error ??
    malhaMun.error;
  const opcoesCand = (candsBase ?? []).map((c) => ({
    value: c.tse_candidate_id,
    label: `${c.ballot_name} (${c.ballot_number}) · ${c.party_abbreviation}`,
  }));

  return (
    <Box
      ref={caixaRef}
      className="mapa-container"
      style={{ height: altura, minHeight: 180 }}
      onMouseLeave={() => setHover(null)}
    >
      <MapGL
        ref={mapRef}
        initialViewState={{
          bounds: [
            [BBOX_BRASIL[0], BBOX_BRASIL[1]],
            [BBOX_BRASIL[2], BBOX_BRASIL[3]],
          ],
          fitBoundsOptions: { padding: 16 },
        }}
        mapStyle={estilo as never}
        style={{ width: "100%", height: "100%" }}
        attributionControl={false}
        preserveDrawingBuffer
        dragRotate={false}
        pitchWithRotate={false}
        touchZoomRotate
        onLoad={() => {
          carregouRef.current = true;
          setMapaPronto(true);
        }}
        onStyleData={() => {
          carregouRef.current = true;
        }}
        onError={() => {
          if (!carregouRef.current && usarUrl) setFalhas((f) => ({ ...f, [urlBase]: true }));
        }}
        onZoomEnd={(e) => setZoom(e.viewState.zoom)}
        onMove={() => hover && setHover(null)}
        cursor={hover ? "pointer" : "grab"}
        reuseMaps
      >
        <NavigationControl position="top-right" showCompass={false} />
        <DeckOverlay layers={layers} onHover={onHover} onClick={onClick} interleaved={false} />
      </MapGL>
      {!mapaPronto && <MapaProntoFallback onPronto={() => setMapaPronto(true)} />}

      {seletorCandidatos && precisaValores && modo !== "pontos" && opcoesCand.length > 0 && (
        <Paper
          withBorder
          shadow="sm"
          p={6}
          radius="md"
          style={{ position: "absolute", top: 8, left: 8, zIndex: 6, maxWidth: "calc(100% - 70px)" }}
        >
          <Group gap={6} wrap="wrap">
            <Select
              size="xs"
              data={opcoesCand}
              value={efA}
              onChange={(v) => {
                setCandA(v);
                props.onCandidatos?.(v, efB);
              }}
              searchable
              w={200}
              aria-label="Candidato A"
              comboboxProps={{ withinPortal: true }}
            />
            {tipo === "comparativo" && (
              <>
                <Text size="xs" fw={700}>
                  ×
                </Text>
                <Select
                  size="xs"
                  data={opcoesCand}
                  value={efB}
                  onChange={(v) => {
                    setCandB(v);
                    props.onCandidatos?.(efA, v);
                  }}
                  searchable
                  w={200}
                  aria-label="Candidato B"
                  comboboxProps={{ withinPortal: true }}
                />
              </>
            )}
          </Group>
        </Paper>
      )}
      {modo === "pontos" && precisaValores && (
        <Badge style={{ position: "absolute", top: 8, left: 8, zIndex: 6 }} variant="light" color="gray">
          Nos locais, a cor indica o vencedor de cada local
        </Badge>
      )}
      {locais.data?.truncated && (
        <Badge
          style={{ position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)", zIndex: 6 }}
          color="yellow"
          variant="light"
        >
          Mostrando {fmtInt(locais.data.items.length)} de {fmtInt(locais.data.total)} locais
        </Badge>
      )}

      {legenda && !erro && (
        <Legenda
          tipo={tipo}
          candidatos={itensLegenda}
          destaque={destaque}
          onDestaque={setDestaque}
          unidade={unidade}
          escala={escala}
          rotuloA={candsBase?.find((c) => c.tse_candidate_id === efA)?.ballot_name}
          rotuloB={candsBase?.find((c) => c.tse_candidate_id === efB)?.ballot_name}
          corA={corA}
          corB={corB}
          contagemStatus={contagemStatus}
          vitoriasMunicipios={vitoriasMun}
          partidos={partidos}
        />
      )}

      {carregando && (
        <Group gap={6} style={{ position: "absolute", top: 10, right: 50, zIndex: 6 }}>
          <Loader size="xs" />
          <Text size="xs" c="dimmed">
            Carregando…
          </Text>
        </Group>
      )}
      {erro && (
        <Box style={{ position: "absolute", top: 8, left: 8, right: 50, zIndex: 7 }}>
          <Paper withBorder>
            <ErroView
              erro={erro}
              compacto
              onRetry={() => (modo !== "pontos" ? base.refetch() : locais.refetch())}
            />
          </Paper>
        </Box>
      )}
      {!carregando && !erro && modo === "pontos" && locais.data && locais.data.items.length === 0 && (
        <Badge
          style={{ position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)", zIndex: 6 }}
          variant="light"
          color="gray"
        >
          Sem locais de votação com coordenadas
        </Badge>
      )}

      {hover && (
        <TooltipMapa
          h={hover}
          tipo={tipo}
          efA={efA}
          efB={efB}
          corCand={corCand}
          caixa={[larguraCaixa, alturaCaixa]}
        />
      )}
    </Box>
  );
}

/** Se o evento load demorar (estilo remoto lento), libera o enquadramento mesmo assim. */
function MapaProntoFallback({ onPronto }: { onPronto: () => void }) {
  useEffect(() => {
    const id = setTimeout(onPronto, 1500);
    return () => clearTimeout(id);
  }, [onPronto]);
  return null;
}

function TooltipMapa({
  h,
  tipo,
  efA,
  efB,
  corCand,
  caixa,
}: {
  caixa: [number, number];
  h: Hover;
  tipo: TipoMapa;
  efA: string | null;
  efB: string | null;
  corCand: ReturnType<typeof useCorCandidato>;
}) {
  const [w, hh] = caixa;
  const style = {
    left: w && h.x + 14 + 280 > w ? Math.max(4, h.x - 14 - 280) : Math.max(4, h.x + 14),
    top: hh && h.y + 14 + 190 > hh ? Math.max(4, h.y - 14 - 190) : Math.max(4, h.y + 14),
  };
  let corpo: React.ReactNode;
  if (h.tipo === "hex") {
    corpo = (
      <Stack gap={2}>
        <Text size="sm" fw={700}>
          {fmtPct(h.pct, 1)} dos locais apurados
        </Text>
        <Text size="xs" c="dimmed">
          {fmtInt(h.n)} locais nesta área · clique para aproximar
        </Text>
      </Stack>
    );
  } else if (h.tipo === "local") {
    const l = h.local;
    corpo = (
      <Stack gap={3}>
        <Text size="sm" fw={700} lineClamp={2}>
          {l.name}
        </Text>
        {l.neighborhood && (
          <Text size="xs" c="dimmed">
            {l.neighborhood}
            {l.approximate ? " · posição aproximada" : ""}
          </Text>
        )}
        <Group gap={6}>
          <Box w={8} h={8} style={{ borderRadius: 9, background: COR_STATUS[l.status] }} />
          <Text size="xs">
            {ROTULO_STATUS[l.status]} · {l.sections_tallied}/{l.sections_total} seções
          </Text>
        </Group>
        {l.leader && (
          <Group gap={6} wrap="nowrap">
            <Box
              w={10}
              h={10}
              style={{ borderRadius: 3, background: corCand(l.leader.tse_candidate_id, l.leader.color) }}
            />
            <Text size="xs">
              <b>{l.leader.ballot_name}</b> {fmtPct(l.leader.pct)} · margem {fmtPP(l.margin_pp)}
            </Text>
          </Group>
        )}
        <Text size="xs" c="dimmed">
          Votos válidos: <span className="num">{fmtInt(l.valid_votes)}</span>
        </Text>
      </Stack>
    );
  } else {
    const it = h.item;
    corpo = (
      <Stack gap={3}>
        <Text size="sm" fw={700}>
          {h.nome}
          {it?.state_code && it.level === "municipality" ? (
            <Text span c="dimmed" size="xs">
              {" "}
              · {it.state_code.toUpperCase()}
            </Text>
          ) : null}
        </Text>
        {!it || semDados(it) ? (
          <Text size="xs" c="dimmed">
            Sem dados ainda
          </Text>
        ) : (
          <>
            {it.leader && (
              <Group gap={6} wrap="nowrap">
                <Box
                  w={10}
                  h={10}
                  style={{
                    borderRadius: 3,
                    background: corCand(it.leader.tse_candidate_id, it.leader.color),
                  }}
                />
                <Text size="xs">
                  Líder: <b>{it.leader.ballot_name}</b> {fmtPct(it.leader.pct)}
                </Text>
              </Group>
            )}
            {it.second && (
              <Group gap={6} wrap="nowrap">
                <Box
                  w={10}
                  h={10}
                  style={{
                    borderRadius: 3,
                    background: corCand(it.second.tse_candidate_id, it.second.color),
                  }}
                />
                <Text size="xs">
                  2º: {it.second.ballot_name} {fmtPct(it.second.pct)}
                </Text>
              </Group>
            )}
            <Text size="xs">
              Margem: <b className="num">{fmtPP(it.margin_pp)}</b>
            </Text>
            {tipo === "desempenho" && efA && it.values?.[efA] !== undefined && (
              <Text size="xs">
                Candidato: <b className="num">{fmtPct(it.values[efA])}</b>
              </Text>
            )}
            {tipo === "comparativo" && efA && efB && it.values && (
              <Text size="xs">
                A − B: <b className="num">{fmtPP((it.values[efA] ?? 0) - (it.values[efB] ?? 0))}</b>
              </Text>
            )}
            {tipo === "comparecimento" && it.electorate > 0 && (
              <Text size="xs">
                Comparecimento: <b className="num">{fmtPct((it.turnout / it.electorate) * 100)}</b>
              </Text>
            )}
            {tipo === "partido" && it.leader_party && (
              <Text size="xs">
                Partido mais votado: <b>{it.leader_party.abbreviation}</b>
              </Text>
            )}
            <Text size="xs" c="dimmed">
              Apurado: <span className="num">{fmtPct(it.pct_sections)}</span> · Válidos:{" "}
              <span className="num">{fmtInt(it.valid_votes)}</span>
            </Text>
          </>
        )}
      </Stack>
    );
  }
  return (
    <Paper className="mapa-tooltip" withBorder shadow="lg" p="xs" radius="md" style={style}>
      {corpo}
    </Paper>
  );
}
