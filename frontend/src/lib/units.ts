export type UnitSystem = "metric" | "imperial";

// Temperature: °C ↔ °F
export function convertTemp(c: number | null | undefined, system: UnitSystem) {
  if (c == null) return { value: null, unit: system === "metric" ? "°C" : "°F" };
  return system === "metric"
    ? { value: c, unit: "°C" }
    : { value: c * 9 / 5 + 32, unit: "°F" };
}

// Wind speed: km/h ↔ mph
export function convertSpeed(kmh: number | null | undefined, system: UnitSystem) {
  if (kmh == null) return { value: null, unit: system === "metric" ? "km/h" : "mph" };
  return system === "metric"
    ? { value: kmh, unit: "km/h" }
    : { value: kmh * 0.621371, unit: "mph" };
}

// Pressure: hPa ↔ inHg
export function convertPressure(hpa: number | null | undefined, system: UnitSystem) {
  if (hpa == null) return { value: null, unit: system === "metric" ? "hPa" : "inHg" };
  return system === "metric"
    ? { value: hpa, unit: "hPa" }
    : { value: hpa * 0.02953, unit: "inHg" };
}

// Rain: mm ↔ in
export function convertRain(mm: number | null | undefined, system: UnitSystem) {
  if (mm == null) return { value: null, unit: system === "metric" ? "mm" : "in" };
  return system === "metric"
    ? { value: mm, unit: "mm" }
    : { value: mm * 0.03937, unit: "in" };
}

// Rain rate: mm/h ↔ in/h
export function convertRainRate(mmh: number | null | undefined, system: UnitSystem) {
  if (mmh == null) return { value: null, unit: system === "metric" ? "mm/h" : "in/h" };
  return system === "metric"
    ? { value: mmh, unit: "mm/h" }
    : { value: mmh * 0.03937, unit: "in/h" };
}

// Distance: km ↔ mi
export function convertDistance(km: number | null | undefined, system: UnitSystem) {
  if (km == null) return { value: null, unit: system === "metric" ? "km" : "mi" };
  return system === "metric"
    ? { value: km, unit: "km" }
    : { value: km * 0.621371, unit: "mi" };
}

// Altitude: m ↔ ft
export function convertAltitude(m: number | null | undefined, system: UnitSystem) {
  if (m == null) return { value: null, unit: system === "metric" ? "m" : "ft" };
  return system === "metric"
    ? { value: m, unit: "m" }
    : { value: m * 3.28084, unit: "ft" };
}
