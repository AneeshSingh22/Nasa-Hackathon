import * as THREE from 'three';
import type { GameMode } from '../game/mode';
import { OrbitCamera } from '../render/OrbitCamera';
import { PlayerController } from '../vab/PlayerController';
import { createCommandPod } from './meshes';
import { WorkshopBuilder } from './builder';
import { WorkshopVessel } from './vessel';

// Metres above assemblyRoot: 11.6 m world height in the VAB. Suspension
// makes this a design bay and leaves room to build below the root later.
export const WORKSHOP_POD_HOVER_Y = 10;


export class WorkshopSession {
  private currentMode: GameMode = 'explore';
  readonly pod = createCommandPod();
  readonly orbit: OrbitCamera;
  readonly vessel = new WorkshopVessel();
  builder: WorkshopBuilder | null = null;
  private readonly hiddenObjects = new Map<THREE.Object3D, boolean>();
  private readonly savedPosition = new THREE.Vector3();
  private readonly savedRotation = new THREE.Quaternion();
  private readonly exitButton: HTMLButtonElement;
  private readonly onExit = () => this.exit();

  constructor(
    private readonly player: PlayerController,
    private readonly root: THREE.Object3D,
    private readonly canvas: HTMLElement,
    private readonly hud: HTMLElement,
    private readonly chrome: HTMLElement,
    private readonly beforeEnter: () => void = () => {},
  ) {
    this.orbit = new OrbitCamera(player.camera);
    const button = chrome.querySelector<HTMLButtonElement>('button');
    if (!button) throw new Error('Workshop chrome needs an exit button');
    this.exitButton = button;
    this.exitButton.addEventListener('click', this.onExit);
  }

  get mode(): GameMode { return this.currentMode; }

  enter(extraHidden: readonly THREE.Object3D[] = []): void {
    if (this.currentMode === 'workshop') return;
    this.beforeEnter();
    this.currentMode = 'workshop';
    this.savedPosition.copy(this.player.camera.position);
    this.savedRotation.copy(this.player.camera.quaternion);
    this.player.setEnabled(false);
    this.player.releaseLock();
    // Preserve legacy craft and paid-for parts: temporarily hide them rather
    // than clearing Assembly (which would destroy the player's Explore build).
    for (const object of [...this.root.children, ...extraHidden]) {
      if (!this.hiddenObjects.has(object)) this.hiddenObjects.set(object, object.visible);
      object.visible = false;
    }
    this.pod.position.y = WORKSHOP_POD_HOVER_Y;
    this.root.add(this.pod);
    this.orbit.reset(this.pod.getWorldPosition(new THREE.Vector3()));
    this.vessel.reset();
    this.builder = new WorkshopBuilder(this.vessel, this.pod, this.player.camera, this.orbit, this.canvas, this.chrome);
    this.orbit.attach(this.canvas, () => !this.builder?.placement.active);
    this.hud.classList.add('hidden');
    this.chrome.classList.remove('hidden');
    this.exitButton.focus({ preventScroll: true });
  }

  /** Consume the entire Workshop key context before any legacy shortcuts. */
  handleKey(event: KeyboardEvent): boolean {
    if (this.currentMode !== 'workshop') return false;
    if (event.repeat) return true;
    if (event.code === 'Escape') {
      event.preventDefault();
      if (this.builder?.placement.active) this.builder.placement.cancel();
      else this.exit();
    } else if (event.code === 'KeyQ' || event.code === 'Backspace') {
      event.preventDefault();
      if (!event.repeat) this.builder?.detachLast();
    }
    return true;
  }

  update(): void {
    this.orbit.update();
    this.builder?.placement.update();
  }

  exit(): void {
    if (this.currentMode === 'explore') return;
    this.orbit.detach();
    this.builder?.dispose();
    this.builder = null;
    this.vessel.reset();
    this.pod.removeFromParent();
    for (const [object, visible] of this.hiddenObjects) object.visible = visible;
    this.hiddenObjects.clear();
    // PlayerController uses world-space camera transforms, not camera
    // parenting under yawObject. Restore that actual contract on handoff.
    this.player.camera.position.copy(this.savedPosition);
    this.player.camera.quaternion.copy(this.savedRotation);
    this.player.camera.updateMatrixWorld();
    this.player.setEnabled(true);
    this.currentMode = 'explore';
    this.chrome.classList.add('hidden');
    this.hud.classList.remove('hidden');
    this.exitButton.blur();
    // Pointer lock is reacquired only by the next canvas click/user gesture.
  }

  dispose(): void {
    this.exit();
    this.exitButton.removeEventListener('click', this.onExit);
    const materials = new Set<THREE.Material>();
    this.pod.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      child.geometry.dispose();
      for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
        materials.add(material);
      }
    });
    for (const material of materials) material.dispose();
  }
}
