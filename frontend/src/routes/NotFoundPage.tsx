import { Button, Stack, Text, Title } from "@mantine/core";
import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <Stack align="center" py={80} gap="sm">
      <Title order={1} c="dimmed" className="num">
        404
      </Title>
      <Text>Esta página não existe.</Text>
      <Button component={Link} to="/">
        Voltar ao início
      </Button>
    </Stack>
  );
}
