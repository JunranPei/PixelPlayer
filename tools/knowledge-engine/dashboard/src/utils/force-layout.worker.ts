/**
 * Off-main-thread force-directed layout for the knowledge / domain graphs.
 *
 * The previous implementation ran `forceSimulation(...).tick(up to 300)`
 * synchronously inside a React render path — for a large graph that blocks the
 * main thread for seconds (the "freeze on load"). Running the identical
 * simulation in a worker keeps the UI responsive; the result is posted back as
 * a plain id → position map.
 *
 * The force configuration here is intentionally kept in lockstep with the
 * synchronous `applyForceLayout` fallback in `layout.ts`.
 */
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  forceX,
  forceY,
} from "d3-force";
import type { SimulationNodeDatum, SimulationLinkDatum } from "d3-force";

const NODE_WIDTH = 280;

interface ForceNode extends SimulationNodeDatum {
  id: string;
  community?: number;
  w: number;
}

export interface ForceLayoutMessage {
  requestId: number;
  nodes: Array<{ id: string; width: number; height: number; community?: number }>;
  edges: Array<{ source: string; target: string }>;
}

export interface ForceLayoutResult {
  requestId: number;
  positions: Record<string, { x: number; y: number }>;
}

function seedFromString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  return (Math.abs(hash) % 1000000) / 1000000;
}

self.onmessage = (e: MessageEvent<ForceLayoutMessage>) => {
  const { requestId, nodes, edges } = e.data;

  if (nodes.length === 0) {
    self.postMessage({ requestId, positions: {} } satisfies ForceLayoutResult);
    return;
  }

  const simNodes: ForceNode[] = nodes.map((n) => {
    const rx = seedFromString(n.id + "-x");
    const ry = seedFromString(n.id + "-y");
    return {
      id: n.id,
      x: rx * 800 - 400,
      y: ry * 800 - 400,
      community: n.community,
      w: n.width,
    };
  });

  const nodeIdSet = new Set(simNodes.map((n) => n.id));
  const simLinks: SimulationLinkDatum<ForceNode>[] = edges
    .filter((ed) => nodeIdSet.has(ed.source) && nodeIdSet.has(ed.target))
    .map((ed) => ({ source: ed.source, target: ed.target }));

  const communities = new Set<number>();
  for (const n of simNodes) if (n.community != null) communities.add(n.community);
  const communityCount = Math.max(1, communities.size);
  const communityAngle = (i: number) => (2 * Math.PI * i) / communityCount;
  const clusterRadius = Math.max(600, nodes.length * 5);

  const isLarge = nodes.length > 100;
  const chargeStrength = isLarge ? -600 : -350;
  const linkDistance = isLarge ? 250 : 150;

  const sim = forceSimulation<ForceNode>(simNodes)
    .force(
      "link",
      forceLink<ForceNode, SimulationLinkDatum<ForceNode>>(simLinks)
        .id((d) => d.id)
        .distance(linkDistance)
        .strength(0.2),
    )
    .force("charge", forceManyBody().strength(chargeStrength).distanceMax(1500))
    .force("center", forceCenter(0, 0).strength(0.03))
    .force(
      "collide",
      forceCollide<ForceNode>()
        .radius((d) => Math.max(20, (d.w + 40) / 2))
        .strength(0.8),
    );

  if (communityCount > 1) {
    sim.force(
      "clusterX",
      forceX<ForceNode>((d) => Math.cos(communityAngle(d.community ?? 0)) * clusterRadius).strength(0.3),
    );
    sim.force(
      "clusterY",
      forceY<ForceNode>((d) => Math.sin(communityAngle(d.community ?? 0)) * clusterRadius).strength(0.3),
    );
  }

  const ticks = Math.min(300, Math.max(100, nodes.length));
  sim.tick(ticks);
  sim.stop();

  const dimsById = new Map(nodes.map((n) => [n.id, n]));
  const positions: Record<string, { x: number; y: number }> = {};
  for (const n of simNodes) {
    const d = dimsById.get(n.id);
    const w = d?.width ?? NODE_WIDTH;
    const hgt = d?.height ?? 120;
    positions[n.id] = { x: (n.x ?? 0) - w / 2, y: (n.y ?? 0) - hgt / 2 };
  }

  self.postMessage({ requestId, positions } satisfies ForceLayoutResult);
};
