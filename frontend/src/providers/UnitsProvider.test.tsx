import { beforeEach, describe, expect, it } from "vitest";
import { screen, act } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@testing-library/react";
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

  it("reads from localStorage on mount", async () => {
    localStorage.setItem("ww-units", "imperial");
    render(
      <UnitsProvider>
        <TestConsumer />
      </UnitsProvider>,
    );
    // Wait for useEffect to run
    await act(async () => {});
    expect(screen.getByTestId("system").textContent).toBe("imperial");
  });
});
