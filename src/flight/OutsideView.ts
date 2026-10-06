import * as THREE from 'three';
import { R_EARTH } from '../physics/constants';

/**
 * The world outside the cockpit window.
 *
 * ## Why this replaced the modelled cockpit
 *
 * The earlier flight scene modelled the cockpit interior in 3D and rendered
 * the planet behind it. It failed three times in a row for the same reason:
 * the interesting thing — the world going past — was either hidden behind dark
 * geometry or not there at all, because at zero altitude a planet-sized sphere
 * has its surface exactly at the camera. The cockpit frame is now DOM, drawn
 * over this view, and this scene contains only what is outside.
 *
 * ## Where the window looks
 *
 * Along the direction of travel, at the horizon, rather than along the nose.
 * During the vertical climb the nose points straight up, and a window looking
 * that way shows featureless sky: correct, and impossible to fly by. Looking
 * downrange keeps the ground, the coast, the clouds and the horizon in view
 * for the whole ascent, so the player can watch the pad drop away, cross the
 * cloud deck, and see the horizon curve and dip as they climb. The nose
 * attitude is shown on the attitude indicator, which is where a pilot reads it
 * anyway.
 *
 * ## Scale
 *
 * True scale throughout. The ground is a large disc whose vertices are bent
 * down by the Earth's curvature in the vertex shader, so the horizon dips by
 * exactly acos(R / (R + h)) — 13.5 degrees at 180 km — rather than by a number
 * chosen to look right. The camera stays at the origin and the world moves,
 * which avoids float32 precision loss at planetary distances.
 */

/** The crew cabin sits this far above the pad, at the top of the stack. m */
export const EYE_HEIGHT = 60;

/** Near and far planes for the window view. m */
export const VIEW_NEAR = 4;
export const VIEW_FAR = 4.0e7;

/**
 * Radius of the sky and star backdrops. Small and drawn without depth testing,
 * so it is always behind everything regardless of distance. m
 */
const BACKDROP_RADIUS = 5_000;

/** Radius of the ground disc. Comfortably past the horizon at orbit height. m */
const GROUND_RADIUS = 3.0e6;

/** Cloud deck altitude. Crossing it is the clearest altitude cue a launch has. m */
export const CLOUD_ALTITUDE = 2_400;

/** Ground coordinate (metres east of the pad, along -Z) where the sea begins. */
const COASTLINE = 1_800;

/**
 * How far below the local horizontal the horizon sits, seen from altitude.
 *
 * The tangent from the eye to the sphere: cos(dip) = R / (R + h). Zero on the
 * ground, 13.5 degrees at 180 km. The window's downward tilt follows it so the
 * horizon stays in frame from the pad to orbit.
 */
export function horizonDip(altitude: number): number {
  const h = Math.max(0, altitude);
  return Math.acos(R_EARTH / (R_EARTH + h));
}

/** How dark the sky is, 0 at sea level to 1 in space. */
export function skyDarkness(altitude: number): number {
  // Most of the atmosphere's mass is below 30 km and the sky is black above
  // about 80, so a smoothstep across that band matches what crews describe.
  const t = THREE.MathUtils.clamp((altitude - 4_000) / 70_000, 0, 1);
  return t * t * (3 - 2 * t);
}

export interface OutsideFrame {
  /** Vehicle altitude above the pad. m */
  readonly altitude: number;
  /** Ground distance travelled east of the pad. m */
  readonly downrange: number;
  /** Seconds since launch, or a negative countdown. */
  readonly time: number;
  /** 0..1 rumble from thrust and buffeting. */
  readonly shake: number;
  /** Whether the engines are lit, for the pad smoke. */
  readonly enginesLit: boolean;
}

export interface OutsideView {
  readonly scene: THREE.Scene;
  /** Move the world to match the vehicle. */
  update(frame: OutsideFrame): void;
  /**
   * Point the camera through the window, with any head turn applied.
   * `lookYaw` / `lookPitch` in radians from straight ahead.
   */
  aim(camera: THREE.PerspectiveCamera, frame: OutsideFrame, lookYaw: number, lookPitch: number): void;
  dispose(): void;
}

