# Codex brief — Phase 1 & 2: Workshop mode switch + orbit camera

Read `CLAUDE.md` first (especially **Player modes**, **Workshop part catalog**,
**Implementation: Phase 1 & 2**, units, stack, and code style). Then implement
**only Phase 1 and Phase 2** as specified below.

You are working in the Ad Astra Program repo: a NASA Space Apps 2026
TypeScript + Three.js + Vite game. The product direction has changed from
first-person carry-and-place assembly to:

1. **Explore** — first-person walk in the facility  
2. **Workshop** — third-person Kerbal-style builder (later phases)

This task proves the seam and the workshop camera. **Do not** implement
drag-and-drop parts, attachment nodes, the five-category palette, staging,
launch, or campus redesign.

---

## Mission for this session

Ship a playable spike where:

1. The player walks the existing VAB in Explore mode.  
2. They enter Workshop from a station volume.  
3. Workshop shows a centred Command Pod placeholder and uses an orbit / pan /
   zoom camera with pointer lock off.  
4. Esc (or an exit control) returns to Explore cleanly.  
5. Legacy assemble shortcuts do nothing in Workshop.  
6. Tests and typecheck pass.

---

## Hard constraints

| Rule | Detail |
| --- | --- |
| Stack | Vite, TS `strict`, Three.js, Vitest, plain DOM HUD, **no React**, no state library |
| Units | SI only (m, s, kg, N, rad); convert at DOM write time |
| Physics | `src/physics/` never imports Three.js or DOM — do not touch unless needed (you should not need to) |
| Scope | Phase 1 + 2 only |
| Legacy | Do **not** delete elevator / carry / work-zone / `Assembly` fit flow; gate them inactive in Workshop |
| `main.ts` | Keep wiring thin; put mode + orbit logic in new modules |
| Camera lesson | Assert *direction/framing*, not only that transforms changed (`PlayerController.test.ts` pattern) |
| Pointer lock | Never clear held keys on `pointerlockchange`; clear on `window` `blur` only (existing rule) |
| Parenting | Never parent the Command Pod (or any build mesh) to the camera |

Commands to run before you finish:

```bash
npm test
npm run typecheck
```

---

## Repo landmarks (read before coding)

| Path | Why it matters |
| --- | --- |
| `CLAUDE.md` | Product rules and Phase 1–2 acceptance criteria |
| `src/main.ts` | Integration: renderer, camera, `PlayerController`, `Assembly`, input (`KeyE` → `interact`), frame loop |
| `src/vab/PlayerController.ts` | FPS controller; `requestLock` / `releaseLock`; camera lives under `yawObject` |
| `src/vab/VABScene.ts` | Hangar; `assemblyRoot` at `(0, 1.6, 0)` — rocket parent |
| `src/vab/Assembly.ts` | Legacy linear stack — leave working in Explore |
| `src/vab/parts.ts` / `variants.ts` | Procedural meshes; may reuse a capsule-like builder for the placeholder pod |
| `src/game/workzone.ts`, `carry.ts`, `Mission.ts` | Legacy assemble + resources — gate / pause in Workshop |
| `index.html` | HUD; add a minimal Workshop banner if needed |
| `src/render/` | **Empty — create it** for `OrbitCamera` |

Useful existing APIs:

- `player.requestLock(canvas)` / `player.releaseLock()`
- `player.attach(canvas)` already handles mouse; Workshop must not let FPS look fight the orbit rig
- `env.assemblyRoot` for parenting the placeholder pod

---

## Phase 1 — Mode switch

### Behaviour

1. Introduce an explicit mode: `'explore' | 'workshop'` (module-level or small
   `src/game/mode.ts`). No soft blending of cameras mid-walk.
2. Add a **workshop station** in the current VAB (trigger volume + simple
   placard / painted label such as “Workshop” / “Build rocket”). Place it so
   the player can reach it from spawn without the elevator (near bay floor,
   clear of benches if possible).
3. When Explore + player in volume + interact (`E` is fine): **enter Workshop**.
4. On enter:
   - `player.releaseLock()`
   - Stop applying Explore movement to the active view (skip `player.update` for
     locomotion **or** freeze input — Explore body may stay put)
   - Spawn / show a **Command Pod placeholder** on `assemblyRoot` (centred).
     This is the session root for later phases; for now it is visual + camera
     target only. Prefer a distinct procedural capsule mesh (reuse patterns from
     `variants.ts` / crew capsule if sensible). If a legacy stack is already on
     the stand, either clear it for the spike or parent the pod above a clean
     stand — pick one approach and document it in a short code comment.
   - Hide or dim Explore-only UI: crosshair, carry card, work-zone / elevator
     prompts. Show a thin Workshop chrome: title + “Esc to return to bay”.
   - Prefer **pausing mission resource drain** while in Workshop so camera
     testing does not burn the launch window.
