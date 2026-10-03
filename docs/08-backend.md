# 8. Backend: FastAPI + SQLAlchemy + Alembic

> **Implementação:** o código está em `backend/`. A estrutura real é a desta seção, com as simplificações
> descritas no doc 05 (sem PostGIS/Timescale/MinIO/arq). O coletor está em `app/collector/coletor.py`, o
> worker em `app/worker/jobs.py`, os payloads da API em `app/services/resultados.py` e o mock do TSE em
> `backend/tse_fake/`. Os testes ficam em `backend/tests` (unit, integration, api), com 61 casos, incluindo um
> fluxo completo mock → coletor → worker → banco → API.

## 8.1 Estrutura do projeto

```
backend/
├── pyproject.toml              # deps + config de ruff, mypy e pytest
├── alembic.ini
├── alembic/
│   ├── env.py                  # async, usa Base.metadata
│   └── versions/               # migrações (uma por mudança de schema)
├── app/
│   ├── main.py                 # cria o FastAPI, routers, middlewares e lifespan
│   ├── core/
│   │   ├── config.py           # Settings (pydantic-settings, lidas de env)
│   │   ├── db.py               # engine async, async_sessionmaker, get_session()
│   │   ├── redis.py
│   │   ├── security.py         # hash de senha (argon2), JWT
│   │   └── logging.py
│   ├── models/                 # SQLAlchemy 2.0 (Mapped[...], mapped_column)
│   │   ├── base.py             # DeclarativeBase, naming convention, mixins de timestamp
│   │   ├── eleicao.py          # Eleicao, Cargo, EleicaoCargo
│   │   ├── geografia.py        # UF, Municipio, Zona, LocalVotacao, Secao (com geometrias PostGIS)
│   │   ├── candidatura.py      # Partido, Agremiacao, Candidato
│   │   ├── snapshot.py         # SnapshotResultado, SnapshotCandidato, SnapshotAgremiacao, SnapshotProgresso
│   │   ├── boletim.py          # BoletimUrna, BoletimVoto
│   │   ├── evento.py           # Evento
│   │   ├── coleta.py           # ArquivoColetado (url, etag, idg, status, jws_ok)
│   │   └── usuario.py          # Usuario, Painel, Favorito, Alerta, Preferencia, Compartilhamento
│   ├── schemas/                # Pydantic (entrada/saída da API)
│   ├── repositories/           # queries montadas com select()/insert().on_conflict_do_update()
│   ├── services/               # regras: resultados no tempo T, mapas, busca, painéis, alertas
│   ├── api/
│   │   ├── deps.py             # sessão, usuário atual, paginação
│   │   └── v1/                 # routers: eleicoes, resultados, recortes, mapas, geo, busca,
│   │                           #          locais, secoes, candidatos, eventos, export,
│   │                           #          auth, paineis, favoritos, alertas, admin, ws
│   ├── tse/                    # integração TSE (sem dependência de banco)
│   │   ├── catalogo.py         # parser EA11 + resolução eleição/cargo + templates arq[]
│   │   ├── urls.py             # montagem de nomes de arquivo
│   │   ├── parsers.py          # EA12, EA14/15, EA16, EA18, EA20, EA10 → dataclasses normalizadas
│   │   ├── jws.py              # verificação Ed25519 + kid + alg
│   │   ├── chaves.py           # chaves públicas por ambiente
│   │   ├── bu.py               # decodificação ASN.1 do boletim de urna
│   │   └── numeros.py          # "63,15" → Decimal, datas BRT → UTC
│   ├── collector/
│   │   ├── scheduler.py        # filas de prioridade e intervalos adaptativos
│   │   ├── ratelimit.py        # token bucket no Redis
│   │   ├── fetcher.py          # httpx + ETag + backoff + memória de 404
│   │   └── main.py             # entrypoint do container collector (lock de líder)
│   ├── worker/
│   │   ├── jobs.py             # processar_arquivo, processar_bu, reconciliar, avaliar_alertas
│   │   ├── eventos.py          # detecção de virada, marcos, eleito
│   │   └── main.py             # entrypoint arq
│   ├── realtime/
│   │   ├── hub.py              # gerencia conexões WS, tópicos e fan-out via Redis pub/sub
│   │   └── protocolo.py        # mensagens sub/unsub/resume/diff
│   └── cli.py                  # seed de geodados, import de Dados Abertos, replay
├── tse_fake/                   # app FastAPI mínima que serve snapshots gravados
└── tests/                      # ver 8.5
```

