import { afterEach, beforeEach, expect, describe, it, vi } from 'vitest';
import * as THREE from 'three';
import { createVABScene, VAB_HEIGHT, type VABEnvironment } from './VABScene';

/**
 * The light budget is a performance contract, and it regresses invisibly:
 * adding lamps makes the bay look slightly nicer in a screenshot and costs
 * frames on every machine that runs it.
 *
 * Every point light is evaluated per lit pixel. The scene once had nineteen,
 * which was the single largest reason the game ran slowly — and fifteen of
 * them were ceiling fixtures 90 m above a floor they could not reach, so they
 * cost real time while lighting nothing at all.
 */

describe('bay lighting budget', () => {
  let env: VABEnvironment;

  beforeEach(() => {
    const context = {
      fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
      closePath() {}, fill() {}, fillText() {}, arc() {},
      createLinearGradient: () => ({ addColorStop() {} }),
      getImageData: () => ({ data: new Uint8ClampedArray(256), width: 8, height: 8 }),
      createImageData: () => ({ data: new Uint8ClampedArray(256), width: 8, height: 8 }),
      putImageData() {},
    } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
    env = createVABScene();
    env.scene.updateMatrixWorld(true);
  });

  afterEach(() => { vi.restoreAllMocks(); });

  function lights<T extends THREE.Light>(predicate: (light: THREE.Light) => boolean): T[] {
    const found: T[] = [];
    env.scene.traverse(object => {
      if (object instanceof THREE.Light && predicate(object)) found.push(object as T);
    });
    return found;
  }

  it('keeps the number of point lights inside the frame budget', () => {
    const points = lights<THREE.PointLight>(light => light instanceof THREE.PointLight);
    // Nineteen made the game unplayable. Treat anything above eight as a
    // regression worth justifying rather than a free improvement.
    expect(points.length).toBeLessThanOrEqual(8);
  });

  it('gives every point light a range that reaches something', () => {
    // The old ceiling lamps sat 91.8 m up with a 46 m range, so they lit
    // nothing whatsoever while still costing a per-pixel evaluation. A light
    // that cannot reach the floor or the vehicle is pure cost.
    const points = lights<THREE.PointLight>(light => light instanceof THREE.PointLight);
    expect(points.length).toBeGreaterThan(0);

    for (const light of points) {
      const height = light.getWorldPosition(new THREE.Vector3()).y;
      // Reaches the floor, or the top of the tallest vehicle at ~24 m.
      const reachesFloor = light.distance === 0 || light.distance >= height;
      const reachesVehicle = light.distance === 0 || light.distance >= height - 24;
      expect(reachesFloor || reachesVehicle, `light at y=${height.toFixed(1)}`).toBe(true);
    }
  });

  it('casts shadows from one light only', () => {
    // Each shadow-casting light renders the scene again from its own point of
    // view. One key light is the whole shadow budget.
    const casters = lights(light => light.castShadow);
    expect(casters.length).toBe(1);
  });

  it('keeps the shadow map at a size that can be blurred every frame', () => {
    const [key] = lights(light => light.castShadow);
    expect(key).toBeDefined();
    const shadow = key?.shadow;
    expect(shadow).toBeDefined();
    // VSM blurs the map each frame, so area matters quadratically: 4096 was
    // about a quarter of a billion texel reads per frame.
    expect(shadow!.mapSize.width).toBeLessThanOrEqual(2048);
    expect(shadow!.mapSize.height).toBeLessThanOrEqual(2048);
  });

  it('still lights the work area where the player builds', () => {
    // Cutting lights must not leave the stand dark. Sum the inverse-square
    // contribution at eye height in the middle of the bay.
    const eye = new THREE.Vector3(0, 1.7, 0);
    let irradiance = 0;
    for (const light of lights<THREE.PointLight>(l => l instanceof THREE.PointLight)) {
      const position = light.getWorldPosition(new THREE.Vector3());
      const distance = position.distanceTo(eye);
      if (light.distance === 0 || distance < light.distance) {
        irradiance += light.intensity / (distance * distance);
      }
    }
    // The four original work lights gave about 0.28 here; two brighter ones
    // give about 0.25. Well below 0.15 would read as a dim room.
    expect(irradiance).toBeGreaterThan(0.15);
  });

  it('does not light the ceiling fixtures that cannot reach anything', () => {
    // Emissive housings still read as a full grid of fixtures; only a few of
    // them are real lights. Anything near the roof is suspect.
    const highLights = lights<THREE.PointLight>(
      light => light instanceof THREE.PointLight
        && light.getWorldPosition(new THREE.Vector3()).y > VAB_HEIGHT - 10,
    );
    expect(highLights.length).toBeLessThanOrEqual(3);
  });
});
