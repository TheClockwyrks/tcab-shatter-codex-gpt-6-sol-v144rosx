import type {
  Game,
  InitApi,
  RenderApi,
  UpdateApi,
} from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import * as C from "./constants";
import type { RockSize } from "./constants";

export type Screen = "title" | "howto" | "playing" | "paused" | "gameover";
export type SaucerEdge = "left" | "right";
export type FieldEdge = "top" | "bottom" | "left" | "right";

export interface ShipState {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly angle: number;
  readonly thrusting: boolean;
  readonly invuln: number;
  readonly collision: boolean;
  readonly fireCooldown: number;
}

export interface BulletState {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly life: number;
}

export interface RockState {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly size: RockSize;
  readonly spin: number;
  readonly health: number;
  readonly flash: number;
}

export interface SaucerState {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly mind: boolean;
  readonly gun: boolean;
  readonly travel: boolean;
  readonly weave: 1 | -1;
  readonly fireClock: number;
  readonly weaveClock: number;
  readonly age: number;
}

export interface TorpedoState {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly heading: number;
  readonly life: number;
  readonly homing: boolean;
}

export interface ShatterState {
  readonly screen: Screen;
  readonly menuIndex: number;

  readonly score: number;
  readonly lives: number;
  readonly wave: number;
  readonly waveBanner: number;

  readonly ship: ShipState;
  readonly bullets: readonly BulletState[];
  readonly rocks: readonly RockState[];
  readonly saucer: SaucerState | null;
  readonly enemyBullets: readonly BulletState[];
  readonly torpedoes: readonly TorpedoState[];
  readonly torpedoCharge: number;

  readonly waveSpawning: boolean;
  readonly saucerSpawning: boolean;
  readonly saucerClock: number;
  readonly saucerDue: number;

  readonly nextSaucerEdge: SaucerEdge | null;
  readonly nextSaucerRow: number | null;
  readonly nextSaucerAim: number | null;
  readonly nextRockSpeed: number | null;
  readonly nextRecycleEdge: FieldEdge | null;

  readonly tickClock: number;
  readonly nextId: number;
  readonly simTime: number;
  readonly muted: boolean;
}

export const BACKGROUND = "#070d1b";
type ReadState = DeepReadonly<ShatterState>;
type Point = { x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number };
type Controls = {
  left: boolean;
  right: boolean;
  up: boolean;
  fire: boolean;
  torpedo: boolean;
};
type Sound = (cue: C.CueName) => void;
const TAU = Math.PI * 2;
const wrap = (n: number, size: number): number => ((n % size) + size) % size;
const dx = (a: number, b: number, size: number): number =>
  wrap(a - b + size / 2, size) - size / 2;
const distance = (a: Point, b: Point): number =>
  Math.hypot(dx(a.x, b.x, C.FIELD_W), dx(a.y, b.y, C.FIELD_H));
const direction = (a: number): Point => ({ x: Math.cos(a), y: Math.sin(a) });
const angleTo = (a: Point, b: Point): number =>
  Math.atan2(dx(b.y, a.y, C.FIELD_H), dx(b.x, a.x, C.FIELD_W));
const angleDelta = (a: number, b: number): number =>
  Math.atan2(Math.sin(a - b), Math.cos(a - b));
const finite = (v: number): number => {
  if (!Number.isFinite(v)) throw new Error(`non-finite number: ${v}`);
  return v;
};
const valid = <T extends string>(value: T, choices: readonly string[]): T => {
  if (!choices.includes(value)) throw new Error(`invalid value: ${value}`);
  return value;
};
const bool = (value: boolean): boolean => {
  if (typeof value !== "boolean")
    throw new Error(`invalid boolean: ${String(value)}`);
  return value;
};
const rand = (a: number, b: number): number => a + Math.random() * (b - a);
const star = { x: C.STAR_X, y: C.STAR_Y };
const blankShip = (): ShipState => ({
  x: C.SAFE_X,
  y: C.SAFE_Y,
  vx: 0,
  vy: 0,
  angle: C.FACE_UP,
  thrusting: false,
  invuln: 0,
  collision: true,
  fireCooldown: 0,
});
export function initialState(muted = false): ShatterState {
  return {
    screen: "title",
    menuIndex: 0,
    score: 0,
    lives: C.START_LIVES,
    wave: 0,
    waveBanner: 0,
    ship: blankShip(),
    bullets: [],
    rocks: [],
    saucer: null,
    enemyBullets: [],
    torpedoes: [],
    torpedoCharge: 1,
    waveSpawning: true,
    saucerSpawning: true,
    saucerClock: 0,
    saucerDue: C.SAUCER_FIRST_DELAY,
    nextSaucerEdge: null,
    nextSaucerRow: null,
    nextSaucerAim: null,
    nextRockSpeed: null,
    nextRecycleEdge: null,
    tickClock: 0,
    nextId: 1,
    simTime: 0,
    muted,
    bulletTrails: {},
    extraLifeFlash: 0,
    pointerPresses: {},
  };
}
// Cosmetic state is carried with the world, never in a renderer closure.
export interface ShatterState {
  readonly bulletTrails: Readonly<Record<number, readonly Point[]>>;
  readonly extraLifeFlash: number;
}

