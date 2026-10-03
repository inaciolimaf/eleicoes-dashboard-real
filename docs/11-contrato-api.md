# 11. Contrato da API (v1)

Base: `/api/v1`. JSON em UTF-8. Datas em ISO 8601 **com fuso** (o backend
devolve em UTC, o frontend exibe em `America/Sao_Paulo`). Números são
números JSON (nada de vírgula decimal). Percentuais vão de 0 a 100.

## Convenções

### Recortes (`nivel` + `id`)

| nivel | formato do id | exemplo |
|---|---|---|
| `br` | `br` | `br` |
| `uf` | sigla minúscula | `sp`, `zz` (exterior) |
| `municipio` | `<uf><cd_tse 5 díg>` | `sp71072` |
| `zona` | `<municipio>-z<zona 4>` | `sp71072-z0001` |
| `local` | `<municipio>-z<zona 4>-l<local 4>` | `sp71072-z0001-l1015` |
| `secao` | `<municipio>-z<zona 4>-s<secao 4>` | `sp71072-z0001-s0120` |

Filhos de cada nível: `br → uf`, `uf → municipio`, `municipio → zona`,
`zona → local`, `local → secao`. O parâmetro `filhos=municipio` com
`nivel=br` devolve **todos os municípios do Brasil** (para o mapa nacional).

### Parâmetros comuns
- `turno` (1 ou 2, padrão 1)
- `cargo` (1 Presidente, 3 Governador, 5 Senador, 6 Dep. Federal,
  7 Dep. Estadual, 8 Dep. Distrital)
- `t` (opcional, ISO 8601): estado "como estava" no instante t. Sem `t` =
  ao vivo.

### Situação do candidato (`situacao`)
`ELEITO`, `SEGUNDO_TURNO`, `MATEMATICAMENTE_ELEITO`, `LIDERANDO`,
`SUPLENTE`, `NAO_ELEITO`, `SUB_JUDICE`, `EM_APURACAO`.

### Cor do candidato
O backend devolve `cor` (hex) estável por candidato. O frontend pode
sobrescrever pelas preferências do usuário.

---

## GET `/status`
```json
{ "ambiente": "fake", "ao_vivo": true, "agora": "2026-10-04T22:15:00Z",
  "ultima_totalizacao": "2026-10-04T22:14:30Z", "ultima_coleta": "2026-10-04T22:14:58Z",
  "inicio_divulgacao": "2026-10-04T20:00:00Z", "pct_secoes_br": 63.21,
  "coletor": { "pausado": false, "req_por_seg": 41.2 } }
```

## GET `/eleicoes`
```json
[{ "id": 1, "turno": 1, "ciclo": "ele2026", "tipo": "federal", "nome": "Eleição Ordinária Federal - 2026 1º Turno",
   "cargos": [{ "cd": 1, "nome": "Presidente", "sistema": "majoritario", "abrangencia": "br", "vagas": 1 }] },
 { "id": 2, "turno": 1, "tipo": "estadual", "cargos": [
   { "cd": 3, "nome": "Governador", "sistema": "majoritario", "abrangencia": "uf", "vagas": 1 },
   { "cd": 5, "nome": "Senador", "sistema": "majoritario", "abrangencia": "uf", "vagas": 2 },
   { "cd": 6, "nome": "Deputado Federal", "sistema": "proporcional", "abrangencia": "uf", "vagas": null },
   { "cd": 7, "nome": "Deputado Estadual", "sistema": "proporcional", "abrangencia": "uf", "vagas": null },
   { "cd": 8, "nome": "Deputado Distrital", "sistema": "proporcional", "abrangencia": "uf", "vagas": null } ] }]
```
Cargos estaduais em `nivel=br` não existem como resultado único: para eles o
frontend deve usar `nivel=uf` (ou o mapa de UFs com `/recortes/filhos`).

