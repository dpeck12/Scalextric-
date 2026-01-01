import type { RaceManager } from '../race/RaceManager';

export class StartUI {
  private overlay: HTMLDivElement;
  private lights: HTMLDivElement;
  private statusText: HTMLDivElement;
  private btn: HTMLButtonElement;
  private onStart: () => void;

  constructor(onStart: () => void) {
    this.onStart = onStart;
    this.overlay = document.createElement('div');
    this.overlay.style.position = 'absolute';
    this.overlay.style.left = '50%';
    this.overlay.style.top = '30%';
    this.overlay.style.transform = 'translateX(-50%)';
    this.overlay.style.textAlign = 'center';
    this.overlay.style.fontFamily = 'Inter, system-ui, sans-serif';
    this.overlay.style.zIndex = '1000';
    document.body.appendChild(this.overlay);

    const title = document.createElement('div');
    title.textContent = 'Scalextric';
    title.style.fontSize = '48px';
    title.style.marginBottom = '16px';
    this.overlay.appendChild(title);

    this.lights = document.createElement('div');
    this.lights.style.display = 'flex';
    this.lights.style.flexDirection = 'column';
    this.lights.style.gap = '10px';
    this.lights.style.alignItems = 'center';
    this.overlay.appendChild(this.lights);

    this.statusText = document.createElement('div');
    this.statusText.style.marginTop = '8px';
    this.statusText.style.fontSize = '20px';
    this.statusText.style.color = '#ffd400';
    this.overlay.appendChild(this.statusText);

    this.btn = document.createElement('button');
    this.btn.textContent = 'Start Race';
    this.btn.style.marginTop = '20px';
    this.btn.style.padding = '10px 16px';
    this.btn.style.fontSize = '18px';
    this.btn.style.cursor = 'pointer';
    this.btn.addEventListener('click', () => {
      this.statusText.textContent = 'Countdown starting...';
      this.onStart();
    });
    this.overlay.appendChild(this.btn);

    // Initial lights setup
    this.renderLights(0);
  }

  update(race: RaceManager) {
    // Visibility and content
    if (race.status === 'menu') {
      this.overlay.style.display = 'block';
      this.btn.style.display = 'inline-block';
    } else {
      this.btn.style.display = 'none';
      this.overlay.style.display = 'block'; // Keep lights visible during countdown
    }

    if (race.status === 'countdown') {
      const progress = race.getCountdownProgress();
      this.renderLights(progress);
      const secs = race.getCountdownSeconds();
      this.statusText.textContent = secs > 0 ? `Starting in ${secs}...` : 'GO!';
    } else if (race.status === 'running') {
      this.overlay.style.display = 'none';
    }
  }

  private renderLights(progress: number) {
    // Render 3 stacked red lights that fill progressively
    const count = 3;
    const lit = Math.round(progress * count);
    this.lights.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const circle = document.createElement('div');
      circle.style.width = '48px';
      circle.style.height = '48px';
      circle.style.borderRadius = '50%';
      circle.style.background = i < lit ? '#ff4d4f' : '#3a3a3a';
      circle.style.boxShadow = i < lit ? '0 0 12px #ff4d4f' : 'none';
      this.lights.appendChild(circle);
    }
  }
}