export function createOutsideView(): OutsideView {
  const scene = new THREE.Scene();

  const uniforms = {
    altitude: { value: 0 },
    downrange: { value: 0 },
    darkness: { value: 0 },
    /** sin of the horizon dip, so the sky's glow hugs the real horizon. */
    horizonSin: { value: 0 },
  };

  // ------------------------------------------------------------------- sky
  //
  // A backdrop, so it is small and drawn first with depth testing off, and
  // everything else paints over it. It used to sit at 36 000 km, just inside
  // the far plane, and at that distance 32-bit precision on the GPU pushed some
  // of its vertices past the far plane: whole triangles were clipped and the
  // black clear colour showed through as two large black shapes in the sky.
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(BACKDROP_RADIUS, 48, 24),
    new THREE.ShaderMaterial({
      uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      vertexShader: /* glsl */ `
        varying vec3 vDirection;
        void main() {
          vDirection = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float altitude;
        uniform float darkness;
        uniform float horizonSin;
        varying vec3 vDirection;
        void main() {
          // Elevation above the *visible* horizon, not the local horizontal.
          // From orbit the horizon sits about 13.5 degrees below horizontal, and
          // measuring from horizontal lit that whole band as a thick slab of
          // blue instead of the thin line at the limb that astronauts see.
          float elevation = vDirection.y + horizonSin;
          vec3 zenithDay = vec3(0.16, 0.38, 0.78);
          vec3 horizonDay = vec3(0.64, 0.80, 0.96);
          vec3 space = vec3(0.005, 0.008, 0.02);
          // The bright band hugs the horizon; it thins to a blue line at the
          // limb once the vehicle is above most of the air.
          float band = exp(-max(elevation + 0.02, 0.0) * mix(6.0, 60.0, darkness));
          vec3 day = mix(zenithDay, horizonDay, band);
          vec3 limb = vec3(0.30, 0.55, 1.0) * band * 0.9;
          vec3 colour = mix(day, space + limb, darkness);
          gl_FragColor = vec4(colour, 1.0);
        }
      `,
    }),
  );
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  scene.add(sky);

  // ------------------------------------------------------------------ stars
  const stars = createStars();
  scene.add(stars);

  // ----------------------------------------------------------------- ground
  //
  // A ring tessellated in radius as well as angle, so the curvature in the
  // vertex shader has vertices to bend. The ground coordinate system has the
  // pad at the origin and east along -Z, matching the window's view.
  const groundGeometry = new THREE.RingGeometry(0.5, GROUND_RADIUS, 160, 90);
  groundGeometry.rotateX(-Math.PI / 2);
  // Pack the rings densely near the camera and sparsely far away: the ground
  // under the pad needs metres of detail, the ground at the horizon does not.
  const positions = groundGeometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1) continue;
    const fraction = r / GROUND_RADIUS;
    const warped = GROUND_RADIUS * Math.pow(fraction, 2.6);
    positions.setXYZ(i, (x / r) * warped, 0, (z / r) * warped);
  }
  positions.needsUpdate = true;

  const ground = new THREE.Mesh(groundGeometry, new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      uniform float altitude;
      varying vec2 vGround;
      varying float vDistance;
      const float R = ${R_EARTH.toFixed(1)};
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        float d = length(world.xz);
        // Bend the flat disc onto the sphere: a point d metres away sits
        // R - sqrt(R^2 - d^2) below the tangent plane. Written as
        // d^2 / (R + sqrt(R^2 - d^2)), which is the same value without
        // subtracting two near-equal 6 371 km figures in 32-bit floats.
        float drop = (d * d) / (R + sqrt(max(R * R - d * d, 0.0)));
        world.y -= drop;
        vGround = position.xz;
        vDistance = length(world.xyz);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float downrange;
      uniform float darkness;
      uniform float altitude;
      varying vec2 vGround;
      varying float vDistance;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      float fbm(vec2 p) {
        float total = 0.0;
        float amplitude = 0.5;
        for (int i = 0; i < 5; i++) {
          total += noise(p) * amplitude;
          p *= 2.03;
          amplitude *= 0.5;
        }
        return total;
      }

      void main() {
        // Ground coordinates under this pixel. The vehicle has flown
        // 'downrange' metres east (-Z), so the terrain slides toward the
        // camera as it does: that sliding is what reads as speed.
        vec2 g = vGround + vec2(0.0, -downrange);
        float east = -g.y;

        // The coast. Launch sites face the sea so a failure falls into
        // water, and flying out over the coastline is the view every crew
        // remembers.
        float coastWobble = (fbm(vec2(g.x / 9000.0, 3.1)) - 0.5) * 2600.0;
        float sea = smoothstep(${COASTLINE.toFixed(1)} - 120.0, ${COASTLINE.toFixed(1)} + 120.0, east + coastWobble);

        // Land: scrub, fields and wetland at several scales.
        float broad = fbm(g / 5200.0);
        float fine = fbm(g / 420.0);
        vec3 scrub = vec3(0.30, 0.36, 0.20);
        vec3 field = vec3(0.47, 0.50, 0.30);
        vec3 wet = vec3(0.20, 0.28, 0.22);
        vec3 land = mix(scrub, field, smoothstep(0.45, 0.62, broad));
        land = mix(land, wet, smoothstep(0.58, 0.70, fine) * 0.6);
        land *= 0.85 + fine * 0.3;

        // Roads on a loose grid, which is what gives the land its scale.
        vec2 grid = abs(fract(g / 1600.0) - 0.5);
        float road = 1.0 - smoothstep(0.0, 0.004, min(grid.x, grid.y));
        land = mix(land, vec3(0.55, 0.53, 0.50), road * 0.7);

        // The pad: a concrete apron with a flame trench running north.
        float apron = 1.0 - smoothstep(110.0, 130.0, length(g));
        land = mix(land, vec3(0.62, 0.62, 0.60), apron);
        float trench = (1.0 - smoothstep(6.0, 9.0, abs(g.x))) * step(0.0, g.y) * step(g.y, 140.0);
        land = mix(land, vec3(0.18, 0.18, 0.19), trench);

        vec3 ocean = mix(vec3(0.05, 0.20, 0.33), vec3(0.08, 0.30, 0.42), fbm(g / 3000.0));
        // A bright surf line along the coast.
        float surf = 1.0 - smoothstep(0.0, 0.12, abs(sea - 0.5));
        vec3 surface = mix(land, ocean, sea);
        surface = mix(surface, vec3(0.85, 0.88, 0.88), surf * 0.5);

        // Weather systems seen from above. Below the cloud deck they are the
        // deck itself; from high up they are what makes the ocean read as a
        // planet rather than a flat blue floor.
        float weather = smoothstep(0.5, 0.68, fbm(g / 38000.0 + 7.0));
        surface = mix(surface, vec3(0.93, 0.95, 0.98), weather * smoothstep(0.15, 0.6, darkness) * 0.85);

        // Aerial perspective: distance hazes toward the horizon colour. The
        // haze thins as the vehicle climbs above the air that causes it.
        float hazeLength = mix(110000.0, 1400000.0, darkness);
        float haze = 1.0 - exp(-vDistance / hazeLength);
        vec3 horizonColour = mix(vec3(0.64, 0.80, 0.96), vec3(0.30, 0.50, 0.85), darkness);
        gl_FragColor = vec4(mix(surface, horizonColour, haze * 0.92), 1.0);
      }
    `,
  }));
  ground.frustumCulled = false;
  ground.name = 'Ground';
  scene.add(ground);

  // ----------------------------------------------------------------- clouds
  const clouds = new THREE.Mesh(
    new THREE.PlaneGeometry(220_000, 220_000, 1, 1).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        varying vec2 vGround;
        varying float vDistance;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vGround = position.xz;
          vDistance = length(world.xyz);
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float downrange;
        varying vec2 vGround;
        varying float vDistance;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 15731.743); }
        float noise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                     mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        float fbm(vec2 p) {
          float t = 0.0; float a = 0.5;
          for (int i = 0; i < 5; i++) { t += noise(p) * a; p *= 2.1; a *= 0.5; }
          return t;
        }
        void main() {
          vec2 g = vGround + vec2(0.0, -downrange);
          // Five-octave value noise averages about 0.47, so the threshold sits
          // just above it: broken cumulus, not overcast and not clear sky.
          float cover = smoothstep(0.44, 0.62, fbm(g / 2600.0));
          // Fade the far edge so the deck has no visible boundary.
          float edge = 1.0 - smoothstep(60000.0, 105000.0, vDistance);
          vec3 lit = mix(vec3(0.78, 0.82, 0.88), vec3(1.0), fbm(g / 700.0));
          gl_FragColor = vec4(lit, cover * edge * 0.92);
        }
      `,
    }),
  );
  clouds.frustumCulled = false;
  clouds.name = 'Cloud deck';
  scene.add(clouds);

  // ------------------------------------------------------------- the pad
  //
  // Real geometry close to the camera, because a structure sliding down past
  // the window is the single most legible sign of lift-off.
  const pad = new THREE.Group();
  pad.name = 'Launch pad';
  scene.add(pad);
  buildLaunchTower(pad);
  buildSkyline(pad);

  const smoke = createSmoke();
  pad.add(smoke.group);

  // A sun for the pad geometry. The ground and sky are shaded in their own
  // shaders; this only lights the tower and buildings.
  const sun = new THREE.DirectionalLight(0xfff2de, 2.4);
  sun.position.set(-0.5, 0.8, 0.3);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbcd6f2, 0x4d5a3d, 1.1));

  return {
    scene,

    update(frame) {
      const altitude = Math.max(0, frame.altitude);
      const darkness = skyDarkness(altitude);
      uniforms.altitude.value = altitude;
      uniforms.downrange.value = frame.downrange;
      uniforms.darkness.value = darkness;
      uniforms.horizonSin.value = Math.sin(horizonDip(altitude));

      // Everything on the ground sits this far below the eye.
      const groundY = -(altitude + EYE_HEIGHT);
      ground.position.y = groundY;

      // Pad structures ride the ground, and slide behind the vehicle as it
      // travels east.
      pad.position.set(0, groundY, frame.downrange);
      // Past a few kilometres up the pad is a speck; stop drawing it.
      pad.visible = altitude < 25_000;

      clouds.position.y = CLOUD_ALTITUDE - altitude - EYE_HEIGHT;
      clouds.visible = altitude < 30_000;

      const starMaterial = stars.material as THREE.PointsMaterial;
      const starlight = THREE.MathUtils.clamp((darkness - 0.45) / 0.45, 0, 1);
      starMaterial.color.setScalar(starlight);
      stars.visible = starlight > 0.01;

      smoke.update(frame.time, frame.enginesLit, altitude);
    },

    aim(camera, frame, lookYaw, lookPitch) {
      // Straight ahead is downrange, tilted down past the horizon so the
      // ground fills the lower part of the window at every altitude.
      const dip = horizonDip(frame.altitude);
      // Look well down at lift-off and ease up to the horizon as the vehicle
      // climbs. Lift-off is the most dramatic moment of the flight, and a
      // window aimed at the horizon loses the pad below the frame within a
      // second of leaving it. Tilted down, the player watches the tower and
      // the pad drop away beneath them.
      const climb = THREE.MathUtils.smoothstep(frame.altitude, 0, 5_000);
      const lookDown = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(30, 9, climb));
      const baseTilt = -(dip + lookDown);

      // Rumble. Several unrelated frequencies so it reads as vibration rather
      // than a wobble; amplitude in radians, so it is felt not seen.
      const s = frame.shake;
      const t = performanceSeconds();
      const jitterYaw = s * 0.0035 * (Math.sin(t * 41.0) + 0.5 * Math.sin(t * 77.0));
      const jitterPitch = s * 0.0045 * (Math.sin(t * 47.0) + 0.5 * Math.sin(t * 91.0));

      camera.position.set(0, 0, 0);
      camera.quaternion.setFromEuler(new THREE.Euler(
        baseTilt + lookPitch + jitterPitch,
        lookYaw + jitterYaw,
        s * 0.002 * Math.sin(t * 33.0),
        'YXZ',
      ));
      camera.updateMatrixWorld(true);
    },

    dispose() {
      scene.traverse(object => {
        if (!(object instanceof THREE.Mesh) && !(object instanceof THREE.Points)
          && !(object instanceof THREE.Sprite)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.dispose();
      });
    },
  };
}

