# Ad Astra Program — Game Design

How the full game works, phase by phase. This document is the shared mental
model; when a decision in code contradicts something here, one of the two is
wrong and it needs a conversation.

## The fantasy

You are not an astronaut. You are the **flight engineer** of a small national
space program with one pad, a tight budget, and a director who wants results.
The satisfaction is not in pressing launch — it is in the moment three minutes
into an ascent when you realise the number you computed on the ground was
right.

Kerbal Space Program teaches you that rockets are hard. This teaches you that
*mission design* is hard, and that most of the hard part happens in a building
on the ground, months before anything flies.

## Why first person

The challenge asks for participants to experience an entire mission from
concept to operation. Scale is the part a 2D interface cannot convey. A launch
vehicle is 67 metres tall; standing at its base and looking up communicates
something about the engineering problem that no diagram does.

First person also gives the parts a physical presence. When you walk up to an
engine bell that is taller than you are and read that it produces 5.9 MN of
thrust, the number attaches to an object rather than to a table row.

## The four phases

### Phase 1 — Assembly (built)

**Where:** The Vehicle Assembly Building, first person.

**What you do:** Walk the bay. Look at each part to read what it is and why it
exists. Fit parts bottom-up: core booster, upper stage, payload, fairing. Watch
the engineering board on the wall update as you build.

**What you learn:** The rocket equation, viscerally. The board shows 13 873 m/s
of Δv with two stages and nothing on top. Add the eight-tonne telescope and it
falls to 10 924. The player discovers that payload is not free, and that the
relationship is logarithmic rather than linear, without reading a word of
theory.

**The decision that matters:** Which payload to fly. A three-tonne comsat makes
the ascent forgiving and returns 40 science. A fourteen-tonne laboratory
returns 180 but costs roughly 1 000 m/s of margin, which turns a comfortable
ascent into one that punishes a sloppy pitch programme.

### Phase 2 — Launch (next to build)

**Where:** The pad, first person in the blockhouse, then a chase camera.

**What you do:** Hold a gravity-turn pitch programme by hand while managing
throttle and staging. Go straight up for about a kilometre, then pitch over
progressively as speed builds: roughly 45° by 1 500 m/s, near horizontal by
2 800 m/s. Throttle back between 7 and 15 km to survive max-Q.

**What you learn:** Why ascents look the way they do. Gravity losses, drag
losses, and dynamic pressure are all live numbers on the HUD, and the player
feels the trade between them. Pitch too early and the atmosphere tears the
vehicle apart at 45 kPa. Pitch too late and the propellant goes into altitude
instead of the horizontal speed an orbit actually requires.

**The decision that matters:** When to pitch, and when to stage. Both are
continuous judgements rather than button presses, which is what makes the phase
a skill rather than a quiz.

### Phase 3 — Cruise

**Where:** Orbital map view, with a first-person option inside the spacecraft.

**What you do:** Plan and execute burns. For the lunar missions, a trans-lunar
injection timed so the Moon is where you arrive. Gravity assists where the
mission allows them.

**What you learn:** Orbits are counter-intuitive. Burning prograde raises the
*opposite* side of the orbit. Getting somewhere is a matter of timing as much
as of thrust. The map view teaches patched conics by making the sphere of
influence a visible boundary you cross.

### Phase 4 — Operations

**Where:** Inside the spacecraft, first person at a console.

**What you do:** Allocate a power budget across instruments, schedule
observations inside ground-station contact windows, and downlink before the
recorder fills. Eclipse passes drain the batteries; a brownout can kill an
instrument permanently.

**What you learn:** Arriving is half the job. Score is science *returned*, not
distance travelled, which is the actual measure NASA applies to its own
missions.

## The campaign

Six missions, each introducing exactly one new system so the player is never
overwhelmed.

| # | Mission | Introduces |
| --- | --- | --- |
| 1 | **First Light** — get anything above 100 km | Throttle, TWR, max-Q |
| 2 | **Hold Your Nerve** — reach a stable orbit | Staging, gravity turn, circularization |
| 3 | **Eyes Open** — deploy and operate a satellite | Power, data, contact windows |
| 4 | **The Long Way Round** — free-return lunar flyby | Patched conics, TLI, spheres of influence |
| 5 | **Grey Horizon** — lunar orbit insertion | Orbital capture, plane changes |
| 6 | **Ad Astra** — land a crew and bring them home | Powered descent, rendezvous, re-entry |

## Failure is the curriculum

Most players fail Mission 2 twice. That is the design intent.

A lost vehicle triggers a **review board** scene. The player reads their own
flight data — a telemetry plot of altitude, speed, dynamic pressure and pitch
against time — and selects a root cause from several plausible options. Choose
correctly and the fix unlocks. Choose incorrectly and the board says why, and
the player flies again with better questions.

This is where most of the educational payload sits. Nobody reads a tooltip
about dynamic pressure. Everybody listens when the flight director shouts about
it at T+62 seconds and the vehicle starts shaking, and everybody reads the
telemetry afterwards to find out what they did.

## Characters

Three voices, delivered as HUD dialogue with portraits rather than animated
3D characters — portraits read just as well and cost a day instead of a
fortnight.

- **Elena Vásquez, Flight Director.** Talks you through every ascent, reacts to
  your actual telemetry. Dry, calm, and more impressed by margin than by
  daring.
- **Dr. Okonkwo, Chief Scientist.** Wants his instruments flown. Argues for the
  heavy payload every single time.
- **Director Reyes.** Asks why you spent the quarter's budget on a fairing.
  Represents the constraint that makes the trade-offs matter.

Their lines change based on what the player actually did, which is cheap to
implement and does more for immersion than any amount of geometry.

## Scope discipline

The honest constraint: a month, six people, and a submission that has to be
playable from a cold link in under ninety seconds.

**In scope**

- Four phases, with Phase 1 and 2 excellent and 3 and 4 solid
- Earth and the Moon, modelled properly
- Preset stages with real specs, chosen from a catalog
- Procedural geometry throughout — no asset pipeline
- Portrait-and-text characters

**Out of scope, deliberately**

- Free-form part welding. The single biggest time sink in Kerbal-likes, and it
  teaches less than a constrained catalog does.
- A full solar system. Earth and the Moon done well beats nine bodies done
  shallowly.
- Imported 3D models. A week spent fighting glTF is a week not spent on feel.
- Multiplayer, mod support, procedural planets, re-entry heating visuals.

The test for any proposed feature: does it teach something the challenge prompt
names, and can it be finished and polished in the time left? If the answer to
either is no, it goes on a list for after the deadline.
