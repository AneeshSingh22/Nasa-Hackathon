# Ad Astra Program

A first-person 3D spaceflight engineering game. You are the flight engineer of
a small national space program: walk the assembly building, learn what each
part of a rocket does, build a launch vehicle, fly it by hand, and find out
whether your engineering held up.

Built for the **NASA Space Apps Challenge 2026** — the mission-design game
challenge.

## Quick start

```bash
npm install
npm run dev
```

Open the URL Vite prints, click **Enter the building**, and you are standing on
the assembly bay floor.

| Key | Action |
| --- | --- |
| Arrow keys | Walk (`WASD` also works) |
| `Shift` | Run |
| Mouse | Look |
| `E` | Fit the next stage |
| `Q` | Remove the top stage |
| `R` | Clear the stand |
| `Tab` | Compare payloads (cycles the selection, fits nothing) |
| `G` | Swap an already-fitted payload |
| `F` | Roll out to the pad |
| `T` | Ask the flight director for advice |
| `H` | Show or hide the controls panel |
| `V` | Mute or unmute the flight director |
| `Esc` | Release the cursor — click the view to take it back |

You can only work on the vehicle from inside the painted circle on the floor,
the same way a real assembly bay restricts access. The action prompt fades in
as you approach, so the control teaches itself through movement.

Look directly at any part of the rocket to read its engineering briefing. The
in-game **Controls** button, bottom centre, lists every key at any time.

If your browser refuses pointer lock, looking around still works by holding the
left mouse button and dragging.

## What is playable right now

The **Vehicle Assembly Building** vertical slice:

- First-person movement at true spacecraft scale — the finished stack is 66.7 m
  tall and you walk around its base
- Four-part assembly: core booster, upper stage, telescope payload, fairing
- Live engineering readout computed by the real physics module
- Part inspection with the engineering reason each component exists
- Flight-director dialogue that responds to what you build

The teaching moment is visible in the numbers. Fit the booster and upper stage
and the readout shows 13 873 m/s of Δv. Add the eight-tonne telescope and it
drops to 10 924. Add the fairing and it falls again to 10 501. That is
Tsiolkovsky's rocket equation doing its work, and no tooltip is needed to
explain it.

## The decision the phase is built on

A contract states the requirement — an instrument package above 200 km
returning at least 100 units of science — and leaves the vehicle to you. Four
payloads are available and they are not interchangeable:

| Payload | Mass | Science | Cost | Δv margin | Verdict |
| --- | --- | --- | --- | --- | --- |
| Comsat Relay | 3 t | 40 | $52M | +2 371 m/s | **Fails the contract** |
| Orbital Telescope | 8 t | 100 | $112M | +1 101 m/s | Valid, earns the bonus |
| Crew Capsule | 11 t | 150 | $154M | +535 m/s | Valid, no bonus |
| Science Lab | 14 t | 180 | $186M | **+59 m/s** | Valid, and brutal |

The cheapest payload flies beautifully and does not do the job. The best-paying
one leaves almost no margin and costs $454M of a $480M budget, so a single
teardown bankrupts the programme. There is no move that is right in every
column, which is the whole point.

## Working at height

The lower stages go on from the floor. The payload and fairing sit on top of a
55-metre stack, so they are fitted from the top gantry platform — you climb the
ladder with the arrow keys to get there. Walking off the platform is a real
fall, and a serious one costs days and the director's confidence.

## How a run ends

Build a vehicle that can reach orbit and roll it out with `F`, and the phase
completes: a summary screen reports your remaining budget, schedule and
confidence, so a careless winner and a careful one get visibly different
results.

Roll-out is gated on the engineering analysis. A vehicle the board says cannot
reach orbit is refused, which turns the Δv readout from a number you can ignore
into a gate you have to satisfy.

## How you lose

The assembly phase is a game, not a sandbox. Three resources run down and any
of them can end the mission:

| Resource | Starts at | Spent by |
| --- | --- | --- |
| Budget | $480M | Fitting parts; removals refund only half |
| Launch window | 24 days | 2 days to fit, 3 to remove, 5 to clear the stand |
| Director confidence | 80% | Falls 13 points per teardown |