function gravity<T extends { x: number; y: number; vx: number; vy: number }>(
  body: T,
): T {
  const x = C.STAR_X - body.x,
    y = C.STAR_Y - body.y;
  const d = Math.hypot(x, y);
  if (d === 0) return body;
  const acceleration = C.MU / Math.max(d, C.SOFTEN) ** 2;
  return {
    ...body,
    vx: body.vx + (x / d) * acceleration * C.TICK_DT,
    vy: body.vy + (y / d) * acceleration * C.TICK_DT,
  };
}
function travel<T extends { x: number; y: number; vx: number; vy: number }>(
  body: T,
): T {
  return {
    ...body,
    x: wrap(body.x + body.vx * C.TICK_DT, C.FIELD_W),
    y: wrap(body.y + body.vy * C.TICK_DT, C.FIELD_H),
  };
}
function swept(
  a0: Point,
  a1: Point,
  ar: number,
  b0: Point,
  b1: Point,
  br: number,
): boolean {
  const avx = dx(a1.x, a0.x, C.FIELD_W),
    avy = dx(a1.y, a0.y, C.FIELD_H);
  const bvx = dx(b1.x, b0.x, C.FIELD_W),
    bvy = dx(b1.y, b0.y, C.FIELD_H);
  const vx = avx - bvx,
    vy = avy - bvy;
  const x = dx(a0.x, b0.x, C.FIELD_W),
    y = dx(a0.y, b0.y, C.FIELD_H);
  const t = Math.max(
    0,
    Math.min(1, -(x * vx + y * vy) / (vx * vx + vy * vy || 1)),
  );
  return Math.hypot(x + vx * t, y + vy * t) <= ar + br;
}
function addScore(s: ShatterState, points: number, sound: Sound): ShatterState {
  const old = Math.floor(s.score / C.EXTRA_LIFE_STEP),
    score = s.score + points;
  const extra = Math.floor(score / C.EXTRA_LIFE_STEP) - old;
  if (extra) sound(C.CUES.extraLife);
  return {
    ...s,
    score,
    lives: s.lives + extra,
    extraLifeFlash: extra ? 0.8 : s.extraLifeFlash,
  };
}
function spawnWave(s: ShatterState): ShatterState {
  const rocks = [...s.rocks];
  let nextId = s.nextId;
  const posed = s.nextRockSpeed;
  for (let i = 0; i < C.WAVE_BASE_ROCKS + s.wave; i++) {
    let p: Point;
    do {
      p = { x: rand(0, C.FIELD_W), y: rand(0, C.FIELD_H) };
    } while (
      distance(p, s.ship) < C.WAVE_MIN_SHIP_DIST ||
      distance(p, star) < C.WAVE_MIN_STAR_DIST
    );
    const speed =
      (posed ?? rand(C.ROCK_SPEED_MIN.large, C.ROCK_SPEED_MAX.large)) *
      (1 + Math.min(C.WAVE_SPEED_CAP, C.WAVE_SPEED_STEP * (s.wave - 1)));
    const v = direction(rand(0, TAU));
    rocks.push({
      id: nextId++,
      ...p,
      vx: v.x * speed,
      vy: v.y * speed,
      size: "large",
      spin: rand(0, TAU),
      health: C.ROCK_HEALTH.large,
      flash: 0,
    });
  }
  return { ...s, rocks, nextId, nextRockSpeed: null };
}
function startGame(s: ShatterState): ShatterState {
  return spawnWave({
    ...initialState(s.muted),
    screen: "playing",
    wave: 1,
    nextId: s.nextId,
  });
}
function spawnSaucer(s: ShatterState, sound: Sound): ShatterState {
  const edge = s.nextSaucerEdge ?? (Math.random() < 0.5 ? "left" : "right");
  const y = s.nextSaucerRow ?? rand(C.SAUCER_R, C.FIELD_H - C.SAUCER_R);
  sound(C.CUES.saucer);
  return {
    ...s,
    saucer: {
      id: s.nextId,
      x: edge === "left" ? 0 : C.FIELD_W,
      y,
      vx: edge === "left" ? C.SAUCER_SPEED : -C.SAUCER_SPEED,
      vy: 0,
      mind: true,
      gun: true,
      travel: true,
      weave: Math.random() < 0.5 ? 1 : -1,
      fireClock: C.SAUCER_FIRE_INTERVAL,
      weaveClock: C.SAUCER_WEAVE_INTERVAL,
      age: 0,
    },
    nextId: s.nextId + 1,
    saucerClock: 0,
    nextSaucerEdge: null,
    nextSaucerRow: null,
  };
}
function leaveSaucer(s: ShatterState): ShatterState {
  return {
    ...s,
    saucer: null,
    saucerClock: 0,
    saucerDue: rand(C.SAUCER_GAP_MIN, C.SAUCER_GAP_MAX),
  };
}
function killRock(
  s: ShatterState,
  rock: RockState,
  weapon: { vx: number; vy: number },
  torpedo: boolean,
  sound: Sound,
): ShatterState {
  sound(C.CUES.shatter);
  const child = C.ROCK_CHILD[rock.size],
    rocks = s.rocks.filter((r) => r.id !== rock.id);
  let nextId = s.nextId;
  if (child) {
    const magnitude = Math.hypot(weapon.vx, weapon.vy) || 1;
    const ux = weapon.vx / magnitude,
      uy = weapon.vy / magnitude;
    const kx =
      (torpedo ? ux : -uy) * (torpedo ? C.TORPEDO_SCATTER : C.SPLIT_KICK);
    const ky =
      (torpedo ? uy : ux) * (torpedo ? C.TORPEDO_SCATTER : C.SPLIT_KICK);
    for (const sign of [1, -1])
      rocks.push({
        ...rock,
        id: nextId++,
        vx: rock.vx + sign * kx,
        vy: rock.vy + sign * ky,
        size: child,
        health: C.ROCK_HEALTH[child],
        flash: 0,
      });
  }
  const points =
    rock.size === "large"
      ? C.SCORE_LARGE
      : rock.size === "medium"
        ? C.SCORE_MEDIUM
        : C.SCORE_SMALL;
  return addScore({ ...s, rocks, nextId }, points, sound);
}
function recycleRock(s: ShatterState, rock: RockState): ShatterState {
  const edge =
    s.nextRecycleEdge ??
    (["top", "bottom", "left", "right"] as const)[
      Math.floor(Math.random() * 4)
    ];
  const p =
    edge === "top"
      ? { x: rand(0, C.FIELD_W), y: 0 }
      : edge === "bottom"
        ? { x: rand(0, C.FIELD_W), y: C.FIELD_H }
        : edge === "left"
          ? { x: 0, y: rand(0, C.FIELD_H) }
          : { x: C.FIELD_W, y: rand(0, C.FIELD_H) };
  const speed =
    s.nextRockSpeed ??
    rand(C.ROCK_SPEED_MIN[rock.size], C.ROCK_SPEED_MAX[rock.size]);
  const bearing =
    edge === "top"
      ? Math.PI / 2
      : edge === "bottom"
        ? -Math.PI / 2
        : edge === "left"
          ? 0
          : Math.PI;
  const v = direction(bearing);
  return {
    ...s,
    rocks: s.rocks.map((r) =>
      r.id === rock.id ? { ...r, ...p, vx: v.x * speed, vy: v.y * speed } : r,
    ),
    nextRockSpeed: null,
    nextRecycleEdge: null,
  };
}

