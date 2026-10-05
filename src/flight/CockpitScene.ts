import * as THREE from 'three';
import { R_EARTH } from '../physics/constants';
import { keepSeparate } from '../render/batching';
import { bayFloor, hullPlating, paintedSteel, setRepeat } from '../render/textures';
import { buildControls, type BuiltControl } from './controls';

/**
 * The cockpit and the world outside it.
 *
 * The player flies from inside the vehicle, looking through a window at a
 * planet that actually moves. Two things have to be true for that to work:
 *
 * 1. **The view must be honest.** Altitude, horizon curvature and the fading
 *    sky are all driven by the simulated position, not by a timeline. A player
 *    who pitches over sees the horizon tilt because the vehicle tilted.
 * 2. **The Earth must be enormous.** At a 6 371 km radius and a 200 km orbit,
 *    the planet fills most of the view and its curvature is barely visible from
 *    low altitude. Shrinking it to fit would teach the wrong thing about how
 *    big orbit is, so it is modelled at true scale and the camera's far plane
 *    is pushed out to match.
 *
 * Everything here is procedural, like the rest of the project: no textures to
 * download, no models to license.
 */

/** Far plane, metres. Enough to see the whole planet from orbit. */
export const FLIGHT_FAR_PLANE = 4.0e7;
/** Near plane. Small, because instrument panels are centimetres from the eye. */
export const FLIGHT_NEAR_PLANE = 0.05;

export interface CockpitRig {
  readonly scene: THREE.Scene;
  /** Where the camera sits inside the cockpit. */
  readonly eye: THREE.Vector3;
  /** Everything that rotates with the vehicle. */
  readonly vehicleFrame: THREE.Object3D;
  /** The physical controls on the console, for hit testing. */
  readonly controls: readonly BuiltControl[];
  /**
   * Point the world at a vehicle state.
   *
   * `altitude` in metres, `attitude` the nose direction, `up` the local
   * vertical. The Earth is moved and rotated rather than the camera, which
   * keeps the camera at the origin and avoids floating-point precision loss at
   * planetary distances — the standard trick for space scenes.
   */
  update(altitude: number, attitude: THREE.Vector3, up: THREE.Vector3, downrange: number): void;
  /**
   * Shake the cockpit.
   *
   * `intensity` 0..1. A launch is violent, and a perfectly steady view is the
   * main reason a static screenshot of one looks like a menu. Driven by real
   * thrust and dynamic pressure, so it peaks through max-Q and stops the
   * moment the engines do — which also makes staging and burnout legible
   * without a caption.
   */
  shake(intensity: number, elapsed: number): void;
  dispose(): void;
}

