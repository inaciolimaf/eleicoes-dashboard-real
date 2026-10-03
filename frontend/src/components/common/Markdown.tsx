import { Fragment, type ReactNode } from "react";

/** Markdown mínimo e seguro (sem HTML): títulos, negrito, itálico, código, links e listas. */
function inline(txt: string, chave: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;
  let ultimo = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(txt))) {
    if (m.index > ultimo) out.push(txt.slice(ultimo, m.index));
    const t = m[0];
    const k = `${chave}-${i++}`;
    if (t.startsWith("**")) out.push(<strong key={k}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith("`")) out.push(<code key={k}>{t.slice(1, -1)}</code>);
    else if (t.startsWith("[")) {
      const mm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(t);
      const href = mm?.[2] ?? "#";
      const seguro = /^(https?:|\/|#)/.test(href) ? href : "#";
      out.push(
        <a key={k} href={seguro} target={seguro.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer">
          {mm?.[1]}
        </a>,
      );
    } else out.push(<em key={k}>{t.slice(1, -1)}</em>);
    ultimo = m.index + t.length;
  }
  if (ultimo < txt.length) out.push(txt.slice(ultimo));
  return out;
}

export function Markdown({ texto }: { texto: string }) {
  const linhas = texto.replace(/\r/g, "").split("\n");
  const blocos: ReactNode[] = [];
  let lista: string[] = [];
  const fecharLista = () => {
    if (lista.length) {
      const l = lista;
      blocos.push(
        <ul key={`ul${blocos.length}`}>
          {l.map((x, i) => (
            <li key={i}>{inline(x, `li${blocos.length}-${i}`)}</li>
          ))}
        </ul>,
      );
      lista = [];
    }
  };
  linhas.forEach((ln, i) => {
    const h = /^(#{1,3})\s+(.*)$/.exec(ln);
    const li = /^\s*[-*]\s+(.*)$/.exec(ln);
    if (li) {
      lista.push(li[1]);
      return;
    }
    fecharLista();
    if (h) {
      const nivel = h[1].length;
      const conteudo = inline(h[2], `h${i}`);
      blocos.push(nivel === 1 ? <h1 key={i}>{conteudo}</h1> : nivel === 2 ? <h2 key={i}>{conteudo}</h2> : <h3 key={i}>{conteudo}</h3>);
    } else if (ln.trim()) blocos.push(<p key={i}>{inline(ln, `p${i}`)}</p>);
    else blocos.push(<Fragment key={i} />);
  });
  fecharLista();
  return <div className="markdown">{blocos}</div>;
}