export function stepTick(
  input: ReadState,
  controls: Controls,
  sound: Sound = () => {},
): ShatterState {
  let s: ShatterState = {
    ...input,
    simTime: input.simTime + C.TICK_DT,
  } as ShatterState;
  if (s.screen !== "playing") return s;
  const oldShip = s.ship,
    oldRocks = new Map(s.rocks.map((r) => [r.id, { x: r.x, y: r.y }]));
  const oldBullets = new Map(
    [...s.bullets, ...s.enemyBullets].map((b) => [b.id, { x: b.x, y: b.y }]),
  );
  const oldTorpedoes = new Map(
    s.torpedoes.map((t) => [t.id, { x: t.x, y: t.y }]),
  );
  const oldSaucer = s.saucer;
  let ship = {
    ...s.ship,
    angle:
      s.ship.angle +
      (Number(controls.right) - Number(controls.left)) *
        C.SHIP_TURN *
        C.TICK_DT,
    thrusting: controls.up,
    invuln: Math.max(0, s.ship.invuln - C.TICK_DT),
    fireCooldown: Math.max(0, s.ship.fireCooldown - 1),
  };
  if (controls.up) {
    const u = direction(ship.angle);
    ship = {
      ...ship,
      vx: ship.vx + u.x * C.SHIP_THRUST * C.TICK_DT,
      vy: ship.vy + u.y * C.SHIP_THRUST * C.TICK_DT,
    };
  }
  const drag = 0.5 ** (C.TICK_DT / C.SHIP_DRAG_HALFLIFE);
  let vx = ship.vx * drag,
    vy = ship.vy * drag;
  const scale = Math.min(1, C.SHIP_MAX / (Math.hypot(vx, vy) || 1));
  vx *= scale;
  vy *= scale;
  ship = travel({ ...ship, vx, vy });
  if (distance(ship, star) < C.CORE_R + C.SHIP_R) {
    const x = dx(ship.x, C.STAR_X, C.FIELD_W),
      y = dx(ship.y, C.STAR_Y, C.FIELD_H),
      d = Math.hypot(x, y) || 1;
    const nx = x / d,
      ny = y / d,
      inward = Math.min(0, ship.vx * nx + ship.vy * ny);
    ship = {
      ...ship,
      x: wrap(C.STAR_X + nx * (C.CORE_R + C.SHIP_R), C.FIELD_W),
      y: wrap(C.STAR_Y + ny * (C.CORE_R + C.SHIP_R), C.FIELD_H),
      vx: ship.vx - inward * nx,
      vy: ship.vy - inward * ny,
    };
  }
  s = {
    ...s,
    ship,
    torpedoCharge: Math.min(
      1,
      s.torpedoCharge + C.TICK_DT / C.TORPEDO_RECHARGE,
    ),
    waveBanner: s.waveBanner <= C.TICK_DT + 1e-9 ? 0 : s.waveBanner - C.TICK_DT,
    extraLifeFlash: Math.max(0, s.extraLifeFlash - C.TICK_DT),
  };
  if (s.waveBanner === 0 && input.waveBanner > 0 && s.waveSpawning)
    s = spawnWave(s);
  if (
    controls.fire &&
    s.ship.fireCooldown === 0 &&
    s.bullets.length < C.MAX_BULLETS
  ) {
    const u = direction(ship.angle);
    s = {
      ...s,
      bullets: [
        ...s.bullets,
        {
          id: s.nextId,
          x: wrap(ship.x + u.x * C.SHIP_R, C.FIELD_W),
          y: wrap(ship.y + u.y * C.SHIP_R, C.FIELD_H),
          vx: ship.vx + u.x * C.MUZZLE_SPEED,
          vy: ship.vy + u.y * C.MUZZLE_SPEED,
          life: C.BULLET_LIFE,
        },
      ],
      nextId: s.nextId + 1,
      ship: { ...s.ship, fireCooldown: C.FIRE_INTERVAL_TICKS },
    };
    sound(C.CUES.fire);
  }
  if (controls.torpedo && s.torpedoCharge === 1 && s.torpedoes.length === 0) {
    const u = direction(ship.angle);
    s = {
      ...s,
      torpedoCharge: 0,
      torpedoes: [
        {
          id: s.nextId,
          x: wrap(ship.x + u.x * C.SHIP_R, C.FIELD_W),
          y: wrap(ship.y + u.y * C.SHIP_R, C.FIELD_H),
          vx: u.x * C.TORPEDO_SPEED,
          vy: u.y * C.TORPEDO_SPEED,
          heading: ship.angle,
          life: C.TORPEDO_LIFE,
          homing: true,
        },
      ],
      nextId: s.nextId + 1,
    };
  }
  s = {
    ...s,
    rocks: s.rocks.map((r) => ({
      ...travel(gravity(r)),
      spin: r.spin + C.TICK_DT * (r.id % 2 ? 0.35 : -0.3),
      flash: Math.max(0, r.flash - C.TICK_DT),
    })),
  };
  const advanceBullet = (b: BulletState): BulletState => ({
    ...travel(gravity(b)),
    life: b.life - C.TICK_DT,
  });
  s = {
    ...s,
    bullets: s.bullets.map(advanceBullet),
    enemyBullets: s.enemyBullets.map(advanceBullet),
  };
  s = {
    ...s,
    torpedoes: s.torpedoes.map((t) => {
      let heading = t.heading;
      if (t.homing) {
        const candidates: Point[] = [
          ...s.rocks,
          ...(s.saucer ? [s.saucer] : []),
        ];
        const target = candidates
          .filter(
            (p) =>
              Math.abs(angleDelta(angleTo(t, p), heading)) <= C.TORPEDO_CONE,
          )
          .sort((a, b) => distance(t, a) - distance(t, b))[0];
        if (target)
          heading += Math.max(
            -C.TORPEDO_TURN * C.TICK_DT,
            Math.min(
              C.TORPEDO_TURN * C.TICK_DT,
              angleDelta(angleTo(t, target), heading),
            ),
          );
      }
      const u = direction(heading);
      return {
        ...travel({
          ...t,
          vx: u.x * C.TORPEDO_SPEED,
          vy: u.y * C.TORPEDO_SPEED,
        }),
        heading,
        life: t.life - C.TICK_DT,
      };
    }),
  };
  if (s.saucer) {
    let saucer = {
      ...s.saucer,
      age: s.saucer.age + C.TICK_DT,
      fireClock: s.saucer.fireClock - C.TICK_DT,
      weaveClock: s.saucer.weaveClock - C.TICK_DT,
    };
    if (saucer.mind && saucer.weaveClock <= 0) {
      const weave: 1 | -1 =
        saucer.vy === 0 ? saucer.weave : saucer.vy > 0 ? -1 : 1;
      saucer = {
        ...saucer,
        vy: weave * C.SAUCER_WEAVE_SPEED,
        weave,
        weaveClock: saucer.weaveClock + C.SAUCER_WEAVE_INTERVAL,
      };
    }
    if (saucer.mind) {
      const future = {
        x: saucer.x + saucer.vx * 0.25,
        y: saucer.y + saucer.vy * 0.25,
      };
      if (distance(future, star) < C.CORE_R + C.SAUCER_R + 26)
        saucer = {
          ...saucer,
          vy: (saucer.y < C.STAR_Y ? -1 : 1) * C.SAUCER_WEAVE_SPEED,
        };
    }
    if (saucer.travel) saucer = travel(saucer);
    const sep = distance(saucer, star);
    if (saucer.travel && sep < C.CORE_R + C.SAUCER_R) {
      const a = angleTo(star, saucer),
        u = direction(a);
      saucer = {
        ...saucer,
        x: C.STAR_X + u.x * (C.CORE_R + C.SAUCER_R),
        y: C.STAR_Y + u.y * (C.CORE_R + C.SAUCER_R),
      };
    }
    s = { ...s, saucer };
    if (saucer.fireClock <= 0) {
      if (!saucer.gun)
        s = {
          ...s,
          saucer: {
            ...saucer,
            fireClock: saucer.fireClock + C.SAUCER_FIRE_INTERVAL,
          },
        };
      else {
        const error =
            s.nextSaucerAim ?? rand(-C.SAUCER_AIM_ERROR, C.SAUCER_AIM_ERROR),
          u = direction(angleTo(saucer, ship) + error);
        s = {
          ...s,
          enemyBullets: [
            ...s.enemyBullets,
            {
              id: s.nextId,
              x: saucer.x,
              y: saucer.y,
              vx: saucer.vx + u.x * C.SAUCER_BULLET_SPEED,
              vy: saucer.vy + u.y * C.SAUCER_BULLET_SPEED,
              life: C.SAUCER_BULLET_LIFE,
            },
          ],
          nextId: s.nextId + 1,
          nextSaucerAim: null,
          saucer: {
            ...saucer,
            fireClock: saucer.fireClock + C.SAUCER_FIRE_INTERVAL,
          },
        };
      }
    }
    if (s.saucer && s.saucer.age >= C.SAUCER_LIFETIME) s = leaveSaucer(s);
  } else {
    s = { ...s, saucerClock: s.saucerClock + C.TICK_DT };
    if (s.saucerSpawning && s.saucerClock >= s.saucerDue)
      s = spawnSaucer(s, sound);
  }
  // Collision tests use both endpoints of the tick and wrapped relative motion.
  for (const rock of [...s.rocks]) {
    if (
      s.rocks.some((r) => r.id === rock.id) &&
      swept(
        oldRocks.get(rock.id) ?? rock,
        rock,
        C.ROCK_RADIUS[rock.size],
        star,
        star,
        C.CORE_R,
      )
    ) {
      s = recycleRock(s, rock);
      oldRocks.set(rock.id, {
        x: s.rocks.find((r) => r.id === rock.id)!.x,
        y: s.rocks.find((r) => r.id === rock.id)!.y,
      });
    }
  }
  const resolveShot = (
    shot: BulletState | TorpedoState,
    torpedo: boolean,
  ): void => {
    const old = (torpedo ? oldTorpedoes : oldBullets).get(shot.id) ?? shot;
    const remove = (): void => {
      s = torpedo
        ? { ...s, torpedoes: s.torpedoes.filter((t) => t.id !== shot.id) }
        : { ...s, bullets: s.bullets.filter((b) => b.id !== shot.id) };
    };
    if (
      shot.life <= 0 ||
      swept(old, shot, torpedo ? C.TORPEDO_R : C.BULLET_R, star, star, C.CORE_R)
    ) {
      remove();
      return;
    }
    for (const rock of s.rocks) {
      if (
        swept(
          old,
          shot,
          torpedo ? C.TORPEDO_R : C.BULLET_R,
          oldRocks.get(rock.id) ?? rock,
          rock,
          C.ROCK_RADIUS[rock.size],
        )
      ) {
        remove();
        if (torpedo || rock.health === 1)
          s = killRock(s, rock, shot, torpedo, sound);
        else
          s = {
            ...s,
            rocks: s.rocks.map((r) =>
              r.id === rock.id
                ? { ...r, health: r.health - 1, flash: C.HIT_FLASH_TIME }
                : r,
            ),
          };
        return;
      }
    }
    if (
      s.saucer &&
      swept(
        old,
        shot,
        torpedo ? C.TORPEDO_R : C.BULLET_R,
        oldSaucer ?? s.saucer,
        s.saucer,
        C.SAUCER_R,
      )
    ) {
      remove();
      s = addScore(leaveSaucer(s), C.SCORE_SAUCER, sound);
    }
  };
  for (const b of [...s.bullets]) resolveShot(b, false);
  for (const t of [...s.torpedoes]) resolveShot(t, true);
  s = {
    ...s,
    enemyBullets: s.enemyBullets.filter(
      (b) =>
        b.life > 0 &&
        !swept(
          oldBullets.get(b.id) ?? b,
          b,
          C.SAUCER_BULLET_R,
          star,
          star,
          C.CORE_R,
        ),
    ),
  };
  if (s.ship.collision && s.ship.invuln === 0) {
    const rockHit = s.rocks.some((r) =>
      swept(
        oldShip,
        s.ship,
        C.SHIP_R,
        oldRocks.get(r.id) ?? r,
        r,
        C.ROCK_RADIUS[r.size],
      ),
    );
    const saucerHit =
      s.saucer &&
      swept(
        oldShip,
        s.ship,
        C.SHIP_R,
        oldSaucer ?? s.saucer,
        s.saucer,
        C.SAUCER_R,
      );
    const bulletHit = s.enemyBullets.find((b) =>
      swept(
        oldShip,
        s.ship,
        C.SHIP_R,
        oldBullets.get(b.id) ?? b,
        b,
        C.SAUCER_BULLET_R,
      ),
    );
    if (rockHit || saucerHit || bulletHit) {
      sound(C.CUES.death);
      const lives = s.lives - 1;
      s = {
        ...s,
        lives,
        screen: lives <= 0 ? "gameover" : "playing",
        menuIndex: 0,
        ship: { ...blankShip(), invuln: lives > 0 ? C.INVULN_TIME : 0 },
        enemyBullets: bulletHit
          ? s.enemyBullets.filter((b) => b.id !== bulletHit.id)
          : s.enemyBullets,
        torpedoCharge: lives > 0 ? 1 : s.torpedoCharge,
      };
    }
  }
  if (
    s.waveSpawning &&
    input.rocks.length > 0 &&
    s.rocks.length === 0 &&
    s.waveBanner === 0 &&
    s.screen === "playing"
  )
    s = { ...s, wave: s.wave + 1, waveBanner: C.WAVE_BANNER_TIME };
  const trails: Record<number, readonly Point[]> = {};
  for (const b of [...s.bullets, ...s.enemyBullets])
    trails[b.id] = [...(s.bulletTrails[b.id] ?? []), { x: b.x, y: b.y }].slice(
      -C.TRAIL_TICKS,
    );
  s = { ...s, bulletTrails: trails };
  return s;
}

