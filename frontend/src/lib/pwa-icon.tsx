import { ImageResponse } from "next/og";

const BG_COLOR = "#1a1714";
const ACCENT_COLOR = "#d4a574";

export function renderWaffleIcon(size: number): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: BG_COLOR,
          borderRadius: size * 0.2,
          border: `${Math.max(2, size * 0.03)}px solid ${ACCENT_COLOR}`,
        }}
      >
        <span style={{ fontSize: size * 0.6 }}>🧇</span>
      </div>
    ),
    { width: size, height: size },
  );
}
