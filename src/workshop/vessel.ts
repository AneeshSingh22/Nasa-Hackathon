import { WORKSHOP_PARTS, type NodeId, type PartKind } from './parts';
import { canAttach, nodeTargets, type PlacedPart } from './attach';

export class WorkshopVessel {
  private placed: PlacedPart[] = [];
  private nextId = 1;
  constructor() { this.reset(); }
  get parts(): readonly PlacedPart[] { return this.placed; }
  reset(): void {
    this.placed = [{ id: 'pod', kind: 'command-pod', position: { x: 0, y: 0, z: 0 }, parent: null, attachedNode: null }];
    this.nextId = 1;
  }
  childrenOf(id: string): readonly PlacedPart[] {
    return this.placed.filter(part => part.parent?.partId === id);
  }
  attach(kind: PartKind, parentId: string, nodeId: NodeId): PlacedPart | null {
    if (!canAttach(this.placed, parentId, nodeId, kind).allowed) return null;
    const target = nodeTargets(this.placed).find(node => node.partId === parentId && node.nodeId === nodeId)!;
    const childNode = WORKSHOP_PARTS[kind].nodes.find(node => node.id === 'top')!;
    const part: PlacedPart = { id: `part-${this.nextId++}`, kind,
      position: { x: target.position.x - childNode.position.x,
        y: target.position.y - childNode.position.y, z: target.position.z - childNode.position.z },
      parent: { partId: parentId, nodeId }, attachedNode: 'top',
    };
    this.placed.push(part);
    return part;
  }
  detachLast(): PlacedPart | null {
    // Append-only axial attachment guarantees the most recent part is a leaf.
    return this.placed.length > 1 ? this.placed.pop()! : null;
  }
  analyze(): { cost: number; wetMass: number } {
    return this.placed.reduce((sum, part) => {
      const definition = WORKSHOP_PARTS[part.kind];
      return { cost: sum.cost + definition.cost,
        wetMass: sum.wetMass + definition.dryMass + definition.propellantMass };
    }, { cost: 0, wetMass: 0 });
  }
}
