import { Badge, Group, Tooltip } from "@mantine/core";
import { IconCheck } from "@tabler/icons-react";
import type { CandidateStatus } from "../../../api/models";
import { SITUATION_STYLES } from "../../../lib/palettes";
import { fmtTime } from "../../../lib/time";

type BadgeSize = "xs" | "sm" | "md";

interface StatusBadgeProps {
  status: CandidateStatus;
  overallStatus?: CandidateStatus | null;
  /** e.g. "no Brasil", "em SP" */
  where?: string;
  talliedAt?: string | null;
  size?: BadgeSize;
}

function StatusChip({
  status,
  suffix,
  talliedAt,
  size,
}: {
  status: CandidateStatus;
  suffix?: string;
  talliedAt?: string | null;
  size: BadgeSize;
}) {
  const style = SITUATION_STYLES[status] ?? SITUATION_STYLES.COUNTING;
  if (status === "COUNTING" && !suffix) return null;
  // the TSE publishes these; the panel's own reading ("leading", "counting") is not a TSE declaration
  const publishedByTse = status !== "LEADING" && status !== "COUNTING";
  const label = (
    <>
      {style.description}
      {publishedByTse && talliedAt ? ` Publicado às ${fmtTime(talliedAt)} (Brasília).` : ""}
    </>
  );
  return (
    <Tooltip label={label}>
      <Badge
        size={size}
        color={style.color}
        variant={style.variant}
        leftSection={status === "ELECTED" ? <IconCheck size={12} stroke={3} /> : undefined}
        styles={{ root: { textTransform: "uppercase", letterSpacing: 0.3, flexShrink: 0 } }}
        aria-label={`Situação: ${style.label}${suffix ? " " + suffix : ""}`}
      >
        {style.label}
        {suffix ? ` ${suffix}` : ""}
      </Badge>
    </Tooltip>
  );
}

/** Situation badge (RF-03). Also shows the overall situation when it differs from the local one. */
export function StatusBadge({ status, overallStatus, where, talliedAt, size = "sm" }: StatusBadgeProps) {
  const showOverall = overallStatus && overallStatus !== status && overallStatus !== "COUNTING";
  return (
    <Group gap={4} wrap="wrap">
      <StatusChip status={status} talliedAt={talliedAt} size={size} />
      {showOverall && <StatusChip status={overallStatus} suffix={where} talliedAt={talliedAt} size={size} />}
    </Group>
  );
}
