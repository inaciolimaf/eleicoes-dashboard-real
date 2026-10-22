import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { Text } from "@mantine/core";
import { useNavigate } from "react-router-dom";
import { useDashboards } from "../hooks";
import { readDashboardFile, downloadDashboardFile } from "../file";
import type { Dashboard } from "../repo";
import type { DashboardConfig } from "../schema";

/** Menu commands on one dashboard: copy, import into a new one, export, delete. */
export function useDashboardCommands(dashboard: Dashboard, config: DashboardConfig) {
  const repo = useDashboards();
  const navigate = useNavigate();

  const duplicate = async () => {
    const copy = await repo.create(`${dashboard.name} (cópia)`, config, false);
    navigate(`/paineis/${copy.id}`);
  };

  const exportFile = () => downloadDashboardFile(dashboard.name, { ...config, nome: dashboard.name });

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const { name, config: imported } = readDashboardFile(await file.text());
      const created = await repo.create(name, imported, false);
      notifications.show({ color: "teal", title: "Painel importado", message: created.name });
      navigate(`/paineis/${created.id}`);
    } catch (error) {
      notifications.show({ color: "red", title: "Falha ao importar", message: (error as Error).message });
    }
  };

  const confirmRemove = () =>
    modals.openConfirmModal({
      title: "Apagar painel",
      children: <Text size="sm">Apagar “{dashboard.name}”? Essa ação não pode ser desfeita.</Text>,
      labels: { confirm: "Apagar", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        await repo.remove(dashboard.id);
        navigate("/paineis");
      },
    });

  return { duplicate, exportFile, importFile, confirmRemove };
}
