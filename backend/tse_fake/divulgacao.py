"""Monta, para um instante simulado, os arquivos no mesmo formato da divulgação do TSE."""

from __future__ import annotations

import hashlib
from datetime import datetime, timedelta
from functools import lru_cache

import numpy as np

from app.tse.bu import VotoBU, codificar
from app.tse.numeros import BRT
from tse_fake.cenario import CICLO, ELEICAO_ESTADUAL, ELEICAO_FEDERAL, PLEITO, CargoUF, Cenario
from tse_fake.dados import UFS

PERIODO = 30.0  # segundos simulados entre rodadas de totalização
INICIO = datetime(2026, 10, 4, 17, 0, 0, tzinfo=BRT)
NOMES_CARGO = {1: "Presidente", 3: "Governador", 5: "Senador", 6: "Deputado Federal", 7: "Deputado Estadual",
               8: "Deputado Distrital"}


def pct2(parte: float, todo: float) -> str:
    return f"{(parte * 100.0 / todo) if todo else 0:.2f}".replace(".", ",")


def pctn(parte: float, todo: float) -> str:
    return f"{(parte * 100.0 / todo) if todo else 0:.9f}".rstrip("0").rstrip(",.").replace(".", ",") or "0"


def data_hora(seg: float) -> tuple[str, str]:
    dt = INICIO + timedelta(seconds=seg)
    return dt.strftime("%d/%m/%Y"), dt.strftime("%H:%M:%S")


