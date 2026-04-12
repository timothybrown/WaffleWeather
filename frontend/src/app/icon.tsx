import { renderWaffleIcon } from "@/lib/pwa-icon";

export const size = { width: 192, height: 192 };
export const contentType = "image/png";

export default function Icon() {
  return renderWaffleIcon(192);
}
