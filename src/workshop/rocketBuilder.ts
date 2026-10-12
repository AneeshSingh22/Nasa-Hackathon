import * as THREE from 'three';
import type { Assembly } from '../vab/Assembly';
import type { PartDefinition } from '../vab/parts';
import type { OrbitCamera } from '../render/OrbitCamera';
import { RocketPalette } from './rocketPalette';
import { assessReadiness } from '../game/readiness';
import { attachmentAllowed, BUILD_ANCHOR_Y, ATTACHMENT_RADIUS, portFor, type Port } from './attachments';
import { play } from '../ui/sfx';

export interface BuilderHooks {
  readonly charge: (part: PartDefinition) => boolean;
  readonly refund: (part: PartDefinition) => void;
  readonly spent: () => number;
  readonly changed: () => void;
  readonly refuse: (message: string) => void;
  readonly launch: () => void;
  readonly available?: () => number;
  readonly par?: () => number | null;
  readonly starterGuide?: () => boolean;
}
interface Node { port: Port; sphere: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>; button: HTMLButtonElement }
interface Drag { part: PartDefinition; ghost: THREE.Group; pointerId: number | null; port: Port | null; returning: string | null; hidden: THREE.Object3D[] }

/** A screen-space snap tolerance stays usable at every orbit distance. Geometry
 * remains in assembly coordinates; neither the craft nor preview is camera-parented. */
const SNAP_PIXELS = 36;
const DRAG_THRESHOLD = 6;
export class RocketBuilder {
  readonly palette: RocketPalette;
  private readonly nodes: Node[] = [];
  private drag: Drag | null = null;
  private selected: string | null = null;
  private selectionNodes = false;
  private pending: { part: PartDefinition; pointerId: number; x: number; y: number } | null = null;
  private x = 0;
  private y = 0;
  private readonly canvas: HTMLElement;
  private readonly nodeLayer = document.createElement('div');
  private readonly down = (e: PointerEvent) => this.onDown(e);
  private readonly move = (e: PointerEvent) => {
    const pending = this.pending;
    if (pending && (e.pointerId ?? 1) === pending.pointerId
      && Math.hypot(e.clientX - pending.x, e.clientY - pending.y) >= DRAG_THRESHOLD) {
      this.pending = null; this.beginReturn(pending.part, e);
    }
    if (!this.drag || (this.drag.pointerId !== null && (e.pointerId ?? 1) !== this.drag.pointerId)) return;
    this.x = e.clientX; this.y = e.clientY; this.positionPreview();
  };
  private readonly up = (e: PointerEvent) => {
    if (this.pending && (e.pointerId ?? 1) === this.pending.pointerId) { this.pending = null; return; }
    if (!this.drag || this.drag.pointerId === null || (e.pointerId ?? 1) !== this.drag.pointerId) return;
    this.x = e.clientX; this.y = e.clientY; this.positionPreview();
    const drag = this.drag;
    if (drag.returning && this.over(this.palette.returnTray)) {
      const id = drag.returning; this.cancelDrag(); this.sellPart(id); return;
    }
    const port = drag.port; const part = drag.part; const returning = drag.returning;
    this.cancelDrag();
    if (!returning && port) this.commit(part, port);
    else this.palette.message(returning ? 'Part kept.' : 'Drop on a green node.');
  };
  private readonly cancel = () => { this.cancelDrag(); this.palette.hideInspection(); };

  constructor(private readonly assembly: Assembly, private readonly root: THREE.Object3D,
    private readonly camera: THREE.PerspectiveCamera, private readonly orbit: OrbitCamera,
    chrome: HTMLElement, private readonly hooks: BuilderHooks, canvas?: HTMLElement) {
    this.canvas = canvas ?? document.querySelector<HTMLElement>('#viewport') ?? document.createElement('canvas');
    assembly.enableModular();
    this.palette = new RocketPalette(chrome, { select: (part, event) => this.pick(part, event),
      removeLast: () => this.removeLast(), launch: () => hooks.launch(), sell: id => this.sellPart(id) }, hooks.starterGuide?.() ?? false);
    this.nodeLayer.className = 'attachment-targets'; chrome.append(this.nodeLayer);
    this.canvas.addEventListener('pointerdown', this.down);
    window.addEventListener('pointermove', this.move); window.addEventListener('pointerup', this.up);
    window.addEventListener('pointercancel', this.cancel); window.addEventListener('blur', this.cancel);
    this.refresh();
  }
  get isDragging(): boolean { return this.drag !== null || this.pending !== null; }