A clean build costs $380M and 8 days, leaving real margin. Careless rebuilding
does not: two swaps of the expensive telescope bankrupt the programme, while
cheap fairing swaps let you survive long enough to run the clock out instead.
**Which resource kills you depends on what you waste**, which is the decision
the phase is built around.

Failure opens a review board that names the resource, shows what you spent, and
states the engineering lesson — real programmes lose most of their budget to
rework, which is why design reviews happen on paper before hardware is cut.

## The flight director

Elena Vásquez speaks through the Web Speech API — no audio files, no bundle
cost, and it degrades to silent text wherever speech is unavailable.

**She is quiet by default.** Two lines of briefing, a few words when a part goes
on, and an urgent warning when a resource is about to end the run. That is all
she volunteers. An earlier version narrated every part, every removal and every
payload you tabbed past, and it talked over the panels that say the same thing
faster.

Help is on request instead: press `T` or the **Ask advice** button and she
addresses the situation you are actually in — where to stand, what is failing
the contract, how thin your margin is. She names the trade-off and never the
answer, so asking for help does not delete the decision. A test asserts she
never recommends a payload by name.

Press `V` to mute her voice; the written line still appears.

## Verified physics

The simulation is checked against published values rather than tuned by feel.
`npm test` asserts all of this:

| Quantity | Simulated | Reference |
| --- | --- | --- |
| Circular speed at 400 km | 7 672.6 m/s | 7 672.6 m/s (vis-viva) |
| Orbital period at 400 km | 92.4 min | ~92.5 min (ISS) |
| Hohmann 400 → 2 000 km | 395 + 375 m/s | Textbook Hohmann |
| Sea-level air density | 1.225 kg/m³ | US Standard Atmosphere 1976 |
| Density at 11 / 20 / 32 km | within 12% | US Standard Atmosphere 1976 |
| Max-Q altitude | 7–13 km | Falcon 9 max-Q ~11–13 km |
| Energy drift over one orbit | < 1 × 10⁻⁶ | RK4 integrator |

The first-person controller has its own suite (11 tests) driving real keyboard
events through the movement frame, so a regression in walking is caught by
`npm test` rather than by a player.

The launch vehicle is also verified as *flyable*: 436 t on the pad, liftoff TWR
1.38, 10 501 m/s total Δv against the ~9 400 m/s that low Earth orbit actually
costs. A flown gravity turn reaches roughly 100 × 280 km. Straight-up and
pitch-over-immediately profiles both fail, which is the point — the player has
to learn the manoeuvre.

## Architecture

```
src/
  physics/     Simulation core. Pure functions, no Three.js, no DOM.
    constants.ts    Physical constants, SI units, with sources
    atmosphere.ts   Two-layer exponential density, drag, dynamic pressure
    orbit.ts        Orbital elements, vis-viva, Hohmann, RK4 propagator
    rocket.ts       Rocket equation, staging, engine performance
    physics.test.ts 19 tests against published values
  vab/         The assembly building
    VABScene.ts       Building geometry and lighting
    PlayerController.ts  First-person movement with pointer lock
    parts.ts          Procedural rocket geometry and part specs
    Assembly.ts       Stacking rules and engineering analysis
  content/     Part catalog, vehicle definitions, NASA citations
  main.ts      Integration and the render loop
```

`src/physics/` never imports Three.js and never touches the DOM. It takes
numbers and returns numbers, which is what makes it testable — and the tests
are what make the science defensible.

## Roadmap

- [x] Physics core with tests against published values
- [x] First-person VAB with part assembly and live analysis
- [ ] Roll out to the launch pad
- [ ] Flyable ascent: throttle, pitch, staging, max-Q
- [ ] Orbital map view and manoeuvre planning
- [ ] Trans-lunar injection and landing
- [ ] Campaign progression and the failure review board

## Sources

Part specifications are modelled on real hardware; `src/content/vehicles.ts`
carries the citation list, including the Atlas V Mission Planner's Guide, the
US Standard Atmosphere 1976, and the NASA Goddard Earth and Moon fact sheets.
Where a value is tuned for playability rather than taken from a source, the
comment says so.
