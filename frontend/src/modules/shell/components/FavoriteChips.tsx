import { Badge, Text } from "@mantine/core";
import { IconStarFilled } from "@tabler/icons-react";
import { Link } from "react-router-dom";
import type { FavoriteDto, Level } from "../../../api/models";
import { geoAreaLink } from "../../../lib/geo-areas";

const MAX_CHIPS = 12;

/** Where a favorite leads: candidates and polling places have their own page, geo areas go to explore. */
function favoriteHref(favorite: FavoriteDto): string {
  if (favorite.type === "candidate") return `/candidatos/${favorite.ref}`;
  if (favorite.type === "polling_place") return `/locais/${favorite.ref}`;
  const [level, ...rest] = favorite.ref.split(":");
  return geoAreaLink(level as Level, rest.join(":"));
}

/** The "Favoritos:" label and a chip for each favorite (the first twelve). */
export function FavoriteChips({ favorites }: { favorites: FavoriteDto[] }) {
  return (
    <>
      <Text size="xs" c="dimmed" visibleFrom="md" style={{ whiteSpace: "nowrap" }}>
        Favoritos:
      </Text>
      {favorites.slice(0, MAX_CHIPS).map((favorite) => (
        <Badge
          key={`${favorite.type}:${favorite.ref}`}
          component={Link}
          to={favoriteHref(favorite)}
          variant="outline"
          color={favorite.type === "candidate" ? "grape" : "yellow"}
          size="sm"
          style={{ cursor: "pointer", flexShrink: 0, textTransform: "none" }}
          leftSection={<IconStarFilled size={10} />}
        >
          {favorite.label}
        </Badge>
      ))}
    </>
  );
}
