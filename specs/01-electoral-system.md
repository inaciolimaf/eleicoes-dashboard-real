# 1. Como funciona a eleição no Brasil (o que o sistema precisa modelar)

## 1.1 Quem organiza

- **TSE (Tribunal Superior Eleitoral)** coordena a eleição nacional, define as
  regras por resolução, mantém os sistemas (urna, transmissão, totalização) e
  publica os resultados.
- **TREs (Tribunais Regionais Eleitorais)**, um por UF, cuidam da logística
  estadual e da totalização dos cargos estaduais.
- **Zonas eleitorais** são as unidades administrativas da Justiça Eleitoral
  dentro de cada UF. Uma zona pode cobrir vários municípios e uma capital
  grande tem várias zonas.

## 1.2 Eleições gerais de 2026: cargos em disputa

| Cargo | Código TSE (`cd`) | Abrangência | Sistema | Observação |
|---|---|---|---|---|
| Presidente | `1` | Brasil | Majoritário, 2 turnos | 2º turno se ninguém tiver mais de 50% dos votos válidos |
| Governador | `3` | UF | Majoritário, 2 turnos | Mesma regra, por UF |
| Senador | `5` | UF | Majoritário, turno único | Em 2026 a renovação é de **2/3** do Senado, ou seja, **2 vagas por UF** e o eleitor vota em 2 candidatos |
| Deputado Federal | `6` | UF | Proporcional | 513 vagas, de 8 a 70 por UF |
| Deputado Estadual | `7` | UF | Proporcional | Não existe no DF |
| Deputado Distrital | `8` | DF | Proporcional | Só no DF |

Os códigos de cargo vêm do catálogo do TSE (`cp[].cd`) e aparecem com 4
dígitos no nome dos arquivos (`c0001`, `c0003`...). Para referência, nas
eleições municipais os códigos são Prefeito `11` e Vereador `13`.

### Majoritário (Presidente, Governador, Senador)
- Ganha quem tem mais votos. Para Presidente e Governador é preciso ter
  **maioria absoluta dos votos válidos** (mais de 50%). Se ninguém tiver, os 2
  mais votados vão para o 2º turno.
- **Votos válidos** são os votos nominais em candidatos. Brancos e nulos não
  entram nessa conta.
- O que o dashboard precisa mostrar: % de votos válidos, diferença em pontos
  percentuais (p.p.) entre 1º e 2º colocados, se há chance matemática de
  definição no 1º turno e a "situação" calculada pelo TSE (eleito, 2º turno,
  não eleito).

### Proporcional (Deputados)
- O eleitor vota no candidato ou na legenda (partido). As vagas são
  distribuídas por **quociente eleitoral** (votos válidos ÷ vagas) e
  **quociente partidário**, com sobras distribuídas por média.
- Partidos podem disputar em **federação**, que conta como um único partido
  para efeito de distribuição de vagas. Coligações proporcionais são proibidas
  desde 2020.
- O TSE já publica no arquivo de resultado a situação de cada candidato
  ("Eleito por QP", "Eleito por média", "Suplente", "Não eleito") e o total de
  vagas por agremiação (`vag`). **Não vamos recalcular a distribuição de
  vagas.** Usamos o que o TSE publica e, no máximo, fazemos uma projeção
  marcada como estimativa.

## 1.3 Hierarquia geográfica (os níveis de filtro)

```
Brasil
 └── UF (27, incluindo DF) + ZZ (exterior, só para Presidente)
      └── Município (código TSE de 5 dígitos, que NÃO é o código IBGE)
           └── Zona eleitoral (4 dígitos)
                └── Local de votação ("colégio", 4 dígitos dentro da zona)
                     └── Seção eleitoral (4 dígitos dentro da zona)
                          └── Urna (normalmente 1 por seção, mas pode haver substituição ou contingência)
```

Pontos de atenção:
- **Uma zona pode ter seções em mais de um município** e um município pode ter
  várias zonas. A chave única de uma seção é **(UF, município, zona, seção)**.
- **Local de votação** (o que o usuário chama de "colégio") é a escola ou
  prédio onde ficam várias seções. Ele **não é um nível de totalização
  oficial em tempo real**. Nós montamos esse nível agregando as seções (ver
  [doc 03](03-granularidade-secao.md)).
- O código de município do TSE é diferente do código do IBGE. O TSE publica a
  tabela de correspondência (arquivo de configuração de municípios, EA12).
  Precisamos dela para desenhar mapas.
- **Exterior (ZZ)**: eleitores no exterior votam só para Presidente.

## 1.4 Da urna ao resultado (por que os dados chegam aos poucos)

1. A votação vai das **8h às 17h no horário de Brasília em todo o país**
   (horário unificado desde 2022, mantido pela Res. TSE 23.751/2026).
2. Às 17h cada urna imprime o **Boletim de Urna (BU)** com o total de votos da
   seção, grava a mídia de resultado e o BU é afixado na porta da seção.
   Também tem QR Code, que pode ser lido pelo app **Boletim na Mão**.
3. A mídia é levada a um ponto de transmissão e o BU é enviado ao TSE.
4. O TSE **totaliza**: soma os BUs recebidos e gera novos arquivos de
   resultado. **A divulgação começa às 17h (Brasília), ao mesmo tempo para
   todas as UFs.**
5. A cada nova rodada de totalização, os arquivos JSON são regravados com um
   novo identificador de geração (`idg`), data e hora. É isso que nosso
   sistema "escuta".
6. Os BUs de cada seção também são publicados na internet durante a
   totalização (página "Dados de Urna"), o que permite conferir seção por
   seção.
7. Ao fim, os dados consolidados (CSV por seção, BUs, logs, RDV) vão para o
   **Portal de Dados Abertos**.

Consequência para o produto: o percentual de "seções totalizadas" sobe ao
longo da noite e **o resultado parcial pode mudar de líder** conforme as
regiões chegam. Isso é a "virada" que o usuário quer acompanhar e motiva a
linha do tempo.

## 1.5 Calendário relevante (2026)

| Data | Evento |
|---|---|
| Set/2026 | Simulados de divulgação no ambiente `resultados-sim.tse.jus.br` (dados fictícios: "CANDIDATO 9987", "PARTIDO 9996") |
| **04/10/2026** | **1º turno.** Votação das 8h às 17h, divulgação a partir das 17h (Brasília) |
| **25/10/2026** | **2º turno** (Presidente e Governador, onde houver) |
| Após cada turno | BUs, CSVs por seção e demais arquivos no Portal de Dados Abertos |

## 1.6 Glossário rápido (campos que aparecem nos dados)

| Termo | Significado |
|---|---|
| Pleito | O "evento" eleitoral de uma data (ex.: 1º turno de 2026). Tem código (`pl[].cd`) |
| Eleição | Dentro de um pleito, um conjunto de cargos. Em 2026: **Federal** (Presidente) e **Estadual** (Governador, Senador, Deputados), cada uma com seu código |
| Abrangência | Recorte geográfico do arquivo (`br`, `sp`, `sp71072`...) |
| Votos válidos | Votos nominais em candidatos (e de legenda, no proporcional) |
| Brancos / Nulos | Não entram nos válidos |
| Comparecimento / Abstenção | Eleitores que votaram / aptos que não votaram |
| Seções totalizadas | Seções cujo BU já entrou na soma |
| Seções instaladas / agregadas / anuladas | Estados possíveis das seções, que aparecem nos arquivos de acompanhamento |
| Matematicamente definido (`md`) | Indicador do TSE de que o resultado não pode mais mudar. Os valores exatos ainda precisam ser confirmados no dicionário EA20 (ver doc 07) |
