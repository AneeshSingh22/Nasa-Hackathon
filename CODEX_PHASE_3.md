# Codex brief — Phase 3: Workshop axial assembly (snap spike)

Read `CLAUDE.md` first (Player modes, Workshop assembly / attachment nodes,
Workshop part catalog, SI units, stack, quiet narrator). Then implement
**Phase 3 only** as scoped below.

## Where we are (do not regress)

Already shipped:

- Explore ↔ Workshop mode switch (`WorkshopSession`, `WorkshopStation`)
- Orbit / pan / zoom (`OrbitCamera`) — pointer lock off in Workshop
- Floating Command Pod root (`WORKSHOP_POD_HOVER_Y = 10` on `assemblyRoot`)
- Product direction: assembly **only** in Workshop; back-wall part benches are
  retired from the design (do not restore carry-and-place as the build loop)

Verify Explore → enter Workshop → orbit floating pod → Esc still works before
and after your changes.

## Mission for this session

Make Workshop a **real builder**, not just a camera:

1. Command Pod remains the session root (already spawned on enter).
2. A minimal part palette can select stub parts.
3. Player attaches parts by snap to **axial attachment nodes**.
4. Nodes show **green** (valid) / **red** (invalid) while placing.
5. Same pure rules decide green/red and whether attach succeeds.
6. Thin live readout: cost sum + mass (and Δv if easy from existing rocket
   helpers) — progressive disclosure; no HUD wall.
7. Detach last part (or selected part) with a key (e.g. `Q` / Backspace).

**Stop when axial snap with stubs feels good.** Full five-category catalog,
launch clamps, staging impulses, contract “Complete” gate, and ascent are
**Phase 3b / later** — not this pass.

---

## Hard constraints

| Rule | Detail |
| --- | --- |
| Stack | Vite, TS `strict`, Three.js, Vitest, plain DOM HUD, **no React** |
| Units | SI (m, kg, N, s); convert only when writing DOM text |
| Physics | `src/physics/` stays pure — no Three/DOM imports |
| Legality | One `canAttach` (or equivalent); spheres and attach path share it |
| Camera | Never parent parts to the camera; ghosts stay in world space |
| Orbit conflict | When a part drag/placement is active, LMB must **not** orbit; when idle, orbit works as Phase 2 |
| Scope | Stub catalog only (see below). No radial nodes, symmetry, fuel crossfeed |
| Legacy | Do not revive Explore bench pickup as the build path |
| Quality bar | `npm test` && `npm run typecheck` green |

---

## Stub catalog (Phase 3 only)

Do **not** implement all five categories yet. Ship these types with simple
procedural meshes + costs + mass (+ thrust/propellant where needed):

| Id / type | Category | Role in spike |
| --- | --- | --- |
| `command-pod` | Command | Already exists; session root; **not** placed from palette |
| `fuel-tank` | Propulsion | Axial body; top + bottom nodes; propellant mass + dry mass + cost |
| `liquid-engine` | Propulsion | Attaches under a tank (or under pod if you allow); thrust + Isp + cost |

Optional third stub if time: `stack-decoupler` (Structural) between tank and
pod — only if it does not delay green/red snap.

Use new workshop part definitions (e.g. `src/workshop/parts.ts`). You may
borrow numbers/mesh ideas from `vab/parts.ts` / `variants.ts`, but **do not**
force the old `booster | upper | payload | fairing` slot list onto the new
graph. Legacy `Assembly.SLOTS` stays untouched for now unless you need a thin
adapter for Δv — prefer a small `analyzeWorkshopVessel(...)` that calls
`deltaV` / mass rollup from `physics/rocket.ts`.

---

## Attachment model (v1 axial)

Each placed part owns nodes in **local space**, e.g.:

- `top` / `bottom` stack nodes (and later radial — not now)

Rules for this spike (encode in data + tests):

1. Pod is root; has a **bottom** node free for the stack hanging below it
   (floating build grows **downward** under the pod — matches hover height).
2. Tank: top attaches to pod bottom (or to another tank bottom); bottom accepts
   engine or another tank.
3. Engine: top attaches to tank bottom (or pod bottom if allowed); engine has
   no downward stack child in v1.
4. Occupied node → cannot attach (red).
5. Incompatible pair → red; release does nothing.

