"""Fires a fixed rate of requests at the TSE for a window and reports, second by second, when it
starts blocking (429/403).

The rate is open-loop: a request leaves every 1/rps seconds whether or not the previous ones have
answered, so a slow server does not lower the rate being tested.

The TSE blocks the IP for 10 minutes above its limit and renews the block on every new attempt
during it (spec 02 §2.7), so firing stops at the first block unless --keep-going is passed. Run it
from a machine whose IP is not the production collector's.

    cd backend && uv run python -m tools.rate_probe --rps 50
    uv run python -m tools.rate_probe --rps 120 --url https://resultados.tse.jus.br/oficial/comum/config/ele-c.json
"""

import argparse
import asyncio
import time
from collections import Counter, defaultdict
from dataclasses import dataclass, field

import httpx

#: Above this one Python process cannot keep the pace: the rate actually sent falls below --rps.
MAX_RPS = 1000


@dataclass
class Stats:
    by_second: dict[int, Counter[str]] = field(default_factory=lambda: defaultdict(Counter))
    latencies: dict[int, list[float]] = field(default_factory=lambda: defaultdict(list))
    first_block: tuple[float, httpx.Response] | None = None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("--rps", type=float, required=True, help="requisições por segundo")
    parser.add_argument("--url", default="https://resultados.tse.jus.br/oficial/comum/config/ele-c.json")
    parser.add_argument("--seconds", type=int, default=30, help="duração da janela (padrão 30)")
    parser.add_argument("--timeout", type=float, default=1.0, help="teto por requisição, em s (padrão 1)")
    parser.add_argument("--keep-going", action="store_true", help="continua disparando depois do 1º bloqueio")
    args = parser.parse_args()
    if args.rps > MAX_RPS:
        parser.error(f"--rps acima de {MAX_RPS}: um processo só não sustenta esse ritmo")
    return args


BLOCK_STATUSES = (429, 403)


def bucket(status: int) -> str:
    if status in BLOCK_STATUSES:
        return str(status)
    return f"{status // 100}xx"


async def one(client: httpx.AsyncClient, args: argparse.Namespace, start: float, stats: Stats) -> None:
    sent = time.perf_counter()
    second = int(sent - start)
    try:
        # httpx's own timeout is per phase (connect, each read), so a trickling response never trips it.
        response = await asyncio.wait_for(client.get(args.url), args.timeout)
    except TimeoutError:
        stats.by_second[second]["timeout"] += 1
        return
    except httpx.HTTPError as error:
        stats.by_second[second][f"erro:{type(error).__name__}"] += 1
        return
    stats.by_second[second][bucket(response.status_code)] += 1
    stats.latencies[second].append(time.perf_counter() - sent)
    if response.status_code in BLOCK_STATUSES and stats.first_block is None:
        stats.first_block = (sent - start, response)


async def fire(args: argparse.Namespace, stats: Stats) -> None:
    total = int(args.rps * args.seconds)
    limits = httpx.Limits(max_connections=None, max_keepalive_connections=max(10, int(args.rps)))
    async with httpx.AsyncClient(timeout=args.timeout, limits=limits) as client:
        start = time.perf_counter()
        tasks = []
        for i in range(total):
            if stats.first_block is not None and not args.keep_going:
                break
            delay = start + i / args.rps - time.perf_counter()
            if delay > 0:
                await asyncio.sleep(delay)
            tasks.append(asyncio.create_task(one(client, args, start, stats)))
        await asyncio.gather(*tasks)


def p95(values: list[float]) -> str:
    if not values:
        return "-"
    ordered = sorted(values)
    return f"{ordered[int(0.95 * (len(ordered) - 1))] * 1000:.0f}ms"


def print_table(stats: Stats, seconds: int) -> None:
    kinds = sorted({kind for counts in stats.by_second.values() for kind in counts})
    print(f"{'seg':>4} " + " ".join(f"{k:>8}" for k in kinds) + f" {'p95':>8}")
    for second in range(seconds + 1):
        counts = stats.by_second.get(second)
        if not counts:
            continue
        row = " ".join(f"{counts[k]:>8}" for k in kinds)
        print(f"{second:>4} {row} {p95(stats.latencies[second]):>8}")


def print_summary(stats: Stats, args: argparse.Namespace) -> None:
    totals: Counter[str] = sum(stats.by_second.values(), Counter())
    sent = sum(totals.values())
    print(f"\n{sent} requisições a {args.rps:g} req/s em {args.seconds}s: {dict(totals)}")
    if stats.first_block is None:
        print("Nenhum bloqueio (429/403).")
        return
    at, response = stats.first_block
    blocked = sum(totals[str(s)] for s in BLOCK_STATUSES)
    print(f"Primeiro {response.status_code} em t={at:.1f}s ({blocked / sent:.1%} do total bloqueadas).")
    if not args.keep_going:
        print("Disparo interrompido no bloqueio. O TSE segura o IP por ~10 min antes de liberar.")
    for header in ("server", "retry-after", "x-ratelimit-limit", "x-ratelimit-remaining", "via"):
        if header in response.headers:
            print(f"  {header}: {response.headers[header]}")
    print(f"  corpo: {response.text[:200]!r}")


def main() -> None:
    args = parse_args()
    stats = Stats()
    asyncio.run(fire(args, stats))
    print_table(stats, args.seconds)
    print_summary(stats, args)


if __name__ == "__main__":
    main()
