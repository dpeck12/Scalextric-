export type Segment =
  | { type: 'straight'; lengthPx: number }
  | { type: 'curve'; radiusPx: number; angleDeg: number; dir: 'left' | 'right' };

export type TrackData = {
  name: string;
  segments: Segment[];
  start: { x: number; y: number; headingDeg: number };
  laneWidthPx?: number;
};

export type Vec2 = { x: number; y: number };

function deg2rad(d: number) { return (d * Math.PI) / 180; }

export class Track {
  readonly data: TrackData;
  readonly metersPerPixel: number;
  readonly totalLengthMeters: number;
  readonly pointsPx: Vec2[] = [];
  readonly headingsRad: number[] = [];
  readonly cumulativeMeters: number[] = [];
  readonly boundsPx: { x: number; y: number; width: number; height: number };
  readonly laneWidthPx: number;
  readonly leftEdgePx: Vec2[] = [];
  readonly rightEdgePx: Vec2[] = [];

  private constructor(data: TrackData, mpp: number) {
    this.data = data;
    this.metersPerPixel = mpp;
    this.laneWidthPx = (data.laneWidthPx ?? 40);

    // Build polyline of points around the track
    const pts: Vec2[] = [];
    const cum: number[] = [];
    const heads: number[] = [];

    let x = data.start.x;
    let y = data.start.y;
    let heading = deg2rad(data.start.headingDeg);

    const stepPx = 2; // finer sampling for smoother motion
    let sMeters = 0;

    for (const seg of data.segments) {
      if (seg.type === 'straight') {
        const steps = Math.max(1, Math.floor(seg.lengthPx / stepPx));
        const dx = Math.cos(heading) * (seg.lengthPx / steps);
        const dy = Math.sin(heading) * (seg.lengthPx / steps);
        for (let i = 0; i < steps; i++) {
          x += dx; y += dy;
          pts.push({ x, y });
          heads.push(heading);
          sMeters += (Math.hypot(dx, dy) * this.metersPerPixel);
          cum.push(sMeters);
        }
      } else if (seg.type === 'curve') {
        const angle = deg2rad(seg.angleDeg);
        const dirSign = seg.dir === 'left' ? 1 : -1;
        // Compute center of arc
        const cx = x - Math.sin(heading) * dirSign * seg.radiusPx;
        const cy = y + Math.cos(heading) * dirSign * seg.radiusPx;
        const arcLenPx = Math.abs(seg.radiusPx * angle);
        const steps = Math.max(1, Math.ceil(arcLenPx / stepPx));
        const dtheta = (angle / steps) * dirSign;
        for (let i = 0; i < steps; i++) {
          heading += dtheta;
          x = cx + Math.sin(heading) * dirSign * seg.radiusPx;
          y = cy - Math.cos(heading) * dirSign * seg.radiusPx;
          pts.push({ x, y });
          heads.push(heading);
          sMeters += (Math.abs(dtheta) * seg.radiusPx * this.metersPerPixel);
          cum.push(sMeters);
        }
      }
    }

    // Close loop to start
    pts.push(data.start);
    heads.push(deg2rad(data.start.headingDeg));
    cum.push(sMeters + this.metersPerPixel * stepPx);

    this.pointsPx = pts;
    this.headingsRad = heads;
    this.cumulativeMeters = cum;
    this.totalLengthMeters = sMeters;

    // Compute bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    this.boundsPx = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };

    // Build edges by offsetting normals
    const half = this.laneWidthPx / 2;
    for (let i = 0; i < this.pointsPx.length; i++) {
      const p = this.pointsPx[i];
      const h = this.headingsRad[i];
      const nx = -Math.sin(h);
      const ny = Math.cos(h);
      this.leftEdgePx.push({ x: p.x + nx * half, y: p.y + ny * half });
      this.rightEdgePx.push({ x: p.x - nx * half, y: p.y - ny * half });
    }
  }

  static async load(url: string, metersPerPixel: number): Promise<Track> {
    const res = await fetch(url);
    const json = (await res.json()) as TrackData;
    return new Track(json, metersPerPixel);
  }

  samplePx(sMeters: number): Vec2 {
    // Wrap around and linearly interpolate between samples
    const sWrapped = ((sMeters % this.totalLengthMeters) + this.totalLengthMeters) % this.totalLengthMeters;
    const idx = this.findIndexForMeters(sWrapped);
    const prev = Math.max(0, idx - 1);
    const s0 = this.cumulativeMeters[prev];
    const s1 = this.cumulativeMeters[idx];
    const t = s1 > s0 ? (sWrapped - s0) / (s1 - s0) : 0;
    const p0 = this.pointsPx[prev];
    const p1 = this.pointsPx[idx];
    return { x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t };
  }

  samplePose(sMeters: number): { x: number; y: number; headingRad: number } {
    const sWrapped = ((sMeters % this.totalLengthMeters) + this.totalLengthMeters) % this.totalLengthMeters;
    const idx = this.findIndexForMeters(sWrapped);
    const prev = Math.max(0, idx - 1);
    const s0 = this.cumulativeMeters[prev];
    const s1 = this.cumulativeMeters[idx];
    const t = s1 > s0 ? (sWrapped - s0) / (s1 - s0) : 0;
    const p0 = this.pointsPx[prev];
    const p1 = this.pointsPx[idx];
    const x = p0.x + (p1.x - p0.x) * t;
    const y = p0.y + (p1.y - p0.y) * t;
    // Smooth heading by interpolating discrete headings along the polyline
    const h0 = this.headingsRad[prev] ?? 0;
    const h1 = this.headingsRad[idx] ?? h0;
    const h = angleLerp(h0, h1, t);
    return { x, y, headingRad: h };
  }

  private findIndexForMeters(s: number): number {
    // Binary search on cumulativeMeters
    let lo = 0, hi = this.cumulativeMeters.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.cumulativeMeters[mid] < s) lo = mid + 1; else hi = mid;
    }
    return lo;
  }

  findNearestSMeters(x: number, y: number): number {
    let bestIdx = 0;
    let bestD2 = Infinity;
    for (let i = 0; i < this.pointsPx.length; i++) {
      const p = this.pointsPx[i];
      const dx = p.x - x;
      const dy = p.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { bestD2 = d2; bestIdx = i; }
    }
    return this.cumulativeMeters[bestIdx];
  }
}

function angleLerp(a: number, b: number, t: number): number {
  // Interpolate the shortest arc between angles a and b
  let delta = ((b - a + Math.PI) % (2 * Math.PI)) - Math.PI;
  // Handle edge case when modulo yields negative
  if (delta < -Math.PI) delta += 2 * Math.PI;
  return a + delta * t;
}
