import { Avatar } from "@mantine/core";
import { initials } from "../../../lib/formatting";
import { rgba } from "../../../lib/palettes";

/** Round photo of a candidate, or their initials over a tint of their color. */
export function CandidateAvatar({
  photoUrl,
  name,
  color,
  size = 40,
}: {
  photoUrl?: string | null;
  name: string;
  color: string;
  size?: number;
}) {
  return (
    <Avatar
      src={photoUrl || null}
      alt={name}
      size={size}
      radius="xl"
      styles={{
        root: { border: `2px solid ${color}`, boxShadow: `0 0 0 2px ${rgba(color, 0.18)}`, flexShrink: 0 },
        placeholder: { background: rgba(color, 0.2), color, fontWeight: 700, fontSize: size * 0.36 },
      }}
    >
      {initials(name)}
    </Avatar>
  );
}
