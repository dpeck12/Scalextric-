import { Track } from '../track/Track';

export type CarState = {
  sMeters: number;
  v: number;
  deslotted: boolean;
  marshalTimer: number;
  offX?: number;
  offY?: number;
  offVX?: number;
  offVY?: number;
};

export type InputState = {
  throttle: number; // 0..1
};

export type BotOutput = {
  throttle: number; // 0..1
};

function clamp(x: number, a: number, b: number) { return Math.max(a, Math.min(b, x)); }

export class Physics {
  readonly track: Track;
  readonly metersPerPixel: number;

  // Constants
  private readonly g = 9.81; // m/s^2
  private readonly mu = 0.85; // friction coefficient
  private readonly kT = 12.0; // motor accel constant (m/s^2 at full throttle)
  private readonly cDrag = 0.35; // quadratic drag coefficient
  private readonly marshalDelay = 2.0;
  private readonly offFriction = 6.0;

  cars: CarState[] = [];

  constructor(track: Track, metersPerPixel: number) {
    this.track = track;
    this.metersPerPixel = metersPerPixel;
  }

  initCars(count: number) {
    this.cars = new Array(count).fill(0).map((_, i) => ({
      sMeters: i * 3,
      v: 0,
      deslotted: false,
      marshalTimer: 0
    }));
  }

  update(dt: number, throttles: number[]) {
    for (let i = 0; i < this.cars.length; i++) {
      const throttle = throttles[i] ?? 0;
      this.updateCar(this.cars[i], dt, throttle);
    }
  }

  private updateCar(state: CarState, dt: number, throttle: number) {
    if (state.deslotted) {
      // Off-track kinematics
      if (state.offX !== undefined && state.offY !== undefined && state.offVX !== undefined && state.offVY !== undefined) {
        const speed = Math.hypot(state.offVX, state.offVY);
        const decel = this.offFriction;
        const newSpeed = Math.max(0, speed - decel * dt);
        if (speed > 0) {
          const scale = newSpeed / speed;
          state.offVX *= scale;
          state.offVY *= scale;
        }
        state.offX += (state.offVX ?? 0) * dt / this.metersPerPixel;
        state.offY += (state.offVY ?? 0) * dt / this.metersPerPixel;
      }
      state.marshalTimer -= dt;
      if (state.marshalTimer <= 0) {
        const sNearest = this.track.findNearestSMeters(state.offX ?? 0, state.offY ?? 0);
        state.sMeters = sNearest;
        state.v = 0;
        state.deslotted = false;
        state.offX = undefined;
        state.offY = undefined;
        state.offVX = undefined;
        state.offVY = undefined;
      }
      return;
    }

    // Longitudinal dynamics
    const accel = this.kT * clamp(throttle, 0, 1) - this.cDrag * state.v * state.v;
    state.v = Math.max(0, state.v + accel * dt);
    state.sMeters += state.v * dt;

    // Determine local curvature
    const curvatureR = this.estimateLocalRadius(state.sMeters);

    if (curvatureR !== Infinity) {
      const rMeters = curvatureR * this.metersPerPixel;
      const aLat = (state.v * state.v) / rMeters; // m/s^2
      const aLatMax = this.mu * this.g; // could add magnets term later
      if (aLat > aLatMax + 0.01) {
        // De-slot: move off-track along tangent + outward normal
        const pose = this.track.samplePose(state.sMeters);
        const nx = -Math.sin(pose.headingRad);
        const ny = Math.cos(pose.headingRad);
        const tx = Math.cos(pose.headingRad);
        const ty = Math.sin(pose.headingRad);
        const outward = 0.5 * state.v; // m/s outward impulse
        state.offX = pose.x;
        state.offY = pose.y;
        state.offVX = tx * state.v + nx * outward;
        state.offVY = ty * state.v + ny * outward;
        state.deslotted = true;
        state.marshalTimer = this.marshalDelay;
      }
    }
  }

  private estimateLocalRadius(sMeters: number): number {
    // Naive radius estimate by looking at neighboring samples: use discrete curvature via three points
    const idx = this['findIndex'](sMeters);
    const pts = this.track.pointsPx;
    const i0 = Math.max(0, idx - 2);
    const i1 = idx;
    const i2 = Math.min(pts.length - 1, idx + 2);
    const p0 = pts[i0], p1 = pts[i1], p2 = pts[i2];
    const r = radiusFromThreePoints(p0.x, p0.y, p1.x, p1.y, p2.x, p2.y);
    return isFinite(r) ? r : Infinity;
  }

  private findIndex(sMeters: number): number {
    const sWrapped = ((sMeters % this.track.totalLengthMeters) + this.track.totalLengthMeters) % this.track.totalLengthMeters;
    // Binary search in track.cumulativeMeters
    let lo = 0, hi = this.track.cumulativeMeters.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.track.cumulativeMeters[mid] < sWrapped) lo = mid + 1; else hi = mid;
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