/** Wall-clock seconds, for vibration that keeps going when time is paused. */
function performanceSeconds(): number {
  return (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
}

/**
 * The launch tower and pad furniture.
 *
 * In ground coordinates: pad at the origin, east (downrange) along -Z, the
 * vehicle standing at the origin with the crew cabin EYE_HEIGHT up. The tower
 * stands to the left and slightly ahead so it fills the left side of the
 * window at T-0 and slides down out of it in the first seconds of flight.
 */
function buildLaunchTower(pad: THREE.Group): void {
  const steel = new THREE.MeshStandardMaterial({ color: 0x8a3b2a, metalness: 0.4, roughness: 0.7 });
  const grey = new THREE.MeshStandardMaterial({ color: 0x6d7076, metalness: 0.5, roughness: 0.6 });
  const concrete = new THREE.MeshStandardMaterial({ color: 0x9a9a96, roughness: 0.95 });

  const towerX = -22;
  const towerZ = -34;
  const towerHeight = 95;
  const width = 9;

  // Four legs and a lattice of cross members: a box would read as a building.
  for (const dx of [-1, 1]) {
    for (const dz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.9, towerHeight, 0.9), steel);
      leg.position.set(towerX + dx * width / 2, towerHeight / 2, towerZ + dz * width / 2);
      pad.add(leg);
    }
  }
  for (let y = 4; y < towerHeight; y += 6) {
    for (const [dx, dz, rx, rz] of [
      [0, -1, width, 0.5], [0, 1, width, 0.5], [-1, 0, 0.5, width], [1, 0, 0.5, width],
    ] as Array<[number, number, number, number]>) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(rx, 0.5, rz), steel);
      beam.position.set(towerX + dx * width / 2, y, towerZ + dz * width / 2);
      pad.add(beam);
    }
    // Diagonals on the face toward the camera.
    const brace = new THREE.Mesh(new THREE.BoxGeometry(width * 1.35, 0.35, 0.35), steel);
    brace.position.set(towerX, y + 3, towerZ + width / 2);
    brace.rotation.z = (y / 6) % 2 === 0 ? 0.62 : -0.62;
    pad.add(brace);
  }

  // Crew access arm, from the tower's inner corner to just short of the
  // vehicle, a few metres below the cabin. Computed from its two ends so it
  // actually connects them; a box placed by eye floated in mid-air.
  const armStart = new THREE.Vector2(towerX + width / 2, towerZ + width / 2);
  const armEnd = new THREE.Vector2(-5, -7);
  const armSpan = armEnd.clone().sub(armStart);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(armSpan.length(), 2.4, 2.2), grey);
  arm.position.set(
    (armStart.x + armEnd.x) / 2, EYE_HEIGHT - 5, (armStart.y + armEnd.y) / 2,
  );
  // BoxGeometry runs along x; rotating by theta about y points x at
  // (cos theta, 0, -sin theta).
  arm.rotation.y = Math.atan2(-armSpan.y, armSpan.x);
  pad.add(arm);

  // Lightning mast on top, with a warning lamp.
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 22, 8), grey);
  mast.position.set(towerX, towerHeight + 11, towerZ);
  pad.add(mast);
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.9, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xff3b2f }),
  );
  beacon.position.set(towerX, towerHeight + 22.5, towerZ);
  pad.add(beacon);

  // Concrete pad deck and the mount the vehicle stands on.
  const deck = new THREE.Mesh(new THREE.BoxGeometry(70, 3, 70), concrete);
  deck.position.set(0, 1.5, 0);
  pad.add(deck);

  // Floodlight masts around the pad perimeter.
  for (const [x, z] of [[55, -70], [-75, -95], [80, 40], [-60, 60]] as Array<[number, number]>) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 40, 6), grey);
    pole.position.set(x, 20, z);
    pad.add(pole);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 1.2), grey);
    lamp.position.set(x, 40, z);
    pad.add(lamp);
  }

  // Water tower: a recognisable pad landmark, and a second object at a
  // different distance so the parallax reads.
  const tank = new THREE.Mesh(new THREE.SphereGeometry(9, 16, 12), concrete);
  tank.position.set(140, 62, -180);
  pad.add(tank);
  for (const dx of [-5, 5]) {
    for (const dz of [-5, 5]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 56, 6), grey);
      leg.position.set(140 + dx, 28, -180 + dz);
      pad.add(leg);
    }
  }
}

