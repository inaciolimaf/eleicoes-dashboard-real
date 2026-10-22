import { Alert, Button, Modal, PasswordInput, Stack, Tabs, Text, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { useLogin, useRegister } from "../hooks";
import { useUi } from "../../../lib/ui-store";

type AuthTab = "login" | "register";

/** Sign-in and account-creation modal, opened from the user menu or from any screen that needs an account. */
export function AuthModal() {
  const isOpen = useUi((s) => s.authOpen);
  const setOpen = useUi((s) => s.setAuthOpen);
  const [tab, setTab] = useState<AuthTab>("login");
  const login = useLogin();
  const register = useRegister();
  const form = useForm({
    initialValues: { name: "", email: "", password: "" },
    validate: {
      email: (v) => (/^\S+@\S+\.\S+$/.test(v) ? null : "E-mail inválido"),
      password: (v) => (v.length >= 6 ? null : "Mínimo de 6 caracteres"),
      name: (v, values) => (tab === "register" && !v.trim() && values ? "Informe seu nome" : null),
    },
  });
  const error = (tab === "login" ? login.error : register.error) as Error | null;
  const submit = form.onSubmit(async (values) => {
    try {
      const result =
        tab === "login"
          ? await login.mutateAsync({ email: values.email, password: values.password })
          : await register.mutateAsync(values);
      notifications.show({
        color: "teal",
        title: `Olá, ${result.user.name.split(" ")[0]}!`,
        message: result.user.is_admin ? "Você é administrador." : "Sessão iniciada.",
      });
      form.reset();
      setOpen(false);
    } catch {
      /* shown in the Alert below the form */
    }
  });
  return (
    <Modal opened={isOpen} onClose={() => setOpen(false)} title={<Text fw={700}>Sua conta</Text>} size="sm">
      <Tabs value={tab} onChange={(value) => setTab((value as AuthTab) ?? "login")}>
        <Tabs.List grow mb="md">
          <Tabs.Tab value="login">Entrar</Tabs.Tab>
          <Tabs.Tab value="register">Criar conta</Tabs.Tab>
        </Tabs.List>
      </Tabs>
      <form onSubmit={submit}>
        <Stack>
          {tab === "register" && (
            <TextInput label="Nome" autoComplete="name" {...form.getInputProps("name")} />
          )}
          <TextInput
            label="E-mail"
            type="email"
            autoComplete="email"
            {...form.getInputProps("email")}
            data-autofocus
          />
          <PasswordInput
            label="Senha"
            autoComplete={tab === "login" ? "current-password" : "new-password"}
            {...form.getInputProps("password")}
          />
          {error && (
            <Alert color="red" variant="light">
              {error.message}
            </Alert>
          )}
          <Button type="submit" loading={login.isPending || register.isPending}>
            {tab === "login" ? "Entrar" : "Criar conta"}
          </Button>
          <Text size="xs" c="dimmed">
            Sem conta, seus painéis ficam salvos neste navegador. Com conta, ficam disponíveis em qualquer
            lugar e podem ser compartilhados.
          </Text>
        </Stack>
      </form>
    </Modal>
  );
}
