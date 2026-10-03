import { Avatar } from "@mantine/core";
import { iniciais } from "../../lib/format";
import { rgba } from "../../lib/cores";

export function AvatarCandidato({
  fotoUrl,
  nome,
  cor,
  size = 40,
}: {
  fotoUrl?: string | null;
  nome: string;
  cor: string;
  size?: number;
}) {
  return (
    <Avatar
      src={fotoUrl || null}
      alt={nome}
      size={size}
      radius="xl"
      styles={{
        root: { border: `2px solid ${cor}`, boxShadow: `0 0 0 2px ${rgba(cor, 0.18)}`, flexShrink: 0 },
        placeholder: { background: rgba(cor, 0.2), color: cor, fontWeight: 700, fontSize: size * 0.36 },
      }}
    >
      {iniciais(nome)}
    </Avatar>
  );
}
