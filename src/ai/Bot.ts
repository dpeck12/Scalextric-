import { Track } from '../track/Track';
import type { CarState, BotOutput } from '../systems/physics';
import { DIFFICULTY } from './difficulty';

function clamp(x: number, a: number, b: number) { return Math.max(a, Math.min(b, x)); }

export class Bot {
  private track: Track;
  private alpha = DIFFICULTY[1].alpha;
  private pid = { ...DIFFICULTY[1].pid };
  private integ = 0;
  private lastErr = 0;

  constructor(track: Track) {
    this.track = track;
  }

  setDifficulty(name: string) {
    const preset = DIFFICULTY.find(d => d.name.toLowerCase() === name.toLowerCase());
    if (preset) {
      this.alpha = preset.alpha;
      this.pid = { ...preset.pid };
    }
  }

  update(state: CarState, dt: number): BotOutput {
    const vTarget = this.computeTargetSpeed(state.sMeters);
    const err = vTarget - state.v;
    this.integ = clamp(this.integ + err * dt, -5, 5);
    const deriv = (err - this.lastErr) / dt;
    this.lastErr = err;
    let u = this.pid.kp * err + this.pid.ki * this.integ + this.pid.kd * deriv;
    u = clamp(u / 10, 0, 1); // scale to 0..1
    return { throttle: u };
  }

  private computeTargetSpeed(sMeters: number): number {
    // Lookahead across next samples to find min corner speed limit
    const lookaheadMeters = 15; // meters
    const stepMeters = 0.5;
    let vMax = 100; // high default
    for (let d = 0; d <= lookaheadMeters; d += stepMeters) {
      const rPx = this.estimateRadius(sMeters + d);
      if (!isFinite(rPx)) continue;
      const r = rPx * this.track.metersPerPixel;
      const aLatMax = 0.85 * 9.81; // align with physics mu*g
      const vCorner = Math.sqrt(aLatMax * r);
      vMax = Math.min(vMax, vCorner);
    }
    return this.alpha * vMax;
  }

  private estimateRadius(sMeters: number): number {
    // Reuse Track sample-based curvature via three points
    const sWrapped = ((sMeters % this.track.totalLengthMeters) + this.track.totalLengthMeters) % this.track.totalLengthMeters;
    const idx = this.findIndex(sWrapped);
    const pts = this.track.pointsPx;
    const i0 = Math.max(0, idx - 2);
    const i1 = idx;
    const i2 = Math.min(pts.length - 1, idx + 2);
    const p0 = pts[i0], p1 = pts[i1], p2 = pts[i2];
    const r = radiusFromThreePoints(p0.x, p0.y, p1.x, p1.y, p2.x, p2.y);
    return isFinite(r) ? r : Infinity;
  }

  private findIndex(s: number): number {
    let lo = 0, hi = this.track.cumulativeMeters.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.track.cumulativeMeters[mid] < s) lo = mid + 1; else hi = mid;
    }
    return lo;
  }
}

function radiusFromThreePoints(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): number {
  const a = x1 * (y2 - y3) - y1 * (x2 - x3) + x2 * y3 - x3 * y2;
  if (Math.abs(a) < 1e-6) return Infinity;
  const b = (x1 * x1 + y1 * y1) * (y3 - y2) + (x2 * x2 + y2 * y2) * (y1 - y3) + (x3 * x3 + y3 * y3) * (y2 - y1);
  const c = (x1 * x1 + y1 * y1) * (x2 - x3) + (x2 * x2 + y2 * y2) * (x3 - x1) + (x3 * x3 + y3 * y3) * (x1 - x2);
  const d = (x1 * x1 + y1 * y1) * (x3 * y2 - x2 * y3) + (x2 * x2 + y2 * y2) * (x1 * y3 - x3 * y1) + (x3 * x3 + y3 * y3) * (x2 * y1 - x1 * y2);
  const xc = -b / (2 * a);
  const yc = -c / (2 * a);
  const r = Math.hypot(x1 - xc, y1 - yc);
  return r;
}
