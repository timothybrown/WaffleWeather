import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import UnitsProvider, { useUnits } from "./UnitsProvider";

function TestConsumer() {
  const { system, toggle } = useUnits();
  return (
    <div>
      <span data-testid="system">{system}</span>
      <button onClick={toggle}>Toggle</button>
    </div>
  );
}

function DoubleToggleConsumer() {
  const { system, toggle } = useUnits();
  return (
    <div>
      <span data-testid="system">{system}</span>
      <button
        onClick={() => {
          toggle();
          toggle();
        }}
      >
        Toggle twice
      </button>
    </div>
  );
}

describe("UnitsProvider", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to metric", () => {
    render(
      <UnitsProvider>
        <TestConsumer />
      </UnitsProvider>,
    );
    expect(screen.getByTestId("system").textContent).toBe("metric");
  });

  it("toggles to imperial", async () => {
    const user = userEvent.setup();
    render(
      <UnitsProvider>
        <TestConsumer />
      </UnitsProvider>,
    );
    await user.click(screen.getByText("Toggle"));
    expect(screen.getByTestId("system").textContent).toBe("imperial");
  });

  it("toggles back to metric", async () => {
    const user = userEvent.setup();
    render(
      <UnitsProvider>
        <TestConsumer />
      </UnitsProvider>,
    );
    await user.click(screen.getByText("Toggle"));
    await user.click(screen.getByText("Toggle"));
    expect(screen.getByTestId("system").textContent).toBe("metric");
  });

  it("composes two synchronous toggles in one event", async () => {
    const user = userEvent.setup();
    render(
      <UnitsProvider>
        <DoubleToggleConsumer />
      </UnitsProvider>,
    );
    expect(screen.getByTestId("system").textContent).toBe("metric");

    await user.click(screen.getByText("Toggle twice"));

    expect(screen.getByTestId("system").textContent).toBe("metric");
    expect(localStorage.getItem("ww-units")).toBe("metric");
  });

  it("persists to localStorage on toggle", async () => {
    const user = userEvent.setup();
    render(
      <UnitsProvider>
        <TestConsumer />
      </UnitsProvider>,
    );
    await user.click(screen.getByText("Toggle"));
    expect(localStorage.getItem("ww-units")).toBe("imperial");
  });

  it("reads from localStorage on mount", () => {
    localStorage.setItem("ww-units", "imperial");
    render(
      <UnitsProvider>
        <TestConsumer />
      </UnitsProvider>,
    );
    expect(screen.getByTestId("system").textContent).toBe("imperial");
  });

  it("hydrates from the server default before applying stored units", async () => {
    localStorage.setItem("ww-units", "imperial");
    const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: undefined,
    });

    let serverHtml = "";
    try {
      serverHtml = renderToString(
        <UnitsProvider>
          <TestConsumer />
        </UnitsProvider>,
      );
    } finally {
      if (windowDescriptor) {
        Object.defineProperty(globalThis, "window", windowDescriptor);
      }
    }

    expect(serverHtml).toContain("metric");

    const container = document.createElement("div");
    container.innerHTML = serverHtml;
    document.body.appendChild(container);
    const onRecoverableError = vi.fn();

    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(
        container,
        <UnitsProvider>
          <TestConsumer />
        </UnitsProvider>,
        { onRecoverableError },
      );
    });

    const systemText = container.querySelector(
      '[data-testid="system"]',
    )?.textContent;

    await act(async () => {
      root?.unmount();
    });
    container.remove();

    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(systemText).toBe("imperial");
  });

  it("falls back to metric when localStorage reads fail", () => {
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
        <UnitsProvider>
          <TestConsumer />
        </UnitsProvider>,
      );
      expect(screen.getByTestId("system").textContent).toBe("metric");
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
      <UnitsProvider>
        <TestConsumer />
      </UnitsProvider>,
    );

    try {
      await user.click(screen.getByText("Toggle"));
      expect(screen.getByTestId("system").textContent).toBe("imperial");
    } finally {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        value: originalLocalStorage,
      });
      await user.click(screen.getByText("Toggle"));
    }
  });
});