/** Distant buildings: the assembly building on the skyline, for scale. */
function buildSkyline(pad: THREE.Group): void {
  const wall = new THREE.MeshStandardMaterial({ color: 0xbfc2c4, roughness: 0.9 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x3b5a8a, roughness: 0.8 });

  // The assembly building the player built the vehicle in, 2.5 km away.
  const vab = new THREE.Mesh(new THREE.BoxGeometry(160, 160, 220), wall);
  vab.position.set(-1600, 80, 900);
  pad.add(vab);
  const flag = new THREE.Mesh(new THREE.BoxGeometry(1, 50, 80), blue);
  flag.position.set(-1519, 100, 900);
  pad.add(flag);

  for (const [x, z, w, h, d] of [
    [900, 600, 90, 30, 60], [1300, -400, 60, 22, 50], [-900, -1500, 120, 26, 80],
  ] as Array<[number, number, number, number, number]>) {
    const block = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wall);
    block.position.set(x, h / 2, z);
    pad.add(block);
  }
}

/**
 * Exhaust and steam billowing out of the flame trench at ignition.
 *
 * Soft sprites with a generated radial texture — a DataTexture rather than a
 * canvas, so it builds headlessly in tests.
 */
function createSmoke() {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - size / 2) / (size / 2);
      const dy = (y - size / 2) / (size / 2);
      const falloff = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy));
      const index = (y * size + x) * 4;
      data[index] = 245;
      data[index + 1] = 245;
      data[index + 2] = 248;
      data[index + 3] = Math.round(255 * falloff * falloff);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.needsUpdate = true;

  const group = new THREE.Group();
  group.name = 'Exhaust cloud';
  const puffs: Array<{ sprite: THREE.Sprite; angle: number; speed: number; delay: number }> = [];
  let seed = 7;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  for (let i = 0; i < 28; i++) {
    const material = new THREE.SpriteMaterial({
      map: texture, transparent: true, depthWrite: false, opacity: 0,
    });
    const sprite = new THREE.Sprite(material);
    group.add(sprite);
    puffs.push({
      sprite,
      // Mostly out along the flame trench and to the sides, as a real
      // deluge cloud spreads.
      angle: random() * Math.PI * 2,
      speed: 6 + random() * 14,
      delay: random() * 2.5,
    });
  }

  return {
    group,
    update(time: number, lit: boolean, altitude: number) {
      group.visible = lit && altitude < 8_000;
      if (!group.visible) return;
      for (const puff of puffs) {
        const age = Math.max(0, time - puff.delay);
        const reach = Math.min(160, puff.speed * age);
        const scale = 18 + age * 9;
        puff.sprite.position.set(
          Math.cos(puff.angle) * reach,
          6 + age * 2.2,
          Math.sin(puff.angle) * reach,
        );
        puff.sprite.scale.setScalar(Math.min(scale, 140));
        (puff.sprite.material as THREE.SpriteMaterial).opacity =
          THREE.MathUtils.clamp(age * 0.6, 0, 0.75) * (1 - Math.min(1, age / 40));
      }
    },
  };
}

