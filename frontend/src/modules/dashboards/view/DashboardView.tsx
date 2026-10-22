import { Button, Group, Stack } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPlus } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { NoData } from "../../../components/States";
import { REGISTRY } from "../widgets/registry";
import { Grid } from "../grid/Grid";
import { WidgetDrawer } from "../panels/WidgetDrawer";
import { ConfigDrawer } from "../panels/ConfigDrawer";
import { ShareModal } from "../modals/ShareModal";
import { useDashboards } from "../hooks";
import { useEditor, type EditorState } from "../editor";
import { samePosition } from "../grid/grid-layout";
import type { Dashboard } from "../repo";
import type { DashboardConfig, LayoutItem, WidgetCfg, WidgetType } from "../schema";
import { addWidget, applyLayoutChange, duplicateWidget, removeWidget } from "./edit-actions";
import { DashboardHeader } from "./DashboardHeader";
import { DashboardControls } from "./DashboardControls";
import { RenameModal } from "./RenameModal";
import { useAutosave } from "./useAutosave";
import { useDashboardCommands } from "./useDashboardCommands";
import { useEditorSession } from "./useEditorSession";

/** One dashboard: its header, its edit controls and its grid, with the drawers and modals of the editor. */
export function DashboardView({ dashboard }: { dashboard: Dashboard }) {
  const repo = useDashboards();
  const navigate = useNavigate();
  const editor = useEditor();
  const config = configOf(editor, dashboard);
  const commands = useDashboardCommands(dashboard, config);
  const [configuringId, setConfiguringId] = useState<string | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState<string | null>(null);

  useEditorSession(dashboard);
  const { saving, savedAt } = useAutosave(dashboard.id, repo.save);

  const widgetBeingConfigured = useMemo(
    () => config.widgets.find((widget) => widget.id === configuringId) ?? null,
    [config.widgets, configuringId],
  );

  const onAddWidget = (type: WidgetType) => {
    editor.apply((current) => addWidget(current, type));
    setCatalogOpen(false);
    notifications.show({
      color: "teal",
      message: `${REGISTRY[type].name} adicionado ao fim do painel`,
      autoClose: 2500,
    });
    setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }), 250);
  };

  const onLayoutChange = (lg: LayoutItem[], others: Record<string, LayoutItem[]>) =>
    editor.apply((current) => applyLayoutChange(current, lg, others), {
      history: !samePosition(config.widgets, lg),
    });

  const onSaveWidget = (updated: WidgetCfg) =>
    editor.apply((current) => ({
      ...current,
      widgets: current.widgets.map((widget) => (widget.id === updated.id ? updated : widget)),
    }));

  return (
    <Stack gap="sm">
      <Group justify="space-between" wrap="wrap" gap="xs">
        <DashboardHeader dashboard={dashboard} saving={saving} savedAt={savedAt} />
        <DashboardControls
          editing={editor.editing}
          canUndo={editor.past.length > 0}
          canRedo={editor.future.length > 0}
          isDefault={dashboard.isDefault}
          onUndo={editor.undo}
          onRedo={editor.redo}
          onAddWidget={() => setCatalogOpen(true)}
          onToggleEditing={() => editor.setEditing(!editor.editing)}
          onRename={() => setRenameDraft(dashboard.name)}
          onDuplicate={commands.duplicate}
          onSetDefault={() => repo.setDefault(dashboard.id)}
          onShare={() => setShareOpen(true)}
          onExport={commands.exportFile}
          onImportFile={commands.importFile}
          onTvMode={() => navigate(`/tv?inicio=${encodeURIComponent(dashboard.id)}`)}
          onRemove={commands.confirmRemove}
        />
      </Group>

      {config.widgets.length === 0 ? (
        <EmptyDashboard
          onAddWidget={() => {
            editor.setEditing(true);
            setCatalogOpen(true);
          }}
        />
      ) : (
        <Grid
          config={config}
          editing={editor.editing}
          onLayoutChange={onLayoutChange}
          onConfigure={setConfiguringId}
          onDuplicate={(id) => editor.apply((current) => duplicateWidget(current, id))}
          onRemove={(id) => editor.apply((current) => removeWidget(current, id))}
        />
      )}

      <WidgetDrawer open={catalogOpen} onClose={() => setCatalogOpen(false)} onAdd={onAddWidget} />
      <ConfigDrawer
        widget={widgetBeingConfigured}
        onClose={() => setConfiguringId(null)}
        onSave={onSaveWidget}
      />
      <ShareModal dashboard={dashboard} open={shareOpen} onClose={() => setShareOpen(false)} />
      <RenameModal
        draft={renameDraft}
        onDraftChange={setRenameDraft}
        onClose={() => setRenameDraft(null)}
        onSubmit={(name) => repo.save(dashboard.id, { name })}
      />
    </Stack>
  );
}

/** The config shown: the editor's copy while this dashboard is open in it, otherwise the stored one. */
function configOf(editor: EditorState, dashboard: Dashboard): DashboardConfig {
  return editor.dashboardId === dashboard.id && editor.config ? editor.config : dashboard.config;
}

function EmptyDashboard({ onAddWidget }: { onAddWidget: () => void }) {
  return (
    <NoData title="Painel vazio">
      <Stack align="center" gap="xs">
        <span>Adicione widgets do catálogo para montar o seu painel.</span>
        <Button leftSection={<IconPlus size={16} />} onClick={onAddWidget}>
          Adicionar widget
        </Button>
      </Stack>
    </NoData>
  );
}
