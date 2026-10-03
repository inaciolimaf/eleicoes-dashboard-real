"""Geração determinística de um cenário eleitoral sintético sobre os municípios reais do Brasil.

Tudo é fictício (candidatos, partidos, votos, locais). A geografia (municípios, posições) é real para que os
mapas façam sentido. O cenário é pensado para "ter história": candidatos com força regional diferente e
regiões que apuram em ritmos diferentes, o que produz viradas durante a noite.
"""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from tse_fake.dados import (
    APELIDOS,
    BAIRROS,
    CAPITAIS,
    HOMENAGEADOS,
    LOGRADOUROS,
    NUMEROS_FEDERACAO,
    PARTIDOS,
    PRIMEIROS,
    SOBRENOMES,
    TIPOS_LOCAL,
    UFS,
    vagas_estaduais,
)

ARQ_MUNICIPIOS = Path(__file__).resolve().parent.parent / "app" / "data" / "municipios.json"

PLEITO = 9001
ELEICAO_FEDERAL = 9100
ELEICAO_ESTADUAL = 9102
CICLO = "ele2026"


@dataclass
class Partido:
    numero: int
    sigla: str
    nome: str
    agremiacao: str
    agremiacao_numero: str
    tipo: str  # i (isolado) | f (federação)


@dataclass
class Candidato:
    sqcand: str
    numero: int
    nome: str
    nome_urna: str
    partido: Partido
    vices: list[tuple[str, str]] = field(default_factory=list)  # (tipo, nome)


@dataclass
class CargoUF:
    """Votos de um cargo em uma abrangência (br para Presidente, uma UF para os demais)."""

    cd: int
    uf: str  # "br" ou sigla
    eleicao: int
    sistema: str
    vagas: int
    votos_por_eleitor: int
    a: int  # índice global da primeira seção
    b: int
    candidatos: list[Candidato]
    votos: np.ndarray  # (b-a, ncand) int32
    brancos: np.ndarray
    nulos: np.ndarray
    partidos: list[Partido] = field(default_factory=list)
    legenda: np.ndarray | None = None  # (b-a, npartidos)


@dataclass
class Municipio:
    idx: int
    uf: str
    cd: int
    ibge: int
    nome: str
    capital: bool
    lat: float
    lon: float
    regiao: str
    a: int = 0
    b: int = 0
    zonas: list[int] = field(default_factory=list)


@dataclass
class Zona:
    idx: int
    uf: str
    numero: int
    municipio: int
    a: int = 0
    b: int = 0


@dataclass
class Local:
    idx: int
    zona: int
    numero: int
    nome: str
    endereco: str
    bairro: str
    cep: str
    lat: float | None
    lon: float | None
    a: int = 0
    b: int = 0


