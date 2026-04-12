"use client";

export default function OfflinePage() {
  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center gap-6 px-6 text-center">
      <span className="text-6xl">🧇</span>
      <h1 className="font-display text-2xl font-semibold text-text">
        You are offline
      </h1>
      <p className="max-w-sm text-sm text-text-muted">
        The weather station could not be reached. Check your connection and try
        again.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="rounded-lg border border-border bg-surface-alt px-5 py-2.5 text-sm font-medium text-text transition-colors hover:bg-surface-hover"
      >
        Try again
      </button>
    </div>
  );
}
