import { renderWaffleIcon } from "@/lib/pwa-icon";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function Icon() {
  return renderWaffleIcon(180);
}
