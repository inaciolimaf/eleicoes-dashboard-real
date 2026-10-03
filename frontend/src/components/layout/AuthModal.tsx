import { Alert, Button, Modal, PasswordInput, Stack, Tabs, Text, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { useLogin, useRegistro } from "../../api/hooks";
import { useUi } from "../../store/ui";

export function AuthModal() {
  const aberto = useUi((s) => s.authAberto);
  const setAberto = useUi((s) => s.setAuthAberto);
  const [aba, setAba] = useState<string | null>("entrar");
  const login = useLogin();
  const registro = useRegistro();
  const form = useForm({
    initialValues: { nome: "", email: "", senha: "" },
    validate: {
      email: (v) => (/^\S+@\S+\.\S+$/.test(v) ? null : "E-mail inválido"),
      senha: (v) => (v.length >= 6 ? null : "Mínimo de 6 caracteres"),
      nome: (v, vals) => (aba === "registro" && !v.trim() && vals ? "Informe seu nome" : null),
    },
  });
  const erro = (aba === "entrar" ? login.error : registro.error) as Error | null;
  const enviar = form.onSubmit(async (v) => {
    try {
      const r = aba === "entrar" ? await login.mutateAsync({ email: v.email, senha: v.senha }) : await registro.mutateAsync(v);
      notifications.show({ color: "teal", title: `Olá, ${r.usuario.nome.split(" ")[0]}!`, message: r.usuario.is_admin ? "Você é administrador." : "Sessão iniciada." });
      form.reset();
      setAberto(false);
    } catch {
      /* exibido no Alert */
    }
  });
  return (
    <Modal opened={aberto} onClose={() => setAberto(false)} title={<Text fw={700}>Sua conta</Text>} size="sm">
      <Tabs value={aba} onChange={setAba}>
        <Tabs.List grow mb="md">
          <Tabs.Tab value="entrar">Entrar</Tabs.Tab>
          <Tabs.Tab value="registro">Criar conta</Tabs.Tab>
        </Tabs.List>
      </Tabs>
      <form onSubmit={enviar}>
        <Stack>
          {aba === "registro" && <TextInput label="Nome" autoComplete="name" {...form.getInputProps("nome")} />}
          <TextInput label="E-mail" type="email" autoComplete="email" {...form.getInputProps("email")} data-autofocus />
          <PasswordInput label="Senha" autoComplete={aba === "entrar" ? "current-password" : "new-password"} {...form.getInputProps("senha")} />
          {erro && (
            <Alert color="red" variant="light">
              {erro.message}
            </Alert>
          )}
          <Button type="submit" loading={login.isPending || registro.isPending}>
            {aba === "entrar" ? "Entrar" : "Criar conta"}
          </Button>
          <Text size="xs" c="dimmed">
            Sem conta, seus painéis ficam salvos neste navegador. Com conta, ficam disponíveis em qualquer lugar e podem ser compartilhados.
          </Text>
        </Stack>
      </form>
    </Modal>
  );
}
