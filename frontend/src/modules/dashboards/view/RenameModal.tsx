import { Button, Group, Modal, Stack, TextInput } from "@mantine/core";

interface RenameModalProps {
  /** Name being typed; `null` closes the modal. */
  draft: string | null;
  onDraftChange: (name: string) => void;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
}

export function RenameModal({ draft, onDraftChange, onClose, onSubmit }: RenameModalProps) {
  return (
    <Modal opened={draft !== null} onClose={onClose} title="Renomear painel">
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (draft?.trim()) await onSubmit(draft.trim());
          onClose();
        }}
      >
        <Stack>
          <TextInput
            value={draft ?? ""}
            onChange={(event) => onDraftChange(event.currentTarget.value)}
            data-autofocus
            maxLength={120}
          />
          <Group justify="flex-end">
            <Button type="submit">Salvar</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
