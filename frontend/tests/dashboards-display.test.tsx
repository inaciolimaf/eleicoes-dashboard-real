import { act, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { Markdown } from "../src/modules/dashboards/shared/Markdown";
import { Clock } from "../src/modules/dashboards/shared/Clock";

function withMantine(node: ReactNode) {
  return <MantineProvider>{node}</MantineProvider>;
}

describe("Markdown note", () => {
  it("renders headings, lists and inline marks", () => {
    const { container } = render(
      <Markdown
        text={"# Um\n## Dois\n### Três\nTexto com **negrito**, *itálico* e `código`.\n- primeiro\n- segundo"}
      />,
    );
    expect(container.querySelector("h1")?.textContent).toBe("Um");
    expect(container.querySelector("h2")?.textContent).toBe("Dois");
    expect(container.querySelector("h3")?.textContent).toBe("Três");
    expect(container.querySelector("strong")?.textContent).toBe("negrito");
    expect(container.querySelector("em")?.textContent).toBe("itálico");
    expect(container.querySelector("code")?.textContent).toBe("código");
    expect(container.querySelectorAll("li")).toHaveLength(2);
  });

  it("keeps safe links and turns anything else into an anchor to nowhere", () => {
    const { container } = render(
      <Markdown text={"[Site](https://example.org) [Interno](/paineis) [Perigoso](javascript:alert(1))"} />,
    );
    const links = Array.from(container.querySelectorAll("a"));
    expect(links[0].getAttribute("href")).toBe("https://example.org");
    expect(links[0].getAttribute("target")).toBe("_blank");
    expect(links[1].getAttribute("href")).toBe("/paineis");
    expect(links[1].getAttribute("target")).toBeNull();
    expect(links[2].getAttribute("href")).toBe("#");
  });

  it("reads Windows line endings and renders blank lines as spacers", () => {
    const { container } = render(<Markdown text={"Primeira\r\n\r\nSegunda"} />);
    expect(container.querySelectorAll("p")).toHaveLength(2);
    expect(container.querySelector(".markdown")).not.toBeNull();
  });

  it("closes a list that ends the text", () => {
    const { container } = render(<Markdown text={"- só um item"} />);
    expect(container.querySelector("ul li")?.textContent).toBe("só um item");
  });
});

describe("clock widget", () => {
  beforeEach(() => {
    // Mantine reads the color scheme through matchMedia, which jsdom lacks
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }));
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    vi.setSystemTime(new Date("2026-10-22T15:04:05Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the Brasília time and moves with each second", () => {
    render(withMantine(<Clock />));
    expect(screen.getByText("Horário de Brasília")).toBeInTheDocument();
    expect(screen.getByText("12:04:05")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText("12:04:06")).toBeInTheDocument();
  });

  it("counts down to a target instant, with days when there are more than a day left", () => {
    const target = new Date("2026-10-23T17:08:09Z").toISOString();
    render(withMantine(<Clock mode="contagem" target={target} label="Divulgação" />));
    expect(screen.getByText("Divulgação")).toBeInTheDocument();
    expect(screen.getByText("1d 02:04:04")).toBeInTheDocument();
    expect(screen.getByText(/até 23\/10 14:08/)).toBeInTheDocument();
  });

  it("shows zero and the default label after the target has passed", () => {
    const target = new Date("2026-10-22T14:00:00Z").toISOString();
    render(withMantine(<Clock mode="contagem" target={target} />));
    expect(screen.getByText("Contagem regressiva")).toBeInTheDocument();
    expect(screen.getByText("00:00:00")).toBeInTheDocument();
  });

  it("falls back to the clock when counting down without a target", () => {
    render(withMantine(<Clock mode="contagem" target={null} />));
    expect(screen.getByText("Horário de Brasília")).toBeInTheDocument();
  });
});