class Divulgacao:
    def __init__(self, cenario: Cenario):
        self.c = cenario
        c = cenario
        # tempos ordenados por recorte (para saber a última mudança de cada arquivo)
        self._t_br = np.sort(c.sec_t)
        self._t_uf = {uf: np.sort(c.sec_t[a:b]) for uf, (a, b) in c.faixa_uf.items()}
        self._t_mun = [np.sort(c.sec_t[m.a:m.b]) for m in c.municipios]
        self._t_zona = [np.sort(c.sec_t[z.a:z.b]) for z in c.zonas]
        self._secao_idx: dict[tuple[str, int, int, int], int] = {}
        for i in range(c.n):
            m = c.municipios[int(c.sec_mun[i])]
            z = c.zonas[int(c.sec_zona[i])]
            self._secao_idx[(m.uf, m.cd, z.numero, int(c.sec_num[i]))] = i
        self._zona_idx = {(c.municipios[z.municipio].uf, c.municipios[z.municipio].cd, z.numero): z for z in c.zonas}
        self._cache_situacao: dict[tuple, tuple] = {}

    # ------------------------------------------------------------------ rodadas e idg
    @staticmethod
    def rodada(t: float) -> float:
        return np.floor(t / PERIODO) * PERIODO

    def ultima_mudanca(self, tempos: np.ndarray, t: float) -> float | None:
        k = int(np.searchsorted(tempos, t, side="right"))
        if k == 0:
            return None
        return float(np.ceil(tempos[k - 1] / PERIODO) * PERIODO)

    def idg(self, tempos: np.ndarray, t: float) -> tuple[str, float | None]:
        ult = self.ultima_mudanca(tempos, t)
        r = 0 if ult is None else int(ult / PERIODO) + 1
        # o arquivo muda também na rodada em que o último arquivo da abrangência é finalizado
        return str(170000000 + r), ult

    def tempos_recorte(self, uf: str, mun: int | None, zona: int | None) -> tuple[np.ndarray, int, int]:
        c = self.c
        if uf == "br":
            return self._t_br, 0, c.n
        if mun is None:
            a, b = c.faixa_uf[uf]
            return self._t_uf[uf], a, b
        m = c.municipio_por_cd(uf, mun)
        if m is None:
            raise KeyError("municipio")
        if zona is None:
            return self._t_mun[m.idx], m.a, m.b
        z = self._zona_idx.get((uf, mun, zona))
        if z is None:
            raise KeyError("zona")
        return self._t_zona[z.idx], z.a, z.b

    # ------------------------------------------------------------------ agregação
    def _somar(self, cargo: CargoUF, a: int, b: int, t: float) -> dict:
        c = self.c
        a2, b2 = max(a, cargo.a), min(b, cargo.b)
        mask = c.sec_t[a2:b2] <= t
        ra, rb = a2 - cargo.a, b2 - cargo.a
        votos = cargo.votos[ra:rb][mask].sum(axis=0).astype(np.int64)
        legenda = cargo.legenda[ra:rb][mask].sum(axis=0).astype(np.int64) if cargo.legenda is not None else None
        aptos = c.sec_aptos[a2:b2]
        comp = c.sec_comp[a2:b2]
        return {
            "votos": votos,
            "legenda": legenda,
            "brancos": int(cargo.brancos[ra:rb][mask].sum()),
            "nulos": int(cargo.nulos[ra:rb][mask].sum()),
            "ts": int(b2 - a2),
            "st": int(mask.sum()),
            "te": int(aptos.sum()),
            "est": int(aptos[mask].sum()),
            "c": int(comp[mask].sum()),
        }

    def situacao(self, cargo: CargoUF, t: float) -> tuple[dict[str, tuple[str, str]], dict[str, int], bool, bool]:
        """Situação global (na abrangência do cargo) de cada candidato no instante t."""
        rod = self.rodada(t)
        chave = (cargo.cd, cargo.uf, rod)
        if chave in self._cache_situacao:
            return self._cache_situacao[chave]
        s = self._somar(cargo, cargo.a, cargo.b, t)
        votos = s["votos"]
        final = s["st"] == s["ts"]
        restantes = int(self.c.sec_aptos[cargo.a:cargo.b][self.c.sec_t[cargo.a:cargo.b] > t].sum()) * cargo.votos_por_eleitor
        ordem = list(np.argsort(-votos, kind="stable"))
        sit: dict[str, tuple[str, str]] = {cand.sqcand: ("n", "") for cand in cargo.candidatos}
        vagas_agr: dict[str, int] = {}
        md = False
        validos = int(votos.sum())
        if cargo.sistema == "majoritario" and validos:
            if cargo.vagas == 1:
                lider = int(ordem[0])
                if final:
                    if votos[lider] * 2 > validos:
                        md = True
                        for i, cand in enumerate(cargo.candidatos):
                            sit[cand.sqcand] = ("s", "Eleito") if i == lider else ("n", "Não eleito")
                    else:
                        top2 = {int(ordem[0]), int(ordem[1])} if len(ordem) > 1 else {lider}
                        for i, cand in enumerate(cargo.candidatos):
                            sit[cand.sqcand] = ("n", "2º turno") if i in top2 else ("n", "Não eleito")
                elif votos[lider] * 2 > validos + restantes:
                    md = True
                    for i, cand in enumerate(cargo.candidatos):
                        sit[cand.sqcand] = ("s", "Eleito") if i == lider else ("n", "Não eleito")
            else:
                vagas = cargo.vagas
                definido = final or (len(ordem) > vagas and votos[ordem[vagas - 1]] > votos[ordem[vagas]] + restantes)
                if definido:
                    md = not final
                    eleitos = {int(x) for x in ordem[:vagas]}
                    for i, cand in enumerate(cargo.candidatos):
                        sit[cand.sqcand] = ("s", "Eleito") if i in eleitos else ("n", "Não eleito")
        elif cargo.sistema == "proporcional" and final and validos:
            vagas_agr, sit = self._proporcional(cargo, votos, s["legenda"])
        out = (sit, vagas_agr, md, final)
        self._cache_situacao[chave] = out
        return out

    def _proporcional(self, cargo: CargoUF, votos: np.ndarray, legenda: np.ndarray | None):
        agr_votos: dict[str, int] = {}
        agr_cands: dict[str, list[int]] = {}
        for i, cand in enumerate(cargo.candidatos):
            ag = cand.partido.agremiacao
            agr_votos[ag] = agr_votos.get(ag, 0) + int(votos[i])
            agr_cands.setdefault(ag, []).append(i)
        if legenda is not None:
            for j, par in enumerate(cargo.partidos):
                agr_votos[par.agremiacao] = agr_votos.get(par.agremiacao, 0) + int(legenda[j])
        total = sum(agr_votos.values())
        qe = max(1, round(total / cargo.vagas))
        vagas = {ag: 0 for ag in agr_votos}
        qp = {ag: v // qe for ag, v in agr_votos.items()}
        for ag in vagas:
            vagas[ag] = qp[ag]
        while sum(vagas.values()) < cargo.vagas:
            melhor = max(agr_votos, key=lambda ag: agr_votos[ag] / (vagas[ag] + 1))
            vagas[melhor] += 1
        sit: dict[str, tuple[str, str]] = {}
        for ag, idxs in agr_cands.items():
            idxs.sort(key=lambda i: -int(votos[i]))
            for pos, i in enumerate(idxs):
                sq = cargo.candidatos[i].sqcand
                if pos < qp[ag]:
                    sit[sq] = ("s", "Eleito por QP")
                elif pos < vagas[ag]:
                    sit[sq] = ("s", "Eleito por média")
                elif vagas[ag] > 0:
                    sit[sq] = ("n", "Suplente")
                else:
                    sit[sq] = ("n", "Não eleito")
        return vagas, sit

    # ------------------------------------------------------------------ arquivos
    def catalogo(self) -> dict:
        def cp(cd: int, tp: str) -> dict:
            return {"cd": str(cd), "ds": NOMES_CARGO[cd], "tp": tp}

        arq = [
            {"tp": "ft", "dir": "<base>/<ambiente>/<ciclo>/<cd_eleicao>/fotos/<uf>"},
            {"tp": "cm", "dir": "<base>/<ambiente>/<ciclo>/<cd_eleicao>/config"},
            {"tp": "e", "dir": "<base>/<ambiente>/<ciclo>/<cd_eleicao>/dados/<uf>"},
            {"tp": "cs", "dir": "<base>/<ambiente>/<ciclo>/arquivo-urna/<cd_pleito>/config/<uf>"},
            {"tp": "ab", "dir": "<base>/<ambiente>/<ciclo>/<cd_eleicao>/dados/<uf>"},
            {"tp": "u", "dir": "<base>/<ambiente>/<ciclo>/<cd_eleicao>/dados/<uf>"},
            {"tp": "aux", "dir": "<base>/<ambiente>/<ciclo>/arquivo-urna/<cd_pleito>/dados/<uf>/<municipio>/<zona>/<secao>"},
        ]
        return {
            "dg": "01/10/2026", "hg": "12:00:00", "f": "o", "idg": "100000001", "c": CICLO, "arq": arq,
            "pl": [{
                "cd": str(PLEITO), "cdpr": "9000", "c": CICLO, "dt": "04/10/2026", "dtlim": "25/10/2026",
                "e": [
                    {"cd": str(ELEICAO_FEDERAL), "cdt2": str(ELEICAO_FEDERAL + 1), "sqele": "1", "t": "1", "tp": "8",
                     "nm": "Eleição Ordinária Federal - 2026 - MOCK 1º Turno",
                     "abr": [{"cd": "br", "cp": [cp(1, "1")]}]},
                    {"cd": str(ELEICAO_ESTADUAL), "cdt2": str(ELEICAO_ESTADUAL + 1), "sqele": "2", "t": "1", "tp": "1",
                     "nm": "Eleição Ordinária Estadual - 2026 - MOCK 1º Turno",
                     "abr": [{"cd": "br", "cp": [cp(3, "1"), cp(5, "1"), cp(6, "2"), cp(7, "2"), cp(8, "2")]}]},
                ],
            }],
        }

    @lru_cache(maxsize=4)
    def municipios(self, eleicao: int) -> dict:
        c = self.c
        abr = []
        for uf in c.ufs:
            mus = [m for m in c.municipios if m.uf == uf]
            abr.append({
                "cd": uf.upper(), "ds": UFS[uf][0].upper(),
                "mu": [{"cd": f"{m.cd:05d}", "cdi": str(m.ibge), "nm": m.nome, "c": "S" if m.capital else "N",
                        "s": "S", "z": [f"{c.zonas[z].numero:04d}" for z in m.zonas]} for m in mus],
            })
        return {"dg": "01/10/2026", "hg": "12:00:00", "f": "o", "idg": "100000002", "abr": abr}

    def cargo(self, cd: int, uf: str) -> CargoUF | None:
        if cd == 1:
            return self.c.cargos.get((1, "br"))
        return self.c.cargos.get((cd, uf))

    def resultado(self, eleicao: int, cd: int, uf: str, mun: int | None, zona: int | None, t: float,
                  so_eleitos: bool = False) -> tuple[str, dict] | None:
        cargo = self.cargo(cd, uf)
        if cargo is None or cargo.eleicao != eleicao:
            return None
        if cd != 1 and uf == "br":
            return None
        tempos, a, b = self.tempos_recorte(uf, mun, zona)
        idg, ult = self.idg(tempos, t)
        rod = self.rodada(t)
        s = self._somar(cargo, a, b, t)
        sit, vagas_agr, md, final_global = self.situacao(cargo, t)
        votos = s["votos"]
        validos = int(votos.sum()) + (int(s["legenda"].sum()) if s["legenda"] is not None else 0)
        tv = s["c"] * cargo.votos_por_eleitor
        dg, hg = data_hora(rod)
        dt, ht = data_hora(ult if ult is not None else 0.0)
        final = s["st"] == s["ts"]
        agr: dict[str, dict] = {}
        for i, cand in enumerate(cargo.candidatos):
            e, st = sit.get(cand.sqcand, ("n", ""))
            if so_eleitos and e != "s":
                continue
            p = cand.partido
            g = agr.setdefault(p.agremiacao, {"n": p.agremiacao_numero, "nm": p.agremiacao, "tp": p.tipo,
                                              "_v": 0, "par": {}})
            par = g["par"].setdefault(p.sigla, {"n": str(p.numero), "sg": p.sigla, "nm": p.nome, "tvl": "0", "cand": []})
            v = int(votos[i])
            g["_v"] += v
            par["cand"].append({
                "seq": "0", "n": str(cand.numero), "sqcand": cand.sqcand, "nm": cand.nome, "nmu": cand.nome_urna,
                "dvt": "Válido", "e": e, "st": st, "vap": str(v), "pvap": pct2(v, validos), "pvapn": pctn(v, validos),
                "vs": [{"tp": tp, "nm": nm, "nmu": nm, "sgp": p.sigla} for tp, nm in cand.vices],
            })
        if s["legenda"] is not None and not so_eleitos:
            for j, par_ in enumerate(cargo.partidos):
                g = agr.get(par_.agremiacao)
                if g and par_.sigla in g["par"]:
                    g["par"][par_.sigla]["tvl"] = str(int(s["legenda"][j]))
                    g["_v"] += int(s["legenda"][j])
        lista = []
        for nome, g in sorted(agr.items(), key=lambda kv: -kv[1]["_v"]):
            pars = []
            for par in g["par"].values():
                par["cand"].sort(key=lambda x: -int(x["vap"]))
                pars.append(par)
            item = {"n": g["n"], "nm": nome, "tp": g["tp"], "tvtl": str(g["_v"]), "par": pars}
            if vagas_agr:
                item["vag"] = str(vagas_agr.get(nome, 0))
            lista.append(item)
        doc = {
            "ele": str(eleicao), "t": "1", "f": "o", "dg": dg, "hg": hg, "idg": idg, "dt": dt, "ht": ht,
            "tf": "s" if final else "n", "md": "s" if (md and uf == cargo.uf and mun is None) else "n",
            "s": {"ts": str(s["ts"]), "st": str(s["st"]), "pst": pct2(s["st"], s["ts"]), "pstn": pctn(s["st"], s["ts"]),
                  "snt": str(s["ts"] - s["st"]), "psnt": pct2(s["ts"] - s["st"], s["ts"])},
            "e": {"te": str(s["te"]), "est": str(s["est"]), "pest": pct2(s["est"], s["te"]),
                  "esnt": str(s["te"] - s["est"]), "c": str(s["c"]), "pc": pct2(s["c"], s["est"]),
                  "pcn": pctn(s["c"], s["est"]), "a": str(s["est"] - s["c"]), "pa": pct2(s["est"] - s["c"], s["est"]),
                  "pan": pctn(s["est"] - s["c"], s["est"])},
            "v": {"tv": str(tv), "vv": str(validos), "pvv": pct2(validos, tv), "vb": str(s["brancos"]),
                  "pvb": pct2(s["brancos"], tv), "tvn": str(s["nulos"]), "ptvn": pct2(s["nulos"], tv),
                  "vn": str(s["nulos"])},
            "carg": [{"cd": f"{cd:04d}", "nmn": NOMES_CARGO[cd], "nv": str(cargo.vagas), "agr": lista}],
        }
        return idg, doc

    def acompanhamento(self, eleicao: int, uf: str, t: float) -> tuple[str, dict]:
        c = self.c
        tempos, a, b = self.tempos_recorte(uf, None, None)
        idg, ult = self.idg(tempos, t)
        dg, hg = data_hora(self.rodada(t))
        itens = [self._item_ab("br" if uf == "br" else "uf", uf, a, b, tempos, t)]
        if uf == "br":
            for u in c.ufs:
                ua, ub = c.faixa_uf[u]
                itens.append(self._item_ab("uf", u, ua, ub, self._t_uf[u], t))
        else:
            for m in c.municipios:
                if m.uf == uf:
                    itens.append(self._item_ab("mu", f"{m.cd:05d}", m.a, m.b, self._t_mun[m.idx], t))
        return idg, {"ele": str(eleicao), "t": "1", "f": "o", "dg": dg, "hg": hg, "idg": idg, "abr": itens}

    def _item_ab(self, tipo: str, cod: str, a: int, b: int, tempos: np.ndarray, t: float) -> dict:
        c = self.c
        mask = c.sec_t[a:b] <= t
        ts, st = b - a, int(mask.sum())
        te = int(c.sec_aptos[a:b].sum())
        est = int(c.sec_aptos[a:b][mask].sum())
        comp = int(c.sec_comp[a:b][mask].sum())
        ult = self.ultima_mudanca(tempos, t)
        dt, ht = data_hora(ult if ult is not None else 0.0)
        item = {
            "and": "f" if st == ts else ("p" if st else "n"), "tpabr": tipo, "cdabr": cod, "dt": dt, "ht": ht,
            "s": {"ts": str(ts), "st": str(st), "pst": pct2(st, ts), "pstn": pctn(st, ts), "snt": str(ts - st),
                  "psnt": pct2(ts - st, ts)},
            "e": {"te": str(te), "est": str(est), "pest": pct2(est, te), "esnt": str(te - est), "c": str(comp),
                  "pc": pct2(comp, est), "pcn": pctn(comp, est), "a": str(est - comp), "pa": pct2(est - comp, est),
                  "pan": pctn(est - comp, est)},
        }
        if tipo in ("br", "uf"):
            mus = [m for m in c.municipios if (tipo == "br" or m.uf == cod)]
            fin = parc = 0
            for m in mus:
                k = int(np.searchsorted(self._t_mun[m.idx], t, side="right"))
                if k == m.b - m.a:
                    fin += 1
                elif k > 0:
                    parc += 1
            nr = len(mus) - fin - parc
            item.update({"munf": str(fin), "pmunf": pct2(fin, len(mus)), "munpt": str(parc),
                         "pmunpt": pct2(parc, len(mus)), "munnr": str(nr), "pmunnr": pct2(nr, len(mus))})
        return item

    @lru_cache(maxsize=32)
    def secoes(self, uf: str) -> dict:
        c = self.c
        mus = []
        for m in c.municipios:
            if m.uf != uf:
                continue
            zon = []
            for zi in m.zonas:
                z = c.zonas[zi]
                zon.append({"cd": f"{z.numero:04d}",
                            "sec": [{"ns": f"{int(c.sec_num[i]):04d}", "nsp": f"{int(c.sec_num[i]):04d}"} for i in range(z.a, z.b)]})
            mus.append({"cd": f"{m.cd:05d}", "nm": m.nome, "zon": zon})
        return {"dg": "01/10/2026", "hg": "12:00:00", "f": "o",
                "abr": [{"cd": uf.upper(), "ds": UFS[uf][0].upper(), "mu": mus}]}

    def indice_secao(self, uf: str, mun: int, zona: int, secao: int) -> int | None:
        return self._secao_idx.get((uf, mun, zona, secao))

    def hash_secao(self, i: int) -> str:
        return hashlib.sha256(f"{self.c.semente}:secao:{i}".encode()).hexdigest()

    def nome_bu(self, i: int) -> str:
        c = self.c
        m = c.municipios[int(c.sec_mun[i])]
        z = c.zonas[int(c.sec_zona[i])]
        return f"o{PLEITO:05d}-{m.cd:05d}{z.numero:04d}{int(c.sec_num[i]):04d}"

    def auxiliar(self, i: int, t: float) -> tuple[str, dict]:
        c = self.c
        ts = float(c.sec_t[i])
        dg, hg = data_hora(self.rodada(t))
        if ts > t:
            return "1", {"dg": dg, "hg": hg, "f": "o", "st": "Não totalizada", "ds": "", "hashes": []}
        dr, hr = data_hora(ts)
        nome = self.nome_bu(i)
        return "2", {
            "dg": dg, "hg": hg, "f": "o", "st": "Totalizada", "ds": "",
            "hashes": [{"hash": self.hash_secao(i), "dr": dr, "hr": hr, "st": "Totalizado", "ds": "",
                        "nmarq": [f"{nome}.logjez", f"{nome}.rdv", f"{nome}.bu", f"{nome}.vscmr", f"{nome}.imgbu"]}],
        }

    @lru_cache(maxsize=20000)
    def boletim(self, i: int) -> bytes:
        c = self.c
        m = c.municipios[int(c.sec_mun[i])]
        z = c.zonas[int(c.sec_zona[i])]
        loc = c.locais[int(c.sec_local[i])]
        emitido_seg = max(30.0, float(c.sec_t[i]) - 240.0)
        emitido = (INICIO + timedelta(seconds=emitido_seg)).strftime("%Y%m%dT%H%M%S")
        comp = int(c.sec_comp[i])

        def votos_cargo(cargo: CargoUF) -> list[VotoBU]:
            r = i - cargo.a
            out = [VotoBU("nominal", int(v), cand.numero, cand.partido.numero)
                   for cand, v in zip(cargo.candidatos, cargo.votos[r], strict=True) if v > 0]
            if cargo.legenda is not None:
                out += [VotoBU("legenda", int(v), p.numero, p.numero) for p, v in zip(cargo.partidos, cargo.legenda[r], strict=True) if v > 0]
            if cargo.brancos[r]:
                out.append(VotoBU("branco", int(cargo.brancos[r])))
            if cargo.nulos[r]:
                out.append(VotoBU("nulo", int(cargo.nulos[r])))
            return out

        pres = c.cargos[(1, "br")]
        estaduais = [c.cargos[k] for k in [(3, m.uf), (5, m.uf), (6, m.uf), (8 if m.uf == "df" else 7, m.uf)] if k in c.cargos]
        maj = [(x.cd, comp, votos_cargo(x)) for x in estaduais if x.sistema == "majoritario"]
        prop = [(x.cd, comp, votos_cargo(x)) for x in estaduais if x.sistema == "proporcional"]
        eleicoes = [(ELEICAO_FEDERAL, 1, [(1, comp, votos_cargo(pres))]), (ELEICAO_ESTADUAL, 1, maj), (ELEICAO_ESTADUAL, 2, prop)]
        return codificar(pleito=PLEITO, eleicoes=eleicoes, municipio=m.cd, zona=z.numero, local=loc.numero,
                         secao=int(c.sec_num[i]), emitido=emitido, aptos=int(c.sec_aptos[i]), comparecimento=comp)

    @lru_cache(maxsize=1)
    def csv_locais(self) -> bytes:
        c = self.c
        cab = ["AA_ELEICAO", "SG_UF", "CD_MUNICIPIO", "NM_MUNICIPIO", "NR_ZONA", "NR_SECAO", "NR_LOCAL_VOTACAO",
               "NM_LOCAL_VOTACAO", "DS_ENDERECO", "NM_BAIRRO", "NR_CEP", "NR_LATITUDE", "NR_LONGITUDE", "QT_ELEITOR_SECAO"]
        linhas = [";".join(f'"{x}"' for x in cab)]
        for i in range(c.n):
            m = c.municipios[int(c.sec_mun[i])]
            z = c.zonas[int(c.sec_zona[i])]
            loc = c.locais[int(c.sec_local[i])]
            lat = f"{loc.lat}" if loc.lat is not None else "-1"
            lon = f"{loc.lon}" if loc.lon is not None else "-1"
            vals = ["2026", m.uf.upper(), str(m.cd), m.nome, str(z.numero), str(int(c.sec_num[i])), str(loc.numero),
                    loc.nome, loc.endereco, loc.bairro, loc.cep, lat, lon, str(int(c.sec_aptos[i]))]
            linhas.append(";".join(f'"{v}"' for v in vals))
        return ("\n".join(linhas) + "\n").encode("latin-1", errors="replace")

    def foto_svg(self, sq: str) -> bytes | None:
        for cargo in self.c.cargos.values():
            for cand in cargo.candidatos:
                if cand.sqcand == sq:
                    ini = "".join(p[0] for p in cand.nome_urna.split()[:2])
                    h = int(hashlib.md5(sq.encode()).hexdigest()[:6], 16) % 360
                    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="160" height="200" viewBox="0 0 160 200">'
                           f'<rect width="160" height="200" fill="hsl({h},45%,38%)"/>'
                           f'<circle cx="80" cy="78" r="38" fill="hsl({h},45%,62%)"/>'
                           f'<rect x="28" y="124" width="104" height="76" rx="40" fill="hsl({h},45%,62%)"/>'
                           f'<text x="80" y="190" font-family="sans-serif" font-size="22" font-weight="700" '
                           f'text-anchor="middle" fill="#fff">{ini}</text></svg>')
                    return svg.encode()
        return None
