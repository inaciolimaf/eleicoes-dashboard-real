# 3. Resultado por zona, local de votação ("colégio") e seção

Este é o requisito mais difícil do projeto. A divulgação oficial em tempo real
(EA20) vai até **município** e **zona**. Para **seção** e **local de
votação** é preciso usar os **arquivos de urna**.

## 3.1 Disponibilidade por nível

| Nível | Fonte em tempo real | Latência típica | Custo de coleta |
|---|---|---|---|
| Brasil / UF | EA20 `-u` | Segundos a poucos minutos após a totalização | Baixo |
| Município | EA20 `-u` (`<uf><mun>`) | Idem | Médio (5.570 municípios) |
| Zona | EA20 `-u` (`<uf><mun>-z<zona>`) **[DOC, CONFIRMAR no oficial]** | Idem | Médio/alto |
| **Seção** | **EA18 `-aux` → arquivo `.bu`** | Quando a seção é totalizada e o BU publicado | **Muito alto** (~470 mil seções) |
| **Local de votação** | **Agregação nossa** das seções (o BU informa o número do local) | Mesma das seções | Derivado |

Plano B para zona: se o arquivo por zona não existir no ambiente oficial,
calcular a zona **somando os BUs** das seções daquela zona. O BU traz
município, zona, local e seção.

## 3.2 Fluxo para o nível de seção

```
EA11 catálogo ──► cd_pleito
       │
       ▼
EA16  <uf>-p<pleito6>-cs.json      (1 por UF, baixar uma vez e atualizar raramente)
  abr[0].mu[] ─► { cd: "06050", nm: "MACAPÁ",
                   zon[]: { cd: "0002", sec[]: { ns: "0824", nsp: ... } } }
       │
       ▼  para cada seção, conforme prioridade
EA18  p<pleito6>-<uf>-m<mun5>-z<zona4>-s<secao4>-aux.json
  { "st": "Totalizada",
    "hashes": [ { "hash": "534f75...", "st": "Totalizado",
                  "dr": "02/10/2022", "hr": "19:20:08",
                  "nmarq": [ "o00406-0605000020824.bu", ".rdv", ".logjez", ".imgbu", ".vscmr" ] } ] }
       │
       ▼
BU    .../<secao4>/<hash>/o00406-0605000020824.bu   (binário ASN.1/BER)
```

Notas:
- `hashes[]` pode ter **mais de uma urna por seção** (substituição ou
  contingência). Usar a entrada com `st = "Totalizado"`. Se houver mais de
  uma, a regra precisa ser validada **[CONFIRMAR]**.
- Seções podem ficar **agregadas** a outra seção (os eleitores votam na
  urna da seção agregadora). O mapeamento vem de EA16 (`nsp`?) **[CONFIRMAR]**.
- Para economizar requisições, só baixar o `.bu` (e o `.imgbu` sob demanda
  para auditoria). RDV e log não são necessários para o dashboard.

## 3.3 Decodificação do BU

- O formato é **ASN.1 (BER)**. A especificação (`bu.asn1`, `assinatura.asn1`,
  `rdv.asn1`) é publicada pelo TSE junto com scripts de exemplo em Python
  (bibliotecas `asn1tools`, `asn1crypto`, `ed25519`).
- Estrutura relevante (`EntidadeBoletimUrna`):
  - `identificacaoSecao` → **município, zona, local (`NumeroLocal`), seção**
  - `dataHoraEmissao`
  - `resultadosVotacaoPorEleicao[]` → `qtdEleitoresAptos`,
    `resultadosVotacao[]` → `qtdComparecimento`, `totaisVotosCargo[]` →
    `codigoCargo`, `votosVotaveis[]` → `tipoVoto` (`nominal`, `legenda`,
    `branco`, `nulo`...), `quantidadeVotos`, `identificacaoVotavel {partido,
    codigo}` (número do candidato)
- O BU tem **hash encadeado e assinatura** e pode ser verificado. É opcional
  na v1, mas é bom diferencial ("seção auditada").
- O BU **não traz o nome do candidato**, só o número. O join com nome, partido
  e `sqcand` é feito pelo número do candidato dentro de (cargo, UF), usando o
  EA20 da UF.
- **Ação:** baixar a versão 2026 do `bu.asn1`. Ela pode ter mudado em relação
  a 2022 (o repositório de referência já tem `doc/` e `docv2/`).

## 3.4 Local de votação ("colégio")

1. **Antes da eleição**, importar do Portal de Dados Abertos o conjunto
   **"Eleitorado – local de votação" 2026**: `(UF, município, zona, nr_local)
   → nome do local, endereço, bairro, latitude, longitude, seções, eleitores
   aptos`.
2. Durante a apuração, cada BU decodificado traz `local`. O resultado do local
   é a **soma das seções** daquele `(município, zona, local)`.
3. O dashboard mostra o local com: % de seções do local já recebidas, votos
   por candidato, comparecimento e um mapa (pin por lat/long).
4. A busca por local deve aceitar nome da escola, bairro ou endereço
   (índice de texto).

## 3.5 Estratégia de coleta (o volume não deixa baixar tudo de uma vez)

Cerca de 470 mil seções × (1 aux + 1 BU) dá quase 1 milhão de requisições.
A 60 req/s, isso leva **~4,5 horas** por IP, sem contar re-polls.

Estratégia proposta:
1. **Sob demanda com prioridade.** Quando um usuário abre ou fixa um
   município, zona ou local no dashboard, as seções daquele recorte entram na
   fila de alta prioridade.
2. **Pré-seleção configurável.** Uma lista de "recortes vigiados" (ex.: a
   capital do usuário, municípios de interesse) é coletada continuamente.
3. **Varredura de fundo** com o orçamento restante, por UF, priorizando
   municípios cujo EA15 mostra avanço recente (seções novas totalizadas).
4. **Sem re-poll de seção totalizada.** Depois que um BU com status
   "Totalizado" é ingerido, a seção só é revisitada se o EA20 do município
   mostrar alguma inconsistência (ex.: total do município menor que a soma das
   seções).
5. **Pós-eleição:** carregar o CSV `votacao_secao` dos Dados Abertos para
   completar 100% das seções e reconciliar.
6. **Escala horizontal (opcional):** mais de um IP de coleta para multiplicar
   o orçamento. Isso precisa respeitar a política do TSE. Decidir antes (ver
   doc 07).

## 3.6 Consistência entre níveis

- Regra de exibição: **o número oficial é sempre o do EA20** para BR, UF,
  município e zona. A soma das seções é exibida como "seções coletadas: X de Y"
  e nunca substitui o total oficial.
- Job de reconciliação: para cada município, comparar `Σ seções ingeridas` com
  o EA20. Divergência acima do esperado (seções ainda não coletadas) gera
  alerta interno.
