import * as PIXI from 'pixi.js';
import { FixedStepLoop } from './engine/loop';
import { Track } from './track/Track';
import { Physics } from './systems/physics';
import { Input } from './systems/input';
import { Bot } from './ai/Bot';
import { RaceManager } from './race/RaceManager';
import { HUD } from './ui/HUD';
import { StartUI } from './ui/StartUI';

const appContainer = document.getElementById('app')!;

const app = new PIXI.Application({
  backgroundColor: 0x121212,
  resizeTo: appContainer,
  antialias: true,
  resolution: Math.max(1, Math.floor(window.devicePixelRatio || 1)),
  autoDensity: true
});
appContainer.appendChild(app.view as HTMLCanvasElement);

// World scale: meters per pixel
const METERS_PER_PIXEL = 0.02; // 50 px = 1 m

async function bootstrap() {
  const track = await Track.load('/assets/tracks/complex.json', METERS_PER_PIXEL);

  const physics = new Physics(track, METERS_PER_PIXEL);
  const input = new Input();
  const botCount = 3; // more than 1 bot opponent
  const carCount = 1 + botCount; // index 0 = human
  physics.initCars(carCount);
  const bots: Bot[] = new Array(botCount).fill(0).map(() => new Bot(track));
  const race = new RaceManager(track.totalLengthMeters, carCount);
  const hud = new HUD((name) => bots.forEach(b => b.setDifficulty(name)));
  const startUI = new StartUI(() => race.startCountdown(3));

  // Graphics layers
  const gBg = new PIXI.Graphics();
  const gTrack = new PIXI.Graphics();
  const gEdges = new PIXI.Graphics();
  app.stage.addChild(gBg);
  app.stage.addChild(gTrack);
  app.stage.addChild(gEdges);
  // Car sprites
  const makeCarTexture = (color: number) => {
    const g = new PIXI.Graphics();
    const width = 10;
    const length = 22;
    g.beginFill(color);
    g.drawRect(-length / 2, -width / 2, length, width);
    g.endFill();
    return app.renderer.generateTexture(g);
  };
  const palette = [0x00e6ff, 0xff6e00, 0xff2e63, 0x8eff32, 0xffd400, 0xbb86fc];
  const sprites: PIXI.Sprite[] = new Array(carCount).fill(0).map((_, i) => {
    const tex = makeCarTexture(palette[i % palette.length]);
    const sp = new PIXI.Sprite(tex);
    sp.anchor.set(0.5);
    app.stage.addChild(sp);
    return sp;
  });

  // Background grass
  const bounds = track.boundsPx;
  const margin = 100;
  gBg.beginFill(0x1f6f2f);
  gBg.drawRect(bounds.x - margin, bounds.y - margin, bounds.width + margin * 2, bounds.height + margin * 2);
  gBg.endFill();

  // Track fill using left and right edges
  const polygon: PIXI.IPointData[] = [];
  for (const p of track.leftEdgePx) polygon.push(p);
  for (let i = track.rightEdgePx.length - 1; i >= 0; i--) polygon.push(track.rightEdgePx[i]);
  gTrack.beginFill(0x2b2b2b);
  gTrack.drawPolygon(polygon);
  gTrack.endFill();

  // Edge lines
  gEdges.lineStyle(2, 0xffffff);
  const drawPolyline = (pts: {x:number;y:number}[]) => {
    gEdges.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) gEdges.lineTo(pts[i].x, pts[i].y);
    gEdges.lineTo(pts[0].x, pts[0].y);
  };
  drawPolyline(track.leftEdgePx);
  drawPolyline(track.rightEdgePx);

  // Starting grid rendering near start/finish
  const startPose = track.samplePose(0);
  const gridCells = 2; // columns per row
  const rows = Math.ceil(carCount / gridCells);
  const rowSpacingMeters = 3; // distance between rows
  const colOffsetPx = track.laneWidthPx * 0.35;
  const nx = -Math.sin(startPose.headingRad);
  const ny = Math.cos(startPose.headingRad);
  const tx = Math.cos(startPose.headingRad);
  const ty = Math.sin(startPose.headingRad);
  gEdges.lineStyle(3, 0xffffff, 0.8);
  for (let r = 0; r < rows; r++) {
    const sBack = - (r * rowSpacingMeters);
    const p = track.samplePose(sBack);
    // draw grid rectangles
    const cellLength = 40; // px
    const cellWidth = track.laneWidthPx * 0.7; // px
    for (let c = 0; c < gridCells; c++) {
      const side = c === 0 ? -1 : 1;
      const cx = p.x + nx * (colOffsetPx * side);
      const cy = p.y + ny * (colOffsetPx * side);
      // rectangle oriented by heading
      const x0 = cx - tx * (cellLength/2) - nx * (cellWidth/2);
      const y0 = cy - ty * (cellLength/2) - ny * (cellWidth/2);
      const x1 = cx + tx * (cellLength/2) - nx * (cellWidth/2);
      const y1 = cy + ty * (cellLength/2) - ny * (cellWidth/2);
      const x2 = cx + tx * (cellLength/2) + nx * (cellWidth/2);
      const y2 = cy + ty * (cellLength/2) + ny * (cellWidth/2);
      const x3 = cx - tx * (cellLength/2) + nx * (cellWidth/2);
      const y3 = cy - ty * (cellLength/2) + ny * (cellWidth/2);
      gEdges.moveTo(x0, y0);
      gEdges.lineTo(x1, y1);
      gEdges.lineTo(x2, y2);
      gEdges.lineTo(x3, y3);
      gEdges.lineTo(x0, y0);
    }
  }

  // Center camera on track bounding box
  const marginCam = 40;
  const screenW = app.renderer.screen.width;
  const screenH = app.renderer.screen.height;
  const scaleX = (screenW - marginCam * 2) / bounds.width;
  const scaleY = (screenH - marginCam * 2) / bounds.height;
  const scale = Math.min(scaleX, scaleY);
  app.stage.scale.set(scale);
  app.stage.position.set(
    screenW / 2 - (bounds.x + bounds.width / 2) * scale,
    screenH / 2 - (bounds.y + bounds.height / 2) * scale
  );

  // Place cars on starting grid
  const gridPositionsSMeters: number[] = [];
  for (let i = 0; i < carCount; i++) {
    const r = Math.floor(i / gridCells);
    const c = i % gridCells;
    const sBack = - (r * rowSpacingMeters);
    const side = c === 0 ? -1 : 1;
    // base pose at sBack, offset sideways by colOffset
    const p = track.samplePose(sBack);
    const sNear = track.findNearestSMeters(
      p.x - Math.sin(p.headingRad) * (colOffsetPx * side),
      p.y + Math.cos(p.headingRad) * (colOffsetPx * side)
    );
    gridPositionsSMeters.push(sNear);
    physics.cars[i].sMeters = sNear;
    physics.cars[i].v = 0;
    physics.cars[i].deslotted = false;
    physics.cars[i].marshalTimer = 0;
  }

  // Previous states for interpolation
  let prevStates = physics.cars.map(c => ({ ...c }));

  const loop = new FixedStepLoop(1 / 120, (dt) => {
    // Inputs
    input.update();

    // Bot updates for each bot car (indices 1..carCount-1)
    const throttles: number[] = new Array(carCount).fill(0);
    // human throttle (index 0)
    throttles[0] = race.throttleMultiplier(0) * input.state.throttle;
    for (let b = 0; b < botCount; b++) {
      const idx = 1 + b;
      const botOut = bots[b].update(physics.cars[idx], dt);
      throttles[idx] = race.throttleMultiplier(idx) * botOut.throttle;
    }

    // Physics step
    // Capture previous states before update
    prevStates = physics.cars.map(c => ({ ...c }));
    physics.update(dt, throttles);
    race.update(physics.cars, dt, input.state);
  }, (alpha, dt) => {
    // Render cars via sprite transforms with prev→current interpolation
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    const renderCar = (sprite: PIXI.Sprite, prev: typeof physics.cars[number], curr: typeof physics.cars[number]) => {
      let x: number, y: number, rot: number;
      const prevOff = prev.deslotted && prev.offX !== undefined && prev.offY !== undefined;
      const currOff = curr.deslotted && curr.offX !== undefined && curr.offY !== undefined;
      if (prevOff || currOff) {
        const px = prev.offX ?? curr.offX ?? 0;
        const py = prev.offY ?? curr.offY ?? 0;
        const cx = curr.offX ?? prev.offX ?? px;
        const cy = curr.offY ?? prev.offY ?? py;
        x = lerp(px, cx, alpha);
        y = lerp(py, cy, alpha);
        const ang = Math.atan2(curr.offVY ?? prev.offVY ?? 0, curr.offVX ?? prev.offVX ?? 0);
        rot = ang;
      } else {
        const s = lerp(prev.sMeters, curr.sMeters, alpha);
        const pose = track.samplePose(s);
        x = pose.x; y = pose.y; rot = pose.headingRad;
      }
      sprite.position.set(x, y);
      sprite.rotation = rot;
    };

    for (let i = 0; i < carCount; i++) {
      renderCar(sprites[i], prevStates[i], physics.cars[i]);
    }

    hud.update(race, physics.cars);
    startUI.update(race);
  });

  loop.start();
}

bootstrap().catch((err) => console.error(err));
