export interface Particle {
  x: number;
  y: number;
  speed: number;
  size: number;
  opacity: number;
  maxOpacity: number;
  fadeRate: number;
}

const CENTER = 100;
const CLIP_R = 58;
const RAD = Math.PI / 180;
const KMH_TO_MPH = 1 / 1.609344;

export function gustPulseAt(
  speedKmh: number,
  gustKmh: number | null,
  timeMs: number,
): number {
  const speedMph = speedKmh * KMH_TO_MPH;
  const gustMph = (gustKmh ?? 0) * KMH_TO_MPH;
  if (gustMph <= speedMph) return 0;
  return (Math.sin(timeMs * 0.002) + 1) / 2;
}

export class ParticleDrift {
  particles: Particle[] = [];
  private spawnAccum = 0;

  constructor(private readonly random: () => number = Math.random) {}

  update(
    dt: number,
    speedKmh: number,
    gustKmh: number | null,
    dirDeg: number,
    timeMs: number,
  ): void {
    const speed = speedKmh * KMH_TO_MPH;

    const gustPulse = gustPulseAt(speedKmh, gustKmh, timeMs);
    const speedMult = 1 + gustPulse;
    const spawnMult = 1 + gustPulse * 0.6;

    const flowRad = (dirDeg + 180) * RAD;
    const flowDx = Math.sin(flowRad);
    const flowDy = -Math.cos(flowRad);

    const spawnRate = Math.min(speed * 0.9, 25) * spawnMult;
    this.spawnAccum += spawnRate * dt;
    while (this.spawnAccum >= 1 && speed > 0.5) {
      this.particles.push(this.spawn(dirDeg, speed));
      this.spawnAccum -= 1;
    }
    if (speed <= 0.5) this.spawnAccum = 0;

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      const move = p.speed * speedMult * dt;
      p.x += flowDx * move;
      p.y += flowDy * move;

      if (p.opacity < p.maxOpacity) {
        p.opacity = Math.min(
          p.opacity + p.fadeRate * p.maxOpacity * 60 * dt,
          p.maxOpacity,
        );
      }

      const dx = p.x - CENTER;
      const dy = p.y - CENTER;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > CLIP_R - 6) {
        const edgeFade = Math.max(1 - (dist - (CLIP_R - 6)) / 6, 0);
        p.opacity = Math.min(p.opacity, p.maxOpacity * edgeFade);
      }
      if (dist > CLIP_R) {
        this.particles.splice(i, 1);
      }
    }
  }

  private spawn(dirDeg: number, speedMph: number): Particle {
    const wr = dirDeg * RAD;
    const spread = (this.random() - 0.5) * Math.PI;
    const angle = wr + spread;
    return {
      x: CENTER + CLIP_R * Math.sin(angle),
      y: CENTER - CLIP_R * Math.cos(angle),
      speed: (20 + speedMph * 5) * (0.7 + this.random() * 0.6),
      size: 0.8 + this.random() * (1.2 + Math.min(speedMph / 15, 1.2)),
      opacity: 0,
      maxOpacity: 0.25 + this.random() * 0.3,
      fadeRate: 0.1 + this.random() * 0.08,
    };
  }

  clear(): void {
    this.particles = [];
    this.spawnAccum = 0;
  }
}