export function createCockpit(): CockpitRig {
  const scene = new THREE.Scene();

  // ---------------------------------------------------------------- lighting
  //
  // One sun, hard shadows, and almost no fill. Space has no atmosphere to
  // scatter light, so the terminator between lit and unlit faces is sharp —
  // which is exactly why spacecraft photographs look the way they do.
  const sun = new THREE.DirectionalLight(0xfff6e8, 3.2);
  sun.position.set(-0.4, 0.5, 1).multiplyScalar(1e6);
  scene.add(sun);

  // A faint fill standing in for light bounced off the planet, so the unlit
  // side of the panel is readable rather than black.
  const earthshine = new THREE.HemisphereLight(0x5588cc, 0x101418, 0.55);
  scene.add(earthshine);

  // Panel lighting.
  //
  // The sun is behind the pilot as often as not, so the console needs its own
  // light or the whole lower third of the screen is black. Two lamps: one
  // above and behind the eye washing the console face, one low and warm for
  // the under-panel glow a lit instrument bay has.
  const panelLight = new THREE.PointLight(0xfff0d8, 6.5, 7, 2);
  panelLight.position.set(0, 0.9, 0.6);
  scene.add(panelLight);

  const underGlow = new THREE.PointLight(0xffc98a, 3.0, 4, 2);
  underGlow.position.set(0, -0.5, -0.4);
  scene.add(underGlow);

  // Ambient floor so nothing in the cockpit is ever fully black. Space is
  // high contrast, but an unreadable instrument panel is a bug, not a mood.
  scene.add(new THREE.AmbientLight(0x6a7a90, 0.75));

  // ------------------------------------------------------------------- Earth
  const earth = new THREE.Group();
  keepSeparate(earth);
  scene.add(earth);

  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(R_EARTH, 96, 64),
    earthMaterial(),
  );
  earth.add(globe);

  // Atmosphere: a shell slightly larger than the planet, rendered back-faces
  // only so it reads as a glow around the limb rather than a blue ball in
  // front of the surface. This is the view every astronaut describes, and it
  // is the single most recognisable thing about looking down from orbit.
  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(R_EARTH * 1.025, 64, 48),
    atmosphereMaterial(),
  );
  earth.add(atmosphere);

  // ------------------------------------------------------- near-field ground
  //
  // The sphere alone gives no sense of motion low down. At zero altitude the
  // surface is exactly at the camera, so there is nothing to see sliding past
  // and a launch reads as a static blue screen — which is precisely how it
  // looked. This is a textured plane a few kilometres below, scrolling against
  // the vehicle's travel, which is what the eye actually reads as speed. It
  // fades out as the altitude climbs and the real curvature takes over.
  const groundMaps = bayFloor(512);
  if (groundMaps) setRepeat(groundMaps, 60, 60);
  const groundMaterial = new THREE.MeshStandardMaterial({
    color: 0x4a5340,
    roughness: 0.95,
    metalness: 0,
    transparent: true,
    opacity: 1,
    ...(groundMaps ? { map: groundMaps.map, normalMap: groundMaps.normalMap } : {}),
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(260_000, 260_000), groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.name = 'Near ground';
  keepSeparate(ground);
  scene.add(ground);

  // Cloud deck. Passing through it is the single clearest altitude cue a
  // launch has, and it is the moment every launch video makes a point of.
  const cloudMaps = hullPlating(77, 512);
  if (cloudMaps) setRepeat(cloudMaps, 28, 28);
  const cloudMaterial = new THREE.MeshStandardMaterial({
    color: 0xf2f6fb,
    roughness: 1,
    metalness: 0,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
    ...(cloudMaps ? { alphaMap: cloudMaps.map } : {}),
  });
  const clouds = new THREE.Mesh(new THREE.PlaneGeometry(400_000, 400_000), cloudMaterial);
  clouds.rotation.x = -Math.PI / 2;
  clouds.name = 'Cloud deck';
  keepSeparate(clouds);
  scene.add(clouds);

  // ------------------------------------------------------------------- stars
  const starfield = createStarfield();
  scene.add(starfield);

  // ----------------------------------------------------------------- cockpit
  //
  // Parented to a frame that rotates with the vehicle, so the panel stays
  // fixed relative to the pilot while the world outside swings past.
  // Fixed in front of the camera, which sits at the origin looking down -Z.
  const vehicleFrame = new THREE.Object3D();
  keepSeparate(vehicleFrame);
  scene.add(vehicleFrame);

  const cockpit = buildCockpitInterior();
  vehicleFrame.add(cockpit);

  // Physical controls, built into the same frame so they shake with it.
  const controls = buildControls(cockpit);

  const eye = new THREE.Vector3(0, 0, 0);

  return {
    scene,
    eye,
    vehicleFrame,
    controls,

    shake(intensity, elapsed) {
      if (intensity <= 0) {
        vehicleFrame.position.set(0, 0, 0);
        vehicleFrame.rotation.set(0, 0, 0);
        return;
      }
      // Several frequencies summed, so it reads as rumble rather than a
      // regular wobble. Amplitudes are centimetres: enough to feel, not
      // enough to make the instruments unreadable.
      const amplitude = intensity * 0.012;
      vehicleFrame.position.set(
        Math.sin(elapsed * 37.1) * amplitude + Math.sin(elapsed * 71.3) * amplitude * 0.5,
        Math.sin(elapsed * 43.7) * amplitude + Math.sin(elapsed * 88.1) * amplitude * 0.4,
        0,
      );
      vehicleFrame.rotation.z = Math.sin(elapsed * 29.3) * intensity * 0.004;
    },

    update(altitude, attitude, up, downrange) {
      // The cockpit never moves.
      //
      // The player is sitting in it, so it stays fixed in front of a camera
      // that also never moves, and the *world* rotates around them. The first
      // version did the opposite — rotated the cockpit and left the camera at
      // identity — which put the camera inside the hull looking at the back of
      // a wall while the Earth showed through it. A cockpit view is defined by
      // the cockpit being still.
      //
      // Keeping the camera at the origin also avoids float32 precision loss:
      // at 6 371 km from the origin a float position is accurate to metres,
      // which shows up as visible jitter.

      // Where the planet sits relative to the pilot, in the pilot's own frame.
      // Nose along -Z (where the camera looks), local up along +Y.
      const forward = attitude.clone().normalize();
      const localUp = up.clone().normalize();
      const right = new THREE.Vector3().crossVectors(forward, localUp).normalize();
      const trueUp = new THREE.Vector3().crossVectors(right, forward).normalize();

      // World-to-vehicle rotation: the inverse of the vehicle's orientation.
      const vehicleBasis = new THREE.Matrix4().makeBasis(right, trueUp, forward.clone().negate());
      const worldRotation = new THREE.Quaternion()
        .setFromRotationMatrix(vehicleBasis)
        .invert();

      // The planet's centre is one Earth radius plus the altitude straight
      // down the local vertical, expressed in the pilot's frame.
      const centreDistance = R_EARTH + altitude;
      const centre = localUp.clone().multiplyScalar(-centreDistance).applyQuaternion(worldRotation);
      earth.position.copy(centre);
      earth.quaternion.copy(worldRotation);
      // Spin the globe under the vehicle so the ground slides past as it
      // travels downrange.
      earth.rotateZ(downrange / R_EARTH);

      // The stars rotate with the world but have no position: they are at
      // effectively infinite distance.
      starfield.quaternion.copy(worldRotation);

      // ---- near-field motion cues ----
      //
      // These are what make a launch feel like a launch. The ground and the
      // cloud deck sit below the vehicle in its own frame, scroll against the
      // distance travelled, and fade out as the vehicle leaves them behind.
      const groundVisible = altitude < 90_000;
      ground.visible = groundVisible;
      if (groundVisible) {
        const down = localUp.clone().multiplyScalar(-Math.max(1, altitude));
        ground.position.copy(down.applyQuaternion(worldRotation));
        ground.quaternion.copy(worldRotation);
        ground.rotateX(-Math.PI / 2);
        groundMaterial.opacity = Math.min(1, Math.max(0, 1 - altitude / 90_000));
        if (groundMaps) {
          // Scroll the texture with the distance flown. This is the motion the
          // eye actually reads: a surface sliding past, not a sphere turning.
          groundMaps.map.offset.y = -(downrange / 4_000) % 1;
          groundMaps.normalMap.offset.y = groundMaps.map.offset.y;
        }
      }

      // The cloud deck sits at 8 km, so it approaches, passes, and is gone —
      // which is the clearest single altitude cue a launch has.
      const CLOUD_ALTITUDE = 8_000;
      const toClouds = CLOUD_ALTITUDE - altitude;
      const cloudsVisible = altitude < 40_000;
      clouds.visible = cloudsVisible;
      if (cloudsVisible) {
        const offset = localUp.clone().multiplyScalar(toClouds);
        clouds.position.copy(offset.applyQuaternion(worldRotation));
        clouds.quaternion.copy(worldRotation);
        clouds.rotateX(-Math.PI / 2);
        // Thickest right at the deck, gone well above and below it.
        const nearness = 1 - Math.min(1, Math.abs(toClouds) / 14_000);
        cloudMaterial.opacity = nearness * 0.85;
        if (cloudMaps) {
          cloudMaps.map.offset.y = -(downrange / 2_600) % 1;
        }
      }

      // The sky fades out as the air thins. By 100 km there is effectively
      // none, which is why that altitude is the conventional edge of space.
      // Sky colour by altitude. A flat blue fill reads as a blank screen; the
      // real cue is that it darkens steadily as the air thins, so the player
      // can see space arriving rather than being told about it.
      const skyFade = Math.max(0, 1 - altitude / 80_000);
      const deepSpace = new THREE.Color(0x02040a);
      const highSky = new THREE.Color(0x0d2b5e);
      const lowSky = new THREE.Color(0x5fa8e8);
      const sky = skyFade > 0.5
        ? highSky.clone().lerp(lowSky, (skyFade - 0.5) * 2)
        : deepSpace.clone().lerp(highSky, skyFade * 2);
      scene.background = sky;
      // Haze near the ground so the horizon is a soft edge rather than a line,
      // and so distant terrain recedes properly.
      scene.fog = altitude < 60_000
        ? new THREE.Fog(sky.getHex(), 2_000, 180_000 + altitude * 4)
        : null;
      const shell = atmosphere.material as THREE.ShaderMaterial;
      if (shell.uniforms.intensity) {
        shell.uniforms.intensity.value = 0.55 + skyFade * 0.45;
      }
    },

    dispose() {
      scene.traverse(object => {
        if (!(object instanceof THREE.Mesh) && !(object instanceof THREE.Points)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.dispose();
      });
    },
  };
}

/**
 * Earth's surface, drawn procedurally.
 *
 * Continents are noise rather than a map: a real coastline needs a texture to
 * download, and at the altitudes this game reaches the player reads "land,
 * ocean, cloud" rather than "that is Portugal". What matters is that the
 * surface has structure at several scales, because a smooth sphere reads as
 * plastic however blue it is.
 */
function earthMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      sunDirection: { value: new THREE.Vector3(-0.4, 0.5, 1).normalize() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vPosition;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vPosition = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 sunDirection;
      varying vec3 vNormal;
      varying vec3 vPosition;

      // Value noise on the sphere surface. Cheap, and enough to break the
      // silhouette into something that reads as geography.
      float hash(vec3 p) {
        return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
      }
      float noise(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float n = mix(
          mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
              mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
              mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
        return n;
      }
      float fbm(vec3 p) {
        float total = 0.0;
        float amplitude = 0.5;
        for (int i = 0; i < 5; i++) {
          total += noise(p) * amplitude;
          p *= 2.1;
          amplitude *= 0.5;
        }
        return total;
      }

      void main() {
        float land = fbm(vPosition * 3.2);
        vec3 ocean = vec3(0.05, 0.15, 0.34);
        vec3 shallow = vec3(0.09, 0.32, 0.46);
        vec3 green = vec3(0.17, 0.33, 0.15);
        vec3 arid = vec3(0.45, 0.38, 0.22);

        vec3 surface = mix(ocean, shallow, smoothstep(0.42, 0.50, land));
        surface = mix(surface, green, smoothstep(0.50, 0.55, land));
        surface = mix(surface, arid, smoothstep(0.60, 0.72, land));

        // Ice at the poles, where the surface normal is near vertical.
        float polar = smoothstep(0.78, 0.95, abs(vPosition.y));
        surface = mix(surface, vec3(0.86, 0.9, 0.94), polar);

        // Cloud, at a different frequency so it does not follow the coastline.
        float cloud = smoothstep(0.52, 0.72, fbm(vPosition * 5.5 + 12.0));
        surface = mix(surface, vec3(0.92, 0.94, 0.97), cloud * 0.7);

        // Lambertian day/night with a soft terminator.
        float lambert = dot(normalize(vNormal), normalize(sunDirection));
        float daylight = smoothstep(-0.12, 0.25, lambert);
        vec3 night = surface * 0.035;
        gl_FragColor = vec4(mix(night, surface, daylight), 1.0);
      }
    `,
  });
}

/** The blue limb: back-face shell with fresnel falloff. */
function atmosphereMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      intensity: { value: 1.0 },
      sunDirection: { value: new THREE.Vector3(-0.4, 0.5, 1).normalize() },
    },
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        vView = normalize(-viewPosition.xyz);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float intensity;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        // Thickest where the line of sight grazes the surface, which is what
        // puts the glow on the limb rather than across the whole disc.
        float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.2);
        vec3 sky = vec3(0.22, 0.48, 0.95);
        gl_FragColor = vec4(sky, rim * intensity * 0.9);
      }
    `,
  });
}

/**
 * Stars.
 *
 * A single Points object rather than thousands of meshes — the same draw-call
 * lesson the bay already paid for. Placed on a sphere far enough out that
 * parallax is invisible, which is true of real stars at these distances.
 */
function createStarfield(): THREE.Points {
  const count = 2400;
  const positions = new Float32Array(count * 3);
  const colours = new Float32Array(count * 3);
  const radius = FLIGHT_FAR_PLANE * 0.85;

  // Deterministic, so the sky is the same every flight.
  let seed = 20260926;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };

  for (let i = 0; i < count; i++) {
    // Uniform on the sphere: naive spherical angles cluster at the poles.
    const u = random() * 2 - 1;
    const theta = random() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    positions[i * 3] = radius * r * Math.cos(theta);
    positions[i * 3 + 1] = radius * u;
    positions[i * 3 + 2] = radius * r * Math.sin(theta);

    // Stars are not white. A spread of colour temperature reads as real.
    const warmth = random();
    const brightness = 0.55 + random() * 0.45;
    colours[i * 3] = brightness * (0.75 + warmth * 0.25);
    colours[i * 3 + 1] = brightness * (0.8 + warmth * 0.12);
    colours[i * 3 + 2] = brightness * (0.95 - warmth * 0.15);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));

  const stars = new THREE.Points(geometry, new THREE.PointsMaterial({
    size: FLIGHT_FAR_PLANE * 0.0012,
    vertexColors: true,
    sizeAttenuation: true,
    depthWrite: false,
  }));
  stars.name = 'Starfield';
  keepSeparate(stars);
  return stars;
}

