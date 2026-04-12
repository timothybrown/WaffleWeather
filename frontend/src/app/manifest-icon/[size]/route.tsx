import { renderWaffleIcon } from "@/lib/pwa-icon";
import { NextResponse } from "next/server";

const ALLOWED_SIZES = new Set([96, 192, 512]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ size: string }> },
) {
  const { size: sizeParam } = await params;
  const size = Number(sizeParam);

  if (!ALLOWED_SIZES.has(size)) {
    return NextResponse.json({ error: "Invalid size" }, { status: 400 });
  }

  const response = renderWaffleIcon(size);
  response.headers.set(
    "Cache-Control",
    "public, max-age=31536000, immutable",
  );
  return response;
}