## GET `/resultados?turno&cargo&nivel&id&t`
```json
{
  "sem_dados": false,
  "recorte": { "nivel": "municipio", "id": "sp71072", "nome": "São Paulo", "uf": "sp",
               "breadcrumb": [ {"nivel":"br","id":"br","nome":"Brasil"}, {"nivel":"uf","id":"sp","nome":"São Paulo"},
                               {"nivel":"municipio","id":"sp71072","nome":"São Paulo"} ] },
  "cargo": { "cd": 1, "nome": "Presidente", "sistema": "majoritario", "vagas": 1 },
  "fonte": "tse",                    // "tse" | "soma_bu" (local/seção)
  "cobertura": null,                 // { "secoes_total": 15, "secoes_coletadas": 12 } em local/seção/zona por BU
  "idg": "173967397", "totalizado_em": "...", "capturado_em": "...", "jws_verificado": true,
  "totais": {
    "eleitorado": 9300000, "eleitorado_apurado": 5800000,
    "secoes_total": 28000, "secoes_totalizadas": 17500, "pct_secoes": 62.5,
    "comparecimento": 4600000, "pct_comparecimento": 79.3,
    "abstencao": 1200000, "pct_abstencao": 20.7,
    "votos_total": 4600000, "votos_validos": 4300000, "pct_validos": 93.5,
    "brancos": 110000, "pct_brancos": 2.4, "nulos": 190000, "pct_nulos": 4.1
  },
  "matematicamente_definido": false, "totalizacao_final": false,
  "lider": { "sqcand": "280001", "margem_pp": 7.13, "margem_votos": 306590 },
  "candidatos": [{
    "sqcand": "280001", "numero": 13, "nome": "Fulano de Tal da Silva", "nome_urna": "FULANO",
    "partido_sigla": "PXA", "partido_numero": 13, "agremiacao": "Federação Esperança",
    "cor": "#2F6BFF", "foto_url": "/api/v1/fotos/280001",
    "votos": 2203000, "pct_validos": 51.23, "posicao": 1,
    "situacao": "LIDERANDO",          // situação NESTE recorte (geral para nível = abrangência do cargo)
    "situacao_geral": "ELEITO",       // situação do candidato na abrangência do cargo (BR para presidente)
    "eleito": true, "destinacao": "Válido",
    "vices": [{ "nome": "Ciclano", "tipo": "vice" }]
  }],
  "agremiacoes": [ { "nome": "Federação Esperança", "partidos": ["PXA","PXB"], "votos": 123, "vagas": 12, "cor": "#..." } ]
}
```
`agremiacoes` só vem preenchido para cargos proporcionais (vazio nos
demais). Se não houver dado: `{ "sem_dados": true, "recorte": {...}, "cargo": {...} }`.

## GET `/resultados/serie?turno&cargo&nivel&id&de&ate&max_pontos=300`
```json
{ "candidatos": [ { "sqcand": "280001", "nome_urna": "FULANO", "cor": "#2F6BFF", "numero": 13, "partido_sigla": "PXA" } ],
  "pontos": [ { "t": "2026-10-04T20:05:00Z", "pct_secoes": 1.2, "votos_validos": 120000,
                "candidatos": { "280001": { "votos": 61000, "pct": 50.8 } } } ],
  "eventos": [ /* mesmos objetos de /eventos, filtrados por recorte/cargo */ ] }
```

## GET `/recortes/filhos?turno&cargo&nivel&id&t&filhos&candidatos=sq1,sq2`
Uma linha por filho. É a base da tabela de recortes **e de todos os mapas**.
```json
{ "nivel_filhos": "municipio",
  "candidatos": [ { "sqcand": "280001", "nome_urna": "FULANO", "cor": "#2F6BFF", "numero": 13, "partido_sigla": "PXA", "vitorias": 312 } ],
  "itens": [{
    "nivel": "municipio", "id": "sp71072", "nome": "São Paulo", "uf": "sp",
    "cd_ibge": 3550308, "regiao": "Sudeste", "capital": true, "lat": -23.55, "lon": -46.63,
    "status": "parcial",                       // nao_recebido | parcial | apurado
    "pct_secoes": 62.5, "eleitorado": 9300000, "comparecimento": 4600000, "pct_abstencao": 20.7,
    "votos_validos": 4300000, "brancos": 110000, "nulos": 190000,
    "lider":   { "sqcand": "280001", "nome_urna": "FULANO", "cor": "#2F6BFF", "votos": 2203000, "pct": 51.23 },
    "segundo": { "sqcand": "280002", "nome_urna": "BELTRANO", "cor": "#E5484D", "votos": 1896000, "pct": 44.10 },
    "margem_pp": 7.13,
    "partido_lider": { "sigla": "PXA", "cor": "#..." },      // proporcionais: partido/agremiação mais votado
    "valores": { "280001": 51.23, "280002": 44.10 }          // % dos candidatos pedidos em `candidatos=`
  }] }
```
`lider`/`segundo` são `null` quando não há votos. `candidatos[].vitorias`
= número de filhos em que o candidato lidera.