**Green / red spheres:** visible while a part is being placed (and optionally
dim when idle). Colour from `canAttach`, not a second heuristic.

Snap: nearest compatible free node within a snap radius (metres, SI); on
release over green, parent mesh, mark nodes connected, update analysis UI.

---

## Input / UX

**Palette (DOM, left side, Workshop only):**

- Categories strip can be minimal (e.g. only Propulsion for now) or show
  disabled future categories — prefer **only Propulsion stubs** to avoid
  clutter (progressive disclosure).
- Click part → select; show hover tooltip with mass, cost, thrust/Isp blurb.
- Always-visible Workshop chrome stays thin: Esc to leave, funds/cost spent,
  short mass / Δv line.

**Placement:**

- Recommended: select from palette → ghost follows a raycast against a
  vertical build plane / node proximity → green/red on candidate nodes →
  click or release to attach.
- Alternative: drag from palette into the canvas. Either is fine; document the
  chosen scheme in a short comment.
- Orbit: LMB drag only when **not** placing. RMB/MMB pan + scroll zoom unchanged.
- `Q` or `Backspace`: remove last attached part (not the Command Pod root).
- `Esc`: if placing, cancel placement first; if idle, exit Workshop (keep
  Phase 1 behaviour — cancel-before-exit is nicer).

---

## Suggested modules

```
src/workshop/parts.ts          # stub PartDefinition + nodes + costs (SI)
src/workshop/vessel.ts         # graph: parts, node occupancy, attach/detach
src/workshop/attach.ts         # pure canAttach / findSnap (HEAVILY tested)
src/workshop/nodes.ts          # green/red sphere visuals (Three)
src/workshop/palette.ts        # DOM palette create/update (or ui/)
src/workshop/placement.ts      # ghost + pointer state while placing
src/workshop/session.ts        # extend: own Vessel, wire palette/placement
src/workshop/*.test.ts         # attach legality + snap choice tests
```

Keep `OrbitCamera` as-is aside from “suppress orbit while placing.”

Thin wiring in `main.ts` / session enter: show palette chrome; on exit,
cancel placement, clear vessel meshes (pod may despawn as today), detach
listeners.

---

## Tests (must ship)

Pure tests (no WebGL), assert behaviour that can fail:

1. Pod + tank on pod bottom → allowed; engine on pod top → rejected (or
   whatever your node roles say — assert the real rules).
2. Engine on tank bottom → allowed; second engine on same node → rejected.
3. `findSnap` picks nearest valid node inside radius; ignores farther ones.
4. Detach frees nodes and updates child list.
5. Cost/mass rollup matches sum of definitions (SI).

Do not write tests that only check “function was called.”

---

## Explicit non-goals (Phase 3b / later)

- Full catalog: decoupler, clamp, reaction wheel, fin, sensor, antenna
- Radial attach, symmetry, strutting
- Contract panel “Complete” / roll-out handoff
- Staging impulses / vessel split at flight time
- Electric charge / science click-collect gameplay
- Reworking Explore campus or deleting all legacy `Assembly` code
- Narrating every attach (“tank added”) — quiet narrator; log/HUD is enough

---

## Acceptance checklist

- [ ] Enter Workshop → floating Command Pod still present
- [ ] Palette shows stub tank + engine; tooltip has cost/mass
- [ ] Attach tank under pod via green node; illegal hover shows red
- [ ] Attach engine under tank; stack visible; orbit still works when idle
- [ ] Detach removes last part; cannot delete pod root
- [ ] Cost/mass (and Δv if implemented) update from real part data
- [ ] Esc / exit Workshop cleans palette, ghosts, listeners; Explore OK
- [ ] `npm test` passes
- [ ] `npm run typecheck` passes

---

## Implementation order

1. Pure `attach` + `vessel` graph + tests (no UI).
2. Node sphere helpers + attach tank under pod via a **dev key or API** once.
3. Procedural stub meshes; render attached graph under workshop root.
4. Palette DOM + selection + tooltip.
5. Placement ghost + green/red + orbit suppress while placing.
6. Detach + live cost/mass readout.
7. Playtest + fix clamps/framing if the hanging stack leaves the view.
8. Stop — do not start full catalog or Complete gate.

## One-line success

In Workshop, I can snap a tank and engine under the floating pod with green/red
node feedback, see cost/mass update, detach, and leave — without touching
Explore benches or Phase 4 launch.
