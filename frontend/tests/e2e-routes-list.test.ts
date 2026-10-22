import { describe, expect, it } from "vitest";
import { matchPath, type RouteObject } from "react-router-dom";
import { routes } from "../src/App";
import { ROUTES } from "../e2e/helpers";

/** The full path of every screen (leaf route) of the router, joined through its parents. */
function screenPatterns(list: RouteObject[], parent = ""): string[] {
  return list.flatMap((route) => {
    const path = route.path === undefined ? parent : joinPath(parent, route.path);
    return route.children ? screenPatterns(route.children, path) : [path];
  });
}

function joinPath(parent: string, child: string): string {
  if (child.startsWith("/") || child === "*") return child;
  return parent === "/" ? `/${child}` : `${parent}/${child}`;
}

describe("e2e route list", () => {
  const rotas = screenPatterns(routes);

  it("covers every screen of the router", () => {
    const cobertas = new Set(ROUTES.map((r) => r.pattern));
    const faltam = rotas.filter((p) => !cobertas.has(p));
    expect(faltam, `rotas sem entrada em frontend/e2e/helpers.ts: ${faltam.join(", ")}`).toEqual([]);
  });

  it("has no entry for a route the router does not declare", () => {
    const declaradas = new Set(rotas);
    const sobram = ROUTES.map((r) => r.pattern).filter((p) => !declaradas.has(p));
    expect(sobram, `entradas em e2e/helpers.ts sem rota em src/App.tsx: ${sobram.join(", ")}`).toEqual([]);
  });

  it("uses concrete paths that the route's pattern matches", () => {
    const fora = ROUTES.filter((r) => !matchPath(r.pattern, r.path));
    expect(
      fora.map((r) => `${r.path} não casa com ${r.pattern}`),
      "caminhos fora do padrão da rota",
    ).toEqual([]);
  });
});
