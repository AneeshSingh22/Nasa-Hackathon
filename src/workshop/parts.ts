export type PartKind = 'command-pod' | 'fuel-tank' | 'liquid-engine';
export type NodeId = 'top' | 'bottom';
export interface Point { readonly x: number; readonly y: number; readonly z: number }
export interface AttachmentNode {
  readonly id: NodeId;
  readonly position: Point;
  readonly accepts: readonly PartKind[];
}
export interface PartDefinition {
  readonly id: PartKind;
  readonly name: string;
  readonly dryMass: number;
  readonly propellantMass: number;
  /** US dollars, not the legacy Mission's millions-of-dollars convention. */
  readonly cost: number;
  readonly height: number;
  readonly thrust: number;
  readonly isp: number;
  readonly nodes: readonly AttachmentNode[];
  readonly description: string;
}
const node = (id: NodeId, y: number, accepts: readonly PartKind[] = []): AttachmentNode =>
  ({ id, position: { x: 0, y, z: 0 }, accepts });

// Gameplay stub numbers, not specifications for a real launch vehicle.
export const WORKSHOP_PARTS: Readonly<Record<PartKind, PartDefinition>> = {
  'command-pod': {
    id: 'command-pod', name: 'Command Pod', dryMass: 1200, propellantMass: 0,
    cost: 600000, height: 2.8, thrust: 0, isp: 0,
    nodes: [node('bottom', -1.4, ['fuel-tank'])],
    description: 'Vessel root. Build downward from the bottom attachment point.',
  },
  'fuel-tank': {
    id: 'fuel-tank', name: 'Fuel Tank', dryMass: 200, propellantMass: 1600,
    cost: 80000, height: 2, thrust: 0, isp: 0,
    nodes: [node('top', 1), node('bottom', -1, ['fuel-tank', 'liquid-engine'])],
    description: 'Attach below the pod or another tank. Add an engine underneath.',
  },
  'liquid-engine': {
    id: 'liquid-engine', name: 'Liquid Engine', dryMass: 400, propellantMass: 0,
    cost: 150000, height: 1.6, thrust: 65000, isp: 310,
    nodes: [node('top', 0.8)],
    description: 'Attaches below a tank. Ends the axial stack.',
  },
};