export interface ShatterDebugApi {
  readonly version: number;
  reset(s: ReadState): ShatterState;
  snapshot(s: ReadState): ReturnType<typeof snapshot>;
  reconcile(s: ReadState): ShatterState;
  menuItemRect(s: ReadState, index: number): Rect | null;
  setScreen(s: ReadState, v: Screen): ShatterState;
  setMenuIndex(s: ReadState, v: number): ShatterState;
  setScore(s: ReadState, v: number): ShatterState;
  setLives(s: ReadState, v: number): ShatterState;
  setWave(s: ReadState, v: number): ShatterState;
  setWaveBanner(s: ReadState, v: number): ShatterState;
  setWaveSpawning(s: ReadState, v: boolean): ShatterState;
  setSaucerSpawning(s: ReadState, v: boolean): ShatterState;
  setSaucerDue(s: ReadState, v: number): ShatterState;
  setShipPosition(s: ReadState, x: number, y: number): ShatterState;
  setShipVelocity(s: ReadState, vx: number, vy: number): ShatterState;
  setShipAngle(s: ReadState, v: number): ShatterState;
  setShipInvuln(s: ReadState, v: number): ShatterState;
  setFireCooldown(s: ReadState, v: number): ShatterState;
  setShipCollision(s: ReadState, v: boolean): ShatterState;
  addBullet(
    s: ReadState,
    x: number,
    y: number,
    vx: number,
    vy: number,
  ): ShatterState;
  removeBullet(s: ReadState, id: number): ShatterState;
  clearBullets(s: ReadState): ShatterState;
  addEnemyBullet(
    s: ReadState,
    x: number,
    y: number,
    vx: number,
    vy: number,
  ): ShatterState;
  removeEnemyBullet(s: ReadState, id: number): ShatterState;
  clearEnemyBullets(s: ReadState): ShatterState;
  addRock(s: ReadState, size: RockSize, x: number, y: number): ShatterState;
  setRockVelocity(
    s: ReadState,
    id: number,
    vx: number,
    vy: number,
  ): ShatterState;
  setRockHealth(s: ReadState, id: number, hp: number): ShatterState;
  removeRock(s: ReadState, id: number): ShatterState;
  clearRocks(s: ReadState): ShatterState;
  addSaucer(s: ReadState, x: number, y: number): ShatterState;
  setSaucerVelocity(s: ReadState, vx: number, vy: number): ShatterState;
  setSaucerWeave(s: ReadState, v: 1 | -1): ShatterState;
  removeSaucer(s: ReadState): ShatterState;
  setSaucerMind(s: ReadState, v: boolean): ShatterState;
  setSaucerGun(s: ReadState, v: boolean): ShatterState;
  setSaucerTravel(s: ReadState, v: boolean): ShatterState;
  setNextSaucerEdge(s: ReadState, v: SaucerEdge): ShatterState;
  setNextSaucerRow(s: ReadState, v: number): ShatterState;
  setNextSaucerAim(s: ReadState, v: number): ShatterState;
  setNextRockSpeed(s: ReadState, v: number): ShatterState;
  setNextRecycleEdge(s: ReadState, v: FieldEdge): ShatterState;
  setTorpedoCharge(s: ReadState, v: number): ShatterState;
  addTorpedo(s: ReadState, x: number, y: number, heading: number): ShatterState;
  setTorpedoHeading(s: ReadState, id: number, heading: number): ShatterState;
  setTorpedoHoming(s: ReadState, id: number, v: boolean): ShatterState;
  removeTorpedo(s: ReadState, id: number): ShatterState;
  clearTorpedoes(s: ReadState): ShatterState;
}
const copy = (s: ReadState): ShatterState => ({ ...s }) as ShatterState;
const entity = <T extends { id: number }>(
  list: readonly T[],
  id: number,
): T => {
  const found = list.find((e) => e.id === finite(id));
  if (!found) throw new Error(`unknown id: ${id}`);
  return found;
};
const saucerRequired = (s: ReadState): SaucerState => {
  if (!s.saucer) throw new Error("no saucer");
  return { ...s.saucer };
};
function snapshot(s: ReadState) {
  return {
    version: C.SHATTER_DEBUG_VERSION,
    screen: s.screen,
    menuIndex: s.menuIndex,
    score: s.score,
    lives: s.lives,
    wave: s.wave,
    waveBanner: s.waveBanner,
    muted: s.muted,
    waveSpawning: s.waveSpawning,
    saucerSpawning: s.saucerSpawning,
    saucerClock: s.saucerClock,
    saucerDue: s.saucerDue,
    nextSaucerEdge: s.nextSaucerEdge,
    nextSaucerRow: s.nextSaucerRow,
    nextSaucerAim: s.nextSaucerAim,
    nextRockSpeed: s.nextRockSpeed,
    nextRecycleEdge: s.nextRecycleEdge,
    ship: { ...s.ship, speed: Math.hypot(s.ship.vx, s.ship.vy) },
    bullets: s.bullets.map((b) => ({ ...b })),
    rocks: s.rocks.map(({ id, x, y, vx, vy, size, health }) => ({
      id,
      x,
      y,
      vx,
      vy,
      size,
      health,
      radius: C.ROCK_RADIUS[size],
    })),
    saucer: s.saucer ? { ...s.saucer } : null,
    enemyBullets: s.enemyBullets.map((b) => ({ ...b })),
    torpedoes: s.torpedoes.map((t) => ({ ...t })),
    torpedoCharge: s.torpedoCharge,
    torpedoReady: s.torpedoCharge === 1,
    simTime: s.simTime,
  };
}
const menuCount = (screen: Screen): number =>
  screen === "title"
    ? C.TITLE_ITEMS.length
    : screen === "paused"
      ? C.PAUSE_ITEMS.length
      : screen === "gameover"
        ? C.GAMEOVER_ITEMS.length
        : 0;
