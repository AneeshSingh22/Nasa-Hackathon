# Ad Astra Program — Engineering Conventions

A first-person 3D spaceflight engineering game for the NASA Space Apps
Challenge 2026. Read this file before writing code. It exists so that six
people working in parallel produce one architecture instead of six.

## The pitch, in one line

You are the flight engineer of a small space program. Walk the assembly
building, learn what each part does, build a rocket, fly it by hand, and find
out whether your napkin maths was right.

## Stack — frozen, do not revisit

| Concern | Choice |
| --- | --- |
| Build tool | Vite |
| Language | TypeScript, `strict: true` |
| 3D | Three.js (procedural geometry, no external models) |
| Tests | Vitest |
| UI | Plain DOM overlays on the WebGL canvas |
| State | Plain modules and classes; no state library |

No React in the game loop. HUD panels are DOM elements updated imperatively,
because a 60 fps render loop should not be re-rendering a component tree.

## Units — the rule that prevents the worst bugs

**SI everywhere, always.** Metres, seconds, kilograms, newtons, pascals,
radians.

Never store kilometres, minutes, or tonnes. Convert only at the moment you
write text into the DOM:

```ts
// right
const altitudeMetres = radius - R_EARTH;
readout.textContent = `${(altitudeMetres / 1000).toFixed(1)} km`;

// wrong — a kilometre in a variable will eventually be added to a metre
const altitudeKm = (radius - R_EARTH) / 1000;
```

One exception, by convention: specific impulse is in **seconds**, because that
is how every engine datasheet in the world quotes it.

## Directory map and lane ownership

Each lane owns its directory. Touching another lane's directory means talking
to that person first.

```
src/
  physics/     Lane A — simulation core. Pure functions, no Three.js, no DOM.
  vab/         Lane B — assembly building: player controller, parts, stacking.
  flight/      Lane B — ascent and orbital flight (not yet built).
  render/      Lane D — shared rendering helpers, effects, camera rigs.
  game/        Lane B — mission constraints, resources, lose conditions,
               work-zone proximity rules.
  ui/          Lane C — HUD panels, overlays, the narrator.
  content/     Lane E — part specs, mission scripts, dialogue, citations.
  main.ts      Integration point. Changes here get reviewed by whoever is producing.
```

`src/physics/` has one hard rule: **it never imports Three.js or touches the
DOM.** It takes numbers and returns numbers. That is what makes it testable,
and the tests are what keep the science defensible in front of NASA judges.

## The physics is the product

Judges for this challenge are engineers. They will check the numbers. So:

1. **Every formula cites its source** in a comment, or says explicitly that a
   value is tuned for play rather than sourced.
2. **Every physical claim has a test** in `src/physics/physics.test.ts` that
   checks it against a published figure.
3. **The HUD derives from the simulation.** Never track a display value
   separately from the physical one; they will drift, and the drift will be
   visible.

Run `npm test` before every commit. A physics bug found on day two is a typo;
the same bug found in week three is fatal, because every balance decision made
in between was tuned around it.

### Reference values the tests assert

| Quantity | Value | Source |
| --- | --- | --- |
| 400 km circular speed | 7 672.6 m/s | vis-viva with `MU_EARTH` |
| 400 km orbital period | 92.4 min | Kepler's third law |
| Hohmann 400 → 2 000 km | 395 + 375 m/s | Hohmann transfer equations |
| Sea-level air density | 1.225 kg/m³ | US Standard Atmosphere 1976 |
| Max-Q altitude | 7–13 km | Emergent from the density model |
| Campaign vehicle Δv | 10 501 m/s | Rocket equation, staged |
| Campaign vehicle TWR | 1.38 | Falcon 9 lifts off near 1.4 |

### Lessons already paid for

Two bugs cost real time during prototyping. Do not reintroduce them.

- **A single atmospheric scale height is wrong.** It overestimates density by
  roughly 3.4× at 52 km, which puts max-Q at the wrong altitude entirely and
  breaks the whole max-Q teaching beat. Use the two-layer model in
  `atmosphere.ts`.
- **An overpowered rocket makes flying meaningless.** An early vehicle had
  11 300 m/s of Δv and flung itself into a 6 000 km ellipse on every input.
  The vehicle must be sized so that a good ascent succeeds and a sloppy one
  does not. `physics.test.ts` asserts both bounds.
