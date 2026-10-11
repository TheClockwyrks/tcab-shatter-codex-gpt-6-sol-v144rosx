import { createCanvas } from "@napi-rs/canvas";
import { createEngine, ConstantClock } from "@clockwyrks/simple-2d";
import { describe, expect, it } from "vitest";
import { FIELD_H, FIELD_W, TICK_DT, TORPEDO_SPEED } from "./constants";
import { debug, game, initialState, stepTick } from "./game";

const idle = {
  left: false,
  right: false,
  up: false,
  fire: false,
  torpedo: false,
};

function playing() {
  return debug.setScreen(
    debug.setWaveSpawning(initialState(), false),
    "playing",
  );
}

describe("Shatter simulation", () => {
  it("runs whole ticks through the engine and keeps rendering independent", async () => {
    const canvas = createCanvas(FIELD_W, FIELD_H);
    const engine = createEngine({
      canvas: canvas as unknown as HTMLCanvasElement,
      width: FIELD_W,
      height: FIELD_H,
      game,
      clock: new ConstantClock(1000 / 60),
      surface: {
        cssWidth: () => FIELD_W,
        cssHeight: () => FIELD_H,
        dpr: () => 1,
        events: () => new EventTarget(),
      },
    });
    await engine.initialize();
    engine.apply((s) => debug.setScreen(s, "playing"));
    engine.apply((s) => debug.setWaveSpawning(s, false));
    await engine.advance(60);
    expect(debug.snapshot(engine.state).simTime).toBeCloseTo(1, 8);
    expect(engine.debug.version).toBe(1);
    engine.destroy();
  });

  it("bends bullets toward the star but leaves a powered torpedo straight", () => {
    let s = playing();
    s = debug.addBullet(s, 450, 300, 0, 0);
    s = debug.addTorpedo(s, 450, 300, 0);
    s = debug.setTorpedoHoming(s, s.torpedoes[0].id, false);
    const next = stepTick(s, idle);
    expect(next.bullets[0].vx).toBeGreaterThan(0);
    expect(next.bullets[0].vy).toBeGreaterThan(0);
    expect(next.torpedoes[0].vx).toBeCloseTo(TORPEDO_SPEED);
    expect(next.torpedoes[0].vy).toBeCloseTo(0);
    expect(next.simTime).toBeCloseTo(TICK_DT);
  });

  it("chips armor, then destroys a rock and fans two full-health fragments", () => {
    let s = playing();
    s = debug.addRock(s, "large", 300, 300);
    for (let i = 0; i < 3; i++) {
      s = debug.addBullet(s, 300, 300, 0, 0);
      s = stepTick(s, idle);
      if (i < 2) {
        expect(s.rocks).toHaveLength(1);
        expect(s.rocks[0].health).toBe(2 - i);
        expect(s.score).toBe(0);
      }
    }
    expect(s.score).toBe(20);
    expect(s.rocks.map((r) => r.size)).toEqual(["medium", "medium"]);
    expect(s.rocks.every((r) => r.health === 2)).toBe(true);
  });

  it("lets a torpedo destroy armor outright and reports the pose", () => {
    let s = playing();
    s = debug.addRock(s, "large", 300, 300);
    s = debug.addTorpedo(s, 300, 300, 0);
    expect(debug.snapshot(s).torpedoes[0].heading).toBe(0);
    s = stepTick(s, idle);
    expect(s.score).toBe(20);
    expect(s.rocks).toHaveLength(2);
  });
});

describe("progression and impacts", () => {
  it("clears the last fragment into a timed next-wave banner", () => {
    let s = debug.setScreen(initialState(), "playing");
    s = debug.setWave(s, 1);
    s = debug.addRock(s, "small", 300, 300);
    s = debug.addBullet(s, 300, 300, 0, 0);
    s = stepTick(s, idle);
    expect(s.rocks).toHaveLength(0);
    expect(s.wave).toBe(2);
    expect(s.waveBanner).toBeGreaterThan(0);
    for (let i = 0; i < 180; i++) s = stepTick(s, idle);
    expect(s.waveBanner).toBe(0);
    expect(s.rocks).toHaveLength(5);
  });

  it("recycles a damaged rock through the star without healing or scoring", () => {
    let s = playing();
    s = debug.addRock(s, "large", 640, 360);
    s = debug.setRockHealth(s, s.rocks[0].id, 1);
    s = debug.setNextRecycleEdge(s, "left");
    s = debug.setNextRockSpeed(s, 80);
    s = stepTick(s, idle);
    expect(s.rocks[0].id).toBe(1);
    expect(s.rocks[0].health).toBe(1);
    expect(s.rocks[0].x).toBe(0);
    expect(s.rocks[0].vx).toBe(80);
    expect(s.score).toBe(0);
  });

  it("loses one ship on contact and grants respawn grace", () => {
    let s = playing();
    s = debug.addRock(s, "small", s.ship.x, s.ship.y);
    s = stepTick(s, idle);
    expect(s.lives).toBe(2);
    expect(s.ship.invuln).toBeGreaterThan(2);
    s = stepTick(s, idle);
    expect(s.lives).toBe(2);
  });

  it("recharges a spent torpedo over game ticks", () => {
    let s = debug.setTorpedoCharge(playing(), 0);
    for (let i = 0; i < 600; i++) s = stepTick(s, idle);
    expect(s.torpedoCharge).toBeCloseTo(0.5, 6);
    expect(debug.snapshot(s).torpedoReady).toBe(false);
    for (let i = 0; i < 600; i++) s = stepTick(s, idle);
    expect(debug.snapshot(s).torpedoReady).toBe(true);
  });
});
