import * as THREE from 'three';
import { R_EARTH } from '../physics/constants';
import { keepSeparate } from '../render/batching';
import { hullPlating, paintedSteel, setRepeat } from '../render/textures';

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
  /**
   * Point the world at a vehicle state.
   *
   * `altitude` in metres, `attitude` the nose direction, `up` the local
   * vertical. The Earth is moved and rotated rather than the camera, which
   * keeps the camera at the origin and avoids floating-point precision loss at
   * planetary distances — the standard trick for space scenes.
   */
  update(altitude: number, attitude: THREE.Vector3, up: THREE.Vector3, downrange: number): void;
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

  // Panel lighting: the instruments are lit from inside the cockpit.
  const panelLight = new THREE.PointLight(0xffd9a0, 2.2, 6, 2);
  panelLight.position.set(0, 0.5, 0.4);
  scene.add(panelLight);

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

  // ------------------------------------------------------------------- stars
  scene.add(createStarfield());

  // ----------------------------------------------------------------- cockpit
  //
  // Parented to a frame that rotates with the vehicle, so the panel stays
  // fixed relative to the pilot while the world outside swings past.
  const vehicleFrame = new THREE.Object3D();
  keepSeparate(vehicleFrame);
  scene.add(vehicleFrame);

  const cockpit = buildCockpitInterior();
  vehicleFrame.add(cockpit);

  const eye = new THREE.Vector3(0, 0, 0);

  return {
    scene,
    eye,
    vehicleFrame,

    update(altitude, attitude, up, downrange) {
      // Keep the camera at the origin and move the planet. At 6 371 km a
      // float32 position loses metres of precision, which shows up as the
      // cockpit visibly jittering; this avoids it entirely.
      const centreDistance = R_EARTH + altitude;
      earth.position.set(0, -centreDistance, 0);
      // Rotate the planet under the vehicle so the ground slides past as the
      // vehicle travels downrange, rather than the vehicle sliding over a
      // static sphere.
      earth.rotation.z = downrange / R_EARTH;

      // Orient the cockpit: the nose points along `attitude`, and `up` keeps
      // the panel the right way round.
      const forward = attitude.clone().normalize();
      const localUp = up.clone().normalize();
      const right = new THREE.Vector3().crossVectors(forward, localUp).normalize();
      const trueUp = new THREE.Vector3().crossVectors(right, forward).normalize();
      const basis = new THREE.Matrix4().makeBasis(right, trueUp, forward.negate());
      vehicleFrame.quaternion.setFromRotationMatrix(basis);

      // The sky fades out as the air thins. By 100 km there is effectively
      // none, which is why that altitude is the conventional edge of space.
      const skyFade = Math.max(0, 1 - altitude / 100_000);
      scene.background = new THREE.Color(0x060910).lerp(new THREE.Color(0x4a7fb5), skyFade * 0.8);
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
function buildCockpitInterior(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Cockpit interior';

  const hullMaps = hullPlating(21, 512);
  if (hullMaps) setRepeat(hullMaps, 2, 2);
  const shell = new THREE.MeshStandardMaterial({
    color: 0x3c424e,
    metalness: 0.55,
    roughness: 0.6,
    side: THREE.BackSide,
    ...(hullMaps ? {
      map: hullMaps.map,
      normalMap: hullMaps.normalMap,
      roughnessMap: hullMaps.roughnessMap,
      normalScale: new THREE.Vector2(0.5, 0.5),
    } : {}),
  });

  const panelMaps = paintedSteel('#23282f', 31, 512);
  if (panelMaps) setRepeat(panelMaps, 3, 2);
  const panelMaterial = new THREE.MeshStandardMaterial({
    color: 0x23282f,
    metalness: 0.4,
    roughness: 0.72,
    ...(panelMaps ? {
      map: panelMaps.map,
      normalMap: panelMaps.normalMap,
      roughnessMap: panelMaps.roughnessMap,
    } : {}),
  });

  // The capsule shell, seen from inside.
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 2.6, 24, 1, true), shell);
  hull.position.y = 0.2;
  group.add(hull);

  // Bulkhead behind the pilot.
  const bulkhead = new THREE.Mesh(new THREE.CircleGeometry(1.5, 24), panelMaterial);
  bulkhead.position.set(0, 0.2, 1.3);
  bulkhead.rotation.y = Math.PI;
  group.add(bulkhead);

  // The main instrument panel, below and ahead, angled toward the pilot the
  // way a real console is so the gauges face the eye rather than the ceiling.
  const console3d = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 0.3), panelMaterial);
  console3d.position.set(0, -0.62, -0.72);
  console3d.rotation.x = -0.42;
  group.add(console3d);

  // Window frame: four bars around the opening. The glass itself is left out
  // deliberately — a transparent pane between the player and the planet costs
  // a sorting pass and adds nothing they can see.
  const frameMaterial = new THREE.MeshStandardMaterial({
    color: 0x2b3038, metalness: 0.7, roughness: 0.45,
  });
  const frameBars: Array<[number, number, number, number, number, number]> = [
    // width, height, depth, x, y, z
    [2.3, 0.14, 0.18, 0, 0.62, -1.18],
    [2.3, 0.14, 0.18, 0, -0.28, -1.18],
    [0.14, 1.04, 0.18, -1.1, 0.17, -1.18],
    [0.14, 1.04, 0.18, 1.1, 0.17, -1.18],
  ];
  for (const [w, h, d, x, y, z] of frameBars) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frameMaterial);
    bar.position.set(x, y, z);
    group.add(bar);
  }

  // Side consoles, which do most of the work of making it feel enclosed.
  for (const side of [-1, 1]) {
    const sideConsole = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.8, 1.4), panelMaterial);
    sideConsole.position.set(side * 1.25, -0.35, -0.2);
    sideConsole.rotation.z = side * 0.18;
    group.add(sideConsole);
  }

  // Overhead switch panel, visible at the top of the view.
  const overhead = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.26, 0.9), panelMaterial);
  overhead.position.set(0, 1.18, -0.3);
  overhead.rotation.x = 0.32;
  group.add(overhead);

  // A scatter of indicator lamps, so the interior has something live in it.
  const lampGeometry = new THREE.SphereGeometry(0.022, 8, 6);
  const lampColours = [0x5fd99a, 0xffb400, 0xff6b3d, 0x52d9ec];
  for (let i = 0; i < 18; i++) {
    const colour = lampColours[i % lampColours.length]!;
    const lamp = new THREE.Mesh(lampGeometry, new THREE.MeshBasicMaterial({ color: colour }));
    const row = Math.floor(i / 9);
    lamp.position.set(-0.78 + (i % 9) * 0.195, 1.1 + row * 0.07, -0.72 - row * 0.02);
    group.add(lamp);
  }

  return group;
}
