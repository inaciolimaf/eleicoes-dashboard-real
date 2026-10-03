/**
 * Tipos da API v1 — espelho fiel de docs/11-contrato-api.md.
 * Qualquer divergência com o backend deve ser corrigida AQUI.
 */

export type Nivel = "br" | "uf" | "municipio" | "zona" | "local" | "secao";

export type Situacao =
  | "ELEITO"
  | "SEGUNDO_TURNO"
  | "MATEMATICAMENTE_ELEITO"
  | "LIDERANDO"
  | "SUPLENTE"
  | "NAO_ELEITO"
  | "SUB_JUDICE"
  | "EM_APURACAO";

export type StatusApuracao = "nao_recebido" | "parcial" | "apurado";

export type CdCargo = 1 | 3 | 5 | 6 | 7 | 8 | number;

export type Iso = string;

// ---------------------------------------------------------------- /status
export interface StatusResp {
  ambiente: string; // "fake" | "simulado" | "oficial" | ...
  ao_vivo: boolean;
  agora: Iso;
  ultima_totalizacao: Iso | null;
  ultima_coleta: Iso | null;
  inicio_divulgacao: Iso | null;
  pct_secoes_br: number | null;
  coletor: { pausado: boolean; req_por_seg: number };
}

// ---------------------------------------------------------------- /eleicoes
export interface Cargo {
  cd: CdCargo;
  nome: string;
  sistema: "majoritario" | "proporcional";
  abrangencia: "br" | "uf";
  vagas: number | null;
}

export interface Eleicao {
  id: number;
  turno: number;
  ciclo?: string;
  tipo?: string;
  nome?: string;
  cargos: Cargo[];
}

// ---------------------------------------------------------------- /resultados
export interface BreadcrumbItem {
  nivel: Nivel;
  id: string;
  nome: string;
}

export interface Recorte {
  nivel: Nivel;
  id: string;
  nome: string;
  uf?: string | null;
  breadcrumb: BreadcrumbItem[];
}

export interface CargoResumo {
  cd: CdCargo;
  nome: string;
  sistema: "majoritario" | "proporcional";
  vagas: number | null;
}

export interface Totais {
  eleitorado: number;
  eleitorado_apurado: number;
  secoes_total: number;
  secoes_totalizadas: number;
  pct_secoes: number;
  comparecimento: number;
  pct_comparecimento: number;
  abstencao: number;
  pct_abstencao: number;
  votos_total: number;
  votos_validos: number;
  pct_validos: number;
  brancos: number;
  pct_brancos: number;
  nulos: number;
  pct_nulos: number;
}

export interface Vice {
  nome: string;
  tipo: string; // "vice" | "suplente" ...
}

export interface CandidatoResultado {
  sqcand: string;
  numero: number;
  nome: string;
  nome_urna: string;
  partido_sigla: string;
  partido_numero: number;
  agremiacao: string | null;
  cor: string;
  foto_url: string | null;
  votos: number;
  pct_validos: number;
  posicao: number;
  situacao: Situacao;
  situacao_geral: Situacao;
  eleito: boolean;
  destinacao: string;
  vices: Vice[];
}

export interface Agremiacao {
  nome: string;
  partidos: string[];
  votos: number;
  vagas: number;
  cor: string;
}

export interface Lider {
  sqcand: string;
  margem_pp: number;
  margem_votos: number;
}

export interface Cobertura {
  secoes_total: number;
  secoes_coletadas: number;
}

export interface ResultadosComDados {
  sem_dados: false;
  recorte: Recorte;
  cargo: CargoResumo;
  fonte: "tse" | "soma_bu";
  cobertura: Cobertura | null;
  idg: string | null;
  totalizado_em: Iso | null;
  capturado_em: Iso | null;
  jws_verificado: boolean | null;
  totais: Totais;
  matematicamente_definido: boolean;
  totalizacao_final: boolean;
  lider: Lider | null;
  candidatos: CandidatoResultado[];
  agremiacoes: Agremiacao[];
}

export interface ResultadosSemDados {
  sem_dados: true;
  recorte: Recorte;
  cargo: CargoResumo;
}

export type ResultadosResp = ResultadosComDados | ResultadosSemDados;

// ---------------------------------------------------------------- /resultados/serie
export interface CandidatoMini {
  sqcand: string;
  nome_urna: string;
  cor: string;
  numero: number;
  partido_sigla: string;
}

