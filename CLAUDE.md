# Ad Astra Program — Engineering Conventions

A 3D spaceflight engineering game for the NASA Space Apps Challenge 2026.
Read this file before writing code. It exists so that people working in
parallel produce one architecture instead of several.

## The pitch, in one line

You are the flight engineer of a small space programme. Explore the facility,
enter the workshop, design a vehicle against a contract and a budget, then fly
it by hand and find out whether your napkin maths was right.

## Player modes — the product rule

The game has two mechanical modes. Do not blend them.

1. **Explore** — first-person walk around an open facility (space centre
   campus). Look around, find stations, enter the workshop. Later: launch pad
   and other buildings as places to visit, not as mini-games of their own.
2. **Workshop** — third-person builder (Kerbal-style). Orbit, pan and zoom the
   vehicle. Drag parts from a palette onto the stack. Each part has a cost. A
   mission / contract panel stays visible. Leave when the stack is ready to
   hand off to launch.

**Assembly happens only in the workshop.** The campus does not carry-and-place
parts, climb elevators to fit payloads, or gate attachment on work-zone height.
Those mechanics were a prototype path; they are not the direction.

### What the workshop must force the player to decide

Every build should juggle at least three live levers:

1. **Contract** — science floor, destination class, whatever the brief requires
2. **Budget / grants** — part costs; overspend fails or burns margin
3. **Performance** — Δv, mass, TWR from the real stack analysis

If two of those are always green no matter what the player picks, the phase
collapses into confirmation again. Fix the balance, not the UI chrome.

### Workshop assembly — drag, drop, and attachment nodes

Reference feel: Kerbal Space Program's Vehicle Assembly Building. The player
picks a part from a palette, drags it into the 3D hangar, and snaps it onto
the vehicle at visible attachment points.

**Attachment nodes.** Every part exposes one or more nodes in local space
(small spheres in the world). Nodes mark where another part can connect — not
free-form placement in empty air.

**Green / red feedback while dragging:**

- **Green** — nearest node pair is compatible; release will attach
- **Red** — near a node but incompatible (wrong kind, occupied, or illegal
  order); release does nothing
- Dim or hidden — nodes that are not candidates for the part in hand

Compatibility is a function of rules, not vibes. The same logic that decides
green/red must be what the workshop assembly graph uses to accept or reject
the attach — no separate "display legality."

**Command pod is the session root.** Every build session spawns a Command Pod
(or probe core) fixed at the hangar centre. It is the vessel hierarchy root,
the default camera focus, and the origin for mass / physics roll-up. The player
does not place it from the palette; they build *onto* it.

**v1 scope: axial stack only.** Ship a linear chain before a full attach graph.
Typical bottom → top order once the modular catalog is live:

| Role | Examples |
| --- | --- |
| Ground lock | Launch clamp (holds the stack until first stage fire) |
| Propulsion | Liquid engine under fuel tank(s) |
| Staging break | Stack / radial decoupler between stages |
| Command | Command pod (already present as root; may sit above tanks) |
| Aero / control | Fins low on the stack; reaction wheel (often in the pod) |
| Mission | Environment sensor, antenna (science & utility) |

Radial nodes, side boosters, symmetry mirrors, and fuel crossfeed are later.
Do not block the workshop on full KSP generality.

The legacy `PartKind` slots (`booster` → `upper` → `payload` → `fairing` in
`vab/parts.ts`) remain the prototype library until the catalog below replaces
them. New workshop work targets the five palette categories, not more
carry-and-place slots.

**Palette and progressive disclosure.** Categories + part thumbnails on one
side; deep stats (thrust, Isp, mass, cost, blurb) on hover or select — a
tooltip, not an always-on wall of numbers. Always-visible chrome stays thin:
craft name, funds / budget, and a short live stack summary derived from the
simulation. Mission / contract requirements stay available without drowning
the 3D view.

### Workshop part catalog (build-screen palette)

Five categories on the build screen. Counts are the *types* the palette must
expose for a playable vessel; variants (tank sizes, engine thrusts) live inside
a type, not as extra categories.

#### 1. Command (1 type) — session root

