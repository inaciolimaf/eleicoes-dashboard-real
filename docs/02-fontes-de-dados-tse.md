# 2. Fontes de dados do TSE

## 2.1 Resposta curta: "O TSE tem API?"

**Não há uma API REST com consultas** (do tipo `GET /resultados?cargo=...&zona=...`).
O TSE publica **arquivos estáticos** em uma CDN (Akamai), em formato
**JSON**, e em 2026 também em **JWS** (o mesmo JSON, assinado digitalmente).
Esses arquivos são regravados a cada rodada de totalização. Na prática isso
funciona como uma "API de leitura" e é a mesma fonte usada pelo app oficial
Resultados, pelo portal do TSE e pela imprensa.

Há três fontes complementares:

| Fonte | O que tem | Quando | Formato |
|---|---|---|---|
| **A. Divulgação de resultados** (`resultados.tse.jus.br`) | Totais por Brasil/UF/município/zona, candidatos, % apurado, eleitos, fotos | **Tempo real**, a partir das 17h do dia da eleição | JSON / JWS |
| **B. Arquivos de urna** (`.../arquivo-urna/...`) | BU de **cada seção** (votos por candidato na seção), RDV, logs | Durante a totalização, à medida que cada seção é totalizada | JSON (índice) + binário ASN.1 |
| **C. Portal de Dados Abertos** (`dadosabertos.tse.jus.br`) | CSVs consolidados (votação por seção, por município/zona, candidatos, **locais de votação**, eleitorado) | Antes (cadastros) e **depois** da eleição (resultados) | CSV / ZIP |

Documentação oficial (consultar antes de implementar, porque muda a cada
eleição):
- Informações técnicas sobre a divulgação de resultados 2026:
  https://www.tse.jus.br/eleicoes/informacoes-tecnicas-sobre-a-divulgacao-de-resultados
- Especificações dos arquivos (EA10, EA11, EA12, EA14, EA15, EA16, EA18,
  EA20), "Instruções para download" e "Manual de verificação dos arquivos JWS":
  https://www.tse.jus.br/eleicoes/eleicoes-2026-content/arquivos/divulgacao-de-resultados
- Portal de Dados Abertos: https://dadosabertos.tse.jus.br/

> **Nota sobre a pesquisa:** o domínio `tse.jus.br` estava bloqueado na rede
> do ambiente onde estas specs foram escritas. Os detalhes abaixo vêm de
> buscas, de trechos da documentação oficial e de **projetos open source que
> já integraram com os arquivos reais do simulado de 2026** (fixtures reais e
> notas de verificação). Cada afirmação está marcada:
> - **[OBS]** observado em arquivo real (simulado 2026 ou oficial 2022) por fonte de terceiros com fixture;
> - **[DOC]** consta na documentação do TSE, mas não foi visto em arquivo real;
> - **[CONFIRMAR]** inferido. Precisa ser validado no ambiente oficial.

---

## 2.2 Ambientes

| Ambiente | Base | Uso |
|---|---|---|
| Oficial | `https://resultados.tse.jus.br/oficial` **[DOC]** | Dia da eleição |
| Simulado 2026 | `https://resultados-sim.tse.jus.br/simulado/simulado2026` **[OBS]** | Testes em setembro, com dados fictícios. Só fica no ar em janelas definidas pelo TSE |
| Histórico 2022 | `https://resultados.tse.jus.br/oficial/ele2022/...` **[OBS]** | Dados reais de 2022 em formato antigo (`-r.json`, `dados-simplificados`). Bom para desenvolvimento e replay |

Em 30/09/2026 o catálogo oficial ainda apontava para o ciclo `ele2024`
(`"c": "ele2024"`). Ele só é trocado para o ciclo de 2026 perto do pleito.
**O sistema precisa detectar o ciclo pelo catálogo, sem fixar nada no
código.**

## 2.3 Tipos de arquivo de divulgação (2026)

