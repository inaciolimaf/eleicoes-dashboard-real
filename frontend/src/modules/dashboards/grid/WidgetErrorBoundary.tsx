import { Button, Stack, Text } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { Component, type ReactNode } from "react";

interface BoundaryProps {
  children: ReactNode;
  /** When this changes, the error state is cleared (the widget's configuration changed). */
  resetKey: string;
}

/** Shows a message in place of a widget that threw, so one broken widget does not blank the dashboard. */
export class WidgetErrorBoundary extends Component<BoundaryProps, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidUpdate(previous: { resetKey: string }) {
    if (previous.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  render() {
    if (this.state.error)
      return (
        <Stack align="center" gap={6} p="md">
          <IconAlertTriangle color="var(--mantine-color-red-5)" />
          <Text size="sm" ta="center">
            Este widget encontrou um erro.
          </Text>
          <Text size="xs" c="dimmed" ta="center" lineClamp={3}>
            {this.state.error.message}
          </Text>
          <Button size="compact-xs" variant="light" onClick={() => this.setState({ error: null })}>
            Recarregar widget
          </Button>
        </Stack>
      );
    return this.props.children;
  }
}
