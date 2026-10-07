import * as THREE from 'three';
import type { GameMode } from '../game/mode';
import { OrbitCamera } from '../render/OrbitCamera';
import { PlayerController } from '../vab/PlayerController';
import { RocketBuilder, type BuilderHooks } from './rocketBuilder';
import type { Assembly } from '../vab/Assembly';

// Metres above assemblyRoot: 11.6 m world height in the VAB. Suspension
// makes this a design bay and leaves room to build below the root later.
export const WORKSHOP_POD_HOVER_Y = 10;


export class WorkshopSession {
  private currentMode: GameMode = 'explore';
  readonly orbit: OrbitCamera;
  builder: RocketBuilder | null = null;
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
    private readonly assembly: Assembly,
    private readonly hooks: BuilderHooks,
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
    // The vehicle under construction stays visible: it is the thing being
    // worked on, and hiding it would leave an empty bay.
    for (const mesh of this.assembly.meshObjects) {
      this.hiddenObjects.set(mesh, true);
      mesh.visible = true;
    }
    this.orbit.reset(this.root.getWorldPosition(new THREE.Vector3()));
    this.builder = new RocketBuilder(this.assembly, this.root, this.player.camera, this.orbit, this.chrome, this.hooks);
    // No placement ghost any more: parts are chosen from the palette and the
    // stack decides where they go, so orbit is always available.
    this.orbit.attach(this.canvas);
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
      this.exit();
    } else if (event.code === 'KeyQ' || event.code === 'Backspace') {
      event.preventDefault();
      if (!event.repeat) this.builder?.removeLast();
    }
    return true;
  }

  update(): void {
    this.orbit.update();
    this.builder?.tick();
  }

  exit(): void {
    if (this.currentMode === 'explore') return;
    this.orbit.detach();
    this.builder?.dispose();
    this.builder = null;
    // The vehicle is NOT reset. It was built with real parts and real money,
    // it lives on `assemblyRoot`, and it must be standing in the bay when the
    // player walks back out — otherwise the whole phase is a sandbox.
    for (const [object, visible] of this.hiddenObjects) object.visible = visible;
    for (const mesh of this.assembly.meshObjects) mesh.visible = true;
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
    // The vehicle's meshes belong to Assembly, which owns their lifetime.
  }
}
