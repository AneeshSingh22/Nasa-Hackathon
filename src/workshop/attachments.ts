import type { PartDefinition, PartKind } from '../vab/parts';
export type Port = 'root' | 'upper' | 'lower' | 'payload' | 'fairing' | `above:${string}` | `below:${string}`;
export const BUILD_ANCHOR_Y = 60;
export const MAX_STACK_HEIGHT = 64;
export const ATTACHMENT_RADIUS = .4; // Small visual marker; screen-space snapping stays generous.

/** The array is physical top-to-bottom, independent of purchase order or seed kind. */
export function insertionIndex(parts: readonly PartDefinition[], port: Port): number | null {
  if (port.startsWith('above:') || port.startsWith('below:')) {
    const index = parts.findIndex(p => p.instanceId === port.slice(6));
    return index < 0 ? null : index + (port.startsWith('below:') ? 1 : 0);
  }
  if (port === 'root') return parts.length ? null : 0;
  if (!parts.length) return null;
  if (port === 'upper') return 0;
  if (port === 'lower') return parts.length;
  const index = parts.findIndex(p => p.kind === (port === 'payload' ? 'command' : 'payload'));
  return index < 0 ? null : index;
}
/** One rule for preview and commit. Presence/fuel readiness is checked at launch,
 * not used to force a command-first shopping sequence. */
export function attachmentAllowed(parts: readonly PartDefinition[], part: PartDefinition, port: Port): boolean {
  if (part.deferred || !['command', 'tank', 'engine', 'payload', 'fairing'].includes(part.kind)) return false;
  if (insertionIndex(parts, port) === null) return false;
  if (['command', 'payload', 'fairing'].includes(part.kind) && parts.some(p => p.kind === part.kind)) return false;
  if (part.kind === 'engine' && parts.filter(p => p.kind === 'engine').length >= 2) return false;
  if (parts.reduce((sum, p) => sum + p.height, 0) + part.height > MAX_STACK_HEIGHT) return false;
  if (port === 'payload') return part.kind === 'payload';
  if (port === 'fairing') return part.kind === 'fairing';
  return true;
}
/** Preferred connection for keyboard/dev builds; pointer placement may choose either end. */
export function portFor(kind: PartKind, parts: readonly PartDefinition[] = []): Port {
  if (!parts.length) return 'root';
  if (kind === 'payload' && parts.some(p => p.kind === 'command')) return 'payload';
  if (kind === 'fairing' && parts.some(p => p.kind === 'payload')) return 'fairing';
  const top = parts[0]!;
  if (kind === 'command') return top.kind === 'tank' || top.kind === 'engine' ? 'upper' : 'lower';
  if (kind === 'tank' && parts.length === 1 && top.kind === 'engine') return 'upper';
  return 'lower';
}
