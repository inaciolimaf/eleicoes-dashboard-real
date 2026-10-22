import type { Level } from "../../api/models";

/** Topic names of the WebSocket, as the backend publishes them (`backend/app/infra/realtime/topics.py`). */
export const topic = {
  results: (round: number, office: number, level: Level, id: string) =>
    `results:${round}:${office}:${level}:${id}`,
  /** The children of an area; the country's municipalities are their own topic (`child_level`). */
  children: (round: number, office: number, level: Level, id: string, childLevel?: Level | null) =>
    level === "country" && childLevel === "municipality"
      ? `children:${round}:${office}:country:${id}:municipality`
      : `children:${round}:${office}:${level}:${id}`,
  pollingPlaces: (round: number, office: number, municipality: string) =>
    `polling_places:${round}:${office}:${municipality}`,
  progress: (round: number) => `progress:${round}`,
  events: (round: number) => `events:${round}`,
  status: () => "status",
};