export interface PontoSerie {
  t: Iso;
  pct_secoes: number;
  votos_validos: number;
  candidatos: Record<string, { votos: number; pct: number }>;
}

export interface SerieResp {
  candidatos: CandidatoMini[];
  pontos: PontoSerie[];
  eventos: Evento[];
}

// ---------------------------------------------------------------- /recortes/filhos
export interface LiderFilho {
  sqcand: string;
  nome_urna: string;
  cor: string;
  votos: number;
  pct: number;
}

export interface ItemFilho {
  nivel: Nivel;
  id: string;
  nome: string;
  uf: string;
  cd_ibge?: number | null;
  regiao?: string | null;
  capital?: boolean | null;
  lat?: number | null;
  lon?: number | null;
  status: StatusApuracao;
  pct_secoes: number;
  eleitorado: number;
  comparecimento: number;
  pct_abstencao: number;
  votos_validos: number;
  brancos: number;
  nulos: number;
  lider: LiderFilho | null;
  segundo: LiderFilho | null;
  margem_pp: number | null;
  partido_lider?: { sigla: string; cor: string } | null;
  valores?: Record<string, number> | null;
}

export interface CandidatoFilhos extends CandidatoMini {
  vitorias: number;
}

export interface FilhosResp {
  nivel_filhos: Nivel;
  candidatos: CandidatoFilhos[];
  itens: ItemFilho[];
}

// ---------------------------------------------------------------- /progresso
export interface ProgressoItem {
  uf: string;
  nome: string;
  pct_secoes: number;
  secoes_total: number;
  secoes_totalizadas: number;
  municipios_total: number;
  municipios_finalizados: number;
  municipios_parciais: number;
  municipios_nao_recebidos: number;
  pct_comparecimento: number;
  atualizado_em: Iso | null;
}

export interface ProgressoResp {
  br: { pct_secoes: number; secoes_total: number; secoes_totalizadas: number; atualizado_em: Iso | null };
  itens: ProgressoItem[];
}

// ---------------------------------------------------------------- /mapas/locais
export interface LocalMapa {
  id: string;
  nome: string;
  bairro: string | null;
  lat: number;
  lon: number;
  aproximado: boolean;
  status: StatusApuracao;
  secoes_total: number;
  secoes_apuradas: number;
  lider: { sqcand: string; nome_urna: string; cor: string; pct: number } | null;
  margem_pp: number | null;
  votos_validos: number;
}

export interface LocaisResp {
  total: number;
  truncado: boolean;
  itens: LocalMapa[];
}

// ---------------------------------------------------------------- /locais/{id}
export interface SecaoResumo {
  id: string;
  numero: number;
  eleitores_aptos: number;
  status: StatusApuracao;
  totalizado_em: Iso | null;
  comparecimento: number | null;
}

export interface LocalDetalhe {
  id: string;
  nome: string;
  endereco: string | null;
  bairro: string | null;
  cep: string | null;
  lat: number | null;
  lon: number | null;
  aproximado: boolean;
  eleitores_aptos: number;
  municipio: { id: string; nome: string };
  zona: { id: string; numero: number };
  secoes: SecaoResumo[];
}

// ---------------------------------------------------------------- /secoes/{id}
export interface VotoBU {
  tipo: string; // "nominal" | "legenda" | ...
  numero: number | null;
  sqcand: string | null;
  nome_urna: string | null;
  partido_sigla: string | null;
  cor: string | null;
  votos: number;
}

export interface CargoBU {
  cd: CdCargo;
  nome: string;
  comparecimento: number;
  votos_validos: number;
  brancos: number;
  nulos: number;
  votos: VotoBU[];
}

export interface SecaoDetalhe {
  id: string;
  numero: number;
  uf: string;
  municipio: { id: string; nome: string };
  zona: { id: string; numero: number };
  local: { id: string; nome: string };
  status: StatusApuracao;
  totalizado_em: Iso | null;
  emitido_em: Iso | null;
  hash: string | null;
  assinatura_ok: boolean | null;
  url_bu: string | null;
  eleitores_aptos: number;
  comparecimento: number | null;
  cargos: CargoBU[];
}

// ---------------------------------------------------------------- /candidatos
export interface CandidatoLista {
  sqcand: string;
  numero: number;
  nome: string;
  nome_urna: string;
  partido_sigla: string;
  agremiacao: string | null;
  cor: string;
  foto_url: string | null;
  uf: string | null;
  cargo: CdCargo | Cargo | CargoResumo;
}

