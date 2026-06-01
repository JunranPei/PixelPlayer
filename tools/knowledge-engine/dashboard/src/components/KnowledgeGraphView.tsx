import { useEffect, useMemo, useCallback, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useReactFlow,
} from "@xyflow/react";
import type { Edge, Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import CustomNode from "./CustomNode";
import type { CustomNodeData } from "./CustomNode";
import { useDashboardStore } from "../store";
import { applyForceLayoutAsync, NODE_WIDTH, NODE_HEIGHT } from "../utils/layout";
import type { KnowledgeGraph } from "@understand-anything/core/types";

const nodeTypes = {
  custom: CustomNode,
};

/** Edge style presets by knowledge edge type. */
const EDGE_STYLES: Record<string, React.CSSProperties> = {
  related: { stroke: "var(--color-border-medium)", strokeWidth: 0.5, opacity: 0.14 },
  cites: { stroke: "var(--color-node-source)", strokeWidth: 1.5, strokeDasharray: "6 3" },
  contradicts: { stroke: "#ff6b6b", strokeWidth: 2 },
  builds_on: { stroke: "var(--color-node-claim)", strokeWidth: 1.5 },
  exemplifies: { stroke: "var(--color-node-entity)", strokeWidth: 1, strokeDasharray: "3 3" },
  categorized_under: { stroke: "var(--color-border-medium)", strokeWidth: 0.5, opacity: 0.1 },
  authored_by: { stroke: "var(--color-node-entity)", strokeWidth: 1, strokeDasharray: "4 4" },
  implements: { stroke: "var(--color-node-function)", strokeWidth: 1, opacity: 0.45 },
  depends_on: { stroke: "var(--color-node-module)", strokeWidth: 1, opacity: 0.45 },
};

/**
 * "Weak" edge types are numerous and visually near-invisible. Above this node
 * count we drop them from the render set unless they touch the active node —
 * this is the single biggest win for large knowledge graphs (thousands of SVG
 * paths otherwise). Meaningful edges are always rendered.
 */
const WEAK_EDGE_TYPES = new Set(["related", "categorized_under"]);
const LOD_NODE_THRESHOLD = 300;

/** Compute node size based on connection count. */
function getNodeDimensions(edgeCount: number): { width: number; height: number } {
  const scale = Math.min(1.5, Math.max(0.85, 0.85 + edgeCount * 0.03));
  return {
    width: Math.round(NODE_WIDTH * scale),
    height: Math.round(NODE_HEIGHT * scale),
  };
}

/** Fits the view once, when nodes first appear after async layout. */
function FitOnData({ nodeCount }: { nodeCount: number }) {
  const { fitView } = useReactFlow();
  const fittedRef = useRef(false);
  useEffect(() => {
    if (fittedRef.current || nodeCount === 0) return;
    fittedRef.current = true;
    const raf = requestAnimationFrame(() =>
      fitView({ padding: 0.15, duration: 400, minZoom: 0.05 }),
    );
    return () => cancelAnimationFrame(raf);
  }, [nodeCount, fitView]);
  return null;
}

function KnowledgeGraphViewInner() {
  const graph = useDashboardStore((s) => s.graph);
  const selectedNodeId = useDashboardStore((s) => s.selectedNodeId);
  const focusNodeId = useDashboardStore((s) => s.focusNodeId);
  const selectNode = useDashboardStore((s) => s.selectNode);
  const searchResultsRaw = useDashboardStore((s) => s.searchResults);
  const tourHighlightedNodeIds = useDashboardStore((s) => s.tourHighlightedNodeIds);
  const nodeTypeFilters = useDashboardStore((s) => s.nodeTypeFilters);
  const [zoomLevelClass, setZoomLevelClass] = useState("zoom-lod-high");

  const onMove = useCallback(
    (_event: MouseEvent | TouchEvent | null, viewport: { zoom: number }) => {
      const zoom = viewport.zoom;
      let nextClass = "zoom-lod-high";
      if (zoom < 0.35) {
        nextClass = "zoom-lod-low";
      } else if (zoom < 0.6) {
        nextClass = "zoom-lod-mid";
      }
      if (nextClass !== zoomLevelClass) {
        setZoomLevelClass(nextClass);
      }
    },
    [zoomLevelClass],
  );

  const onNodeClick = useCallback(
    (nodeId: string) => selectNode(nodeId),
    [selectNode],
  );

  const searchResults = useMemo(
    () => new Map(searchResultsRaw.map((r) => [r.nodeId, r.score])),
    [searchResultsRaw],
  );

  const tourSet = useMemo(
    () => new Set(tourHighlightedNodeIds),
    [tourHighlightedNodeIds],
  );

  // Filter graph — only recompute when graph data or filters change
  const filteredGraph = useMemo((): KnowledgeGraph | null => {
    if (!graph) return null;

    const filteredNodes = graph.nodes.filter((n) => {
      if (["article", "entity", "topic", "claim", "source"].includes(n.type)) {
        return nodeTypeFilters.knowledge !== false;
      }
      return true;
    });

    const filteredNodeIds = new Set(filteredNodes.map((n) => n.id));
    const filteredEdges = graph.edges.filter(
      (e) => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target),
    );

    return { ...graph, nodes: filteredNodes, edges: filteredEdges };
  }, [graph, nodeTypeFilters]);

  // Cheap synchronous derivations (edge counts, communities, dims).
  const { edgeCounts, communityMap, dims } = useMemo(() => {
    const ec = new Map<string, number>();
    const cm = new Map<string, number>();
    const dm = new Map<string, { width: number; height: number }>();
    if (!filteredGraph) return { edgeCounts: ec, communityMap: cm, dims: dm };
    for (const edge of filteredGraph.edges) {
      ec.set(edge.source, (ec.get(edge.source) ?? 0) + 1);
      ec.set(edge.target, (ec.get(edge.target) ?? 0) + 1);
    }
    filteredGraph.layers.forEach((layer, i) => {
      for (const nodeId of layer.nodeIds) cm.set(nodeId, i);
    });
    for (const node of filteredGraph.nodes) {
      dm.set(node.id, getNodeDimensions(ec.get(node.id) ?? 0));
    }
    return { edgeCounts: ec, communityMap: cm, dims: dm };
  }, [filteredGraph]);

  // Async force layout (off the main thread). Positions are stable across
  // selection/search/tour — those only restyle, never relayout.
  const [positionMap, setPositionMap] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [layoutStatus, setLayoutStatus] = useState<"computing" | "ready">("ready");

  useEffect(() => {
    if (!filteredGraph || filteredGraph.nodes.length === 0) {
      setPositionMap(new Map());
      setLayoutStatus("ready");
      return;
    }
    let cancelled = false;
    setLayoutStatus("computing");
    const tmpNodes: Node[] = filteredGraph.nodes.map((node) => ({
      id: node.id,
      type: "custom" as const,
      position: { x: 0, y: 0 },
      data: {},
    }));
    const tmpEdges: Edge[] = filteredGraph.edges.map((e, i) => ({
      id: `ke-${i}`,
      source: e.source,
      target: e.target,
    }));
    applyForceLayoutAsync(tmpNodes, tmpEdges, dims, communityMap).then((pm) => {
      if (cancelled) return;
      setPositionMap(pm);
      setLayoutStatus("ready");
    });
    return () => {
      cancelled = true;
    };
  }, [filteredGraph, dims, communityMap]);

  // Build visual nodes/edges — recomputes on selection/search/tour WITHOUT re-layout
  const { nodes, edges } = useMemo(() => {
    if (!filteredGraph || positionMap.size === 0) return { nodes: [], edges: [] };

    const activeId = focusNodeId ?? selectedNodeId;
    const neighborIds = new Set<string>();
    if (activeId) {
      for (const edge of filteredGraph.edges) {
        if (edge.source === activeId) neighborIds.add(edge.target);
        if (edge.target === activeId) neighborIds.add(edge.source);
      }
    }

    const rfNodes: Node[] = filteredGraph.nodes.map((node) => {
      const isSelected = node.id === selectedNodeId;
      const isFocused = node.id === focusNodeId;
      const isNeighbor = neighborIds.has(node.id);
      const isSelectionFaded = !!activeId && !isSelected && !isFocused && !isNeighbor;
      const searchScore = searchResults.get(node.id);
      const isHighlighted = searchScore !== undefined;
      const isTourHighlighted = tourSet.has(node.id);

      const data: CustomNodeData = {
        label: node.name,
        nodeType: node.type,
        summary: node.summary,
        complexity: node.complexity,
        isHighlighted,
        searchScore,
        isSelected,
        isTourHighlighted,
        isDiffChanged: false,
        isDiffAffected: false,
        isDiffFaded: false,
        isNeighbor,
        isSelectionFaded,
        onNodeClick,
        incomingCount: edgeCounts.get(node.id) ?? 0,
        tags: node.tags,
      };

      return {
        id: node.id,
        type: "custom" as const,
        position: positionMap.get(node.id) ?? { x: 0, y: 0 },
        data,
      };
    });

    const large = filteredGraph.nodes.length > LOD_NODE_THRESHOLD;
    const rfEdges: Edge[] = [];
    for (const e of filteredGraph.edges) {
      const isConnected = !!activeId && (e.source === activeId || e.target === activeId);
      // Level-of-detail: drop near-invisible bulk edges on large graphs
      // unless they touch the active node.
      if (large && WEAK_EDGE_TYPES.has(e.type) && !isConnected) continue;

      const baseStyle = EDGE_STYLES[e.type] ?? EDGE_STYLES.related;
      let style: React.CSSProperties;
      if (activeId) {
        style = isConnected
          ? { ...baseStyle, strokeWidth: Math.max(2, (baseStyle.strokeWidth as number ?? 1) * 1.5), opacity: 1 }
          : { ...baseStyle, opacity: 0.04 };
      } else {
        style = baseStyle;
      }

      rfEdges.push({
        id: `ke-${e.source}-${e.target}-${e.type}`,
        source: e.source,
        target: e.target,
        style,
        animated: e.type === "contradicts" && (!activeId || isConnected),
        label:
          isConnected && e.type !== "related" && e.type !== "categorized_under"
            ? e.type.replace(/_/g, " ")
            : undefined,
        labelStyle: { fill: "var(--color-text-muted)", fontSize: 9, opacity: 0.7 },
        labelBgStyle: { fill: "var(--color-surface)", fillOpacity: 0.9 },
        labelBgPadding: [4, 2] as [number, number],
        labelBgBorderRadius: 3,
      });
    }

    return { nodes: rfNodes, edges: rfEdges };
  }, [filteredGraph, positionMap, selectedNodeId, focusNodeId, searchResults, tourSet, onNodeClick, edgeCounts]);

  if (!graph) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted text-sm">
        No knowledge graph available. Run /understand-knowledge to generate one.
      </div>
    );
  }

  return (
    <div className={`h-full w-full relative ${zoomLevelClass}`}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onlyRenderVisibleElements
        elevateEdgesOnSelect={false}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.05}
        maxZoom={2}
        onMove={onMove}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={22}
          size={1}
          color="var(--color-edge-dot)"
        />
        <Controls />
        <MiniMap
          nodeColor={(n) => {
            const data = n.data as CustomNodeData | undefined;
            const type = data?.nodeType ?? "article";
            const colorMap: Record<string, string> = {
              article: "var(--color-node-article)",
              entity: "var(--color-node-entity)",
              topic: "var(--color-node-topic)",
              claim: "var(--color-node-claim)",
              source: "var(--color-node-source)",
            };
            return colorMap[type] ?? "var(--color-accent)";
          }}
          maskColor="var(--glass-bg)"
          className="!bg-surface !border !border-border-subtle"
        />
        <FitOnData nodeCount={nodes.length} />
      </ReactFlow>
      {layoutStatus === "computing" && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="flex items-center gap-3 px-5 py-3 rounded-full glass-heavy">
            <span className="w-4 h-4 rounded-full border-2 border-accent border-t-transparent animate-spin" />
            <span className="text-sm text-text-secondary">Computing layout…</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function KnowledgeGraphView() {
  return (
    <ReactFlowProvider>
      <KnowledgeGraphViewInner />
    </ReactFlowProvider>
  );
}
