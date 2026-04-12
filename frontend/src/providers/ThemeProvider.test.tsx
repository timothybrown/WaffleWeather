import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, act } from "@testing-library/react";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