export interface CandidatoDetalhe {
  sqcand: string;
  numero: number;
  nome: string;
  nome_urna: string;
  partido_sigla: string;
  partido_numero?: number;
  agremiacao: string | null;
  cor: string;
  foto_url: string | null;
  cargo: CargoResumo | Cargo;
  uf: string | null;
  resultado: { votos: number; pct_validos: number; posicao: number; situacao: Situacao } | null;
  vices: Vice[];
}

// ---------------------------------------------------------------- /busca
export type TipoBusca = "uf" | "municipio" | "zona" | "local" | "secao" | "candidato";

export interface ItemBusca {
  tipo: TipoBusca;
  nivel?: Nivel;
  id: string;
  titulo: string;
  subtitulo?: string | null;
  cargo?: CdCargo | null;
  uf?: string | null;
}

export interface BuscaResp {
  itens: ItemBusca[];
}

// ---------------------------------------------------------------- /eventos
export type TipoEvento =
  | "virada"
  | "marco"
  | "eleito"
  | "segundo_turno"
  | "matematicamente_definido"
  | "finalizado"
  | "inicio";

export interface Evento {
  id: number;
  tipo: TipoEvento | string;
  ocorrido_em: Iso;
  cargo: CdCargo | null;
  nivel: Nivel | null;
  recorte_id: string | null;
  titulo: string;
  descricao: string | null;
  payload: Record<string, unknown>;
}

// ---------------------------------------------------------------- /linha-do-tempo
export interface LinhaDoTempoResp {
  inicio: Iso | null;
  fim: Iso | null;
  agora: Iso;
  eventos: Evento[];
}

// ---------------------------------------------------------------- auth
export interface Usuario {
  id: number | string;
  email: string;
  nome: string;
  is_admin: boolean;
}

export interface AuthResp {
  access_token: string;
  token_type: "bearer";
  usuario: Usuario;
}

// ---------------------------------------------------------------- painéis
export interface PainelApi {
  id: number | string;
  nome: string;
  ordem: number;
  padrao: boolean;
  schema_version: number;
  config: unknown; // validado no front com zod (ver paineis/schema.ts)
  atualizado_em: Iso;
}

export interface CompartilharResp {
  token: string;
  url: string;
}

export interface CompartilhadoResp {
  painel: PainelApi;
  modo: "ao_vivo" | "congelado";
  tempo: Iso | null;
}

// ---------------------------------------------------------------- favoritos / alertas / preferências
export type TipoFavorito = "candidato" | "recorte" | "local";

export interface Favorito {
  tipo: TipoFavorito;
  ref: string;
  rotulo: string;
}

export type TipoAlerta = "pct_candidato" | "virada" | "apuracao" | "eleito" | "local_apurado";

export interface Alerta {
  id: string;
  tipo: TipoAlerta;
  params: Record<string, unknown>;
  ativo: boolean;
  canais?: string[];
  disparado_em?: Iso | null;
}

export interface PreferenciasApi {
  tema: "escuro" | "claro" | "auto";
  densidade: "confortavel" | "compacta";
  animacoes: boolean;
  cores_candidatos: Record<string, string>;
  notificacoes: { toasts: string[]; push: boolean } | Record<string, unknown>;
}

// ---------------------------------------------------------------- admin
export type AdminSaude = Record<string, unknown>;
export type AdminFake = Record<string, unknown>;

export interface AdminFakeReq {
  velocidade?: number;
  pausado?: boolean;
  reiniciar?: boolean;
  ir_para?: Iso;
}

// ---------------------------------------------------------------- WebSocket
export type WsClienteMsg =
  | { op: "sub"; topicos: string[] }
  | { op: "unsub"; topicos: string[] }
  | { op: "auth"; token: string }
  | { op: "ping" };

export type WsServidorMsg =
  | { tipo: "res"; topico: string; seq: number; dados: ResultadosResp }
  | { tipo: "filho"; topico: string; seq: number; dados: ItemFilho }
  | { tipo: "local"; topico: string; seq: number; dados: LocalMapa }
  | { tipo: "progresso"; topico: string; seq: number; dados: ProgressoResp }
  | { tipo: "evento"; topico: string; seq: number; dados: Evento }
  | { tipo: "status"; topico: string; seq: number; dados: StatusResp }
  | { tipo: "alerta"; seq: number; dados: { titulo: string; descricao: string; alerta_id: string } }
  | { tipo: "pong"; seq: number }
  | { tipo: "erro"; seq: number; mensagem: string };