| Part | Role |
| --- | --- |
| Command Pod / Probe Core | Brain of the vessel. Handles player input in flight, provides the camera focus, houses crew or computer, and is the origin for vessel mass and physics aggregation. **Spawns centred in every build session;** not dragged from the palette. |

#### 2. Propulsion (2 types)

| Part | Role |
| --- | --- |
| Liquid Fuel Tank | Holds propellant mass (SI kilograms). Capacity is a number the attached engine(s) draw from. Offer multiple sizes / dry masses as variants. |
| Liquid Fuel Engine | Consumes propellant from connected tanks and applies thrust along the vessel axis in the flight sim (newtons). No tank in the feed path → no thrust. |

#### 3. Structural & Coupling (2 types)

| Part | Role |
| --- | --- |
| Radial / Stack Decoupler | Joins two stages. On stage activation, breaks the joint, runs vessel-split, and may impart a small separation impulse. Required for a real staging sequence. |
| Launch Clamp | Anchors the rocket to the pad: holds the stack fixed (ignores gravity / tip-over) until the first stage fires. Optional in the abstract, strongly recommended so the pad is playable. |

#### 4. Control & Aero (2 types)

| Part | Role |
| --- | --- |
| Reaction Wheel | Applies pitch / yaw / roll torque from player input. May be a distinct part or built into the Command Pod; if built-in, the palette still needs a visible control story so players understand why the pod steers. |
| Aerodynamic Fin | Passive stability in atmosphere: drag/lift that favours pointing forward. Place low on the stack. Without fins (or equivalent), atmospheric ascent flips easily. |

#### 5. Science & Utility (2 types)

| Part | Role |
| --- | --- |
| Environment Sensor (thermometer / barometer) | Does not change flight physics. Samples vessel state (altitude, speed, body) into a data packet the player can collect — the contract's science reason to fly. |
| Antenna / Transmitter | Sends stored science packets to Mission Control (may consume electric charge later). Turns raw data into spendable science progress for the campaign. |

#### Build-screen checklist (what the palette shows)

1. **Command** — Command Pod (default centre spawn; palette may show it as equipped / locked)
2. **Propulsion** — Fuel Tank (variants by size/weight), Liquid Engine
3. **Structural & Coupling** — Decoupler, Launch Clamp
4. **Control & Aero** — Reaction Wheel, Fin
5. **Science & Utility** — Environment Sensor, Antenna

Every part still carries cost (budget lever). Science parts are how the
**contract** lever is met; propulsion and mass are how the **performance**
lever is met. A craft with only a pod is not flight-ready.

### Information design (hard rule)

Playtesting: too much information hits at once. Prefer progressive disclosure —
show the decision in front of the player now; detail on demand (inspect a part,
hover tooltip, toggle a panel, ask for advice). Do not add a new always-on
readout without removing or folding another. Full UX polish can wait; the rule
cannot.

The narrator stays quiet by default (see below). Spoken lines that restate a
panel delete the reason the panel exists.

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
  vab/         Lane B — facility explore + workshop builder: cameras, parts,
               stacking, stations. (Legacy first-person VAB still lives here
               until the workshop replaces it.)
  workshop/    Lane B — workshop session lifecycle (enter/exit, placeholder
               root part). Created in Phase 1.
  flight/      Lane B — ascent and orbital flight (not yet built).
  render/      Lane D — shared rendering helpers, effects, camera rigs
               (workshop OrbitCamera lands here in Phase 2; dir empty today).
  game/        Lane B — mission constraints, resources, lose conditions,
               contract evaluation, GameMode. (Legacy work-zone / carry rules
               stay until the workshop ships; do not extend them as product
               features.)
  ui/          Lane C — HUD panels, overlays, the narrator. Progressive
               disclosure lives here.
  content/     Lane E — part specs, mission scripts, dialogue, citations.
  main.ts      Integration point. Changes here get reviewed by whoever is producing.