## GET `/progresso?turno&t`
Progresso da apuração por UF (independe de cargo), com dados do EA14/EA15.
```json
{ "br": { "pct_secoes": 63.2, "secoes_total": 470000, "secoes_totalizadas": 297000, "atualizado_em": "..." },
  "itens": [ { "uf": "sp", "nome": "São Paulo", "pct_secoes": 70.1, "secoes_total": 100000, "secoes_totalizadas": 70100,
               "municipios_total": 645, "municipios_finalizados": 120, "municipios_parciais": 500, "municipios_nao_recebidos": 25,
               "pct_comparecimento": 79.0, "atualizado_em": "..." } ] }
```

## GET `/mapas/locais?turno&cargo&uf&municipio&bbox&t&limite=20000`
`bbox=minLon,minLat,maxLon,maxLat` (opcional). `uf` e `municipio`
(id de recorte) são opcionais.
```json
{ "total": 1234, "truncado": false,
  "itens": [ { "id": "sp71072-z0001-l1015", "nome": "EE PROF. FULANO", "bairro": "Centro",
               "lat": -23.5, "lon": -46.6, "aproximado": false,
               "status": "parcial", "secoes_total": 15, "secoes_apuradas": 12,
               "lider": { "sqcand": "280001", "nome_urna": "FULANO", "cor": "#2F6BFF", "pct": 48.2 } | null,
               "margem_pp": 3.1, "votos_validos": 4200 } ] }
```

## GET `/locais/{id}?turno`
```json
{ "id": "sp71072-z0001-l1015", "nome": "...", "endereco": "...", "bairro": "...", "cep": "...",
  "lat": -23.5, "lon": -46.6, "aproximado": false, "eleitores_aptos": 4500,
  "municipio": { "id": "sp71072", "nome": "São Paulo" }, "zona": { "id": "sp71072-z0001", "numero": 1 },
  "secoes": [ { "id": "sp71072-z0001-s0120", "numero": 120, "eleitores_aptos": 320,
                "status": "apurado", "totalizado_em": "...", "comparecimento": 260 } ] }
```

## GET `/secoes/{id}?turno`
```json
{ "id": "sp71072-z0001-s0120", "numero": 120, "uf": "sp",
  "municipio": { "id": "sp71072", "nome": "São Paulo" }, "zona": { "id": "sp71072-z0001", "numero": 1 },
  "local": { "id": "sp71072-z0001-l1015", "nome": "..." },
  "status": "apurado", "totalizado_em": "...", "emitido_em": "...", "hash": "ab12...", "assinatura_ok": null,
  "url_bu": "https://.../o00406-7107200010120.bu", "eleitores_aptos": 320, "comparecimento": 260,
  "cargos": [ { "cd": 1, "nome": "Presidente", "comparecimento": 260, "votos_validos": 245, "brancos": 5, "nulos": 10,
                "votos": [ { "tipo": "nominal", "numero": 13, "sqcand": "280001", "nome_urna": "FULANO",
                             "partido_sigla": "PXA", "cor": "#..", "votos": 130 } ] } ] }
```

## GET `/candidatos?turno&cargo&uf`
Lista: `[{ sqcand, numero, nome, nome_urna, partido_sigla, agremiacao, cor, foto_url, uf, cargo }]`.

## GET `/candidatos/{sqcand}?turno&t`
`{ ...candidato, "cargo": {...}, "uf": "sp"|null, "resultado": { votos, pct_validos, posicao, situacao }, "vices": [...] }`.

## GET `/fotos/{sqcand}`
Imagem (proxy/cache da foto do TSE). Pode responder 404 → o frontend mostra
as iniciais.

## GET `/busca?q&limite=20`
```json
{ "itens": [ { "tipo": "municipio", "nivel": "municipio", "id": "sp71072", "titulo": "São Paulo", "subtitulo": "SP · 9,3 mi eleitores" },
             { "tipo": "candidato", "id": "280001", "titulo": "FULANO (13)", "subtitulo": "Presidente · PXA", "cargo": 1, "uf": null },
             { "tipo": "local", "nivel": "local", "id": "sp71072-z0001-l1015", "titulo": "EE PROF. FULANO", "subtitulo": "Centro · São Paulo/SP" } ] }
```
Tipos: `uf`, `municipio`, `zona`, `local`, `secao`, `candidato`.

