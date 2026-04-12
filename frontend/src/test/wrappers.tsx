import React, { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react";
import ThemeProvider from "@/providers/ThemeProvider";
import UnitsProvider from "@/providers/UnitsProvider";

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
}

function TestProviders({ children }: { children: ReactNode }) {
  const client = createTestQueryClient();
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <UnitsProvider>{children}</UnitsProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

/** Alias for use with renderHook({ wrapper }) */
export const wrapper = TestProviders;

export function renderWithProviders(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, "wrapper">,
) {
  return render(ui, { wrapper: TestProviders, ...options });
}
