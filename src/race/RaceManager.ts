import type { CarState } from '../systems/physics';

export class RaceManager {
  totalLength: number;

  status: 'menu' | 'countdown' | 'running' = 'menu';
  private countdownRemaining = 0;
  private countdownTotal = 0;
  private falseStartHuman = false;
  private penaltyHuman = 0;

  laps: number[] = [];
  bestLap: number[] = [];
  private elapsedLap: number[] = [];
  private lastS: number[] = [];

  constructor(totalTrackMeters: number, carCount: number) {
    this.totalLength = totalTrackMeters;
    this.laps = new Array(carCount).fill(0);
    this.bestLap = new Array(carCount).fill(Infinity);
    this.elapsedLap = new Array(carCount).fill(0);
    this.lastS = new Array(carCount).fill(0);
  }

  startCountdown(seconds: number) {
    this.status = 'countdown';
    this.countdownRemaining = Math.max(0, seconds);
    this.countdownTotal = Math.max(0, seconds);
    this.falseStartHuman = false;
    this.penaltyHuman = 0;
    this.elapsedLap = this.elapsedLap.map(() => 0);
  }

  update(states: CarState[], dt: number, input: { throttle: number }) {
    // Handle countdown and false start detection
    if (this.status === 'menu') {
      return;
    }
    if (this.status === 'countdown') {
      // Detect false start if throttle pressed during countdown (human is index 0)
      if (input.throttle > 0.1 && !this.falseStartHuman) {
        this.falseStartHuman = true;
        this.penaltyHuman = 2.0; // seconds of lockout after GO
      }
      this.countdownRemaining = Math.max(0, this.countdownRemaining - dt);
      if (this.countdownRemaining <= 0) {
        this.status = 'running';
      }
      return;
    }

    // Apply ongoing penalty countdown during running
    if (this.penaltyHuman > 0) {
      this.penaltyHuman = Math.max(0, this.penaltyHuman - dt);
    }

    for (let i = 0; i < states.length; i++) {
      this.elapsedLap[i] += dt;
      const wrap = this.didWrap(this.lastS[i], states[i].sMeters);
      if (wrap) {
        this.laps[i]++;
        if (this.elapsedLap[i] < this.bestLap[i]) this.bestLap[i] = this.elapsedLap[i];
        this.elapsedLap[i] = 0;
      }
      this.lastS[i] = states[i].sMeters;
    }
  }

  private didWrap(prev: number, curr: number): boolean {
    const p = prev % this.totalLength;
    const c = curr % this.totalLength;
    return c < p && (prev - curr) < this.totalLength; // crossed start/finish
  }

  getCountdownSeconds(): number {
    return Math.ceil(this.countdownRemaining);
  }

  getCountdownProgress(): number {
    if (this.countdownTotal <= 0) return 0;
    return Math.max(0, Math.min(1, 1 - this.countdownRemaining / this.countdownTotal));
  }

  isFalseStart(): boolean {
    return this.falseStartHuman;
  }

  throttleMultiplier(index: number): number {
    if (this.status === 'menu' || this.status === 'countdown') return 0;
    // Human is index 0: apply penalty lockout if needed
    if (index === 0 && this.penaltyHuman > 0) return 0;
    return 1;
  }
}