function menuRect(s: ReadState, index: number): Rect | null {
  if (!Number.isInteger(index) || index < 0 || index >= menuCount(s.screen))
    return null;
  const start = s.screen === "title" ? 438 : 420;
  return { x: 430, y: start + index * 65, w: 420, h: 55 };
}
export const debug: ShatterDebugApi = {
  version: C.SHATTER_DEBUG_VERSION,
  reset: (s) => initialState(s.muted),
  snapshot,
  reconcile: copy,
  menuItemRect: menuRect,
  setScreen: (s, v) =>
    ({
      ...s,
      screen: valid(v, ["title", "howto", "playing", "paused", "gameover"]),
    }) as ShatterState,
  setMenuIndex: (s, v) => ({ ...s, menuIndex: finite(v) }) as ShatterState,
  setScore: (s, v) => ({ ...s, score: finite(v) }) as ShatterState,
  setLives: (s, v) => ({ ...s, lives: finite(v) }) as ShatterState,
  setWave: (s, v) => ({ ...s, wave: finite(v) }) as ShatterState,
  setWaveBanner: (s, v) => ({ ...s, waveBanner: finite(v) }) as ShatterState,
  setWaveSpawning: (s, v) => ({ ...s, waveSpawning: bool(v) }) as ShatterState,
  setSaucerSpawning: (s, v) =>
    ({ ...s, saucerSpawning: bool(v) }) as ShatterState,
  setSaucerDue: (s, v) => ({ ...s, saucerDue: finite(v) }) as ShatterState,
  setShipPosition: (s, x, y) =>
    ({ ...s, ship: { ...s.ship, x: finite(x), y: finite(y) } }) as ShatterState,
  setShipVelocity: (s, vx, vy) =>
    ({
      ...s,
      ship: { ...s.ship, vx: finite(vx), vy: finite(vy) },
    }) as ShatterState,
  setShipAngle: (s, v) =>
    ({ ...s, ship: { ...s.ship, angle: finite(v) } }) as ShatterState,
  setShipInvuln: (s, v) =>
    ({ ...s, ship: { ...s.ship, invuln: finite(v) } }) as ShatterState,
  setFireCooldown: (s, v) =>
    ({ ...s, ship: { ...s.ship, fireCooldown: finite(v) } }) as ShatterState,
  setShipCollision: (s, v) =>
    ({ ...s, ship: { ...s.ship, collision: bool(v) } }) as ShatterState,
  addBullet: (s, x, y, vx, vy) =>
    ({
      ...s,
      bullets: [
        ...s.bullets,
        {
          id: s.nextId,
          x: finite(x),
          y: finite(y),
          vx: finite(vx),
          vy: finite(vy),
          life: C.BULLET_LIFE,
        },
      ],
      nextId: s.nextId + 1,
    }) as ShatterState,
  removeBullet: (s, id) => {
    entity(s.bullets, id);
    return {
      ...s,
      bullets: s.bullets.filter((b) => b.id !== id),
    } as ShatterState;
  },
  clearBullets: (s) => ({ ...s, bullets: [] }) as ShatterState,
  addEnemyBullet: (s, x, y, vx, vy) =>
    ({
      ...s,
      enemyBullets: [
        ...s.enemyBullets,
        {
          id: s.nextId,
          x: finite(x),
          y: finite(y),
          vx: finite(vx),
          vy: finite(vy),
          life: C.SAUCER_BULLET_LIFE,
        },
      ],
      nextId: s.nextId + 1,
    }) as ShatterState,
  removeEnemyBullet: (s, id) => {
    entity(s.enemyBullets, id);
    return {
      ...s,
      enemyBullets: s.enemyBullets.filter((b) => b.id !== id),
    } as ShatterState;
  },
  clearEnemyBullets: (s) => ({ ...s, enemyBullets: [] }) as ShatterState,
  addRock: (s, size, x, y) =>
    ({
      ...s,
      rocks: [
        ...s.rocks,
        {
          id: s.nextId,
          size: valid(size, ["large", "medium", "small"]),
          x: finite(x),
          y: finite(y),
          vx: 0,
          vy: 0,
          spin: 0,
          health: C.ROCK_HEALTH[size],
          flash: 0,
        },
      ],
      nextId: s.nextId + 1,
    }) as ShatterState,
  setRockVelocity: (s, id, vx, vy) => {
    entity(s.rocks, id);
    return {
      ...s,
      rocks: s.rocks.map((r) =>
        r.id === id ? { ...r, vx: finite(vx), vy: finite(vy) } : r,
      ),
    } as ShatterState;
  },
  setRockHealth: (s, id, hp) => {
    const r = entity(s.rocks, id);
    if (!Number.isInteger(hp) || hp < 1 || hp > C.ROCK_HEALTH[r.size])
      throw new Error(`invalid health: ${hp}`);
    return {
      ...s,
      rocks: s.rocks.map((x) => (x.id === id ? { ...x, health: hp } : x)),
    } as ShatterState;
  },
  removeRock: (s, id) => {
    entity(s.rocks, id);
    return { ...s, rocks: s.rocks.filter((r) => r.id !== id) } as ShatterState;
  },
  clearRocks: (s) => ({ ...s, rocks: [] }) as ShatterState,
  addSaucer: (s, x, y) =>
    ({
      ...s,
      saucer: {
        id: s.nextId,
        x: finite(x),
        y: finite(y),
        vx: C.SAUCER_SPEED,
        vy: 0,
        mind: true,
        gun: true,
        travel: true,
        weave: 1,
        fireClock: C.SAUCER_FIRE_INTERVAL,
        weaveClock: C.SAUCER_WEAVE_INTERVAL,
        age: 0,
      },
      nextId: s.nextId + 1,
    }) as ShatterState,
  setSaucerVelocity: (s, vx, vy) =>
    ({
      ...s,
      saucer: { ...saucerRequired(s), vx: finite(vx), vy: finite(vy) },
    }) as ShatterState,
  setSaucerWeave: (s, v) =>
    ({
      ...s,
      saucer: {
        ...saucerRequired(s),
        weave:
          v === 1 || v === -1
            ? v
            : (() => {
                throw new Error(`invalid weave: ${v}`);
              })(),
      },
    }) as ShatterState,
  removeSaucer: (s) => ({ ...s, saucer: null }) as ShatterState,
  setSaucerMind: (s, v) =>
    ({ ...s, saucer: { ...saucerRequired(s), mind: bool(v) } }) as ShatterState,
  setSaucerGun: (s, v) =>
    ({ ...s, saucer: { ...saucerRequired(s), gun: bool(v) } }) as ShatterState,
  setSaucerTravel: (s, v) =>
    ({
      ...s,
      saucer: { ...saucerRequired(s), travel: bool(v) },
    }) as ShatterState,
  setNextSaucerEdge: (s, v) =>
    ({ ...s, nextSaucerEdge: valid(v, ["left", "right"]) }) as ShatterState,
  setNextSaucerRow: (s, v) =>
    ({ ...s, nextSaucerRow: finite(v) }) as ShatterState,
  setNextSaucerAim: (s, v) =>
    ({ ...s, nextSaucerAim: finite(v) }) as ShatterState,
  setNextRockSpeed: (s, v) =>
    ({ ...s, nextRockSpeed: finite(v) }) as ShatterState,
  setNextRecycleEdge: (s, v) =>
    ({
      ...s,
      nextRecycleEdge: valid(v, ["top", "bottom", "left", "right"]),
    }) as ShatterState,
  setTorpedoCharge: (s, v) =>
    ({ ...s, torpedoCharge: finite(v) }) as ShatterState,
  addTorpedo: (s, x, y, heading) => {
    const u = direction(finite(heading));
    return {
      ...s,
      torpedoes: [
        ...s.torpedoes,
        {
          id: s.nextId,
          x: finite(x),
          y: finite(y),
          heading,
          vx: u.x * C.TORPEDO_SPEED,
          vy: u.y * C.TORPEDO_SPEED,
          life: C.TORPEDO_LIFE,
          homing: true,
        },
      ],
      nextId: s.nextId + 1,
    } as ShatterState;
  },
  setTorpedoHeading: (s, id, heading) => {
    entity(s.torpedoes, id);
    const u = direction(finite(heading));
    return {
      ...s,
      torpedoes: s.torpedoes.map((t) =>
        t.id === id
          ? {
              ...t,
              heading,
              vx: u.x * C.TORPEDO_SPEED,
              vy: u.y * C.TORPEDO_SPEED,
            }
          : t,
      ),
    } as ShatterState;
  },
  setTorpedoHoming: (s, id, v) => {
    entity(s.torpedoes, id);
    return {
      ...s,
      torpedoes: s.torpedoes.map((t) =>
        t.id === id ? { ...t, homing: bool(v) } : t,
      ),
    } as ShatterState;
  },
  removeTorpedo: (s, id) => {
    entity(s.torpedoes, id);
    return {
      ...s,
      torpedoes: s.torpedoes.filter((t) => t.id !== id),
    } as ShatterState;
  },
  clearTorpedoes: (s) => ({ ...s, torpedoes: [] }) as ShatterState,
};

