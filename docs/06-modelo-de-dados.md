# 6. Modelo de dados

## 6.1 Dimensões

```sql
-- Eleição como publicada no catálogo EA11
eleicao (
  id              serial pk,
  ambiente        text,      -- 'oficial' | 'simulado' | 'historico'
  ciclo           text,      -- 'ele2026'
  cd_pleito       int,
  cd_eleicao      int,       -- código TSE (lido do catálogo)
  cd_eleicao_t2   int null,  -- cdt2
  turno           smallint,
  tipo            text,      -- federal | estadual | municipal
  nome            text,
  data            date,
  unique (ambiente, cd_eleicao)
)

cargo (
  cd_cargo        smallint pk,   -- 1, 3, 5, 6, 7, 8
  nome            text,
  sistema         text           -- 'majoritario' | 'proporcional'
)

eleicao_cargo (eleicao_id, cd_cargo, pk(eleicao_id, cd_cargo))

-- Geografia
uf          (sigla char(2) pk, nome text)
municipio   (cd_tse int, uf char(2), nome text, cd_ibge int null, capital bool,
             pk(cd_tse))
zona        (uf char(2), cd_zona int, pk(uf, cd_zona))
local_votacao (
  id serial pk, uf, cd_municipio, cd_zona, nr_local int,
  nome text, endereco text, bairro text, cep text,
  lat numeric null, lon numeric null, eleitores_aptos int,
  unique (uf, cd_municipio, cd_zona, nr_local)
)
secao (
  uf, cd_municipio, cd_zona, nr_secao int,
  nr_local int null,                 -- dos Dados Abertos ou do BU
  secao_agregadora int null,
  eleitores_aptos int null,
  pk (uf, cd_municipio, cd_zona, nr_secao)
)

-- Candidaturas
partido     (numero smallint pk, sigla text, nome text)
agremiacao  (id serial pk, eleicao_id, cd_cargo, uf_abrangencia, numero_tse bigint,
             nome text, tipo text)        -- isolado | federação | coligação
candidato (
  sqcand bigint pk,                  -- id estável do TSE
  eleicao_id, cd_cargo, uf_abrangencia char(2),   -- 'br' para Presidente
  numero int, nome text, nome_urna text,
  partido_numero, agremiacao_id,
  vice_ou_suplentes jsonb,
  foto_url text
)
```

## 6.2 Fatos (séries temporais)

```sql
-- Um registro por geração (idg) de cada arquivo de resultado (EA20 -u)
snapshot_resultado (                         -- hypertable por capturado_em
  id bigserial,
  eleicao_id, cd_cargo,
  nivel text,                 -- br | uf | municipio | zona | local | secao
  recorte_id text,            -- 'br', 'sp', 'sp71072', 'sp71072-z0001'...
  idg bigint,                 -- id de geração do TSE
  gerado_em timestamptz,      -- dg/hg
  totalizado_em timestamptz,  -- dt/ht
  capturado_em timestamptz,   -- quando o coletor viu
  jws_verificado bool,
  secoes_total int, secoes_totalizadas int, pct_secoes numeric,
  eleitorado int, eleitorado_totalizado int,
  comparecimento int, abstencao int,
  votos_total int, votos_validos int, brancos int, nulos int,
  matematicamente_definido text null,
  totalizacao_final bool,
  objeto_bruto text,          -- chave no armazenamento de objetos
  unique (eleicao_id, cd_cargo, nivel, recorte_id, idg)
)

snapshot_candidato (                         -- hypertable
  snapshot_id bigint, sqcand bigint,
  votos int, pct_validos numeric,
  situacao text, eleito bool, destinacao text,
  posicao smallint
)

snapshot_agremiacao (snapshot_id, agremiacao_id, votos int, vagas int)

-- Acompanhamento (EA14/EA15), sem cargo
snapshot_progresso (
  eleicao_id, nivel, recorte_id, idg, totalizado_em, capturado_em,
  andamento text, secoes_total, secoes_totalizadas, pct_secoes,
  municipios_finalizados, municipios_parciais, municipios_nao_recebidos,
  eleitorado, comparecimento, abstencao
)

-- Seção (BU): um registro por urna totalizada
boletim_urna (
  id bigserial pk,
  eleicao_pleito int, uf, cd_municipio, cd_zona, nr_secao, nr_local,
  hash text, status text, emitido_em timestamptz, publicado_em timestamptz,
  eleitores_aptos int, comparecimento int,
  assinatura_ok bool null,
  objeto_bruto text
)
boletim_votos (boletim_id, cd_cargo, tipo_voto text, numero int null, votos int)
```

## 6.3 Derivados / leitura rápida

- `estado_atual_resultado` (view materializada ou Redis): último snapshot por
  (eleição, cargo, nível, recorte).
- `resultado_local_votacao` (agregado contínuo): Σ `boletim_votos` por local,
  com `secoes_coletadas / secoes_total`.
- `evento` (feed): `(id, tipo, eleicao_id, cd_cargo, nivel, recorte_id,
  ocorrido_em, payload jsonb)`.

## 6.4 Consulta "estado no instante T"

```sql
select distinct on (recorte_id) *
from snapshot_resultado
where eleicao_id = $1 and cd_cargo = $2 and nivel = $3
  and totalizado_em <= $T
order by recorte_id, totalizado_em desc, idg desc;
```

Usar `totalizado_em` (horário oficial da totalização) como eixo do tempo, e
não `capturado_em`. Assim o replay fica fiel ao TSE mesmo se o coletor
atrasar.

## 6.5 Configuração de painel (frontend)

```json
{
  "id": "noite-eleicao",
  "nome": "Noite da eleição",
  "filtroGlobal": { "ambiente": "oficial", "ciclo": "ele2026", "turno": 1,
                    "cargo": 1, "nivel": "br", "recorte": "br", "tempo": "agora" },
  "widgets": [
    { "id": "w1", "tipo": "placar",   "pos": {"x":0,"y":0,"w":6,"h":4}, "herda": true },
    { "id": "w2", "tipo": "mapa",     "pos": {"x":6,"y":0,"w":6,"h":8},
      "config": { "nivelFilhos": "uf", "metrica": "lider" }, "herda": true },
    { "id": "w3", "tipo": "evolucao", "pos": {"x":0,"y":4,"w":6,"h":4},
      "config": { "eixoX": "pct_secoes" }, "herda": true },
    { "id": "w4", "tipo": "placar",   "pos": {"x":0,"y":8,"w":4,"h":4},
      "filtros": { "cargo": 3, "nivel": "uf", "recorte": "sp" }, "herda": false }
  ]
}
```
