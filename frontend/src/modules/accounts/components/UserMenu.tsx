import { Avatar, Button, Menu, Text } from "@mantine/core";
import { IconBell, IconLogin, IconLogout, IconSettings, IconShieldLock, IconUser } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../../lib/auth-store";
import { useUi } from "../../../lib/ui-store";
import { initials } from "../../../lib/formatting";

/** Sign-in buttons for a visitor: a labelled one on wide screens, an icon one on narrow ones. */
function SignInButtons() {
  const openAuth = () => useUi.getState().setAuthOpen(true);
  return (
    <>
      <Button
        size="sm"
        variant="light"
        leftSection={<IconLogin size={16} />}
        onClick={openAuth}
        visibleFrom="sm"
      >
        Entrar
      </Button>
      <Button size="sm" variant="light" px={8} onClick={openAuth} hiddenFrom="sm" aria-label="Entrar">
        <IconUser size={16} />
      </Button>
    </>
  );
}

/** Account avatar that opens the user's menu. */
export function UserMenu() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  if (!user) return <SignInButtons />;
  return (
    <Menu position="bottom-end" width={220} shadow="md">
      <Menu.Target>
        <Avatar
          component="button"
          radius="xl"
          color="election"
          variant="filled"
          style={{ cursor: "pointer", border: 0 }}
          aria-label="Menu do usuário"
        >
          {initials(user.name || user.email)}
        </Avatar>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>
          <Text size="sm" fw={700} c="var(--mantine-color-text)">
            {user.name}
          </Text>
          <Text size="xs">{user.email}</Text>
        </Menu.Label>
        <Menu.Item leftSection={<IconSettings size={14} />} onClick={() => navigate("/conta")}>
          Conta e preferências
        </Menu.Item>
        <Menu.Item leftSection={<IconBell size={14} />} onClick={() => navigate("/alertas")}>
          Alertas
        </Menu.Item>
        {user.is_admin && (
          <Menu.Item leftSection={<IconShieldLock size={14} />} onClick={() => navigate("/admin")}>
            Administração
          </Menu.Item>
        )}
        <Menu.Divider />
        <Menu.Item
          color="red"
          leftSection={<IconLogout size={14} />}
          onClick={() => {
            signOut();
            // the account's data must not outlive the session
            queryClient.removeQueries({ queryKey: ["paineis"] });
            queryClient.removeQueries({ queryKey: ["favoritos"] });
            queryClient.removeQueries({ queryKey: ["alertas"] });
            navigate("/");
          }}
        >
          Sair
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