## 8.2 Modelos (SQLAlchemy 2.0)

- Estilo **declarativo tipado** (`Mapped[int]`, `mapped_column(...)`),
  `DeclarativeBase` com `MetaData(naming_convention=...)`, para o Alembic
  gerar nomes de constraint estáveis.
- **Todas as queries são montadas com a API do SQLAlchemy** (`select`,
  `insert(...).on_conflict_do_update`, `func`, `over()` para window
  functions). Não há SQL cru espalhado no código. As exceções (ex.:
  `create_hypertable`) ficam só nas migrações.
- Geometrias com **GeoAlchemy2** (`Geometry("MULTIPOLYGON", 4326)`,
  `Geometry("POINT", 4326)`).
- Sessão async (`AsyncSession`) por request via dependência `get_session`.
- Tabelas e colunas: ver [doc 06](06-modelo-de-dados.md).

Exemplo do padrão:

```python
class SnapshotResultado(Base):
    __tablename__ = "snapshot_resultado"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    eleicao_id: Mapped[int] = mapped_column(ForeignKey("eleicao.id"))
    cd_cargo: Mapped[int] = mapped_column(SmallInteger)
    nivel: Mapped[Nivel] = mapped_column(Enum(Nivel, name="nivel"))
    recorte_id: Mapped[str] = mapped_column(String(32))
    idg: Mapped[int] = mapped_column(BigInteger)
    totalizado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    votos_validos: Mapped[int]
    # ...
    candidatos: Mapped[list["SnapshotCandidato"]] = relationship(back_populates="snapshot")
    __table_args__ = (UniqueConstraint("eleicao_id", "cd_cargo", "nivel", "recorte_id", "idg"),)
```

Consulta "estado no instante T" (repositório):

```python
stmt = (
    select(SnapshotResultado)
    .where(
        SnapshotResultado.eleicao_id == eleicao_id,
        SnapshotResultado.cd_cargo == cargo,
        SnapshotResultado.nivel == nivel,
        SnapshotResultado.totalizado_em <= t,
    )
    .order_by(SnapshotResultado.recorte_id,
              SnapshotResultado.totalizado_em.desc(),
              SnapshotResultado.idg.desc())
    .distinct(SnapshotResultado.recorte_id)
)
```

## 8.3 Migrações (Alembic)

- `alembic/env.py` em modo async, com `target_metadata = Base.metadata`.
- Migração inicial: extensões (`timescaledb`, `postgis`, `pg_trgm` para a
  busca), tabelas, `create_hypertable` para `snapshot_*` e
  `boletim_voto`, políticas de compressão e índices GIN trigram para a busca.
- Toda mudança de modelo vem com uma migração revisada (autogenerate +
  revisão manual). A CI checa se `alembic check` não acusa diferenças.
- O container `migrate` roda `alembic upgrade head` antes de `api`,
  `collector` e `worker` subirem.

## 8.4 Regras de domínio importantes

- **Situação do candidato** (`services/situacao.py`): mapeia `e`, `st`, `md`
  e `dvt` do TSE para o enum `ELEITO | SEGUNDO_TURNO | MATEMATICAMENTE_ELEITO
  | LIDERANDO | SUPLENTE | NAO_ELEITO | SUB_JUDICE | EM_APURACAO`. Só
  `LIDERANDO` é calculado por nós. Senador usa 2 vagas em 2026 (lidas do
  arquivo ou da config da eleição).
- **Votos válidos**: sempre o `v.vv` do TSE nos níveis com EA20. Nos níveis
  local e seção, é a soma de nominais + legenda dos BUs, e a resposta da API
  traz `fonte: "tse" | "soma_bu"` e `cobertura`.
- **Vencedor de um recorte** para o mapa: maior `vap` no recorte. Empate é
  marcado como `empate`. Recorte sem votos fica `sem_dados`.
- **Status de apuração do local**: `nao_recebido` (0 seções), `parcial` e
  `apurado` (todas as seções do local com BU totalizado).