| Código | Nome | Sufixo / `arq.tp` | Para que serve |
|---|---|---|---|
| **EA11** | Configuração de eleições (catálogo) | `ele-c` | Ponto de entrada: pleitos, eleições, cargos, templates de diretório |
| **EA12** | Configuração de municípios | `-cm` | Lista de municípios por UF, com código TSE ↔ IBGE, capitais e zonas |
| **EA14** | Acompanhamento Brasil | `-ab` (abrangência `br`) | % de seções e eleitorado totalizados por UF |
| **EA15** | Acompanhamento UF | `-ab` (abrangência UF) | O mesmo, por município da UF |
| **EA16** | Configuração de seções | `-cs` | Árvore município → zona → seção (base para o nível seção) |
| **EA18** | Auxiliar de seção | `-aux` | Por seção: status, hashes e nomes dos arquivos de urna (BU, RDV, log) |
| **EA20** | **Resultado unificado** | `-u` | **Votos por candidato/partido/federação** + totais (válidos, brancos, nulos, comparecimento, seções). É o arquivo principal |
| **EA10** | Resultado de eleitos | `-e` | Só os eleitos de uma abrangência |
| — | Fotos | `ft` | `fotos/<uf>/<sqcand>.jpeg` |

Em eleições anteriores existiam outros arquivos que **não aparecem na lista
de 2026**: EA04 (resultado consolidado), EA13 (evolução das parciais) e o
formato `dados-simplificados/...-r.json`. Por isso o histórico de parciais
precisa ser montado por nós.

## 2.4 Fluxo de descoberta (nunca adivinhar URL)

```
1. GET <base>/comum/config/ele-c.jws (ou .json)    → catálogo EA11
2. Escolher o pleito (pl[]) pela data e o turno (e[].t) e localizar a eleição
   que contém o cargo desejado (e[].abr[].cp[].cd)
3. Ler em arq[] o template de diretório do tipo de arquivo desejado
4. Preencher os placeholders e montar o nome do arquivo
5. GET do arquivo, com If-None-Match (ETag), em polling
```

### Catálogo EA11 (exemplo real do simulado, reduzido) **[OBS]**

```json
{
  "dg": "14/09/2026", "hg": "20:58:55", "f": "s", "idg": "145692058",
  "arq": [
    { "tp": "ft",  "dir": "<base>/<ambiente>/<ciclo>/<cd_eleicao>/fotos/<uf>" },
    { "tp": "cm",  "dir": "<base>/<ambiente>/<ciclo>/<cd_eleicao>/config" },
    { "tp": "e",   "dir": "<base>/<ambiente>/<ciclo>/<cd_eleicao>/dados/<uf>" },
    { "tp": "cs",  "dir": "<base>/<ambiente>/<ciclo>/arquivo-urna/<cd_pleito>/config/<uf>" },
    { "tp": "t",   "dir": "<base>/<ambiente>/<ciclo>/<cd_eleicao>/dados/<uf>" },
    { "tp": "ab",  "dir": "<base>/<ambiente>/<ciclo>/<cd_eleicao>/dados/<uf>" },
    { "tp": "u",   "dir": "<base>/<ambiente>/<ciclo>/<cd_eleicao>/dados/<uf>" },
    { "tp": "aux", "dir": "<base>/<ambiente>/<ciclo>/arquivo-urna/<cd_pleito>/dados/<uf>/<municipio>/<zona>/<secao>" }
  ],
  "pl": [{
    "cd": "17801", "c": "ele2026", "dt": "26/04/2026",
    "e": [
      { "cd": "21270", "cdt2": "21271", "t": "1", "tp": "8",
        "nm": "Eleição Ordinária Federal - 2026 - 17801 1º Turno",
        "abr": [{ "cd": "br", "cp": [{ "cd": "1", "ds": "Presidente", "tp": "1" }] }] },
      { "cd": "21272", "cdt2": "21273", "t": "1", "tp": "1",
        "nm": "Eleição Ordinária Estadual - 2026 - 17801 1º Turno",
        "abr": [{ "cd": "br", "cp": [
          { "cd": "3", "ds": "Governador",        "tp": "1" },
          { "cd": "5", "ds": "Senador",           "tp": "1" },
          { "cd": "6", "ds": "Deputado Federal",  "tp": "2" },
          { "cd": "7", "ds": "Deputado Estadual", "tp": "2" },
          { "cd": "8", "ds": "Deputado Distrital","tp": "2" } ] }] }
    ]
  }]
}
```

Como ler:
- `pl[].cd` é o código do **pleito** (usado em `arquivo-urna/<cd_pleito>`) e
  `pl[].c` é o **ciclo** (`ele2026`).
- `e[].cd` é o código da **eleição**. `e[].cdt2` é o código da eleição do
  **2º turno** correspondente. `e[].t` é o turno. `e[].tp` é o tipo
  (8 = federal, 1 = estadual, 3 = municipal **[CONFIRMAR]**).
