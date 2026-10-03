# 7. Plano de entrega, riscos e questões em aberto

## 7.1 Escopo

A entrega é o **sistema completo** descrito nos docs 04 a 10. Não há MVP com
corte de funcionalidades. As etapas abaixo são só a **ordem de construção**:
cada uma deixa o sistema rodando no Docker e a próxima constrói em cima.

| Etapa | Entrega | Testes (backend) |
|---|---|---|
| **E0 – Captura imediata** | Antes das 17h de 04/10: o container `collector` em modo "só bruto" grava no volume `brutos` todo EA11/EA20/EA14/EA15 coletado. Garante o histórico do 1º turno para a máquina do tempo | Rate limiter, ETag, URLs |
| **E1 – Fundação** | Docker Compose completo, modelos SQLAlchemy, migrações Alembic, parsers TSE, verificação JWS, tse-fake | Unit de `app/tse`, migrações |
| **E2 – Ingestão e domínio** | Worker: snapshots, situação/selos, votos válidos, vencedor, eventos. Seed de geodados e locais | Ingestão, tempo T, situação, eventos |
| **E3 – API e tempo real** | Todos os endpoints REST, WebSocket com resume, export | API e WS |
| **E4 – Frontend base** | AppShell, tema, placar + bloco de totais com selos, explorar por nível, busca, slider de tempo e replay, tempo real | — |
| **E5 – Mapas** | Os 7 tipos de mapa, drill-down por clique, legenda interativa, mapa de locais apurados | Endpoints de mapa |
| **E6 – Granularidade fina** | EA16/EA18 + decodificação do BU, local de votação, seção, reconciliação, coleta sob demanda | BU, local, reconciliação |
| **E7 – Personalização** | Contas, painéis com grade editável, catálogo de widgets, templates, compartilhamento, favoritos, alertas, modo TV, import/export | Painéis, auth, alertas |
| **E8 – Pós-eleição e admin** | Import dos Dados Abertos, comparativo 2022 × 2026, página admin, observabilidade | Import e reconciliação |
| **E9 – Prova de carga** | Replay de uma noite completa no tse-fake em 60×, com 10 mil conexões WS simuladas | e2e de replay |

Datas de referência: 1º turno em **04/10/2026** (só a E0 cabe até lá) e
2º turno em **25/10/2026**. A meta é ter o sistema completo rodando no 2º
turno, com os dados do 1º turno disponíveis para replay.

## 7.2 Validações pendentes (assim que o ambiente oficial abrir)

1. Confirmar a base oficial `https://resultados.tse.jus.br/oficial` e o
   ciclo `ele2026` no catálogo.
2. Confirmar os códigos de eleição oficiais (fontes citam **6257** federal e
   **6259** estadual, pleito **3220**). O sistema só lê do catálogo.
3. Confirmar se existe o arquivo **por zona** (`<uf><mun>-z<zona>-c..-u`). Se
   não existir, a zona vem da soma de BUs.
4. Confirmar as **chaves públicas JWS** no "Manual de verificação dos arquivos
   JWS" e testar a chave oficial contra um arquivo real.
5. Completar o dicionário de campos com as specs oficiais (`md`, `tf`, `and`,
   `agr.tp`, `vb`, `vn`, `e`, `st` no formato 2026).
6. Confirmar o caminho de `arquivo-urna` em 2026, o formato do EA16 e a versão
   2026 do `bu.asn1`.
7. Confirmar a política de acesso (100 req/s por IP, uso de múltiplos IPs).
8. Verificar se o conjunto "Eleitorado – local de votação 2026" (com lat/long)
   já está nos Dados Abertos.

## 7.3 Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| Bloqueio de IP pelo TSE | Sistema cego por 10+ min | Token bucket com folga, sem URLs especulativas, circuit breaker, standby |
| Formato muda entre simulado e oficial | Parser quebra na hora crítica | Parser tolerante, testes com fixtures reais, brutos no volume `brutos` para reprocessar, alerta em erro de parse |
| Volume de seções vs. limite | Nível seção incompleto durante a noite | Coleta sob demanda + prioridade, cobertura visível ao usuário, completar com Dados Abertos depois |
| Locais sem coordenada | Pontos faltando no mapa | Centróide do município + marcação "posição aproximada" |
| Pico de acesso | Lentidão | Fan-out via Redis, cache curto, réplicas da API |
| Interpretação errada (válidos × total, eleito) | Informação incorreta | Usar os percentuais e a situação do TSE e rotular claramente; "Liderando" separado de "Eleito" |
| Frontend sem testes automatizados | Regressões visuais | TypeScript strict, tipos gerados do OpenAPI, lint, checklist manual de release com o tse-fake |

## 7.4 Decisões tomadas

- Stack: **FastAPI + SQLAlchemy 2.0 + Alembic** no backend, **React + Vite +
  Mantine + ECharts + MapLibre/deck.gl** no frontend.
- Execução: **Docker Compose** para dev, testes e produção.
- Testes automatizados **apenas no backend**.
- Entrega do **sistema completo** (todas as funcionalidades dos docs 04 a 10).

## 7.5 Decisões ainda em aberto

- Uso pessoal ou aberto ao público? Isso muda hospedagem, custo e cuidados
  legais.
- Onde hospedar (VPS única com Docker é o padrão sugerido).
