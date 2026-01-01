import type { RaceManager } from '../race/RaceManager';
import type { CarState } from '../systems/physics';

function fmtTime(t: number): string {
  if (!isFinite(t)) return '--:--.--';
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

export class HUD {
  private el: HTMLDivElement;
  private overlay: HTMLDivElement;
  private difficulty: HTMLSelectElement;
  private onDifficulty: (name: string) => void;

  constructor(onDifficultyChange: (name: string) => void) {
    this.onDifficulty = onDifficultyChange;
    this.el = document.createElement('div');
    this.el.className = 'hud';
    this.el.style.zIndex = '900';
    document.body.appendChild(this.el);

    this.overlay = document.createElement('div');
    this.overlay.style.position = 'absolute';
    this.overlay.style.left = '50%';
    this.overlay.style.top = '20%';
    this.overlay.style.transform = 'translateX(-50%)';
    this.overlay.style.fontSize = '64px';
    this.overlay.style.fontFamily = 'Inter, system-ui, sans-serif';
    this.overlay.style.zIndex = '900';
    document.body.appendChild(this.overlay);

    this.difficulty = document.createElement('select');
    for (const name of ['Easy', 'Medium', 'Hard']) {
      const opt = document.createElement('option');
      opt.value = name; opt.textContent = name;
      this.difficulty.appendChild(opt);
    }
    this.difficulty.value = 'Medium';
    this.difficulty.addEventListener('change', () => {
      this.onDifficulty(this.difficulty.value);
    });
    this.el.appendChild(document.createTextNode('Difficulty: '));
    this.el.appendChild(this.difficulty);
  }

  update(race: RaceManager, cars: CarState[]) {
    const rows = cars.map((c, i) => {
      const who = i === 0 ? 'You' : `Bot ${i}`;
      const best = fmtTime(race.bestLap[i]);
      return `<div>${who} Lap: ${race.laps[i]} | Best: ${best} | v: ${c.v.toFixed(2)} m/s ${c.deslotted ? '(DESLOTTED)' : ''}</div>`;
    }).join('');
    this.el.innerHTML = rows;
    // Re-append difficulty selector after innerHTML reset
    this.el.appendChild(document.createTextNode('Difficulty: '));
    this.el.appendChild(this.difficulty);

    // Start lights overlay
    if (race.status === 'countdown') {
      const secs = race.getCountdownSeconds();
      this.overlay.textContent = secs > 0 ? String(secs) : '';
      this.overlay.style.color = '#ffd400';
    } else {
      this.overlay.textContent = '';
    }
    if (race.isFalseStart() && race.status === 'countdown') {
      this.overlay.textContent = 'FALSE START!';
      this.overlay.style.color = '#ff4d4f';
    }
    if (race.status === 'running' && race.isFalseStart()) {
      if (cars[0]?.v < 0.1) {
        this.overlay.textContent = 'PENALTY';
        this.overlay.style.color = '#ff4d4f';
      } else {
        this.overlay.textContent = '';
      }
    }
  }
}
