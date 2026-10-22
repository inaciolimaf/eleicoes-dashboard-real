# 12. Backend num container só

Hoje a produção sobe 7 containers: `db`, `redis`, `api`, `collector`, `worker-1`, `worker-2` e `web`.
`api`, `collector` e os dois workers são **a mesma imagem** com `command` diferente, e cada um abre
seu próprio pool de conexões, seu cliente Redis e sua cópia do código em memória. Esta spec junta
os três papéis num único serviço `backend`: a API passa a rodar o coletor e o worker como tarefas
de fundo do próprio processo. A produção cai para 4 containers (`db`, `redis`, `backend`, `web`).

Esta spec **altera a spec 05** (§5.3 e §5.4 descrevem coletor e worker como processos separados) e
**a spec 10** (§10.1, tabela de serviços e ordem de subida).

## Decisões

| Assunto | Decisão |
|---|---|
| Onde roda o coletor | Tarefa de fundo no `lifespan` da API (`Collector.run()`) |
| Onde roda o worker | `WORKER_CONCORRENCIA` consumidores da fila no `lifespan` da API |
| Processos | Continua `uvicorn --workers 2`: cada processo sobe coletor e consumidores |
| Coletor duplicado | Não acontece: só o líder (lock `collector:leader` no Redis) coleta; o outro processo espera (spec 05 §5.3 item 8) |
| Fila | Continua no Redis: os consumidores dos 2 processos dividem a fila como os 2 workers de hoje |
| Separar de novo | Variáveis `RODAR_COLETOR` e `RODAR_WORKER` (padrão `true`). Com `false`, o processo só serve a API, e um serviço extra da mesma imagem pode rodar o papel à parte |
| Entrypoints atuais | `python -m app.collector.main` e `python -m app.worker.main` continuam existindo (usados pela saída de emergência acima e nos testes) |
| Migrations | Sem mudança: o `entrypoint-api.sh` já migra com `MIGRAR_AO_SUBIR=true` |
| Mock do TSE | `tse-fake` continua um container à parte, só no `docker-compose.yml` local |
| Frontend | `web` (nginx) continua separado: servir estático pelo uvicorn gastaria o mesmo event loop da API |

## 1. Inicialização e parada

```python
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    hub = Hub(get_redis()); hub.start()
    background = start_background(get_settings())   # coletor e/ou consumidores, conforme as variáveis
    yield
    await stop_background(background)               # cancela e espera, com teto de 5 s
    await hub.stop()
```

- `start_background` fica em `app/core/background.py` e só cria tasks (`asyncio.create_task`); não
  bloqueia o `startup`. O `/health` responde assim que o uvicorn sobe, como hoje.
- Uma task que morre com exceção é logada (`background.task_failed`) e **recriada** após 5 s. Hoje
  quem faz isso é o `restart: unless-stopped` do container; dentro do processo, ninguém faria.
- No SIGTERM, o uvicorn chama o fim do `lifespan`: as tasks são canceladas, o lock de líder deixa de
  ser renovado e expira em até 30 s, e o outro processo (ou o próximo deploy) assume.

## 2. Liderança do coletor

Com dois processos no mesmo container disputando o lock, a renovação atual é insegura:
`_renew_leadership` faz `SET collector:leader <id> EX 30` **sem conferir o dono**. Se o líder travar
por mais de 30 s (GC, event loop ocupado com ingestão), o outro processo assume e o antigo, ao
voltar, sobrescreve o lock: **os dois coletam**, o tráfego ao TSE dobra e passa de 100 req/s, e o
TSE bloqueia o IP por 10 min (spec 02).

- A renovação passa a ser compare-and-set (script Lua: renova só se o valor for o próprio id).
- Se a renovação falhar, o coletor **para** (cancela os próprios loops) e volta a
  `_wait_for_leadership`.

## 3. Contenção entre API e processamento

Coletor, worker e API dividem o mesmo event loop por processo. A ingestão (decodificar BU em ASN.1,
upsert de snapshot) é CPU e trava as requisições enquanto roda.

- A decodificação de BU e o parse de JSONs grandes (deputados por UF) passam a rodar em
  `asyncio.to_thread`, para o loop continuar atendendo enquanto o trabalho pesado roda.
- `WORKER_CONCORRENCIA` continua 6 por processo: 2 processos × 6 = os mesmos 12 consumidores dos 2
  workers de hoje. Se a API ficar lenta (§5), é o primeiro número a baixar.
- Freio de fila (`FILA_MAX`) continua igual.

## 4. Compose

**`docker-compose.coolify.yml`**: some `collector`, `worker-1` e `worker-2`; `api` vira `backend`
e herda o volume `brutos`. O `web` passa a depender de `backend`, e o `nginx.conf` aponta para
`http://backend:8000`.

**`docker-compose.yml`** (local): some `collector`, `worker` e `migrate`. O `backend` migra pelo
entrypoint, como na produção, e o compose local passa a ter 5 containers (`db`, `redis`,
`tse-fake`, `backend`, `web`).

**Variáveis**: `RODAR_COLETOR` e `RODAR_WORKER` são novas, com padrão seguro (`true`): nada a
configurar no Coolify. Nenhuma variável existente muda de nome.

## 5. Riscos

| Risco | Como aparece | Resposta |
|---|---|---|
| API lenta no pico da apuração | p95 de `/api/v1/results` sobe junto com a fila | §3; se não bastar, `RODAR_WORKER=false` no `backend` e um serviço `worker` à parte |
| Um processo do uvicorn morre | Coletor e consumidores desse processo param junto | O uvicorn recria o processo; o lock expira e o outro processo assume a coleta |
| Memória num container só | Pico de RAM somado dos 4 containers num limite só | Medir no simulador (`make fake-velocidade v=20`) antes de ir para produção |

## 6. Testes (garantias)

| Regra | Garantia |
|---|---|
| Só um coletor coleta | Teste de integração: dois `Collector` com o mesmo Redis, o líder trava 31 s (relógio falso), o outro assume, o antigo **não** recupera o lock |
| Task de fundo que morre volta | Teste unitário de `start_background` com uma task que lança na 1ª vez |
| `RODAR_COLETOR=false` não coleta | Teste do `lifespan`: nenhuma task de coletor criada |
| Parada limpa | Teste do `lifespan`: o fim do contexto cancela tudo em menos de 5 s |
| API responde durante ingestão | Teste de carga (`backend/tools/rate_probe.py`) com o simulador acelerado: p95 de `/health` abaixo de 200 ms |

## 7. Ordem de entrega

1. Liderança com compare-and-set (§2), que já corrige um problema de hoje e vale sozinho.
2. `app/core/background.py` + `lifespan` + variáveis, com os testes de §6.
3. `asyncio.to_thread` na ingestão pesada (§3).
4. Compose local, compose do Coolify, `nginx.conf`, specs 05 e 10, `docs/system/`.