function selectMenu(s: ShatterState): ShatterState {
  if (s.screen === "title")
    return s.menuIndex === 0 ? startGame(s) : { ...s, screen: "howto" };
  if (s.screen === "paused")
    return s.menuIndex === 0
      ? { ...s, screen: "playing", menuIndex: 0 }
      : s.menuIndex === 1
        ? startGame(s)
        : { ...s, screen: "title", menuIndex: 0 };
  if (s.screen === "gameover")
    return s.menuIndex === 0
      ? startGame(s)
      : { ...s, screen: "title", menuIndex: 0 };
  return s;
}
function updateMenus(s: ShatterState, api: UpdateApi): ShatterState {
  if (s.screen === "playing") {
    if (api.input.pressed("pause"))
      return { ...s, screen: "paused", menuIndex: 0 };
    return s;
  }
  if (
    s.screen === "paused" &&
    (api.input.pressed("pause") || api.input.pressed("back"))
  )
    return { ...s, screen: "playing", menuIndex: 0 };
  if (s.screen === "howto")
    return api.input.pressed("confirm") || api.input.pressed("back")
      ? { ...s, screen: "title" }
      : s;
  if (s.screen === "gameover" && api.input.pressed("back"))
    return { ...s, screen: "title", menuIndex: 0 };
  if (s.screen === "title") api.input.pressed("back");
  const count = menuCount(s.screen);
  if (!count) return s;
  if (api.input.pressed("up"))
    s = { ...s, menuIndex: (s.menuIndex - 1 + count) % count };
  if (api.input.pressed("down"))
    s = { ...s, menuIndex: (s.menuIndex + 1) % count };
  const keyConfirm = api.input.pressed("confirm");
  if (keyConfirm) return selectMenu(s);
  const pressed: Record<number, number> = { ...s.pointerPresses };
  for (const sample of api.input.pointerSamples()) {
    if (sample.button !== "primary" && sample.type !== "move") continue;
    const hit = Array.from({ length: count }, (_, i) => i).find((i) => {
      const r = menuRect(s, i);
      return (
        r &&
        sample.x >= r.x &&
        sample.x <= r.x + r.w &&
        sample.y >= r.y &&
        sample.y <= r.y + r.h
      );
    });
    if (hit !== undefined) s = { ...s, menuIndex: hit };
    if (sample.type === "down") pressed[sample.id] = hit ?? -1;
    if (sample.type === "up") {
      if (hit !== undefined && pressed[sample.id] === hit) {
        s = { ...s, pointerPresses: {} };
        return selectMenu(s);
      }
      delete pressed[sample.id];
    }
  }
  return { ...s, pointerPresses: pressed };
}
export interface ShatterState {
  readonly pointerPresses: Readonly<Record<number, number>>;
}