## GET `/eventos?turno&desde&limite=100&tipos=&cargo&nivel&id`
```json
[ { "id": 123, "tipo": "virada", "ocorrido_em": "...", "cargo": 1, "nivel": "uf", "recorte_id": "mg",
    "titulo": "Virada em MG", "descricao": "BELTRANO passou FULANO (48,9% × 48,7%)", "payload": {} } ]
```
Tipos: `virada`, `marco` (10/25/50/75/90/100%), `eleito`, `segundo_turno`,
`matematicamente_definido`, `finalizado`, `inicio`.

## GET `/linha-do-tempo?turno`
`{ "inicio": "...", "fim": "...", "agora": "...", "eventos": [ ...eventos de nível br/uf ] }`.
`inicio` = primeiro snapshot, `fim` = último. O slider vai de `inicio` até `fim`.

## GET `/export?recurso=resultados|filhos&formato=csv|json&...`
Mesmos parâmetros do recurso. Responde arquivo para download.

## Autenticação (JWT Bearer)
- `POST /auth/registro` `{email, senha, nome}` → `{access_token, token_type:"bearer", usuario:{id,email,nome,is_admin}}`
- `POST /auth/login` `{email, senha}` → idem
- `GET /auth/me` → `usuario`

## Painéis
- `GET /paineis` → `[{id, nome, ordem, padrao, schema_version, config, atualizado_em}]`
- `POST /paineis` `{nome, config, padrao?}` → painel
- `GET|PUT|DELETE /paineis/{id}`
- `POST /paineis/{id}/compartilhar` `{modo: "ao_vivo"|"congelado", tempo?}` → `{token, url}`
- `GET /compartilhados/{token}` (público) → `{painel, modo, tempo}`

`config` é o JSON do painel (ver doc 06, seção 6.5). O backend valida só
que é um objeto com `widgets` (lista) e `filtroGlobal` (objeto).

## Favoritos, alertas e preferências (autenticados)
- `GET /favoritos`, `POST /favoritos {tipo, ref, rotulo}`, `DELETE /favoritos/{tipo}/{ref}`
- `GET /alertas`, `POST /alertas {tipo, params, ativo}`, `PUT/DELETE /alertas/{id}`
  - tipos: `pct_candidato` `{cargo, nivel, id, sqcand, limite}`, `virada` `{cargo, nivel, id}`,
    `apuracao` `{nivel, id, limite}`, `eleito` `{sqcand}`, `local_apurado` `{local_id}`
- `GET /preferencias`, `PUT /preferencias {tema, densidade, animacoes, cores_candidatos, notificacoes}`

## Admin (`is_admin`)
- `GET /admin/saude` → métricas do coletor e do worker
- `POST /admin/coletor/pausar`, `POST /admin/coletor/retomar`
- `GET /admin/fake` / `POST /admin/fake {velocidade?, pausado?, reiniciar?, ir_para?}` → controla o relógio do mock do TSE (só no ambiente `fake`)

O primeiro usuário registrado vira admin.

---

## WebSocket `/api/v1/ws`

Cliente → servidor:
```json
{ "op": "sub",   "topicos": ["res:1:1:br:br", "filhos:1:1:br:br", "eventos:1", "status"] }
{ "op": "unsub", "topicos": ["res:1:1:br:br"] }
{ "op": "auth",  "token": "<jwt>" }          // opcional: habilita alertas do usuário
{ "op": "ping" }
```

Tópicos:
| Tópico | Mensagem enviada |
|---|---|
| `res:<turno>:<cargo>:<nivel>:<id>` | `{tipo:"res", topico, dados: <payload de /resultados>}` |
| `filhos:<turno>:<cargo>:<nivel>:<id>` | `{tipo:"filho", topico, dados: <item de /recortes/filhos>}` (um por filho alterado). `filhos:<t>:<c>:br:br:municipio` para todos os municípios |
| `locais:<turno>:<cargo>:<municipio id>` | `{tipo:"local", topico, dados: <item de /mapas/locais>}` |
| `progresso:<turno>` | `{tipo:"progresso", topico, dados: <payload de /progresso>}` |
| `eventos:<turno>` | `{tipo:"evento", topico, dados: <evento>}` |
| `status` | `{tipo:"status", topico, dados: <payload de /status>}` |
| (automático após `auth`) | `{tipo:"alerta", dados:{titulo, descricao, alerta_id}}` |

Servidor → cliente também envia `{tipo:"pong"}` e `{tipo:"erro", mensagem}`.
Toda mensagem tem `seq` (inteiro crescente por conexão).
