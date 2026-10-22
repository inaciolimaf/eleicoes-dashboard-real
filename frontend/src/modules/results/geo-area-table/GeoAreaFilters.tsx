import {
  ActionIcon,
  Badge,
  Button,
  Collapse,
  Group,
  MultiSelect,
  NumberInput,
  RangeSlider,
  Select,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { IconFilter, IconFilterOff, IconSearch } from "@tabler/icons-react";
import type { ChildCandidateDto } from "../../../api/models";
import { REGIONS, UFS } from "../../../lib/geo-areas";
import type { GroupBy, TableFilters } from "./geoAreaModel";

/** Grouping choices; the labels are visible text, so they stay in Portuguese. */
export function groupOptions(hasStates: boolean) {
  return [
    { value: "none", label: "Sem agrupamento" },
    { value: "region", label: "Agrupar por região" },
    ...(hasStates ? [{ value: "state", label: "Agrupar por UF" }] : []),
    { value: "size", label: "Agrupar por porte" },
  ];
}

interface FilterToolbarProps {
  childLevelLabel: string;
  search: string;
  onSearch: (search: string) => void;
  filtersOpen: boolean;
  onToggleFilters: () => void;
  activeCount: number;
  groupBy: GroupBy;
  onGroupBy: (groupBy: GroupBy) => void;
  hasStates: boolean;
  onClear: () => void;
}

/** Row above the table: name search, the Filters toggle with its count, grouping and clear. */
export function FilterToolbar(props: FilterToolbarProps) {
  const { activeCount } = props;
  return (
    <Group gap="xs" wrap="wrap">
      <TextInput
        size="xs"
        placeholder={`Buscar ${props.childLevelLabel}…`}
        leftSection={<IconSearch size={14} />}
        value={props.search}
        onChange={(event) => props.onSearch(event.currentTarget.value)}
        style={{ flex: 1, minWidth: 160 }}
      />
      <Button
        size="xs"
        variant={activeCount ? "light" : "default"}
        leftSection={<IconFilter size={14} />}
        rightSection={
          activeCount ? (
            <Badge size="xs" circle>
              {activeCount}
            </Badge>
          ) : undefined
        }
        onClick={props.onToggleFilters}
      >
        Filtros
      </Button>
      <Select
        size="xs"
        w={150}
        value={props.groupBy}
        onChange={(value) => props.onGroupBy((value as GroupBy) ?? "none")}
        data={groupOptions(props.hasStates)}
        allowDeselect={false}
        aria-label="Agrupamento"
      />
      {activeCount > 0 && (
        <Tooltip label="Limpar filtros">
          <ActionIcon variant="subtle" size="md" onClick={props.onClear} aria-label="Limpar filtros">
            <IconFilterOff size={16} />
          </ActionIcon>
        </Tooltip>
      )}
    </Group>
  );
}

/** Territory filters: states (when the list has them), regions, the winner and capital or inland. */
function PlaceFilters({
  filters,
  update,
  hasStates,
  candidates,
}: {
  filters: TableFilters;
  update: (patch: Partial<TableFilters>) => void;
  hasStates: boolean;
  candidates: ChildCandidateDto[];
}) {
  return (
    <>
      {hasStates && (
        <MultiSelect
          size="xs"
          label="UF"
          data={UFS.map((state) => ({ value: state.uf, label: `${state.uf.toUpperCase()} · ${state.name}` }))}
          value={filters.states}
          onChange={(value) => update({ states: value })}
          searchable
          clearable
        />
      )}
      <MultiSelect
        size="xs"
        label="Região"
        data={REGIONS}
        value={filters.regions}
        onChange={(value) => update({ regions: value })}
        clearable
      />
      <Select
        size="xs"
        label="Vencedor"
        data={candidates.map((candidate) => ({
          value: candidate.tse_candidate_id,
          label: `${candidate.ballot_name} (${candidate.wins})`,
        }))}
        value={filters.winner}
        onChange={(value) => update({ winner: value })}
        clearable
        searchable
      />
      <Stack gap={2}>
        <Text size="xs" fw={500}>
          Capital / interior
        </Text>
        <SegmentedControl
          size="xs"
          value={filters.capital}
          onChange={(value) => update({ capital: value as TableFilters["capital"] })}
          data={[
            { value: "all", label: "Todos" },
            { value: "capital", label: "Capitais" },
            { value: "inland", label: "Interior" },
          ]}
        />
      </Stack>
    </>
  );
}

/** Numeric filters: the tallied share, the margin and the minimum electorate. */
function NumericFilters({
  filters,
  update,
}: {
  filters: TableFilters;
  update: (patch: Partial<TableFilters>) => void;
}) {
  return (
    <>
      <Stack gap={2}>
        <Text size="xs" fw={500}>
          % apurado: {filters.tallied[0]}–{filters.tallied[1]}%
        </Text>
        <RangeSlider
          size="sm"
          min={0}
          max={100}
          step={5}
          value={filters.tallied}
          onChange={(value) => update({ tallied: value })}
          label={(value) => `${value}%`}
        />
      </Stack>
      <Stack gap={2}>
        <Text size="xs" fw={500}>
          Margem: {filters.margin[0]}–{filters.margin[1]} p.p.
        </Text>
        <RangeSlider
          size="sm"
          min={0}
          max={100}
          step={1}
          value={filters.margin}
          onChange={(value) => update({ margin: value })}
          label={(value) => `${value} p.p.`}
        />
      </Stack>
      <NumberInput
        size="xs"
        label="Eleitorado mínimo"
        value={filters.minElectorate ?? ""}
        onChange={(value) => update({ minElectorate: typeof value === "number" ? value : null })}
        thousandSeparator="."
        decimalSeparator=","
        min={0}
        step={10000}
      />
    </>
  );
}

interface FilterPanelProps {
  open: boolean;
  filters: TableFilters;
  update: (patch: Partial<TableFilters>) => void;
  hasStates: boolean;
  candidates: ChildCandidateDto[];
}

/** The collapsible panel of filters under the toolbar. */
export function FilterPanel({ open, filters, update, hasStates, candidates }: FilterPanelProps) {
  return (
    <Collapse in={open}>
      <SimpleGrid
        cols={{ base: 1, xs: 2, md: 4 }}
        spacing="sm"
        p="xs"
        style={{ border: "1px solid var(--mantine-color-default-border)", borderRadius: 10 }}
      >
        <PlaceFilters filters={filters} update={update} hasStates={hasStates} candidates={candidates} />
        <NumericFilters filters={filters} update={update} />
      </SimpleGrid>
    </Collapse>
  );
}