- `cp[].tp`: `1` = majoritário, `2` = proporcional.
- **Pegadinha [OBS]:** `abr[].cd` vem sempre `"br"` no catálogo, mesmo para
  cargos estaduais. A eleição deve ser resolvida pelo **código do cargo**
  (`cp[].cd`), nunca pela UF. A UF só entra na URL.
- **Os códigos de eleição mudam entre simulado e oficial.** No simulado:
  21270 (federal) e 21272 (estadual). Fontes secundárias citam 6257
  (federal) e 6259 (estadual) para o 1º turno oficial de 2026 (pleito 3220)
  **[CONFIRMAR]**. Em 2022 eram 544/545 (federal 1º e 2º turno) e 546/547
  (estadual). **Sempre ler do catálogo.**
- Todos os valores numéricos vêm como **string** (`"cd": "21270"`). É preciso
  converter e tratar string vazia como ausente.

### Padrões de URL e nome de arquivo

`<base>` já inclui o ambiente. Exemplo: `https://resultados.tse.jus.br/oficial`.

| Arquivo | URL | Fonte |
|---|---|---|
| Catálogo | `<base>/comum/config/ele-c.json` (ou `.jws`) | [OBS] |
| Municípios (EA12) | `<base>/<ciclo>/<ele>/config/mun-e<ele6>-cm.json` | [OBS] |
| Resultado Brasil | `<base>/<ciclo>/<ele>/dados/br/br-c<cargo4>-e<ele6>-u.json` | [OBS] `br-c0001-e021270-u.jws` |
| Resultado UF | `<base>/<ciclo>/<ele>/dados/<uf>/<uf>-c<cargo4>-e<ele6>-u.json` | [DOC] |
| Resultado município | `<base>/<ciclo>/<ele>/dados/<uf>/<uf><mun5>-c<cargo4>-e<ele6>-u.json` | [OBS] `sp61581-c0003-e021272-u.jws` |
| **Resultado zona** | `<base>/<ciclo>/<ele>/dados/<uf>/<uf><mun5>-z<zona4>-c<cargo4>-e<ele6>-u.json` | [DOC] spec EA20 |
| Eleitos | mesmo diretório, sufixo `-e.json` | [DOC] |
| Acompanhamento | `<base>/<ciclo>/<ele>/dados/<uf\|br>/<uf\|br>-e<ele6>-ab.json` | [OBS] `br-e021270-ab.jws` |
| Fotos | `<base>/<ciclo>/<ele>/fotos/<uf\|br>/<sqcand>.jpeg` | [OBS] |
| Seções (EA16) | `<base>/<ciclo>/arquivo-urna/<pleito>/config/<uf>/<uf>-p<pleito6>-cs.json` | [OBS em 2022] |
| Auxiliar seção (EA18) | `<base>/<ciclo>/arquivo-urna/<pleito>/dados/<uf>/<mun5>/<zona4>/<secao4>/p<pleito6>-<uf>-m<mun5>-z<zona4>-s<secao4>-aux.json` | [OBS em 2022] |
| Arquivos da urna | `.../<secao4>/<hash>/<nmarq>` (ex.: `o00406-0605000020824.bu`) | [OBS em 2022] |

(`<ele6>` = código da eleição com 6 dígitos. `<cargo4>` = código do cargo com
4 dígitos. `<uf>` em minúsculas.)

**Recomendação:** montar o diretório a partir de `arq[].dir` do catálogo e
manter apenas o **nome do arquivo** como regra no código.

## 2.5 Resultado unificado (EA20): estrutura

Exemplo real reduzido do simulado (Presidente/Brasil) **[OBS]**:

```json
{
  "ele": "21270", "t": "1", "f": "s",
  "dg": "28/09/2026", "hg": "15:51:39", "idg": "173967397",
  "v": { "tv": "1000", "vv": "950" },
  "carg": [{
    "cd": "0001",
    "agr": [{
      "n": "60134540", "nm": "PARTIDO 9996", "tp": "i",
      "par": [{
        "n": "68", "sg": "P 9996", "nm": "PARTIDO 9996",
        "cand": [{
          "n": "68", "sqcand": "41592494",
          "nm": "CANDIDATO 9987", "nmu": "CANDIDATO 9987",
          "dvt": "Válido", "vap": "600", "pvapn": "63,157894737",
          "vs": [{ "tp": "v", "sqcand": "41592495", "nm": "CANDIDATO 9986" }]
        }]
      }]
    }]
  }]
}
```