class Cenario:
    def __init__(self, semente: int = 2026, escala: float = 1.0):
        self.semente = semente
        self.rng = np.random.default_rng(semente)
        self.escala = escala
        self.municipios: list[Municipio] = []
        self.zonas: list[Zona] = []
        self.locais: list[Local] = []
        self.ufs: list[str] = sorted(UFS)
        self.faixa_uf: dict[str, tuple[int, int]] = {}
        self.cargos: dict[tuple[int, str], CargoUF] = {}
        self._gerar_geografia()
        self._gerar_tempos()
        self._gerar_votos()

    # ------------------------------------------------------------------ geografia
    def _gerar_geografia(self) -> None:
        rng = self.rng
        bruto = json.loads(ARQ_MUNICIPIOS.read_text(encoding="utf-8"))
        bruto.sort(key=lambda m: (m["uf"].lower(), m["nome"]))
        sec_uf: list[int] = []
        sec_mun: list[int] = []
        sec_zona: list[int] = []
        sec_local: list[int] = []
        sec_num: list[int] = []
        sec_aptos: list[int] = []
        sec_lat: list[float] = []
        sec_lon: list[float] = []
        self._aneis: dict[int, list] = {}
        uf_idx = {u: i for i, u in enumerate(self.ufs)}
        prox_zona: dict[str, int] = {}
        for m in bruto:
            uf = m["uf"].lower()
            capital = m["ibge"] in CAPITAIS
            mun = Municipio(
                idx=len(self.municipios), uf=uf, cd=m["ibge"] % 100000, ibge=m["ibge"], nome=m["nome"].upper(),
                capital=capital, lat=m["lat"], lon=m["lon"], regiao=UFS[uf][1],
            )
            self._aneis[mun.idx] = m["aneis"]
            # porte do município -> quantidade de seções
            if capital:
                n = int(rng.lognormal(math.log(380), 0.45) * (1.6 if uf in ("sp", "rj") else 1.0))
            else:
                n = int(rng.lognormal(math.log(5.5), 0.95))
            n = max(1, int(round(n * self.escala)))
            mun.a = len(sec_num)
            nz = max(1, min(40, math.ceil(n / 140)))
            por_zona = np.array_split(np.arange(n), nz)
            for parte in por_zona:
                if len(parte) == 0:
                    continue
                numero_zona = prox_zona.get(uf, 0) + 1
                prox_zona[uf] = numero_zona
                z = Zona(idx=len(self.zonas), uf=uf, numero=numero_zona, municipio=mun.idx, a=len(sec_num))
                self.zonas.append(z)
                mun.zonas.append(z.idx)
                restantes = len(parte)
                k = 0
                numero_secao = 1
                while restantes > 0:
                    tam = min(restantes, int(rng.integers(2, 11)))
                    lat, lon, aprox = self._ponto_local(mun, rng)
                    loc = Local(
                        idx=len(self.locais), zona=z.idx, numero=1015 + 8 * k, nome=self._nome_local(rng),
                        endereco=f"{rng.choice(LOGRADOUROS)} {rng.choice(HOMENAGEADOS)}, {int(rng.integers(1, 3000))}",
                        bairro=str(rng.choice(BAIRROS)) if not capital else f"{rng.choice(BAIRROS)} {int(rng.integers(1, 9))}",
                        cep=f"{int(rng.integers(10000, 99999))}-{int(rng.integers(0, 999)):03d}",
                        lat=None if aprox else lat, lon=None if aprox else lon, a=len(sec_num),
                    )
                    for _ in range(tam):
                        sec_uf.append(uf_idx[uf])
                        sec_mun.append(mun.idx)
                        sec_zona.append(z.idx)
                        sec_local.append(loc.idx)
                        sec_num.append(numero_secao)
                        numero_secao += 1 + int(rng.integers(0, 3) == 0)
                        sec_aptos.append(int(rng.integers(170, 400)))
                        sec_lat.append(lat)
                        sec_lon.append(lon)
                    loc.b = len(sec_num)
                    self.locais.append(loc)
                    restantes -= tam
                    k += 1
                z.b = len(sec_num)
            mun.b = len(sec_num)
            self.municipios.append(mun)
        self.sec_uf = np.array(sec_uf, dtype=np.int16)
        self.sec_mun = np.array(sec_mun, dtype=np.int32)
        self.sec_zona = np.array(sec_zona, dtype=np.int32)
        self.sec_local = np.array(sec_local, dtype=np.int32)
        self.sec_num = np.array(sec_num, dtype=np.int32)
        self.sec_aptos = np.array(sec_aptos, dtype=np.int32)
        self.sec_lat = np.array(sec_lat, dtype=np.float64)
        self.sec_lon = np.array(sec_lon, dtype=np.float64)
        self.n = len(sec_num)
        for uf in self.ufs:
            idx = np.nonzero(self.sec_uf == uf_idx[uf])[0]
            self.faixa_uf[uf] = (int(idx[0]), int(idx[-1]) + 1)
        # comparecimento
        taxa_mun = np.clip(rng.normal(0.80, 0.045, len(self.municipios)), 0.6, 0.93)
        taxa = np.clip(taxa_mun[self.sec_mun] + rng.normal(0, 0.02, self.n), 0.5, 0.97)
        self.sec_comp = rng.binomial(self.sec_aptos, taxa).astype(np.int32)

    def _nome_local(self, rng: np.random.Generator) -> str:
        return f"{rng.choice(TIPOS_LOCAL)} {rng.choice(HOMENAGEADOS)}"

    def _ponto_local(self, mun: Municipio, rng: np.random.Generator) -> tuple[float, float, bool]:
        aprox = rng.random() < 0.03
        aneis = self._aneis.get(mun.idx) or []
        anel = max(aneis, key=len) if aneis else None
        if anel:
            xs = [p[0] for p in anel]
            ys = [p[1] for p in anel]
            minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
            for _ in range(30):
                if mun.capital or rng.random() < 0.6:
                    sx = max((maxx - minx) * 0.12, 0.004)
                    sy = max((maxy - miny) * 0.12, 0.004)
                    x = float(rng.normal(mun.lon, sx))
                    y = float(rng.normal(mun.lat, sy))
                else:
                    x = float(rng.uniform(minx, maxx))
                    y = float(rng.uniform(miny, maxy))
                if _dentro(x, y, anel):
                    return round(y, 5), round(x, 5), aprox
        return round(mun.lat + float(rng.normal(0, 0.005)), 5), round(mun.lon + float(rng.normal(0, 0.005)), 5), aprox

    # ------------------------------------------------------------------ tempos de totalização
    def _gerar_tempos(self) -> None:
        """Minutos após 17h (Brasília) em que cada seção é totalizada."""
        rng = self.rng
        mediana_regiao = {"Sudeste": 32.0, "Sul": 30.0, "Centro-Oeste": 42.0, "Nordeste": 62.0, "Norte": 85.0}
        med_mun = np.array([mediana_regiao[m.regiao] * (0.75 if m.capital else 1.0) * float(rng.lognormal(0, 0.25))
                            for m in self.municipios])
        t = rng.lognormal(np.log(med_mun[self.sec_mun]), 0.55)
        atrasadas = rng.random(self.n) < 0.004
        t[atrasadas] = rng.uniform(200, 380, int(atrasadas.sum()))
        self.sec_t = np.clip(t, 0.4, 390.0) * 60.0  # segundos

    # ------------------------------------------------------------------ candidatos e votos
    def _nome(self, rng: np.random.Generator, usados: set[str]) -> tuple[str, str]:
        for _ in range(100):
            p = str(rng.choice(PRIMEIROS))
            s1, s2 = (str(x) for x in rng.choice(SOBRENOMES, 2, replace=False))
            nome = f"{p} {s1} {s2}"
            if rng.random() < 0.25:
                urna = f"{p} {rng.choice(APELIDOS)}"
            else:
                urna = f"{p} {s2}"
            if urna not in usados:
                usados.add(urna)
                return nome, urna
        return nome, f"{urna} {len(usados)}"

    def _sq(self, cd: int, uf: str, i: int) -> str:
        h = int(hashlib.sha1(f"{self.semente}:{cd}:{uf}:{i}".encode()).hexdigest()[:8], 16)
        return str(280000000000 + h % 100000000)

    def _partidos(self) -> list[Partido]:
        out = []
        for numero, sigla, nome, fed in PARTIDOS:
            if fed:
                out.append(Partido(numero, sigla, nome, fed, NUMEROS_FEDERACAO[fed], "f"))
            else:
                out.append(Partido(numero, sigla, nome, nome, str(numero), "i"))
        return out

    def _campo(self, rng: np.random.Generator, lat: np.ndarray, lon: np.ndarray, centros: int, escala: float) -> np.ndarray:
        """Campo espacial suave (soma de gaussianas) para dar 'redutos' regionais."""
        v = np.zeros_like(lat)
        for _ in range(centros):
            k = int(rng.integers(0, len(lat)))
            cy, cx = lat[k], lon[k]
            sig = float(rng.uniform(1.0, 4.0)) * escala
            amp = float(rng.normal(0, 0.8))
            v += amp * np.exp(-(((lat - cy) ** 2 + (lon - cx) ** 2) / (2 * sig**2)))
        return v

    def _distribuir(self, rng: np.random.Generator, util: np.ndarray, validos: np.ndarray) -> np.ndarray:
        p = np.exp(util - util.max(axis=1, keepdims=True))
        p /= p.sum(axis=1, keepdims=True)
        return rng.multinomial(validos.astype(np.int64), p).astype(np.int32)

    def _gerar_votos(self) -> None:
        rng = np.random.default_rng(self.semente + 1)
        partidos = self._partidos()
        self.partidos = partidos
        regiao_sec = np.array([self.municipios[m].regiao for m in range(len(self.municipios))])[self.sec_mun]
        ruido_mun = rng.normal(0, 1, (len(self.municipios), 12))

        # ---------------- Presidente: disputa apertada com força regional oposta (gera virada)
        usados: set[str] = set()
        perfil = [  # (base, bônus por região)
            (1.30, {"Nordeste": 0.75, "Norte": 0.35, "Sudeste": -0.15, "Sul": -0.45, "Centro-Oeste": -0.35}),
            (1.28, {"Nordeste": -0.55, "Norte": 0.05, "Sudeste": 0.12, "Sul": 0.45, "Centro-Oeste": 0.40}),
            (-0.35, {"Sudeste": 0.25, "Sul": 0.10}),
            (-0.75, {"Nordeste": 0.20}),
            (-1.25, {"Sul": 0.30}),
            (-1.70, {}),
            (-2.20, {"Norte": 0.40}),
            (-2.60, {}),
        ]
        ordem_partidos = [0, 2, 5, 6, 7, 8, 9, 10]
        cands = []
        util = np.zeros((self.n, len(perfil)))
        for i, (base, bonus) in enumerate(perfil):
            par = partidos[ordem_partidos[i]]
            nome, urna = self._nome(rng, usados)
            vice_nome, vice_urna = self._nome(rng, usados)
            cands.append(Candidato(self._sq(1, "br", i), par.numero, nome, urna, par, [("v", vice_urna)]))
            u = np.full(self.n, base)
            for reg, b in bonus.items():
                u = u + np.where(regiao_sec == reg, b, 0.0)
            u = u + self._campo(rng, self.sec_lat, self.sec_lon, 6, 1.0) * 0.35
            u = u + ruido_mun[self.sec_mun, i] * 0.18 + rng.normal(0, 0.08, self.n)
            util[:, i] = u
        brancos, nulos, validos = self._brancos_nulos(rng, 0.018, 0.032)
        self.cargos[(1, "br")] = CargoUF(1, "br", ELEICAO_FEDERAL, "majoritario", 1, 1, 0, self.n, cands,
                                         self._distribuir(rng, util, validos), brancos, nulos)

        # ---------------- cargos estaduais
        for uf in self.ufs:
            a, b = self.faixa_uf[uf]
            lat, lon = self.sec_lat[a:b], self.sec_lon[a:b]
            n = b - a
            usados_uf: set[str] = set()
            # Governador
            ng = int(rng.integers(3, 7))
            bases = np.sort(rng.normal(0, 0.9, ng))[::-1]
            bases[0] += float(rng.uniform(0.0, 0.9))
            cands = []
            util = np.zeros((n, ng))
            escolhidos = rng.choice(len(partidos), ng, replace=False)
            for i in range(ng):
                par = partidos[int(escolhidos[i])]
                nome, urna = self._nome(rng, usados_uf)
                _, vice = self._nome(rng, usados_uf)
                cands.append(Candidato(self._sq(3, uf, i), par.numero, nome, urna, par, [("v", vice)]))
                util[:, i] = bases[i] + self._campo(rng, lat, lon, 3, 0.6) * 0.5 + rng.normal(0, 0.1, n)
            cands, util = self._numerar_unicos(cands, util)
            br_, nu_, va_ = self._brancos_nulos(rng, 0.03, 0.04, a, b)
            self.cargos[(3, uf)] = CargoUF(3, uf, ELEICAO_ESTADUAL, "majoritario", 1, 1, a, b, cands,
                                           self._distribuir(rng, util, va_), br_, nu_)
            # Senador (2 vagas em 2026: cada eleitor vota em 2)
            ns = int(rng.integers(5, 9))
            cands = []
            util = np.zeros((n, ns))
            bases = np.sort(rng.normal(0, 0.8, ns))[::-1]
            escolhidos = rng.choice(len(partidos), ns, replace=False)
            for i in range(ns):
                par = partidos[int(escolhidos[i])]
                nome, urna = self._nome(rng, usados_uf)
                _, s1 = self._nome(rng, usados_uf)
                _, s2 = self._nome(rng, usados_uf)
                num = par.numero * 10 + int(rng.integers(0, 10))
                cands.append(Candidato(self._sq(5, uf, i), num, nome, urna, par, [("s", s1), ("s", s2)]))
                util[:, i] = bases[i] + self._campo(rng, lat, lon, 3, 0.6) * 0.5 + rng.normal(0, 0.1, n)
            cands, util = self._numerar_unicos(cands, util)
            br_, nu_, va_ = self._brancos_nulos(rng, 0.06, 0.07, a, b)
            self.cargos[(5, uf)] = CargoUF(5, uf, ELEICAO_ESTADUAL, "majoritario", 2, 2, a, b, cands,
                                           self._distribuir(rng, util, va_ * 2), br_ * 2, nu_ * 2)
            # Proporcionais
            vagas_fed = UFS[uf][2]
            self._proporcional(rng, 6, uf, vagas_fed, 4, a, b, usados_uf)
            cd_est = 8 if uf == "df" else 7
            self._proporcional(rng, cd_est, uf, 24 if uf == "df" else vagas_estaduais(vagas_fed), 5, a, b, usados_uf)

    def _numerar_unicos(self, cands: list[Candidato], util: np.ndarray) -> tuple[list[Candidato], np.ndarray]:
        vistos: set[int] = set()
        manter = []
        for i, c in enumerate(cands):
            if c.numero not in vistos:
                vistos.add(c.numero)
                manter.append(i)
        return [cands[i] for i in manter], util[:, manter]

    def _brancos_nulos(self, rng, pb: float, pn: float, a: int = 0, b: int | None = None):
        comp = self.sec_comp[a:b]
        brancos = rng.binomial(comp, pb).astype(np.int32)
        nulos = rng.binomial(comp - brancos, pn).astype(np.int32)
        return brancos, nulos, (comp - brancos - nulos).astype(np.int32)

    def _proporcional(self, rng, cd: int, uf: str, vagas: int, digitos: int, a: int, b: int, usados: set[str]) -> None:
        n = b - a
        lat, lon = self.sec_lat[a:b], self.sec_lon[a:b]
        partidos = self.partidos
        forca = rng.normal(0, 0.7, len(partidos))
        util_partido = np.zeros((n, len(partidos)))
        for j in range(len(partidos)):
            util_partido[:, j] = forca[j] + self._campo(rng, lat, lon, 2, 0.6) * 0.4
        pp = np.exp(util_partido)
        pp /= pp.sum(axis=1, keepdims=True)
        total_cands = max(len(partidos) * 2, int(vagas * 1.4))
        peso_partido = np.exp(forca) / np.exp(forca).sum()
        por_partido = np.maximum(1, np.round(peso_partido * total_cands)).astype(int)
        cands: list[Candidato] = []
        colunas = []
        for j, par in enumerate(partidos):
            zipf = 1.0 / np.arange(1, por_partido[j] + 1) ** 1.05
            usados_num: set[int] = set()
            for k in range(por_partido[j]):
                while True:
                    num = par.numero * 10 ** (digitos - 2) + int(rng.integers(1, 10 ** (digitos - 2)))
                    if num not in usados_num:
                        usados_num.add(num)
                        break
                nome, urna = self._nome(rng, usados)
                c = Candidato(self._sq(cd, uf, len(cands)), num, nome, urna, par)
                cands.append(c)
                k_sec = int(rng.integers(0, n))
                d2 = (lat - lat[k_sec]) ** 2 + (lon - lon[k_sec]) ** 2
                reduto = 1.6 * np.exp(-d2 / (2 * float(rng.uniform(0.05, 0.6)) ** 2))
                colunas.append((j, np.log(zipf[k]) + reduto))
        brancos, nulos, validos = self._brancos_nulos(rng, 0.035, 0.055, a, b)
        legenda_frac = rng.uniform(0.03, 0.09, n)
        leg_total = rng.binomial(validos, legenda_frac).astype(np.int32)
        nominal = validos - leg_total
        util = np.zeros((n, len(cands)))
        # probabilidade do candidato = força do partido na seção × peso do candidato dentro do partido
        for j in range(len(partidos)):
            idx = [i for i, (jj, _) in enumerate(colunas) if jj == j]
            if not idx:
                continue
            bloco = np.exp(np.array([colunas[i][1] for i in idx]).T)
            bloco /= bloco.sum(axis=1, keepdims=True)
            util[:, idx] = np.log(pp[:, [j]] * bloco + 1e-12)
        votos = self._distribuir(rng, util, nominal)
        legenda = rng.multinomial(leg_total.astype(np.int64), pp).astype(np.int32)
        self.cargos[(cd, uf)] = CargoUF(cd, uf, ELEICAO_ESTADUAL, "proporcional", vagas, 1, a, b, cands, votos,
                                        brancos, nulos, partidos, legenda)

    # ------------------------------------------------------------------ utilidades
    def cargos_da_uf(self, uf: str) -> list[CargoUF]:
        return [c for (cd, u), c in self.cargos.items() if u == uf]

    def municipio_por_cd(self, uf: str, cd: int) -> Municipio | None:
        if not hasattr(self, "_mun_idx"):
            self._mun_idx = {(m.uf, m.cd): m for m in self.municipios}
        return self._mun_idx.get((uf, cd))


def _dentro(x: float, y: float, anel: list) -> bool:
    dentro = False
    j = len(anel) - 1
    for i in range(len(anel)):
        xi, yi = anel[i]
        xj, yj = anel[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-12) + xi:
            dentro = not dentro
        j = i
    return dentro