export const game: Game<ShatterState, ShatterDebugApi> = {
  initialize(api: InitApi<ShatterState>): [ShatterState, ShatterDebugApi] {
    for (const name of C.ACTIONS) api.input.register(name, C.BINDINGS[name]);
    api.audio.define(C.CUES.fire, {
      wave: "triangle",
      freq: 740,
      freqTo: 240,
      gain: 0.13,
      durationMs: 90,
    });
    api.audio.define(C.CUES.shatter, {
      wave: "sawtooth",
      freq: 110,
      freqTo: 35,
      gain: 0.22,
      durationMs: 190,
    });
    api.audio.define(C.CUES.thrust, {
      wave: "sawtooth",
      freq: 65,
      gain: 0.045,
      durationMs: 300,
    });
    api.audio.define(C.CUES.saucer, {
      wave: "sine",
      freq: 340,
      freqTo: 620,
      gain: 0.12,
      durationMs: 260,
    });
    api.audio.define(C.CUES.death, {
      wave: "sawtooth",
      freq: 210,
      freqTo: 32,
      gain: 0.25,
      durationMs: 460,
    });
    api.audio.define(C.CUES.extraLife, {
      wave: "triangle",
      freq: 500,
      freqTo: 920,
      gain: 0.16,
      durationMs: 330,
    });
    const register = (
      name: string,
      f: (s: ReadState) => string | number | boolean,
    ): void => api.diagnostics.register(name, f);
    register("screen", (s) => s.screen);
    register("score", (s) => s.score);
    register("lives", (s) => s.lives);
    register("wave", (s) => s.wave);
    register(
      "ship pos",
      (s) => `${s.ship.x.toFixed(1)}, ${s.ship.y.toFixed(1)}`,
    );
    register(
      "ship velocity",
      (s) => `${s.ship.vx.toFixed(1)}, ${s.ship.vy.toFixed(1)}`,
    );
    register("ship speed", (s) => Math.hypot(s.ship.vx, s.ship.vy));
    register("ship facing", (s) => s.ship.angle);
    register("ship grace", (s) => s.ship.invuln);
    register("bullets", (s) => s.bullets.length);
    register("rocks", (s) => s.rocks.length);
    register("saucer", (s) =>
      s.saucer ? `${s.saucer.x.toFixed(1)}, ${s.saucer.y.toFixed(1)}` : "none",
    );
    register("torpedo charge", (s) => s.torpedoCharge);
    register("torpedoes", (s) => s.torpedoes.length);
    register("sim time", (s) => s.simTime);
    return [initialState(), debug];
  },
  update(state: ReadState, api: UpdateApi, dt: number): ShatterState {
    let s = copy(state);
    if (api.input.pressed("mute")) api.audio.setMuted(!api.audio.muted());
    s = { ...s, muted: api.audio.muted() };
    const wasPlaying = s.screen === "playing";
    s = updateMenus(s, api);
    const controls: Controls = {
      left: api.input.value("left") > 0,
      right: api.input.value("right") > 0,
      up: api.input.value("up") > 0,
      fire: wasPlaying && (api.input.value("a") > 0 || api.input.pressed("a")),
      torpedo: wasPlaying && api.input.pressed("b"),
    };
    let tickClock = s.tickClock + Math.max(0, dt);
    let torpedoPress = controls.torpedo;
    while (tickClock + 1e-10 >= C.TICK_DT) {
      const cues = new Set<C.CueName>();
      s = stepTick(s, { ...controls, torpedo: torpedoPress }, (cue) => {
        cues.add(cue);
      });
      for (const cue of cues) api.audio.play(cue);
      torpedoPress = false;
      tickClock -= C.TICK_DT;
    }
    s = { ...s, tickClock };
    if (s.screen === "playing" && s.ship.thrusting) {
      if (!api.audio.looping(C.CUES.thrust)) api.audio.loop(C.CUES.thrust);
    } else if (api.audio.looping(C.CUES.thrust)) api.audio.stop(C.CUES.thrust);
    return s;
  },
  render(state: ReadState, api: RenderApi): void {
    draw(state, api.ctx);
  },
};

