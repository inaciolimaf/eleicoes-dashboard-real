# 7. Roadmap, riscos e questões em aberto

## 7.1 Fases

**Contexto de prazo:** hoje é 03/10/2026 e o 1º turno é amanhã (04/10). Um
sistema completo não fica pronto a tempo do 1º turno. A proposta é:

| Fase | Objetivo | Entregáveis |
|---|---|---|
| **0 – Captura (urgente, antes de 17h de 04/10)** | Não perder o histórico do 1º turno | Script coletor mínimo que baixa catálogo, EA20 BR/UF de todos os cargos e EA14/EA15, respeitando ETag e o teto de req/s, e grava **os arquivos brutos com timestamp**. Sem UI. Esses dados alimentam o replay e a "máquina do tempo" depois |
| **1 – MVP (até o 2º turno, 25/10)** | Dashboard em tempo real BR/UF/município | Coletor completo, normalizador, Postgres/Timescale, API, WebSocket, frontend com placar, mapa, evolução, slider de tempo e painéis salvos localmente |
| **2 – Zona, local e seção** | Drill-down profundo | EA16/EA18 + decodificação de BU, base de locais de votação (Dados Abertos), widget de local/seção, reconciliação |
| **3 – Personalização avançada** | Produto "seu" | Contas, painéis no servidor, alertas, modo TV, templates, exportações |
| **4 – Pós-eleição** | Análise | Carga dos CSVs dos Dados Abertos e comparativos 2022 × 2026 |

## 7.2 Validações pendentes (fazer assim que o ambiente oficial abrir)

1. Confirmar a base oficial `https://resultados.tse.jus.br/oficial` e o
   ciclo `ele2026` no catálogo.
2. Confirmar os códigos de eleição oficiais (fontes citam **6257** federal e
   **6259** estadual, pleito **3220**). O código só deve ser lido do
   catálogo.
3. Confirmar se o arquivo **por zona** (`<uf><mun>-z<zona>-c..-u`) existe no
   oficial e com que frequência é atualizado.
4. Confirmar as **chaves públicas JWS** diretamente no "Manual de verificação
   dos arquivos JWS" do TSE e testar a chave oficial contra um arquivo real.
5. Baixar as especificações oficiais (PDF/MD) de EA11, EA12, EA14, EA15,
   EA16, EA18 e EA20 e completar o dicionário de campos (`md`, `tf`, `and`,
   `agr.tp`, `vb`, `vn`).
6. Confirmar o caminho de `arquivo-urna` em 2026 (template `aux` do catálogo),
   o formato do EA16 e a versão 2026 do `bu.asn1`.
7. Confirmar a política de acesso: o limite de 100 req/s é **por IP**? É
   permitido usar múltiplos IPs? Ler os termos nas "Instruções para download".
8. Verificar se o conjunto "Eleitorado – local de votação 2026" já está
   publicado nos Dados Abertos.

## 7.3 Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| Bloqueio de IP pelo TSE (excesso de req/s ou de 404) | Sistema cego por 10+ min | Token bucket com folga, sem URLs especulativas, circuit breaker, standby em outro IP |
| Formato muda entre simulado e oficial ou entre turnos | Parser quebra na hora crítica | Parser tolerante (campos opcionais), testes de contrato, armazenamento bruto para reprocessar, alarme em erro de parse |
| Volume de seções inviável dentro do limite | Nível seção incompleto durante a noite | Coleta sob demanda + prioridade, comunicar a cobertura ao usuário, completar com Dados Abertos depois |
| Pico de acesso no próprio sistema | Lentidão | Fan-out via WebSocket/SSE, CDN com cache de 2–5 s, estado em Redis |
| Interpretação errada (ex.: % sobre válidos × total) | Informação incorreta | Usar sempre os percentuais do TSE (`pvapn`) e rotular claramente |
| Projeções confundidas com resultado | Desinformação | Projeções desligadas por padrão e rotuladas como "estimativa" |
| Prazo (eleição amanhã) | Perder os dados do 1º turno | Fase 0 imediata: só capturar e guardar |

## 7.4 Decisões que dependem do dono do projeto

- Rodar só para uso pessoal ou abrir ao público? Isso muda escala, custo e
  cuidados legais.
- Nível seção "ao vivo" é obrigatório na v1 ou pode entrar depois?
- Hospedagem: VPS única (mais simples) ou cloud gerenciada?
- Stack: TypeScript ponta a ponta (sugerido) ou backend em Python/Go?
