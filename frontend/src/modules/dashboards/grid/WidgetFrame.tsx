import { Box, Card, Group, Text } from "@mantine/core";
import { useElementSize } from "@mantine/hooks";
import { IconGripVertical } from "@tabler/icons-react";
import { useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import type { Level } from "../../../api/models";
import { FilterProvider } from "../../../lib/effective-filter";
import { geoAreaLink } from "../../../lib/geo-areas";
import { useFilter } from "../../../lib/filter-store";
import type { WidgetCfg } from "../schema";
import { REGISTRY } from "../widgets/registry";
import { FilterChips } from "./WidgetFilterChips";
import { WidgetErrorBoundary } from "./WidgetErrorBoundary";
import { WidgetMenu } from "./WidgetMenu";
import { widgetFilter } from "./widget-filter";

interface WidgetFrameProps {
  widget: WidgetCfg;
  editing: boolean;
  readOnly?: boolean;
  onConfigure?: () => void;
  onDuplicate?: () => void;
  onRemove?: () => void;
}

/** Card around a widget: title, filter chips, menu and the widget body. */
export function WidgetFrame({
  widget,
  editing,
  readOnly,
  onConfigure,
  onDuplicate,
  onRemove,
}: WidgetFrameProps) {
  const definition = REGISTRY[widget.tipo];
  const config = useMemo(
    () => ({ ...definition.defaults, ...widget.config }),
    [definition.defaults, widget.config],
  );
  const title = (typeof config.title === "string" && config.title) || definition.name;
  const { ref, height } = useElementSize();
  const cardRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const setArea = useFilter((s) => s.setRecorte);
  const fixedFilter = widgetFilter(widget);

  const select = useCallback(
    (level: Level, id: string, name: string) => {
      const click = config.clique === "navegar" ? "navegar" : "filtrar";
      if (level === "polling_place" || level === "section" || click === "navegar" || fixedFilter)
        navigate(geoAreaLink(level, id));
      else setArea(level, id, name);
    },
    [config.clique, fixedFilter, navigate, setArea],
  );

  const Component = definition.Component;
  const body = (
    <Box ref={ref} style={{ flex: 1, minHeight: 0, position: "relative" }}>
      {height > 0 && (
        <WidgetErrorBoundary resetKey={JSON.stringify(widget.config) + JSON.stringify(widget.filtros)}>
          <Component widget={widget} config={config} height={Math.floor(height)} onSelect={select} />
        </WidgetErrorBoundary>
      )}
    </Box>
  );

  const content = (
    <Card
      ref={cardRef}
      p="sm"
      h="100%"
      style={{
        display: "flex",
        flexDirection: "column",
        outline: editing ? "1px dashed var(--mantine-color-eleicao-4)" : undefined,
        overflow: "hidden",
      }}
      aria-label={title}
    >
      <Group justify="space-between" wrap="nowrap" gap={6} mb={6} style={{ flexShrink: 0 }}>
        <Group gap={4} wrap="nowrap" style={{ minWidth: 0 }}>
          {editing && !readOnly && (
            <Box className="alca-arrastar" style={{ display: "flex" }} aria-label="Arrastar widget">
              <IconGripVertical size={16} color="var(--mantine-color-dimmed)" />
            </Box>
          )}
          <Text fw={700} size="sm" lineClamp={1} className={editing ? "alca-arrastar" : undefined}>
            {title}
          </Text>
        </Group>
        <Group gap={4} wrap="nowrap" data-export-ignore="true">
          <FilterChips fixed={!!fixedFilter} />
          <WidgetMenu
            widget={widget}
            title={title}
            cardRef={cardRef}
            editing={editing && !readOnly}
            onConfigure={onConfigure}
            onDuplicate={onDuplicate}
            onRemove={onRemove}
          />
        </Group>
      </Group>
      {body}
    </Card>
  );
  return fixedFilter ? <FilterProvider value={fixedFilter}>{content}</FilterProvider> : content;
}