- **Three.js cameras look down −Z.** The first-person controller shipped with
  its starting yaw set to `Math.PI`, which faced the back wall two metres away.
  Walking forward worked perfectly and looked like a dead input. Any camera or
  heading work needs a test that asserts a *direction*, not just that the
  position changed — `PlayerController.test.ts` has them.
- **Never clear held keys on `pointerlockchange`.** Acquiring pointer lock
  moves focus off the start button, so clearing there drops the keys the player
  is already holding. Clear on `window` `blur` instead.

## Code style

- `strict` TypeScript. No `any`. Prefer `readonly` and `const`.
- Name things the way an engineer would say them out loud: `periapsis`,
  `dynamicPressure`, `stackMass` — never `p`, `q1`, `m2`.
- Comments explain *why*, not *what*. A comment that restates the code is
  noise; a comment that records a decision is the most valuable line in the
  file.
- Functions in `physics/` are pure and take explicit parameters. No module
  state, no hidden globals.

## Commands

```bash
npm install
npm run dev        # dev server with hot reload
npm test           # physics test suite
npm run typecheck  # tsc --noEmit
npm run build      # production bundle
```

## What is built so far

**Vertical slice: the Vehicle Assembly Building.** First-person walking at real
spacecraft scale, four-part rocket assembly, and a live engineering readout
driven by `physics/rocket.ts`. Press `E` to fit parts and watch the Δv figure
drop as payload mass goes on.

**Mission constraints.** Budget, launch window and director confidence all run
down, and any of them reaching zero ends the mission with a review-board
screen. Balance is pinned by `game/Mission.test.ts`: a clean build finishes
with margin on all three, two telescope swaps bankrupt the programme, and cheap
swaps run the schedule out instead. Retune those numbers only with the tests in
front of you.

**The contract is what makes assembly a game.** `game/contract.ts` states a
requirement and leaves the vehicle to the player. Before it existed, the build
order was hardcoded and pressing `E` four times always produced the one correct
vehicle. `contract.test.ts` pins the property that matters: at least three
payloads satisfy the contract, they differ in science, margin and cost, the
cheapest one fails the science floor, and the highest-paying one leaves under
200 m/s of margin. If a change makes one payload strictly best, that test
should start failing — fix the balance, not the test.

**Working at height.** The payload and fairing are fitted from the top gantry
platform, not the floor, so the player climbs. `workzone.test.ts` pins the
gantry geometry against the platform heights `VABScene` actually builds: these
constants live in two files and once disagreed badly enough that the payload
was unreachable — the work height was 56 m when the top platform was 45.6, and
the ladder ran up a column outside the platform footprint entirely. Change one
and run the tests.

**One source of truth for reach rules.** `canWorkOn` in `game/workzone.ts` is
the only place that decides whether the player can fit a part. `main.ts` used
to duplicate the check, which is how a bug shipped that let the core booster be
fitted from 56 metres up: the gantry is 7 m from the stand horizontally, so it
satisfied the floor work zone when height was ignored.

**Proximity-gated interaction.** `game/workzone.ts` restricts assembly to the
painted circle around the stand, and the action prompt fades in as the player
approaches. The hint radius is deliberately wider than the spawn distance: if
the prompt were invisible at spawn, the opening move of the game would be
hidden. `workzone.test.ts` pins that.

**Roll-out.** Pressing `F` on a flight-ready stack ends the phase with a
summary of what the build cost. It is gated on `analysis.canReachOrbit`, so the
delta-v board is a gate rather than decoration.

**The narrator.** `ui/Narrator.ts` speaks the flight director's lines through
the Web Speech API and mirrors every one into the dialogue panel, so spoken and
written text cannot drift apart. Speech is always optional: it degrades to
silent text where the API is missing and the player can mute it with `V`.
Script lives in `content/dialogue.ts` and is written to be heard — short
sentences, no parentheses, no figures that only parse on the page.

## What comes next, in order

1. **Flyable ascent** — throttle, pitch, staging, max-Q, with the HUD showing
   live apoapsis. The ascent physics is already verified by headless
   simulation, so this is wiring rather than discovery. Roll-out already gates
   on `analysis.canReachOrbit`; the pad scene picks up from there.
2. **Flyable ascent** — throttle, pitch, staging, max-Q, with the HUD showing
   live apoapsis. The ascent physics is already verified by headless simulation.
3. **Orbital map view** — switch from first-person to a map with manoeuvre
   planning.
4. **The Moon** — patched conics, sphere-of-influence transitions, landing.
5. **Campaign and review board** — mission progression, and the failure-analysis
   scene that carries most of the educational payload.
