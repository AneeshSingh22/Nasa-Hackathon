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
| `W` `A` `S` `D` | Walk |
| `Shift` | Run |
| Mouse | Look |
| `E` | Fit the next stage |
| `Q` | Remove the top stage |
| `R` | Clear the stack |
| `H` | Show or hide the controls panel |
| `Esc` | Release the cursor — click the view to take it back |

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