Hierarquia: **cargo (`carg`) → agremiação (`agr`: partido isolado ou
federação/coligação) → partido (`par`) → candidato (`cand`) → vices e
suplentes (`vs`)**.

### Dicionário de campos (principais)

| Campo | Onde | Significado | Fonte |
|---|---|---|---|
| `ele` | raiz | Código da eleição | OBS |
| `t` | raiz | Turno | OBS |
| `f` | raiz | Fase/ambiente: `s` = simulado, `o` = oficial | OBS |
| `dg`, `hg` | raiz | Data/hora de **geração** do arquivo | OBS |
| `dt`, `ht` | raiz/abr | Data/hora da **totalização** | OBS |
| `idg` | raiz | **Identificador de geração**. Muda a cada regravação e é igual ao ETag HTTP. É a chave do snapshot | OBS |
| `v.tv` | raiz | Total de votos | OBS |
| `v.vv` | raiz | Votos válidos | OBS |
| `v.vb`, `v.vn`/`v.tvn` | raiz | Brancos, nulos | DOC |
| `s.ts`, `s.st`, `s.pst`/`s.pstn` | raiz | Seções: total, totalizadas, % (`pst` com 2 casas e vírgula, `pstn` com precisão total) | OBS (EA14), DOC (EA20) |
| `e.te`, `e.est`, `e.esnt` | raiz | Eleitorado: total, em seções totalizadas, em não totalizadas | OBS (EA14) |
| `e.c`, `e.pc`, `e.a`, `e.pa` | raiz | Comparecimento e abstenção (absoluto e %) | OBS (EA14) |
| `tf` | raiz | Totalização final (`s`/`n`) | DOC |
| `md` | raiz | Matematicamente definido | DOC, valores [CONFIRMAR] |
| `agr[].tp` | agr | `i` = partido isolado. Os demais valores indicam federação/coligação | OBS / [CONFIRMAR] |
| `agr[].vag` | agr | Vagas obtidas (proporcional) | DOC |
| `cand[].n` | cand | Número do candidato na urna | OBS |
| `cand[].sqcand` | cand | **ID estável do candidato** (usado nas fotos) | OBS |
| `cand[].nm` / `nmu` | cand | Nome civil / nome de urna | OBS |
| `cand[].vap` | cand | Votos apurados | OBS |
| `cand[].pvap` / `pvapn` | cand | % dos válidos (`pvapn` com precisão total) | OBS |
| `cand[].dvt` | cand | Destinação do voto (`Válido`, `Anulado`, `Anulado sub judice`...) | OBS |
| `cand[].e` | cand | Eleito (`s`/`n`) | OBS 2022 |
| `cand[].st` | cand | Situação ("Eleito", "2º turno", "Eleito por QP", "Suplente"...) | OBS 2022 |

**Formatação [OBS]:** números vêm como string, percentuais usam **vírgula
decimal** (`"63,157894737"`) e datas estão em `dd/mm/aaaa`. O parser precisa
normalizar tudo isso.

### Acompanhamento (EA14/EA15): exemplo de item **[OBS]**

```json
{ "tpabr": "uf", "cdabr": "sp", "dt": "28/09/2026", "ht": "16:20:40",
  "and": "f",
  "munf": "645", "pmunf": "100,00",
  "s": { "ts": "106580", "st": "106580", "pst": "100,00", "si": "...", "sa": "...", "sna": "0" },
  "e": { "te": "...", "est": "...", "c": "...", "pc": "...", "a": "...", "pa": "..." } }
```

`and` indica o andamento (`f` = finalizado **[CONFIRMAR]** os demais
valores). `munf`/`munpt`/`munnr` = municípios finalizados / parcialmente
totalizados / não recebidos. Esse arquivo alimenta o **mapa de progresso da
apuração** com um único request por UF, sem cargo.

## 2.6 Assinatura JWS (novidade de 2026) **[OBS]**

- Cada arquivo existe em `.json` (puro) e em `.jws` (JWS compact
  serialization: `header.payload.assinatura` em base64url). O `.jws` vem com
  `Content-Type: application/json`, mas o corpo é **texto** e não JSON.