/** Stars on a far sphere: one Points object, not thousands of meshes. */
function createStars(): THREE.Points {
  const count = 2600;
  const positions = new Float32Array(count * 3);
  const colours = new Float32Array(count * 3);
  const radius = BACKDROP_RADIUS * 0.8;
  let seed = 20261005;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  for (let i = 0; i < count; i++) {
    // Uniform on the sphere; naive angles cluster at the poles.
    const u = random() * 2 - 1;
    const theta = random() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    positions[i * 3] = radius * r * Math.cos(theta);
    positions[i * 3 + 1] = radius * u;
    positions[i * 3 + 2] = radius * r * Math.sin(theta);
    const warmth = random();
    const brightness = 0.55 + random() * 0.45;
    colours[i * 3] = brightness * (0.78 + warmth * 0.22);
    colours[i * 3 + 1] = brightness * (0.82 + warmth * 0.1);
    colours[i * 3 + 2] = brightness * (0.98 - warmth * 0.15);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  // Opaque with additive blending, not transparent. Three.js draws every
  // transparent object after every opaque one whatever its renderOrder, so
  // transparent stars landed on top of the Earth. Opaque objects respect
  // renderOrder, and additive blending means a star faded to black adds
  // nothing to the daytime sky. Brightness is faded through `color`.
  const stars = new THREE.Points(geometry, new THREE.PointsMaterial({
    size: 2.2,
    sizeAttenuation: false,
    vertexColors: true,
    color: 0x000000,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  }));
  stars.name = 'Stars';
  // Drawn straight after the sky and before everything else.
  stars.renderOrder = -9;
  stars.frustumCulled = false;
  return stars;
}
