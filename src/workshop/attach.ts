import { WORKSHOP_PARTS, type NodeId, type PartKind, type Point } from './parts';

export interface Connection { readonly partId: string; readonly nodeId: NodeId }
export interface PlacedPart {
  readonly id: string;
  readonly kind: PartKind;
  readonly position: Point;
  readonly parent: Connection | null;
  readonly attachedNode: NodeId | null;
}
export interface NodeTarget extends Connection { readonly position: Point }
export interface AttachResult { readonly allowed: boolean; readonly reason: string }
export interface SnapCandidate extends NodeTarget { readonly result: AttachResult; readonly distance: number }
export const SNAP_RADIUS = 0.8;
// Preview workspace clearance, in metres below the floating pod centre.
// Keep even the lowest mesh above the stand; this is a build-space limit,
// not a flight-physics constraint. It also keeps this spike frameable in the bay.
export const MAX_STACK_DROP = 9;

export function nodeTargets(parts: readonly PlacedPart[]): NodeTarget[] {
  return parts.flatMap(part => WORKSHOP_PARTS[part.kind].nodes.map(node => ({
    partId: part.id, nodeId: node.id,
    position: { x: part.position.x + node.position.x,
      y: part.position.y + node.position.y, z: part.position.z + node.position.z },
  })));
}

export function canAttach(parts: readonly PlacedPart[], parentId: string, parentNodeId: NodeId,
  kind: PartKind, childNodeId: NodeId = 'top'): AttachResult {
  const parent = parts.find(part => part.id === parentId);
  const parentNode = parent && WORKSHOP_PARTS[parent.kind].nodes.find(node => node.id === parentNodeId);
  const child = WORKSHOP_PARTS[kind];
  const childNode = child.nodes.find(node => node.id === childNodeId);
  if (!parent || !parentNode || !childNode) return { allowed: false, reason: 'No matching attachment point' };
  if (parent.attachedNode === parentNodeId || parts.some(part =>
    part.parent?.partId === parentId && part.parent.nodeId === parentNodeId)) {
    return { allowed: false, reason: 'Attachment point occupied' };
  }
  if (parentNodeId !== 'bottom' || childNodeId !== 'top' || !parentNode.accepts.includes(kind)) {
    return { allowed: false, reason: kind === 'liquid-engine' ? 'Engines attach below a tank' : 'Incompatible attachment point' };
  }
  const childCentreY = parent.position.y + parentNode.position.y - childNode.position.y;
  if (childCentreY - child.height / 2 < -MAX_STACK_DROP - 1e-8) {
    return { allowed: false, reason: 'No room above the stand — remove a tank' };
  }
  return { allowed: true, reason: 'Click to attach' };
}

/** Nearest valid node wins. An invalid candidate is retained only for red feedback. */
export function findSnap(parts: readonly PlacedPart[], kind: PartKind, point: Point,
  radius = SNAP_RADIUS): SnapCandidate | null {
  const candidates = nodeTargets(parts).map(target => ({ ...target,
    distance: Math.hypot(target.position.x - point.x, target.position.y - point.y, target.position.z - point.z),
    result: canAttach(parts, target.partId, target.nodeId, kind),
  })).filter(candidate => candidate.distance <= radius).sort((a, b) => a.distance - b.distance);
  return candidates.find(candidate => candidate.result.allowed) ?? candidates[0] ?? null;
}