- Algoritmo: **EdDSA / Ed25519**. O header traz `kid`.
- Há uma chave pública por ambiente, publicada no "Manual de verificação dos
  arquivos JWS" do TSE:
  - simulado: `kid = pEGrlis0i8vO2Bz7Ergwr0MnKfg`, `x = 81fm_gXW6Q5gBWrGJkE7j5MOS5vmTnRqqFHfdMeRbsw`
  - oficial: `kid = sNbt9Q_fLS65zE1_ZLNV-XRRwPY`, `x = kWlpNHjuws1csyQZwzn3Fhzbi3RD435RbpThtSr4hMc`
  - **[CONFIRMAR]** as duas chaves diretamente no manual oficial antes de
    usar. Elas foram transcritas de um projeto de terceiros que validou só a
    de simulado contra arquivos reais.
- Requisito: o coletor **verifica a assinatura** (algoritmo esperado +
  `kid` do ambiente ativo) antes de aceitar um snapshot. Isso garante que o
  dado exibido é o publicado pelo TSE. A chave **nunca** pode ser lida do
  próprio JWS.

## 2.7 Limites de acesso e cache **[OBS, conforme "Instruções para download"]**

- **100 requisições por segundo por IP** (um `304` também conta). Quem passa
  disso fica **bloqueado por 10 minutos**, e o bloqueio é renovado a cada nova
  tentativa durante o castigo.
- **Muitos 404 seguidos também podem bloquear o IP.** Por isso não se deve
  "chutar" URLs (ex.: varrer zonas inexistentes). Sempre derivar do catálogo
  e das configurações.
- **ETag = `idg`.** Um GET com `If-None-Match` retorna `304` sem corpo se nada
  mudou. Esse é o mecanismo de polling eficiente.
- Não usar `?nocache=`, porque isso anula o cache.
- Não há autenticação, API key ou CORS documentado. Para o navegador,
  **preferir um backend coletor** e não chamar o TSE direto do cliente: um
  usuário com o dashboard aberto não pode gerar tráfego ao TSE.

### Orçamento de requisições (dimensionamento)

| Recorte | Arquivos por ciclo | Observação |
|---|---|---|
| Presidente BR + 27 UFs | 28 | Barato |
| Governador + Senador, por UF | 54 | Barato |
| Dep. Fed. + Est./Dist., por UF | 54 | Arquivos grandes (milhares de candidatos) |
| Acompanhamento BR + 27 UFs | 28 | Barato |
| **Município** (5.570) × cargos (~6) | ~33.000 | Precisa de rodízio e priorização |
| **Zona** (~2.600 zonas, mais combinações município×zona) × cargos | dezenas de milhares | Só sob demanda ou com prioridade |
| **Seção** (~470 mil seções) | 1 aux + 1 BU cada | Só com orçamento dedicado, ver doc 03 |

Com o teto de 100 req/s (vamos operar a **no máximo 50–70 req/s** por IP,
com folga), um ciclo completo de municípios leva cerca de 8–10 minutos. Por
isso o coletor precisa de **filas com prioridade** (ver doc 05).

## 2.8 Portal de Dados Abertos (complementar)

Conjuntos úteis (por ano, CSV em ZIP, separador `;`, encoding Latin-1):

| Conjunto | Uso no sistema | Disponível |
|---|---|---|
| **Eleitorado – local de votação** | Nome, endereço, bairro e **lat/long** do "colégio", seções do local, eleitores aptos | **Antes** da eleição |
| Candidatos (+ bens, fotos) | Enriquecimento de perfil | Antes |
| Votação por seção (`votacao_secao`) | Resultado por seção consolidado, para validar e preencher lacunas | Depois |
| Detalhe da apuração por seção / município-zona | Comparecimento, brancos, nulos por seção | Depois |
| Votação nominal por município e zona | Validação | Depois |
| Boletins de urna / arquivos transmitidos (`.bu`, `.imgbu`, `.logjez`, `.rdv`, `.vscmr`) | Auditoria | Depois |
| Malhas / correspondência TSE↔IBGE | Mapas | Antes |

## 2.9 Outros canais oficiais (não são fonte de dados para nós)

- App **Resultados** (iOS/Android) e o Portal Resultados: mostram o mesmo
  dado, até município.
- App **Boletim na Mão**: lê o QR Code do BU impresso na seção. Permite
  conferência cidadã, mas não é fonte automatizável.
