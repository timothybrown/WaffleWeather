import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, act } from "@testing-library/react";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import ThemeProvider, { useTheme } from "./ThemeProvider";

function TestConsumer() {
  const { preference, resolved, setPreference } = useTheme();
  return (
    <div>
      <span data-testid="preference">{preference}</span>
      <span data-testid="resolved">{resolved}</span>
      <button onClick={() => setPreference("light")}>Light</button>
      <button onClick={() => setPreference("dark")}>Dark</button>
      <button onClick={() => setPreference("auto")}>Auto</button>
    </div>
  );
}

let mockDarkMatch = false;
const listeners: Array<() => void> = [];

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.querySelector('meta[name="theme-color"]')?.remove();
  mockDarkMatch = false;
  listeners.length = 0;

  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: query.includes("dark") ? mockDarkMatch : false,
        media: query,
        addEventListener: (_: string, cb: () => void) => {
          listeners.push(cb);
        },
        removeEventListener: (_: string, cb: () => void) => {
          const idx = listeners.indexOf(cb);
          if (idx >= 0) listeners.splice(idx, 1);
        },
        dispatchEvent: () => true,
      }) as unknown as MediaQueryList,
  );
});

describe("ThemeProvider", () => {
  it("defaults to auto preference", () => {
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("preference").textContent).toBe("auto");
  });

  it("resolves auto to light when system is light", () => {
    mockDarkMatch = false;
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("resolved").textContent).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("resolves auto to dark when system is dark", () => {
    mockDarkMatch = true;
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("resolved").textContent).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("sets data-theme to dark when preference is dark", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );
    await user.click(screen.getByText("Dark"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(screen.getByTestId("resolved").textContent).toBe("dark");
  });

  it("sets data-theme to light when preference is light", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );
    await user.click(screen.getByText("Light"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(screen.getByTestId("resolved").textContent).toBe("light");
  });

  it("persists preference to localStorage", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );
    await user.click(screen.getByText("Dark"));
    expect(localStorage.getItem("ww-theme")).toBe("dark");
  });

  it("reads preference from localStorage on mount", () => {
    localStorage.setItem("ww-theme", "light");
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("preference").textContent).toBe("light");
    expect(screen.getByTestId("resolved").textContent).toBe("light");
  });

  it("hydrates from the server default before applying stored preference", async () => {
    localStorage.setItem("ww-theme", "dark");
    const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: undefined,
    });

    let serverHtml = "";
    try {
      serverHtml = renderToString(
        <ThemeProvider>
          <TestConsumer />
        </ThemeProvider>,
      );
    } finally {
      if (windowDescriptor) {
        Object.defineProperty(globalThis, "window", windowDescriptor);
      }
    }

    expect(serverHtml).toContain("auto");
    expect(serverHtml).toContain("light");

    const container = document.createElement("div");
    container.innerHTML = serverHtml;
    document.body.appendChild(container);
    const onRecoverableError = vi.fn();

    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(
        container,
        <ThemeProvider>
          <TestConsumer />
        </ThemeProvider>,
        { onRecoverableError },
      );
    });

    const preferenceText = container.querySelector(
      '[data-testid="preference"]',
    )?.textContent;
    const resolvedText = container.querySelector(
      '[data-testid="resolved"]',
    )?.textContent;

    await act(async () => {
      root?.unmount();
    });
    container.remove();

    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(preferenceText).toBe("dark");
    expect(resolvedText).toBe("dark");
  });

  it("falls back to auto when localStorage reads fail", () => {
    const originalLocalStorage = window.localStorage;
    const blockedStorage = {
      ...originalLocalStorage,
      getItem: vi.fn(() => {
        throw new Error("storage unavailable");
      }),
    } as Storage;
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: blockedStorage,
    });

    try {
      render(
        <ThemeProvider>
          <TestConsumer />
        </ThemeProvider>,
      );
      expect(screen.getByTestId("preference").textContent).toBe("auto");
    } finally {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        value: originalLocalStorage,
      });
    }
  });

  it("updates the UI when localStorage writes fail", async () => {
    const user = userEvent.setup();
    const originalLocalStorage = window.localStorage;
    const blockedStorage = {
      ...originalLocalStorage,
      getItem: vi.fn(() => {
        throw new Error("storage unavailable");
      }),
      setItem: vi.fn(() => {
        throw new Error("storage unavailable");
      }),
    } as Storage;
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: blockedStorage,
    });

    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );

    try {
      await user.click(screen.getByText("Dark"));
      expect(screen.getByTestId("preference").textContent).toBe("dark");
      expect(screen.getByTestId("resolved").textContent).toBe("dark");
    } finally {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        value: originalLocalStorage,
      });
      await user.click(screen.getByText("Auto"));
    }
  });

  it("responds to system preference changes while in auto mode", () => {
    mockDarkMatch = false;
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("resolved").textContent).toBe("light");

    mockDarkMatch = true;
    act(() => {
      for (const listener of listeners) listener();
    });
    expect(screen.getByTestId("resolved").textContent).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("does not respond to system changes when not in auto mode", async () => {
    const user = userEvent.setup();
    mockDarkMatch = false;
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );
    await user.click(screen.getByText("Light"));

    mockDarkMatch = true;
    act(() => {
      for (const listener of listeners) listener();
    });
    expect(screen.getByTestId("resolved").textContent).toBe("light");
  });

  it("creates theme-color meta tag", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );
    await user.click(screen.getByText("Dark"));
    const meta = document.querySelector('meta[name="theme-color"]');
    expect(meta?.getAttribute("content")).toBe("#1a1714");

    await user.click(screen.getByText("Light"));
    expect(meta?.getAttribute("content")).toBe("#faf7f2");
  });

  it("removes MQL listener on unmount", () => {
    mockDarkMatch = false;
    const { unmount } = render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );
    const countBefore = listeners.length;
    expect(countBefore).toBeGreaterThan(0);
    unmount();
    expect(listeners).toHaveLength(0);
  });
});
