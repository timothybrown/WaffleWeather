import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

// Provide a minimal localStorage stub if the environment doesn't supply one
const storage = new Map<string, string>();
const localStorageStub: Storage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { storage.set(key, value); },
  removeItem: (key: string) => { storage.delete(key); },
  clear: () => { storage.clear(); },
  get length() { return storage.size; },
  key: (index: number) => [...storage.keys()][index] ?? null,
};

vi.stubGlobal("localStorage", localStorageStub);

const unhandledFetch = vi.fn((input: RequestInfo | URL) =>
  Promise.reject(new Error(`Unhandled fetch in test: ${String(input)}`)),
);

// Auto-cleanup after each test
beforeEach(() => {
  storage.clear();
  unhandledFetch.mockClear();
  vi.stubGlobal("fetch", unhandledFetch);
});

afterEach(() => {
  cleanup();
});

// Mock WebSocket globally
vi.stubGlobal(
  "WebSocket",
  class MockWebSocket {
    url: string;
    readyState = 1;
    onopen: (() => void) | null = null;
    onclose: (() => void) | null = null;
    onmessage: ((e: { data: string }) => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(url: string) {
      this.url = url;
    }
    send() {}
    close() {}
  },
);
