import { Avatar, Button, Menu, Text } from "@mantine/core";
import { IconBell, IconLogin, IconLogout, IconSettings, IconShieldLock, IconUser } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../store/auth";
import { useUi } from "../../store/ui";
import { iniciais } from "../../lib/format";

export function UserMenu() {
  const { usuario, sair } = useAuth();
  const setAuth = useUi((s) => s.setAuthAberto);
  const navigate = useNavigate();
  const qc = useQueryClient();
  if (!usuario)
    return (
      <>
        <Button size="sm" variant="light" leftSection={<IconLogin size={16} />} onClick={() => setAuth(true)} visibleFrom="sm">
          Entrar
        </Button>
        <Button size="sm" variant="light" px={8} onClick={() => setAuth(true)} hiddenFrom="sm" aria-label="Entrar">
          <IconUser size={16} />
        </Button>
      </>
    );
  return (
    <Menu position="bottom-end" width={220} shadow="md">
      <Menu.Target>
        <Avatar component="button" radius="xl" color="eleicao" variant="filled" style={{ cursor: "pointer", border: 0 }} aria-label="Menu do usuário">
          {iniciais(usuario.nome || usuario.email)}
        </Avatar>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>
          <Text size="sm" fw={700} c="var(--mantine-color-text)">
            {usuario.nome}
          </Text>
          <Text size="xs">{usuario.email}</Text>
        </Menu.Label>
        <Menu.Item leftSection={<IconSettings size={14} />} onClick={() => navigate("/conta")}>
          Conta e preferências
        </Menu.Item>
        <Menu.Item leftSection={<IconBell size={14} />} onClick={() => navigate("/alertas")}>
          Alertas
        </Menu.Item>
        {usuario.is_admin && (
          <Menu.Item leftSection={<IconShieldLock size={14} />} onClick={() => navigate("/admin")}>
            Administração
          </Menu.Item>
        )}
        <Menu.Divider />
        <Menu.Item
          color="red"
          leftSection={<IconLogout size={14} />}
          onClick={() => {
            sair();
            qc.removeQueries({ queryKey: ["paineis"] });
            qc.removeQueries({ queryKey: ["favoritos"] });
            qc.removeQueries({ queryKey: ["alertas"] });
            navigate("/");
          }}
        >
          Sair
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