```

Agent handoff for the current spike: `CODEX_PHASE_1_2.md`.

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

Bugs that cost real time. Do not reintroduce them. Lessons tied to the legacy
elevator / carry-and-place loop are marked **historical** — keep them while
that code exists; do not treat them as reasons to invest in that loop as the
product.

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
  position changed — `PlayerController.test.ts` has them. The same rule will
  apply to the workshop orbit camera: assert framing, not only that the
  transform changed.
- **Never narrate the player's own actions.** Elena crept back into
  commentary — "Going up", "Back on the bench", "Core booster is on the stand" —
  every one of which the HUD already showed. She now speaks only for errors,
  refusals, resource warnings, contract verdicts, and on request via `T`. Before
  adding a spoken line, check whether a panel or the log already says it.
- **Variants must differ in the mesh, not only in the numbers.** All three
  boosters shared one builder and all four payloads another, so the options were
  visually identical and the choice looked pointless. `vab/variants.ts` gives
  each its own silhouette, and `tests/variants.test.ts` fingerprints the
  geometry so a future part added without a builder fails the suite.
- **Two systems that must agree need a test that drives both.** (Historical —
  elevator stop vs work-zone height.) The fix was `game/worksite.ts` and
  `tests/workheight.test.ts`. When the workshop owns attach height, delete the
  dual path rather than syncing it forever.
- **A bezel drawn in front of a screen hides the screen.** The blueprint
  display rendered as a plain black rectangle for two rounds. The drawing code
  was correct; a 0.35 m deep frame box centred at z = 0 put its front face at
  z = +0.175, ahead of the display plane at z = +0.09, and the board faces the
  player. Check depth ordering on any panel the player looks at head-on, and
  keep frames strictly behind the surface they frame.
- **Canvas UI needs a test even though jsdom has no canvas.** `tests/blueprint.test.ts`
  records drawing calls against a stub 2D context, which asserts *what* was
  drawn rather than that pixels changed. Without it there was no way to tell
  whether a black screen was a drawing bug or a scene-graph bug. The native
  `canvas` package does not build on this machine, so do not reach for it.
- **Coplanar surfaces flicker.** Floor decals must sit on separated layers or
  they z-fight as the camera moves.
- **A trigger volume used for two purposes serves neither.** (Historical —
  elevator `contains` vs `atControls`.) Keep interaction volumes single-purpose
  when adding campus stations (e.g. "enter workshop").
- **The building must be taller than the rocket.** (Historical for the VAB
  high bay; still true for any enclosed workshop mesh.) Part heights need
  re-checking against the room height / roof slot.
- **A fixed elevator stop cannot serve variable stack heights.** (Historical.)
  Do not rebuild a height-commute mechanic for the workshop; the orbit camera
  exists so the player never has to ride to the attach point.
- **Do not build a scene with regex backreferences.** A `re.sub` over
  `stations.ts` injected literal control characters into the source and esbuild
  failed with `Expected identifier but found ""`. Vitest reported the file
  as "no tests" rather than as an error. Rewrite whole files instead.
- **A feature can be correct and still invisible.** (Historical — placement
  preview outside FOV.) When someone says a feature is missing, check where it
  is on screen before assuming the logic is wrong. Workshop framing tests should
  assert the stack is inside the view.
- **A test that cannot fail is worse than no test.** The collision test walked
  the player for four seconds then asserted an overshoot distance that passed
  when collision was missing entirely. Sample every frame and assert the
  *closest* approach — or whatever property would actually break.
- **When a mechanic needs a third fix, replace the mechanic.** The ladder was
  replaced by an elevator after three failed attempts. The elevator / carry
  loop itself is now being replaced by the workshop for the same reason:
  playtesting showed commute-and-confirm, not design.
- **Never parent a carried mesh to the camera.** (Historical for carry mode.)
  It clipped through geometry and blocked the view. Workshop ghosts / previews
  belong in world space at the snap target, not on the camera.
- **Meshes are not collision.** Solid objects need registered colliders
  (cylinders on `PlayerController.obstacles` in explore mode). The rocket was a
  pass-through hologram for several commits when only the mesh existed.
- **Propellant with no engine is not delta-v.** The Workshop readout summed
  wet mass straight from the part definitions, so a stack of tanks with nothing
  to burn them would have quoted a delta-v figure from an isp of zero. The fix
  is `workshop/analysis.ts`: propellant only counts toward delta-v once a part
  with thrust and isp is attached, and the readout says "no engine" until then.
  It also sums *mass flow* rather than averaging isp, because two engines of
  different isp burn like their combined flow, not their mean.
- **Check the stub numbers teach the intended trade.** The Phase 3 tank and
  engine stubs turned out to be well chosen by accident: one tank gives
  1 933 m/s at TWR 1.95, and a three-tank stack on one engine reaches 3 519 m/s
  but a TWR of 0.95 — it cannot lift off. That ceiling is the lesson the builder
  exists to teach, so `analysis.test.ts` pins it. A retune that makes more tanks
  strictly better should fail that test.

- **A dead start button is a silent startup throw.** `main.ts` builds the
  renderer at line 75 and does not register the start button's click handler
  until about 1 400 lines later, with no try/catch anywhere in between. Any
  throw in that window — a refused WebGL context, a null node — left the overlay
  up and the button focusable, hoverable and completely inert, which reads to a
  player as a laggy machine rather than an error. There is now a WebGL probe
  before the renderer and a `window` `error` listener that writes the reason
  into the start card and disables the button. `tests/startup.test.ts` asserts
  the overlay actually hides on click, which is the assertion the old
  integration test was missing: it clicked the button and never checked that
  anything happened.

- **A build phase that discards the build is a sandbox, not a game.** The
  Workshop owned its own three-stub vessel and called `vessel.reset()` on exit,
  so nothing the player did in there survived, counted, cost anything or
  reached the contract panel. The fix was not to copy state out but to delete
  the parallel model: the Workshop now drives the same `Assembly` the bay and
  the contract panel already read, so the vehicle is simply standing there when
  the player walks back out. Whenever two models describe the same thing, one
  of them is going to be thrown away — prefer driving the real one.
- **Offer every option or there is no decision.** Phase 3 shipped one tank and
  one engine, so every build was identical and nothing could go wrong. The
  library already held nine parts with real trade-offs. The balance that makes
  it a game: the cheapest stack reaches orbit but misses the science floor, the
  most scientific one either busts the budget or cannot reach orbit at 8 189
  m/s, and several paths in between work. `rocketBuilder.test.ts` asserts a
  heavier payload buys less delta-v, so a retune that makes one option strictly
  best fails.

- **Camera limits are part scale, not camera taste.** `ORBIT_LIMITS.maxDistance`
  was 18 m, tuned for a 2.8 m stub pod. A finished rocket is 67.5 m tall and
  needs about 72 m of standoff to frame, so the player could not pull back far
  enough to see the payload at all — and `frame()` silently clamped to 18 too,
  so the automatic reframing could not rescue it either. Limits are now 5–110 m
  with a floor clearance so the eye never drops underground. The camera is
  deliberately allowed outside the 46 m-deep bay, because the standoff a launch
  vehicle needs does not fit indoors. Any change to part heights needs checking
  against `maxDistance` as well as `VAB_HEIGHT`.
- **A choice you cannot reverse is not a comparison.** Clicking a part committed
  it, so comparing three boosters meant tearing the stack down. `Assembly.swapPart`
  already existed and rebuilds everything above the swapped slot; the palette now
  keeps a fitted slot's buttons live and a click swaps in place, charging only the
  price difference. Going cheaper refunds half, like every other reversal in the
  programme, so experimenting still costs something.

- **Never clear held keys on `pointerlockchange`.** Acquiring pointer lock
  moves focus off the start button, so clearing there drops keys the player is
  already holding. Clear on `window` `blur` instead. Workshop mode should
  release pointer lock cleanly when entering the builder so mouse drag works
  for orbit and part placement.

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

## What is built so far (legacy vertical slice)

The repo still contains a first-person Vehicle Assembly Building: walk at real
spacecraft scale, elevator to height, carry-and-place from benches, proximity
work zones, and roll-out on `F` gated by `analysis.canReachOrbit`. That slice
proved scale, part meshes, contract balance, mission resources, and a live
engineering readout driven by `physics/rocket.ts`.

**Target feel overrides that loop.** New work moves toward campus explore +
workshop builder. Do not invest in elevator reach, gantry ladders, carry-speed
tuning, or work-zone height windows as product features. Reuse what still
serves the new loop:

- **Part library and variants** — `vab/parts.ts`, `vab/variants.ts`; silhouettes
  must differ, not only numbers.
- **Contract / mission resources** — `game/contract.ts`, `game/Mission.ts`.
  Budget, window and confidence still matter; balance stays pinned by tests.
  If a change makes one payload strictly best, fix the balance, not the test.
- **Stack analysis** — Δv, mass, TWR from the simulation; the HUD derives from
  it. This becomes the workshop's performance lever and the gate before launch.
- **Quiet narrator + advice on request** — `ui/Narrator.ts`, `game/advice.ts`.
  Advice names the trade-off, never the answer (`advice.test.ts` forbids naming
  a payload).

Historical detail of the carry-and-place / elevator path (stations, crane
hoist, `canWorkOn`, gantry geometry) remains in the codebase and its tests until
the workshop replaces it. Treat that code as scaffolding, not as the design.

## What comes next, in order

1. **Mode switch (Phase 1)** — Explore ↔ Workshop. See *Implementation:
   Phase 1 & 2* below.
2. **Workshop camera (Phase 2)** — third-person orbit / pan / zoom. Same
   section.
3. **Workshop assembly (Phase 3)** — axial snap spike first: see
   `CODEX_PHASE_3.md`. Full five-category catalog, contract “Complete” gate,
   and handoff to launch are Phase 3b / later.
4. **Flyable ascent** — throttle, pitch, staging, max-Q, live apoapsis. Ascent
   physics is already verified headless; this is wiring. Pad scene picks up
   after workshop complete / roll-out.
5. **Campus expansion** — other facilities as explore destinations (launch site
   exterior, etc.). Flavour and wayfinding, not a second builder.
6. **Orbital map view** — switch to a map with manoeuvre planning.
7. **The Moon** — patched conics, sphere-of-influence transitions, landing.
8. **Campaign and review board** — mission progression, and the failure-analysis
   scene that carries most of the educational payload.

Cinematics, final art direction, and deep storyline are later passes. Nail the
mode switch and workshop camera before assembly UI.

## Implementation: Phase 1 & 2 (current focus)

**Follow-up superseding the original legacy-loop requirements below:** Explore
now routes assembly exclusively to Workshop. Back-wall part benches, placards,
step paint and the old blueprint board are retired; pickup, fit, Tab selection
and other legacy assembly shortcuts are disconnected. Keep their underlying
modules for migration, but do not restore them as playable Explore mechanics.
The Workshop Command Pod floats 10 m above `assemblyRoot` (11.6 m above the
VAB floor), and the orbit target follows its world-space centre. Palette,
drag-drop and snap nodes remain outside this iteration.

Do **only** these two phases now. Do not implement drag-drop, attachment
nodes, the five-category palette, staging, or ascent. Leave the legacy
carry-and-place path runnable in Explore mode until Phase 3+ replaces it.

For a paste-ready agent brief, see `CODEX_PHASE_1_2.md` at the repo root.

### Shared constraints

- Stack stays frozen: Vite, TypeScript `strict`, Three.js, Vitest, plain DOM
  HUD, no React in the game loop, no state library.
- SI units everywhere; convert only when writing DOM text.
- `src/physics/` must not import Three.js or touch the DOM.
- Prefer new modules over growing `main.ts`. Thin wiring in `main.ts` is fine;
  camera and mode logic belong in dedicated files.
- `src/render/` is empty today — create it for the orbit camera.
- Run `npm test` and `npm run typecheck` before considering the work done.
- Do not delete elevator / carry / work-zone code in these phases; gate it so
  it is inactive (or unreachable) while `mode === 'workshop'`.

### Phase 1 — Explore ↔ Workshop mode switch

**Goal.** Prove the product seam: walk the existing VAB as Explore, enter a
Workshop mode that is a distinct camera / input context, exit back to Explore.

**Done when:**

1. Player can walk in first person as today (Explore).
2. Near a clearly marked workshop station / door volume, an interact prompt
   offers entering the workshop (reuse `E` or a dedicated affordance).
3. Entering Workshop: exits pointer lock, stops first-person look/move from
   driving the camera, shows a Command Pod (or clear capsule placeholder)
   centred on the assembly stand (`assemblyRoot` is at `(0, 1.6, 0)` in
   `VABScene`).
4. Exiting Workshop (Esc and/or interact at an exit control): restores Explore,
   re-parents or re-enables the FPS camera on `PlayerController.yawObject`,
   and allows pointer lock again on the next canvas gesture.
5. While in Workshop, legacy fit / carry / elevator / `Q` / `R` assemble
   shortcuts do not run (or are no-ops). Mission clock may pause or continue —
   prefer **pause mission resource drain** in Workshop for this spike so
   testing the camera does not burn the window.
6. At least one unit test covers mode enter/exit state (e.g. `mode` flips and
   workshop root present), without requiring WebGL.

**Suggested shape (not mandatory names):**

```
src/game/mode.ts          # type GameMode = 'explore' | 'workshop'; enter/exit helpers
src/vab/WorkshopStation.ts  # trigger volume + placard near the stand or bay wall
src/workshop/session.ts   # spawn/despawn placeholder Command Pod on the stand
```

**Reuse:**

- `PlayerController.requestLock` / `releaseLock` already exist.
- `createVABScene()` / existing hangar — do **not** rebuild the campus yet;
  Phase 1 uses the current VAB as the explore space and hangar.
- Existing HUD: hide or dim Explore-only chrome in Workshop (crosshair,
  carry card, work-zone prompt). A minimal "Workshop — Esc to leave" banner
  is enough. Do not add the full part palette yet.

**Explicit non-goals for Phase 1:** orbit camera polish (that is Phase 2),
part palette, snap nodes, contract gating for "Complete."

### Phase 2 — Workshop orbit camera

**Goal.** In Workshop mode only, frame the stand with a third-person orbit
camera: orbit, pan, zoom. Pointer lock stays off.

**Done when:**

1. Entering Workshop hands the shared `THREE.PerspectiveCamera` to the orbit
   rig (or the orbit rig writes camera transform each frame while Workshop is
   active). Explore no longer updates `PlayerController` movement into the
   active view.
2. **Orbit** — drag (recommend LMB) rotates azimuth/elevation around a target
   at the Command Pod / stand centre.
3. **Pan** — drag (recommend RMB or MMB, or Shift+LMB) moves the target in the
   camera's local plane.
4. **Zoom** — scroll wheel changes distance; clamp min/max so the camera never
   enters the pod mesh or flies through the far wall.
5. Elevation clamped (no flipping upside-down through the floor).
6. Target defaults to the placeholder Command Pod world position.
7. Unit tests assert *direction / framing properties* (e.g. after orbit by π/2,
   camera lies roughly on the expected axis relative to target; distance stays
   within clamps) — same lesson as `PlayerController.test.ts`: assert where
   the camera points, not only that a number changed.
8. Leaving Workshop restores Explore camera behaviour cleanly (no leftover
   orbit listeners stealing mouse input).

**Suggested shape:**

```
src/render/OrbitCamera.ts       # pure-ish rig: update(dt), handlePointer*, setTarget
src/render/OrbitCamera.test.ts  # framing / clamp tests (jsdom + Three math, no WebGL)
```

**Input conflict rules (Workshop):**

- Mouse drag = orbit/pan, not FPS look.
- Scroll = zoom, not page scroll (`preventDefault` on the canvas).
- `Esc` = exit Workshop (Phase 1), not only exit pointer lock.
- Do not parent the Command Pod to the camera.

**Explicit non-goals for Phase 2:** dragging parts from a palette, green/red
nodes, saving craft, launch handoff.

### After Phase 1 & 2

Stop and playtest. Next is Phase 3 (vessel graph + axial snap with stub
parts), documented under workshop assembly above — not in this spike.
