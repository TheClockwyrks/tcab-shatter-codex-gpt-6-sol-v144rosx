# Shatter

Shatter is a browser space shooter built around a gravity well. Pilot an inertial ship through wrapping space, break armored rocks into smaller fragments, and clear each wave. The central star bends bullets and rocks, while your ship and guided torpedo fly under their own power. A hunting saucer joins the fight as the run goes on.

## Run locally

```bash
npm ci
npm run dev
```

Open the address Vite prints. To produce a static site, run `npm run build` and serve `dist/` from any static file server. `npm run preview` serves that build locally.

## Controls

| Key | Action |
| --- | --- |
| Arrows or WASD | Turn left and right; up thrusts |
| Space | Fire gun |
| F | Launch guided torpedo when charged |
| Enter | Confirm menu selection |
| Esc or P | Pause or resume; Esc also goes back |
| M | Mute or unmute |
| Backquote | Toggle debug overlay |

Mouse and touch can select menu entries. The torpedo carries one charge, recharging over ten seconds. Large rocks need three gun hits and medium rocks need two, while a torpedo destroys either in one hit.

Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run format` to check the implementation.
