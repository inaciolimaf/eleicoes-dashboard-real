import { Stack, Text } from "@mantine/core";
import { AnimatePresence, motion } from "motion/react";
import type { CandidateResultDto, ResultsWithDataDto } from "../../../api/models";
import { CandidateRow } from "./CandidateRow";

/** Animated ranking: rows slide when the order changes, unless animations are off. */
export function CandidateList({
  rows,
  maxPct,
  result,
  showPhotos,
  link,
  animate,
  onlyElected,
}: {
  rows: CandidateResultDto[];
  maxPct: number;
  result: ResultsWithDataDto;
  showPhotos: boolean;
  link: boolean;
  animate: boolean;
  onlyElected: boolean;
}) {
  return (
    <Stack gap={0}>
      <AnimatePresence initial={false}>
        {rows.map((candidate) => (
          <motion.div
            key={candidate.tse_candidate_id}
            layout={animate ? "position" : false}
            initial={animate ? { opacity: 0, y: 8 } : false}
            animate={{ opacity: 1, y: 0 }}
            exit={animate ? { opacity: 0 } : undefined}
            transition={{ type: "spring", stiffness: 420, damping: 38 }}
          >
            <CandidateRow
              candidate={candidate}
              maxPct={maxPct}
              result={result}
              showPhoto={showPhotos}
              link={link}
            />
          </motion.div>
        ))}
      </AnimatePresence>
      {rows.length === 0 && (
        <Text size="sm" c="dimmed" ta="center" py="md">
          {onlyElected ? "Nenhum eleito definido ainda." : "Nenhum candidato."}
        </Text>
      )}
    </Stack>
  );
}
