import { Text } from "@mantine/core";
import { CandidateCard } from "../../results";
import { EventFeed } from "../../events";
import { PollingPlaceDetail } from "../../polling-places";
import { SectionDetail } from "../../sections";
import { useEffectiveFilter } from "../../../lib/effective-filter";
import { Clock } from "../shared/Clock";
import { Markdown } from "../shared/Markdown";
import { ScrollBody } from "./scroll-body";
import {
  configArray,
  configBool,
  configNumber,
  configString,
  configStringOrNull,
  type WidgetProps,
} from "./types";

// 11 ─ Event feed
export function EventsWidget({ config, height }: WidgetProps) {
  const filter = useEffectiveFilter();
  const onlyArea = configBool(config, "soRecorte", false);
  return (
    <EventFeed
      tipos={configArray(config, "tipos")}
      limite={configNumber(config, "limite", 50)}
      cargo={configBool(config, "soCargo", false) ? filter.cargo : null}
      nivel={onlyArea ? filter.nivel : null}
      id={onlyArea ? filter.id : null}
      compacto={height < 220}
      alturaMax={height}
    />
  );
}

// 12 ─ Candidate card
export function CandidateWidget({ config, height }: WidgetProps) {
  return (
    <ScrollBody height={height}>
      <CandidateCard sqcand={configStringOrNull(config, "sqcand")} />
    </ScrollBody>
  );
}

// 13 ─ Polling place
export function PollingPlaceWidget({ config, height }: WidgetProps) {
  const filter = useEffectiveFilter();
  const id = configStringOrNull(config, "localId") ?? (filter.nivel === "polling_place" ? filter.id : null);
  return (
    <ScrollBody height={height}>
      <PollingPlaceDetail localId={id} alturaLista={Math.max(160, height - 120)} />
    </ScrollBody>
  );
}

// 14 ─ Section (ballot box detail)
export function SectionWidget({ config, height }: WidgetProps) {
  const filter = useEffectiveFilter();
  const id = configStringOrNull(config, "secaoId") ?? (filter.nivel === "section" ? filter.id : null);
  return (
    <ScrollBody height={height}>
      <SectionDetail secaoId={id} compacto />
    </ScrollBody>
  );
}

// 15 ─ Clock / countdown
export function ClockWidget({ config }: WidgetProps) {
  return (
    <Clock
      mode={configString(config, "modo", "relogio") as "relogio" | "contagem"}
      target={configStringOrNull(config, "alvo")}
      label={configString(config, "rotulo", "")}
    />
  );
}

// 16 ─ Text / note
export function TextWidget({ config, height }: WidgetProps) {
  const text = configString(config, "texto", "");
  return (
    <ScrollBody height={height}>
      {text ? (
        <Markdown text={text} />
      ) : (
        <Text size="sm" c="dimmed">
          Edite o widget para escrever uma anotação (aceita **negrito**, *itálico*, listas e links).
        </Text>
      )}
    </ScrollBody>
  );
}
