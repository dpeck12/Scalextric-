export class FixedStepLoop {
  private accumulator = 0;
  private last = 0;
  private running = false;
  private rafId = 0;

  constructor(
    private readonly dt: number,
    private readonly update: (dt: number) => void,
    private readonly render: (alpha: number, dt: number) => void
  ) {}

  start() {
    if (this.running) return;
    this.running = true;
    this.accumulator = 0;
    this.last = performance.now();
    const tick = () => {
      if (!this.running) return;
      const now = performance.now();
      let frameTime = (now - this.last) / 1000;
      this.last = now;
      // Clamp to avoid spiral of death on tab resume
      frameTime = Math.min(frameTime, this.dt * 3);
      this.accumulator += frameTime;

      while (this.accumulator >= this.dt) {
        this.update(this.dt);
        this.accumulator -= this.dt;
      }

      const alpha = this.accumulator / this.dt;
      this.render(alpha, this.dt);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pause();
      else this.resume();
    });
  }

  pause() {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  resume() {
    if (this.running) return;
    this.running = true;
    this.accumulator = 0;
    this.last = performance.now();
    this.rafId = requestAnimationFrame(() => this.start());
  }
}