## 8.5 Testes (somente backend)

O projeto **só tem testes automatizados no backend**. Ferramentas:

| Ferramenta | Uso |
|---|---|
| `pytest` + `pytest-asyncio` | Base |
| `httpx.AsyncClient` + `ASGITransport` | Testes da API sem subir servidor |
| `respx` | Mock das chamadas HTTP ao TSE no coletor |
| `testcontainers` (Postgres Timescale+PostGIS, Redis) **ou** o serviço `db-test` do compose | Banco real nos testes de integração |
| `factory-boy` / fábricas próprias | Dados de teste |
| `freezegun` / `time-machine` | Tempo controlado (replay, intervalos) |
| `pytest-cov` | Cobertura (mínimo 85% em `app/tse`, `app/services`, `app/api`) |
| `hypothesis` | Propriedades do parser de números e das somas |

Organização:

```
tests/
├── conftest.py                 # engine de teste, migra com Alembic, sessão com rollback por teste
├── fixtures/tse/               # arquivos reais: ele-c (simulado 2026), EA20, EA14, EA16, EA18, .bu, .jws
├── unit/
│   ├── tse/test_catalogo.py     # resolve eleição pelo cargo (abr.cd sempre "br"), cdt2, templates arq[]
│   ├── tse/test_urls.py         # br/uf/município/zona, padding c0001 e e021270
│   ├── tse/test_parsers.py      # strings → números, vírgula decimal, campos ausentes
│   ├── tse/test_jws.py          # assinatura válida, 1 byte alterado, kid errado, alg errado
│   ├── tse/test_bu.py           # decodifica BU real, extrai município/zona/local/seção/votos
│   ├── services/test_situacao.py      # cada combinação e/st/md/dvt → selo correto
│   ├── services/test_vencedor.py      # líder, margem p.p., empate, sem dados
│   ├── services/test_eventos.py       # virada, marcos 10/25/50..., eleito
│   └── collector/test_ratelimit.py    # nunca passa do teto, 304 consome token
├── integration/
│   ├── test_migrations.py       # upgrade head → downgrade base → upgrade head; alembic check vazio
│   ├── test_ingestao.py         # arquivo EA20 → snapshot + candidatos + evento
│   ├── test_tempo_t.py          # estado no instante T com vários snapshots
│   ├── test_local_votacao.py    # BUs → agregado do local, cobertura, status
│   ├── test_collector.py        # com respx: ETag/304, sem re-tentar 404, backoff em 5xx
│   └── test_reconciliacao.py
├── api/
│   ├── test_resultados.py       # bloco de votos válidos + selos em todos os níveis
│   ├── test_mapas.py            # vencedores/desempenho/progresso/locais retornam o formato correto
│   ├── test_busca.py
│   ├── test_paineis.py          # CRUD, compartilhar, import/export JSON, permissões
│   ├── test_auth.py
│   └── test_ws.py               # sub/unsub, recebe diff após ingestão, resume com seq
└── e2e/
    └── test_replay.py           # tse-fake + collector + worker + api: replay de uma noite em velocidade alta
```

Execução:
- `docker compose -f docker-compose.yml -f docker-compose.test.yml run --rm api-test`
  (ou `make test`).
- A CI roda `ruff`, `mypy`, `alembic check` e `pytest --cov`, nessa ordem.

## 8.6 Configuração (variáveis de ambiente)

| Variável | Exemplo |
|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://eleicoes:eleicoes@db:5432/eleicoes` |
| `REDIS_URL` | `redis://redis:6379/0` |
| `S3_ENDPOINT` / `S3_BUCKET` / chaves | `http://minio:9000`, `tse-brutos` |
| `TSE_AMBIENTE` | `oficial` \| `simulado` \| `fake` |
| `TSE_BASE_URL` | `https://resultados.tse.jus.br/oficial` (ou `http://tse-fake:8080/oficial`) |
| `TSE_MAX_RPS` | `60` |
| `TSE_VERIFICAR_JWS` | `true` |
| `COLETAR_SECOES` | `true` |
| `JWT_SECRET`, `JWT_EXPIRA_MIN` | — |
| `CORS_ORIGINS` | `http://localhost:5173` |