function textLine(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size: number,
  color: string,
  align: CanvasTextAlign = "left",
  weight = "600",
): void {
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.font = `${weight} ${size}px system-ui, sans-serif`;
  ctx.fillText(value, x, y);
}
function wrappedDraw(
  p: Point,
  radius: number,
  draw: (x: number, y: number) => void,
): void {
  const xs = [0],
    ys = [0];
  if (p.x < radius) xs.push(C.FIELD_W);
  if (p.x > C.FIELD_W - radius) xs.push(-C.FIELD_W);
  if (p.y < radius) ys.push(C.FIELD_H);
  if (p.y > C.FIELD_H - radius) ys.push(-C.FIELD_H);
  for (const x of xs) for (const y of ys) draw(p.x + x, p.y + y);
}
function drawShip(
  ctx: CanvasRenderingContext2D,
  s: ShipState,
  small = false,
): void {
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(s.angle);
  if (small) ctx.scale(0.58, 0.58);
  if (s.invuln > 0)
    ctx.globalAlpha = 0.46 + 0.35 * Math.sin(s.invuln * 19) ** 2;
  if (s.thrusting && !small) {
    ctx.fillStyle = "#ffae61";
    ctx.shadowColor = "#ff8b4b";
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.moveTo(-15, -7);
    ctx.lineTo(-31 - 7 * Math.sin(s.invuln * 50), 0);
    ctx.lineTo(-15, 7);
    ctx.fill();
  }
  ctx.shadowBlur = 17;
  ctx.shadowColor = "#5ff3ff";
  ctx.fillStyle = "#091a2a";
  ctx.strokeStyle = "#89f4ff";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(19, 0);
  ctx.lineTo(-15, -12);
  ctx.lineTo(-10, 0);
  ctx.lineTo(-15, 12);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
function drawRock(
  ctx: CanvasRenderingContext2D,
  r: RockState,
  x: number,
  y: number,
): void {
  const radius = C.ROCK_RADIUS[r.size],
    damage = 1 - r.health / C.ROCK_HEALTH[r.size];
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(r.spin);
  ctx.shadowColor = r.flash > 0 ? "#fff3b0" : "#de8b5d";
  ctx.shadowBlur = r.flash > 0 ? 25 : 7;
  ctx.fillStyle = r.flash > 0 ? "#fff1c2" : damage > 0 ? "#433c45" : "#29334c";
  ctx.strokeStyle =
    r.flash > 0 ? "#ffffff" : damage > 0 ? "#f29869" : "#a6a6bc";
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * TAU,
      rr = radius * (0.82 + 0.16 * Math.sin(i * 13.3 + r.id));
    const px = Math.cos(a) * rr,
      py = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  if (damage > 0) {
    ctx.strokeStyle = "#ed815c";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-radius * 0.38, -radius * 0.18);
    ctx.lineTo(-radius * 0.05, radius * 0.06);
    ctx.lineTo(radius * 0.2, -radius * 0.12);
    if (damage > 0.5) {
      ctx.moveTo(0, 0);
      ctx.lineTo(radius * 0.38, radius * 0.4);
    }
    ctx.stroke();
  }
  ctx.restore();
}
function drawTrail(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  rgb: string,
): void {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i];
    const x2 = a.x + dx(b.x, a.x, C.FIELD_W),
      y2 = a.y + dx(b.y, a.y, C.FIELD_H);
    ctx.strokeStyle = `rgba(${rgb},${(i / points.length) * 0.75})`;
    ctx.lineWidth = 0.5 + (3 * i) / points.length;
    ctx.lineCap = "round";
    for (const ox of [-C.FIELD_W, 0, C.FIELD_W])
      for (const oy of [-C.FIELD_H, 0, C.FIELD_H]) {
        ctx.beginPath();
        ctx.moveTo(a.x + ox, a.y + oy);
        ctx.lineTo(x2 + ox, y2 + oy);
        ctx.stroke();
      }
  }
}
function draw(s: ReadState, ctx: CanvasRenderingContext2D): void {
  // A stable starfield is derived from coordinates; rendering makes no random draws.
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, C.FIELD_W, C.FIELD_H);
  for (let i = 0; i < 100; i++) {
    const x = (i * 719.73) % C.FIELD_W,
      y = (i * i * 97.31) % C.FIELD_H;
    ctx.fillStyle = i % 7 === 0 ? "#334362" : "#202b42";
    ctx.fillRect(x, y, i % 13 === 0 ? 2 : 1, i % 13 === 0 ? 2 : 1);
  }
  const halo = ctx.createRadialGradient(
    C.STAR_X,
    C.STAR_Y,
    C.CORE_R,
    C.STAR_X,
    C.STAR_Y,
    C.HALO_R * 1.5,
  );
  halo.addColorStop(0, "#ffae80aa");
  halo.addColorStop(0.32, "#ab54723b");
  halo.addColorStop(1, "#ab547200");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(C.STAR_X, C.STAR_Y, C.HALO_R * 1.5, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.shadowColor = "#ffc489";
  ctx.shadowBlur = 31;
  ctx.fillStyle = "#ffebbb";
  ctx.beginPath();
  ctx.arc(C.STAR_X, C.STAR_Y, C.CORE_R, 0, TAU);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "#f5bd9060";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(C.STAR_X, C.STAR_Y, C.CORE_R + 10, 0, TAU);
  ctx.stroke();
  if (
    s.screen === "playing" ||
    s.screen === "paused" ||
    s.screen === "gameover"
  ) {
    for (const r of s.rocks)
      wrappedDraw(r, C.ROCK_RADIUS[r.size] + 3, (x, y) =>
        drawRock(ctx, r, x, y),
      );
    for (const b of s.bullets) {
      drawTrail(ctx, s.bulletTrails[b.id] ?? [], "102,239,255");
      wrappedDraw(b, 8, (x, y) => {
        ctx.fillStyle = "#c9fbff";
        ctx.shadowColor = "#67eaff";
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(x, y, C.BULLET_R, 0, TAU);
        ctx.fill();
        ctx.shadowBlur = 0;
      });
    }
    for (const b of s.enemyBullets) {
      drawTrail(ctx, s.bulletTrails[b.id] ?? [], "255,117,151");
      wrappedDraw(b, 7, (x, y) => {
        ctx.fillStyle = "#ff7597";
        ctx.beginPath();
        ctx.arc(x, y, C.SAUCER_BULLET_R, 0, TAU);
        ctx.fill();
      });
    }
    for (const t of s.torpedoes)
      wrappedDraw(t, 18, (x, y) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(t.heading);
        ctx.shadowColor = "#ffca6e";
        ctx.shadowBlur = 22;
        ctx.fillStyle = "#ffe09a";
        ctx.beginPath();
        ctx.moveTo(11, 0);
        ctx.lineTo(-7, -6);
        ctx.lineTo(-3, 0);
        ctx.lineTo(-7, 6);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      });
    if (s.saucer)
      wrappedDraw(s.saucer, 25, (x, y) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.strokeStyle = "#ff83b1";
        ctx.fillStyle = "#482941";
        ctx.shadowColor = "#ff61a7";
        ctx.shadowBlur = 18;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(0, 3, 24, 9, 0, 0, TAU);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(0, -4, 11, 8, 0, Math.PI, TAU);
        ctx.stroke();
        ctx.restore();
      });
    if (s.lives > 0)
      wrappedDraw(s.ship, 24, (x, y) => drawShip(ctx, { ...s.ship, x, y }));
    drawHud(s, ctx);
    if (s.waveBanner > 0) {
      textLine(
        ctx,
        `WAVE ${s.wave}`,
        C.FIELD_W / 2,
        235,
        48,
        "#ffdb9a",
        "center",
        "800",
      );
      textLine(ctx, "INCOMING", C.FIELD_W / 2, 281, 17, "#d49e80", "center");
    }
  }
  if (s.screen === "title") {
    ctx.fillStyle = "#070d1be0";
    ctx.fillRect(170, 174, 940, 222);
    textLine(ctx, C.TAGLINE_TEXT, 640, 211, 17, "#efaa82", "center", "700");
    textLine(ctx, C.TITLE_TEXT, 640, 305, 104, "#edf8ff", "center", "900");
    textLine(
      ctx,
      "BEND THE SHOT. BREAK THE FIELD.",
      640,
      360,
      19,
      "#8ba6c0",
      "center",
    );
    drawMenu(s, ctx, C.TITLE_ITEMS);
    textLine(
      ctx,
      "ARROWS / WASD TO FLY  •  SPACE TO FIRE  •  F FOR TORPEDO",
      640,
      660,
      17,
      "#7f9bb5",
      "center",
    );
  }
  if (s.screen === "howto") {
    textLine(ctx, "HOW TO PLAY", 640, 97, 57, "#eef8ff", "center", "800");
    const lines = [
      "Shoot every rock through its fragments to clear the wave.",
      "Large rocks wear armor. Each hit cracks them further before they break.",
      "The star bends bullets and rocks, never your ship. Curve a shot around it.",
      "A rock swallowed by the core returns from the edge. Keep hunting.",
      "The saucer comes to hunt you. Shoot it down before it lines up a shot.",
      "F launches one guided torpedo. It finds the nearest target in a narrow",
      "forward cone, flies true through the well, and shatters any rock outright.",
      "It recharges in ten seconds.",
    ];
    lines.forEach((line, i) =>
      textLine(
        ctx,
        line,
        640,
        192 + i * 38,
        22,
        i === 5 || i === 6 ? "#ffd39a" : "#c4d4e4",
        "center",
        "500",
      ),
    );
    textLine(
      ctx,
      "ARROWS / WASD  TURN & THRUST     SPACE  FIRE     F  TORPEDO",
      640,
      560,
      19,
      "#8ef2ef",
      "center",
    );
    textLine(
      ctx,
      "ENTER  SELECT     ESC / P  PAUSE & BACK     M  MUTE",
      640,
      595,
      18,
      "#8ef2ef",
      "center",
    );
    textLine(ctx, "ENTER OR ESC TO RETURN", 640, 673, 16, "#8097aa", "center");
  }
  if (s.screen === "paused" || s.screen === "gameover") {
    ctx.fillStyle = "#070d1bcc";
    ctx.fillRect(0, 0, C.FIELD_W, C.FIELD_H);
    textLine(
      ctx,
      s.screen === "paused" ? "PAUSED" : "GAME OVER",
      640,
      257,
      66,
      "#eef8ff",
      "center",
      "900",
    );
    if (s.screen === "gameover")
      textLine(
        ctx,
        `SCORE ${s.score.toLocaleString()}   •   WAVE ${s.wave}`,
        640,
        331,
        22,
        "#eeb384",
        "center",
      );
    drawMenu(s, ctx, s.screen === "paused" ? C.PAUSE_ITEMS : C.GAMEOVER_ITEMS);
  }
}
function drawMenu(
  s: ReadState,
  ctx: CanvasRenderingContext2D,
  items: readonly string[],
): void {
  items.forEach((item, i) => {
    const r = menuRect(s, i);
    if (!r) return;
    const selected = s.menuIndex === i;
    ctx.fillStyle = selected ? "#153348" : "#0d1a2b";
    ctx.strokeStyle = selected ? "#7de4e7" : "#344b65";
    ctx.lineWidth = 2;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    textLine(
      ctx,
      item,
      640,
      r.y + r.h / 2,
      21,
      selected ? "#e9ffff" : "#91a8c2",
      "center",
      "700",
    );
  });
}
function drawHud(s: ReadState, ctx: CanvasRenderingContext2D): void {
  textLine(ctx, "SCORE", 42, 36, 15, "#8cb0c7");
  textLine(
    ctx,
    s.score.toLocaleString().padStart(6, "0"),
    42,
    74,
    35,
    "#e9f7ff",
    "left",
    "800",
  );
  textLine(ctx, "SHIPS", 42, 117, 14, "#8cb0c7");
  for (let i = 0; i < Math.max(0, s.lives - 1); i++)
    drawShip(
      ctx,
      { ...blankShip(), x: 54 + i * 30, y: 151, angle: C.FACE_UP },
      true,
    );
  textLine(ctx, "TORPEDO", 42, 196, 14, "#8cb0c7");
  ctx.fillStyle = s.torpedoCharge === 1 ? "#ffcd81" : "#6d7184";
  ctx.beginPath();
  ctx.moveTo(52, 223);
  ctx.lineTo(37, 232);
  ctx.lineTo(52, 241);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#263448";
  ctx.fillRect(68, 224, 150, 13);
  ctx.fillStyle = s.torpedoCharge === 1 ? "#ffcf7e" : "#78d4d2";
  ctx.fillRect(68, 224, 150 * s.torpedoCharge, 13);
  if (s.extraLifeFlash > 0)
    textLine(ctx, "EXTRA SHIP", 640, 97, 24, "#fff1aa", "center", "800");
  textLine(ctx, `WAVE ${s.wave}`, C.FIELD_W - 42, 37, 17, "#8eacc4", "right");
  if (s.muted)
    textLine(ctx, "SOUND OFF", C.FIELD_W - 42, 66, 14, "#7b91aa", "right");
}
