import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/wrappers";
import Sidebar from "./Sidebar";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

// Mock WebSocketProvider
vi.mock("@/providers/WebSocketProvider", () => ({
  useWebSocket: () => ({
    connected: true,
    offline: false,
    reconnect: () => {},
  }),
}));

describe("Sidebar", () => {
  it("renders WaffleWeather branding", () => {
    renderWithProviders(<Sidebar open={true} onClose={() => {}} />);
    expect(screen.getByText("WaffleWeather")).toBeInTheDocument();
  });

  it("renders all navigation links", () => {
    renderWithProviders(<Sidebar open={true} onClose={() => {}} />);
    expect(screen.getByText("Observatory")).toBeInTheDocument();
    expect(screen.getByText("Lightning")).toBeInTheDocument();
    expect(screen.getByText("Wind Rose")).toBeInTheDocument();
    expect(screen.getByText("History")).toBeInTheDocument();
    expect(screen.getByText("Diagnostics")).toBeInTheDocument();
  });

  it("shows 'Live' when connected", () => {
    renderWithProviders(<Sidebar open={true} onClose={() => {}} />);
    expect(screen.getByText("Live")).toBeInTheDocument();
  });

  it("shows unit toggle buttons", () => {
    renderWithProviders(<Sidebar open={true} onClose={() => {}} />);
    expect(screen.getByText("Metric")).toBeInTheDocument();
    expect(screen.getByText("Imperial")).toBeInTheDocument();
  });

  it("calls onClose when close button clicked", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<Sidebar open={true} onClose={onClose} />);
    await user.click(screen.getByLabelText("Close menu"));
    expect(onClose).toHaveBeenCalled();
  });

  it("highlights active nav item", () => {
    renderWithProviders(<Sidebar open={true} onClose={() => {}} />);
    const observatoryLink = screen.getByText("Observatory").closest("a");
    expect(observatoryLink?.className).toContain("text-primary");
  });

  it("shows theme toggle with three options", () => {
    renderWithProviders(<Sidebar open={true} onClose={() => {}} />);
    const group = screen.getByRole("radiogroup", { name: "Theme" });
    expect(group).toBeInTheDocument();
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);
    expect(screen.getByTitle("Auto")).toBeInTheDocument();
    expect(screen.getByTitle("Light")).toBeInTheDocument();
    expect(screen.getByTitle("Dark")).toBeInTheDocument();
  });

  it("switches theme when clicking toggle segments", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Sidebar open={true} onClose={() => {}} />);

    await user.click(screen.getByTitle("Dark"));
    expect(screen.getByTitle("Dark")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTitle("Auto")).toHaveAttribute("aria-checked", "false");

    await user.click(screen.getByTitle("Light"));
    expect(screen.getByTitle("Light")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTitle("Dark")).toHaveAttribute("aria-checked", "false");
  });
});
