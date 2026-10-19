import { afterEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useResolvedColors } from "./useResolvedColors";

describe("useResolvedColors", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("style");
  });

  it("re-resolves when the variable list changes", () => {
    document.documentElement.style.setProperty("--a", "#111111");
    document.documentElement.style.setProperty("--b", "#222222");

    const { result, rerender } = renderHook(({ names }) => useResolvedColors(names), {
      initialProps: { names: ["--a"] },
    });
    expect(result.current).toEqual({ "--a": "#111111" });

    rerender({ names: ["--b"] });
    expect(result.current).toEqual({ "--b": "#222222" });
  });

  it("keeps the same object for an equal inline list", () => {
    document.documentElement.style.setProperty("--a", "#111111");

    const { result, rerender } = renderHook(({ names }) => useResolvedColors(names), {
      initialProps: { names: ["--a"] },
    });
    const first = result.current;

    rerender({ names: ["--a"] });
    expect(result.current).toBe(first);
  });
});
