import { readFileSync } from "fs";
import { join } from "path";
import { NextResponse } from "next/server";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function Icon() {
  const buf = readFileSync(join(process.cwd(), "public", "icon-180.png"));
  return new NextResponse(buf, {
    headers: { "Content-Type": "image/png" },
  });
}