5. On exit (`Esc` and/or interact on an exit affordance):
   - Remove or hide workshop chrome
   - Tear down orbit listeners (Phase 2)
   - Restore Explore camera via `PlayerController.yawObject`
   - Allow pointer lock again on the next canvas click / start gesture
   - Resume mission ticking if you paused it
6. While `workshop`: legacy `interact` fit/carry/elevator paths, `Q` detach,
   `R` reset stack must be **no-ops** (or early-return). Do not soft-fail with
   narrator spam.

### Suggested files

```
src/game/mode.ts
src/vab/WorkshopStation.ts   # volume + contains(player) + optional mesh/sign
src/workshop/session.ts      # enter/exit side effects, placeholder pod lifecycle
```

### Phase 1 tests

- Mode flips explore → workshop → explore.
- Workshop session creates a pod object parented under the assembly root (or a
  documented workshop root).
- Prefer logic tests that do not need WebGL/canvas.

---

## Phase 2 — Orbit camera

### Behaviour

Implement `src/render/OrbitCamera.ts` (name flexible) used **only** when
`mode === 'workshop'`.

| Input | Action |
| --- | --- |
| LMB drag | Orbit azimuth / elevation around target |
| RMB or MMB drag (or Shift+LMB) | Pan target in camera local plane |
| Scroll wheel | Zoom distance (clamp min/max) |

Requirements:

1. Pointer lock remains **off** in Workshop.
2. Default target = Command Pod world position (stand centre).
3. Clamp elevation so the camera does not flip under the floor.
4. Clamp radius so the camera does not clip inside the pod or leave the useful
   hangar framing.
5. Each Workshop frame: orbit rig writes the shared `PerspectiveCamera`
   transform. Do **not** also run FPS look into that camera.
6. On exit Workshop: detach pointer/wheel listeners so Explore mouse behaviour
   returns to normal (`PlayerController` look + lock).
7. `preventDefault` on wheel over the canvas so the page does not scroll.

### Phase 2 tests (`src/render/OrbitCamera.test.ts`)

Using Three.js math in Vitest/jsdom (no WebGL):

- After a known azimuth delta, camera position relative to target matches the
  expected quadrant/axis within tolerance.
- Distance stays within min/max after zoom attempts past the limits.
- Elevation stays within clamp after extreme pitch input.

Mirror the project lesson: **assert direction/framing**, not only “value changed.”

---

## Integration sketch (guidance, not a mandate)

In `main.ts` frame loop, conceptually:

```ts
if (mode === 'explore') {
  player.update(dt);
  // existing explore prompts / elevator / etc.
} else {
  orbitCamera.update(dt); // applies to `camera`
  // no legacy assemble input
}
renderer.render(env.scene, camera);
```

Enter/exit functions should be the single place that toggles listeners, HUD
visibility, lock state, and pod spawn.

---

## Out of scope (refuse scope creep)

- Part palette / categories UI  
- Drag-drop, snap spheres, green/red compatibility  
- Rewriting `PartKind` / full workshop catalog  
- New campus exterior  
- Flyable ascent / roll-out changes  
- Narrator lines that narrate “entering workshop” every time if a HUD banner
  already says it (quiet narrator rule)  
- Refactors unrelated to mode + orbit camera  

If you notice legacy bugs, do not fix them unless they block Phase 1–2.

---

## Acceptance checklist

- [ ] Explore walk still works as before after load + start  
- [ ] Workshop station reachable; `E` (or documented key) enters Workshop  
- [ ] Pointer lock released; FPS move/look no longer drives the view  
- [ ] Command Pod placeholder visible on the stand  
- [ ] Orbit / pan / zoom work; clamps feel sane  
- [ ] Esc returns to Explore; mouse/lock behaviour restored  
- [ ] Legacy assemble keys inert in Workshop  
- [ ] `npm test` passes  
- [ ] `npm run typecheck` passes  
- [ ] Short comments explain *why* for mode boundaries and camera handoff  

---

## Implementation order

1. `GameMode` + enter/exit stubs + HUD banner (no orbit yet; freeze camera on stand).  
2. Workshop station volume + interact wiring; gate legacy assemble in Workshop.  
3. Placeholder Command Pod spawn/despawn.  
4. `OrbitCamera` + tests.  
5. Wire orbit into Workshop frames; verify exit cleans listeners.  
6. Run `npm test` && `npm run typecheck`; fix fallout.  

Stop when Phase 1 and 2 acceptance checklist is green. Do not start Phase 3.