  /** Programmatic builds and interactive drops take the identical transaction. */
  fit(part: PartDefinition, port = portFor(part.kind, this.assembly.parts)): void { this.commit(part, port); }
  private commit(part: PartDefinition, port: Port): void {
    if (!attachmentAllowed(this.assembly.parts, part, port)) { this.palette.message('That part does not fit this node.'); return; }
    if ((this.hooks.available && part.cost > this.hooks.available() + 1e-9) || !this.hooks.charge(part)) {
      this.hooks.refuse(`The budget cannot cover ${part.name}.`); this.palette.message(`Not enough budget for ${part.name}.`);
      this.palette.shake(); play('deny'); return;
    }
    const fitted = this.assembly.attachModular(part, port);
    if (!fitted) { this.hooks.refund(part); return; }
    this.selectionNodes = false; this.selected = fitted.instanceId!; this.palette.select(null);
    this.palette.message(`${part.name} attached`);
    this.palette.flashCost(-part.cost); play('clunk'); this.refresh();
  }
  pick(part: PartDefinition, event?: PointerEvent): void {
    if (part.deferred) return;
    this.cancelDrag(); this.palette.hideInspection();
    const ghost = this.makeGhost(part); this.root.add(ghost);
    this.drag = { part, ghost, pointerId: event ? (event.pointerId ?? 1) : null, port: null, returning: null, hidden: [] };
    this.palette.select(part.id); this.palette.message(this.assembly.parts.length ? 'Drop on a green node' : 'Drop anywhere in the empty bay');
    if (event) { this.x = event.clientX; this.y = event.clientY; }
    else { const node = this.nodes.find(n => attachmentAllowed(this.assembly.parts, part, n.port));
      const point = node ? this.screen(node.sphere.position) : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      this.x = point.x; this.y = point.y; }
    this.positionPreview();
  }
  private makeGhost(part: PartDefinition): THREE.Group {
    const ghost = this.assembly.preview(part); ghost.name = 'workshop-preview';
    ghost.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      const clone = (m: THREE.Material) => { const copy = m.clone(); copy.transparent = true; copy.opacity = .48; copy.depthWrite = false; return copy; };
      o.material = Array.isArray(o.material) ? o.material.map(clone) : clone(o.material);
    });
    const ball = new THREE.Mesh(new THREE.SphereGeometry(ATTACHMENT_RADIUS, 16, 12), new THREE.MeshBasicMaterial({ color: 0x7fffa5, depthTest: false }));
    ball.name = 'source-attachment'; ball.position.y = part.kind === 'tank' || part.kind === 'engine' ? part.height : 0;
    ball.renderOrder = 25; ghost.add(ball); return ghost;
  }
  private onDown(event: PointerEvent): void {
    if (event.button !== 0 || event.shiftKey) return;
    this.x = event.clientX; this.y = event.clientY;
    if (this.drag) { this.drag.pointerId = event.pointerId ?? 1; this.positionPreview(); event.preventDefault(); return; }
    const rect = this.rect(); const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((this.x - rect.left) / rect.width * 2 - 1, 1 - (this.y - rect.top) / rect.height * 2), this.camera);
    const hit = ray.intersectObjects([...this.assembly.meshObjects], true)[0]; if (!hit) { this.palette.hideInspection(); this.selected = null; this.selectionNodes = false; this.rebuildNodes(); return; }
    let object: THREE.Object3D | null = hit.object;
    while (object && !object.userData.assemblyPartId) object = object.parent;
    const id: string | undefined = object?.userData.assemblyPartId; if (!id) return;
    const part = this.assembly.parts.find(p => p.instanceId === id)!;
    this.selected = id;
    this.pending = { part, pointerId: event.pointerId ?? 1, x: event.clientX, y: event.clientY };
    this.palette.inspect(part, event.clientX, event.clientY);
    this.selectionNodes = true; this.rebuildNodes();
    event.preventDefault();
  }
  private beginReturn(part: PartDefinition, event: PointerEvent): void {
    this.pick(part, event); this.drag!.returning = part.instanceId!;
    const mesh = this.assembly.meshFor(part.instanceId!);
    if (mesh) { this.drag!.hidden.push(mesh); mesh.visible = false; }
    this.palette.message('Drop in Return for a full refund'); this.positionPreview();
  }
  private rect() {
    const rect = this.canvas.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width || window.innerWidth, height: rect.height || window.innerHeight };
  }
  private screen(local: THREE.Vector3): { x: number; y: number; z: number } {
    const projected = this.root.localToWorld(local.clone()).project(this.camera); const rect = this.rect();
    return { x: rect.left + (projected.x + 1) * rect.width / 2, y: rect.top + (1 - projected.y) * rect.height / 2, z: projected.z };
  }
  private over(element: HTMLElement): boolean {
    const r = element.getBoundingClientRect(); return r.width > 0 && this.x >= r.left && this.x <= r.right && this.y >= r.top && this.y <= r.bottom;
  }
  private positionPreview(): void {
    if (!this.drag) return;
    const drag = this.drag; drag.port = null;
    // UI is never a build surface, even if a projected node lies behind it.
    const hit = document.elementFromPoint?.(this.x, this.y);
    const overUI = hit?.closest('.rocket-palette, .workshop-specs, .workshop-topbar, .workshop-return, #workshop-contract-monitor, .workshop-heading, .installed-part-info, #hub-launch-button');
    let nearest: Node | undefined; let distance = SNAP_PIXELS;
    for (const node of this.nodes) {
      const s = this.screen(node.sphere.position); const d = Math.hypot(s.x - this.x, s.y - this.y);
      const allowed = !drag.returning && attachmentAllowed(this.assembly.parts, drag.part, node.port);
      node.sphere.material.color.setHex(allowed ? 0x5eff8f : 0xf26356);
      node.button.dataset.compatible = String(allowed);
      if (!overUI && s.z >= -1 && s.z <= 1 && d < distance) { nearest = node; distance = d; }
    }
    const rect = this.rect();
    // Before a craft exists the whole clear bay is a seed target. Requiring a
    // tiny origin-node hit made long tanks/engines feel command-only to players.
    const inBay = this.x >= rect.left && this.x <= rect.left + rect.width
      && this.y >= rect.top && this.y <= rect.top + rect.height;
    if (!this.assembly.parts.length && !drag.returning && !overUI && inBay) {
      nearest = this.nodes.find(n => n.port === 'root' && attachmentAllowed([], drag.part, 'root'));
    }
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((this.x - rect.left) / rect.width * 2 - 1, 1 - (this.y - rect.top) / rect.height * 2), this.camera);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(this.camera.getWorldDirection(new THREE.Vector3()), this.orbit.target);
    const world = ray.ray.intersectPlane(plane, new THREE.Vector3());
    if (world) drag.ghost.position.copy(this.root.worldToLocal(world));
    if (nearest && !drag.returning && attachmentAllowed(this.assembly.parts, drag.part, nearest.port)) {
      drag.port = nearest.port; drag.ghost.position.copy(nearest.sphere.position);
    }
    const sourcePort = nearest?.port ?? portFor(drag.part.kind, this.assembly.parts);
    const sourceAtTop = sourcePort === 'lower' || sourcePort.startsWith('below:');
    if (sourceAtTop) drag.ghost.position.y -= drag.part.height;
    const source = drag.ghost.getObjectByName('source-attachment') as THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
    source.position.y = sourceAtTop ? drag.part.height : 0;
    source.material.color.setHex(drag.port ? 0x5eff8f : nearest ? 0xf26356 : 0xcedad8);
    this.palette.returnTray.classList.toggle('drop-active', !!drag.returning && this.over(this.palette.returnTray));
  }
  /** Returns true only when an active preview was consumed. */
  cancelDrag(): boolean {
    const pending = this.pending; this.pending = null;
    const drag = this.drag; if (!drag) return !!pending; this.drag = null;
    for (const mesh of drag.hidden) mesh.visible = true;
    this.root.remove(drag.ghost);
    drag.ghost.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose()); } });
    this.palette.select(null); this.palette.returnTray.classList.remove('drop-active');
    this.palette.message('Placement canceled'); this.updateNodes(); return true;
  }
  removeLast(): void {
    this.cancelDrag(); const id = this.selected && this.assembly.parts.some(p => p.instanceId === this.selected)
      ? this.selected : this.assembly.lastInstalled?.instanceId;
    if (id) this.sellPart(id);
  }
  sellPart(id: string): void { this.returnPart(id, false); }
  returnPart(id: string, subtree = true): void {
    this.cancelDrag(); this.palette.hideInspection(); const removed = this.assembly.removeModular(id, subtree); if (!removed.length) return;
    for (const part of removed) this.hooks.refund(part);
    const refund = removed.reduce((sum, part) => sum + part.cost, 0);
    this.selected = null; this.selectionNodes = false; this.palette.flashCost(refund); play('refund'); this.refresh();
    this.palette.message(`${subtree ? 'Returned' : 'Sold'} · $${refund}M refunded`);
  }
  refresh(): void {
    const analysis = this.assembly.analyze();
    this.palette.refresh(this.assembly.nextSlot(), this.assembly.parts);
    this.palette.update(analysis, this.hooks.spent(), assessReadiness({ complete: this.assembly.isComplete(), totalDeltaV: analysis.totalDeltaV, liftoffTWR: analysis.liftoffTWR }), this.hooks.par?.());
    this.frame(); this.rebuildNodes(); this.hooks.changed();
  }
  private frame(): void {
    if (!this.assembly.parts.length) { this.orbit.reset(this.root.localToWorld(new THREE.Vector3(0, BUILD_ANCHOR_Y, 0))); return; }
    const box = new THREE.Box3(); this.root.updateMatrixWorld(true);
    for (const mesh of this.assembly.meshObjects) box.union(new THREE.Box3().setFromObject(mesh));
    const size = box.getSize(new THREE.Vector3());
    // Reserve breathing room for the top instruments and bottom status strip.
    this.orbit.frame(box.getCenter(new THREE.Vector3()), size.y * .6, Math.max(size.x, size.z) * .6);
  }
  private clearNodes(): void {
    for (const n of this.nodes) { this.root.remove(n.sphere); n.sphere.geometry.dispose(); n.sphere.material.dispose(); n.button.remove(); }
    this.nodes.length = 0;
  }
  private rebuildNodes(): void {
    this.clearNodes(); const parts = this.assembly.parts;
    const add = (port: Port, y: number) => {
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(ATTACHMENT_RADIUS, 20, 12), new THREE.MeshBasicMaterial({ color: 0x5eff8f, depthTest: false, transparent: true, opacity: .85 }));
      sphere.name = `attachment-${port}`; sphere.position.y = y; sphere.renderOrder = 30; this.root.add(sphere);
      const button = document.createElement('button'); button.type = 'button'; button.dataset.port = port;
      button.setAttribute('aria-label', `Attach selected part at ${port} node`);
      button.addEventListener('click', () => { if (!this.drag || this.drag.returning) return; const part = this.drag.part;
        this.cancelDrag(); this.commit(part, port); });
      this.nodeLayer.append(button); this.nodes.push({ port, sphere, button });
    };
    if (!parts.length) add('root', BUILD_ANCHOR_Y);
    else {
      const top = parts[0]!, bottom = parts.at(-1)!;
      add('upper', this.assembly.meshFor(top.instanceId!)!.position.y + top.height);
      add('lower', this.assembly.meshFor(bottom.instanceId!)!.position.y);
      // Selecting a part exposes both of its interfaces, so a sold middle
      // component can be replaced without dismantling the rest of the rocket.
      const selected = this.selectionNodes ? parts.find(p => p.instanceId === this.selected) : null;
      if (selected) {
        const mesh = this.assembly.meshFor(selected.instanceId!)!;
        if (selected !== top) add(`above:${selected.instanceId}`, mesh.position.y + selected.height);
        if (selected !== bottom) add(`below:${selected.instanceId}`, mesh.position.y);
      }
    }
    this.updateNodes();
  }
  private updateNodes(): void {
    for (const n of this.nodes) {
      const point = this.screen(n.sphere.position);
      n.button.style.left = `${point.x}px`; n.button.style.top = `${point.y}px`;
      n.button.hidden = point.z < -1 || point.z > 1;
      // Idle hit targets must not cover the installed mesh's picking surface.
      n.button.style.pointerEvents = this.drag ? 'auto' : 'none';
      n.button.tabIndex = this.drag ? 0 : -1;
      if (!this.drag) {
        n.sphere.visible = true; n.sphere.material.color.setHex(0x5eff8f);
      } else n.sphere.visible = true;
    }
  }
  tick(): void { this.updateNodes(); if (this.drag) this.positionPreview(); }
  dispose(): void {
    this.cancelDrag(); this.clearNodes(); this.nodeLayer.remove(); this.palette.dispose();
    this.canvas.removeEventListener('pointerdown', this.down); window.removeEventListener('pointermove', this.move);
    window.removeEventListener('pointerup', this.up); window.removeEventListener('pointercancel', this.cancel); window.removeEventListener('blur', this.cancel);
  }
}
