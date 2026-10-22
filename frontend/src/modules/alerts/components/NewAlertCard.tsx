import { Button, Card, Group, NumberInput, Select, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconBellRinging } from "@tabler/icons-react";
import { useState } from "react";
import type { AlertType } from "../../../api/models";
import { CandidatePicker, GeoAreaPicker, geoAreaValue, readGeoArea } from "../../results";
import { OFFICE_OPTIONS } from "../../../lib/offices";
import { stateOfId } from "../../../lib/geo-areas";
import { useFilter } from "../../../lib/filter-store";
import { ALERT_TYPE_OPTIONS, alertFields, buildAlertParams } from "../rules";
import { useSaveAlert } from "../hooks";

/** Form that creates one alert rule; the fields shown depend on the rule. */
export function NewAlertCard() {
  const filter = useFilter();
  const save = useSaveAlert();
  const [type, setType] = useState<AlertType>("candidate_pct");
  const [officeCode, setOfficeCode] = useState(filter.cargo);
  const [area, setArea] = useState<string | null>(geoAreaValue(filter.nivel, filter.id));
  const [candidateCode, setCandidateCode] = useState<string | null>(null);
  const [threshold, setThreshold] = useState<number>(50);
  const [pollingPlace, setPollingPlace] = useState<string | null>(null);
  const geoArea = readGeoArea(area);
  const fields = alertFields(type);

  const create = async () => {
    const params = buildAlertParams(type, {
      officeCode,
      geoArea: geoArea ? { level: geoArea.nivel, id: geoArea.id } : null,
      candidateCode,
      threshold,
      pollingPlaceId: readGeoArea(pollingPlace)?.id,
    });
    if (!params) {
      notifications.show({ color: "red", message: "Preencha todos os campos do alerta." });
      return;
    }
    try {
      await save.mutateAsync({ type, params, active: true });
      notifications.show({ color: "teal", message: "Alerta criado." });
    } catch (error) {
      notifications.show({
        color: "red",
        title: "Falha ao criar alerta",
        message: (error as Error).message,
      });
    }
  };

  return (
    <Card p="md">
      <Text fw={700} mb="sm">
        Novo alerta
      </Text>
      <Stack gap="sm">
        <Select
          label="Regra"
          data={ALERT_TYPE_OPTIONS}
          value={type}
          onChange={(value) => value && setType(value as AlertType)}
          allowDeselect={false}
        />
        <Group grow align="flex-start">
          {fields.office && (
            <Select
              label="Cargo"
              data={OFFICE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              value={String(officeCode === 8 ? 7 : officeCode)}
              onChange={(value) => setOfficeCode(Number(value ?? 1))}
              allowDeselect={false}
            />
          )}
          {fields.area && <GeoAreaPicker label="Recorte" value={area} onChange={setArea} />}
        </Group>
        <Group grow align="flex-start">
          {fields.candidate && (
            <CandidatePicker
              label="Candidato"
              value={candidateCode}
              onChange={setCandidateCode}
              round={filter.turno}
              office={officeCode}
              state={geoArea ? stateOfId(geoArea.nivel, geoArea.id) : null}
            />
          )}
          {fields.limit && (
            <NumberInput
              label="Limite (%)"
              value={threshold}
              onChange={(value) => setThreshold(Number(value) || 0)}
              min={0}
              max={100}
              decimalScale={2}
            />
          )}
        </Group>
        {fields.pollingPlace && (
          <GeoAreaPicker
            label="Local de votação"
            types={["polling_place"]}
            includeBrazil={false}
            includeStates={false}
            value={pollingPlace}
            onChange={setPollingPlace}
          />
        )}
        <Group justify="flex-end">
          <Button leftSection={<IconBellRinging size={16} />} onClick={create} loading={save.isPending}>
            Criar alerta
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