/**
 * The cockpit interior.
 *
 * Built around a window at eye level, with the structure the player would
 * actually see: a frame, a sill, side consoles and the back of the instrument
 * panel. The gauges themselves are DOM, laid over the canvas, because text and
 * needles are far sharper as HTML than as canvas textures on a quad — and the
 * project already renders its HUD that way.
 */
/**
 * The cockpit interior.
 *
 * Built around the view, not around the camera. The first version wrapped a
 * cylinder shell right around the eye, so the player was enclosed by hull with
 * only a small gap to see through; combined with the camera never being
 * oriented, the result was a wall of dark geometry with the planet showing
 * through it.
 *
 * This version is a flight deck: a wide console across the lower third of the
 * screen, window posts at the edges of vision, and a brow above. Nothing sits
 * in the middle of the view, because the middle of the view is the thing the
 * player is flying by. Everything is placed in the camera's own frame — the
 * camera is at the origin looking down -Z, so -Z is forward, +Y is up.
 */
function buildCockpitInterior(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Cockpit interior';

  const panelMaps = paintedSteel('#1b2029', 31, 512);
  if (panelMaps) setRepeat(panelMaps, 4, 2);
  const panel = new THREE.MeshStandardMaterial({
    color: 0x1b2029,
    metalness: 0.45,
    roughness: 0.68,
    ...(panelMaps ? {
      map: panelMaps.map,
      normalMap: panelMaps.normalMap,
      roughnessMap: panelMaps.roughnessMap,
      normalScale: new THREE.Vector2(0.6, 0.6),
    } : {}),
  });

  const hullMaps = hullPlating(21, 512);
  if (hullMaps) setRepeat(hullMaps, 2, 1);
  const frame = new THREE.MeshStandardMaterial({
    color: 0x2e343f,
    metalness: 0.7,
    roughness: 0.45,
    ...(hullMaps ? {
      map: hullMaps.map,
      normalMap: hullMaps.normalMap,
      roughnessMap: hullMaps.roughnessMap,
    } : {}),
  });

  // ---- main console, across the bottom of the view ----
  //
  // Angled toward the pilot so its face catches the panel light rather than
  // presenting an edge. Low enough that it occupies the bottom third and
  // leaves the horizon clear.
  const console3d = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.9, 0.5), panel);
  console3d.position.set(0, -0.92, -1.25);
  console3d.rotation.x = -0.38;
  group.add(console3d);

  // A raised lip along the top edge of the console, which is what stops it
  // reading as a floating slab.
  const lip = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.08, 0.14), frame);
  lip.position.set(0, -0.56, -1.44);
  lip.rotation.x = -0.38;
  group.add(lip);

  // ---- window posts at the edges of vision ----
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.2, 0.26), frame);
    post.position.set(side * 1.62, 0.1, -1.5);
    post.rotation.z = side * 0.06;
    group.add(post);

    // Side consoles, angled inward, giving the deck depth at the periphery.
    const sideConsole = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.72, 1.1), panel);
    sideConsole.position.set(side * 1.5, -0.68, -0.75);
    sideConsole.rotation.z = side * 0.22;
    group.add(sideConsole);
  }

  // ---- brow above the window ----
  const brow = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.3, 0.5), frame);
  brow.position.set(0, 1.18, -1.4);
  brow.rotation.x = 0.26;
  group.add(brow);

  // ---- instrument faces on the console ----
  //
  // Dark glass rectangles reading as screens. The live numbers are DOM, which
  // is far sharper than a canvas texture on a quad and is how the rest of the
  // project draws its HUD.
  const screen = new THREE.MeshStandardMaterial({
    color: 0x071018,
    metalness: 0.15,
    roughness: 0.18,
    emissive: 0x1a5c74,
    emissiveIntensity: 1.4,
  });
  const bezelMaterial = new THREE.MeshStandardMaterial({
    color: 0x12161d, metalness: 0.6, roughness: 0.5,
  });

  // Two rows of screens in bezels, which is what a glass cockpit looks like.
  // A single row of bare rectangles reads as a placeholder; the density of
  // framed displays is what makes it read as equipment.
  for (let row = 0; row < 2; row++) {
    const y = -0.74 - row * 0.26;
    const z = -1.46 + row * 0.1;
    for (const x of [-1.05, -0.35, 0.35, 1.05]) {
      const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.22, 0.05), bezelMaterial);
      bezel.position.set(x, y, z);
      bezel.rotation.x = -0.38;
      group.add(bezel);

      // The lit face sits proud of its bezel: a frame drawn in front of a
      // screen hides the screen, which this project has already paid for once.
      const face = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.165, 0.02), screen);
      face.position.set(x, y + 0.012, z + 0.03);
      face.rotation.x = -0.38;
      group.add(face);
    }
  }

  // Circular gauges between the screen rows, for the analogue feel a launch
  // vehicle still has.
  const gaugeRim = new THREE.MeshStandardMaterial({
    color: 0x2a3038, metalness: 0.75, roughness: 0.35,
  });
  const gaugeFace = new THREE.MeshStandardMaterial({
    color: 0x0c1218, emissive: 0x2b4f2f, emissiveIntensity: 0.8,
    metalness: 0.1, roughness: 0.4,
  });
  for (const x of [-1.42, 1.42]) {
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 20), gaugeRim);
    rim.position.set(x, -0.86, -1.4);
    rim.rotation.set(Math.PI / 2 - 0.38, 0, 0);
    group.add(rim);

    const dial = new THREE.Mesh(new THREE.CircleGeometry(0.082, 20), gaugeFace);
    dial.position.set(x, -0.845, -1.37);
    dial.rotation.x = -0.38;
    group.add(dial);
  }

  // ---- indicator lamps along the brow ----
  //
  // On the brow, above the window, where a real caution-and-warning panel
  // sits. They were previously scattered across the overhead panel directly in
  // front of the eye, which is why the broken view was a field of coloured
  // dots.
  const lampGeometry = new THREE.SphereGeometry(0.03, 10, 8);
  const lampColours = [0x5fd99a, 0x5fd99a, 0xffb400, 0x52d9ec, 0x5fd99a, 0xff6b3d];
  for (let i = 0; i < 12; i++) {
    const colour = lampColours[i % lampColours.length]!;
    const lamp = new THREE.Mesh(lampGeometry, new THREE.MeshBasicMaterial({ color: colour }));
    lamp.position.set(-1.2 + i * 0.22, 1.06, -1.32);
    group.add(lamp);
  }

  // ---- overhead panel ----
  //
  // High above the window, angled down. In the Shuttle this is where the
  // breaker rows live, and it is most of why that cockpit reads as dense with
  // equipment. It sits above the open band the view tests protect.
  const overhead = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.7, 0.4), panel);
  overhead.position.set(0, 1.62, -0.75);
  overhead.rotation.x = 0.75;
  group.add(overhead);

  const breakerMaterial = new THREE.MeshStandardMaterial({
    color: 0x1a1f27, metalness: 0.5, roughness: 0.6,
  });
  const breakerGeometry = new THREE.BoxGeometry(0.045, 0.045, 0.035);
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 20; i++) {
      const breaker = new THREE.Mesh(breakerGeometry, breakerMaterial);
      breaker.position.set(-1.14 + i * 0.12, 1.48 + row * 0.1, -0.62 - row * 0.09);
      breaker.rotation.x = 0.75;
      group.add(breaker);
    }
  }

  // Switch rows on the console, catching the light so the surface is not bare.
  const switchGeometry = new THREE.BoxGeometry(0.05, 0.07, 0.03);
  const switchMaterial = new THREE.MeshStandardMaterial({
    color: 0x8d95a3, metalness: 0.8, roughness: 0.35,
  });
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 14; i++) {
      const toggle = new THREE.Mesh(switchGeometry, switchMaterial);
      toggle.position.set(-1.45 + i * 0.22, -1.16 - row * 0.1, -1.22 + row * 0.04);
      toggle.rotation.x = -0.38;
      group.add(toggle);
    }
  }

  return group;
}
