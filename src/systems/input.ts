export class Input {
  state = { throttle: 0 };
  private target = 0;
  private readonly rampUp = 1.5; // per second
  private readonly rampDown = 2.0; // per second
  private gamepadIndex: number | null = null;
  private readonly deadzone = 0.12;

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') this.target = 1;
      if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') this.target = 0;
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') this.target = 0;
    });

    window.addEventListener('gamepadconnected', (e) => {
      if (this.gamepadIndex === null) this.gamepadIndex = e.gamepad.index;
    });
    window.addEventListener('gamepaddisconnected', (e) => {
      if (this.gamepadIndex === e.gamepad.index) this.gamepadIndex = null;
    });
  }

  update(dt?: number) {
    const d = dt ?? 1 / 120;

    // Poll gamepad and compute throttle
    let gpThrottle = 0;
    const gp = this.getActiveGamepad();
    if (gp) {
      // Prefer right trigger axis (common indices: 5 or 2 depending on mapping)
      const axes = gp.axes || [];
      const buttons = gp.buttons || [];
      const rtAxis = axes[5] ?? axes[2] ?? 0;
      const rtBtn = buttons[7]?.value ?? buttons[7]?.pressed ? 1 : 0;
      const raw = Math.max(rtAxis, rtBtn);
      gpThrottle = this.applyDeadzoneAndClamp(raw);
    }

    // Merge keyboard target with gamepad throttle (max wins)
    const desired = Math.max(this.target, gpThrottle);
    const rate = desired > this.state.throttle ? this.rampUp : this.rampDown;
    this.state.throttle += (desired - this.state.throttle) * Math.min(1, rate * d);
    this.state.throttle = Math.max(0, Math.min(1, this.state.throttle));
  }

  private getActiveGamepad(): Gamepad | null {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    if (this.gamepadIndex !== null) return pads[this.gamepadIndex] || null;
    // Fallback: pick first non-null
    for (const p of pads) if (p) return p;
    return null;
  }

  private applyDeadzoneAndClamp(x: number): number {
    const v = Math.max(0, Math.min(1, x));
    if (v < this.deadzone) return 0;
    // Remap so deadzone edge becomes 0
    return (v - this.deadzone) / (1 - this.deadzone);
  }
}
