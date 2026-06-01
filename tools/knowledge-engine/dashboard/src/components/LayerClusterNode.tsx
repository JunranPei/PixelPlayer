import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps, Node } from "@xyflow/react";
import { getLayerColor } from "./LayerLegend";

const complexityColors: Record<string, string> = {
  simple: "text-node-function",
  moderate: "text-gold-dim",
  complex: "text-[#c97070]",
};

export interface LayerClusterData extends Record<string, unknown> {
  layerId: string;
  layerName: string;
  layerDescription: string;
  fileCount: number;
  aggregateComplexity: string;
  layerColorIndex: number;
  searchMatchCount?: number;
  onDrillIn: (layerId: string) => void;
}

export type LayerClusterFlowNode = Node<LayerClusterData, "layer-cluster">;

function LayerClusterNode({
  data,
}: NodeProps<LayerClusterFlowNode>) {
  const color = getLayerColor(data.layerColorIndex);
  const complexityColor =
    complexityColors[data.aggregateComplexity] ?? complexityColors.simple;

  return (
    <div
      className="relative rounded-[22px] bg-elevated border border-border-subtle overflow-hidden cursor-pointer transition-all duration-[280ms] ease-[var(--ease-spring)] hover:border-accent/40 hover:-translate-y-0.5 hover:shadow-xl group"
      style={{
        width: 300,
        boxShadow: "0 6px 20px -6px rgba(0,0,0,0.45)",
      }}
      onClick={() => data.onDrillIn(data.layerId)}
    >
      {/* Left color bar */}
      <div
        className="absolute left-0 top-2 bottom-2 w-1.5 rounded-full"
        style={{ backgroundColor: color.label }}
      />

      <Handle
        type="target"
        position={Position.Top}
        className="!bg-text-muted !w-2 !h-2"
      />

      <div className="pl-5 pr-4 py-4">
        {/* Header row */}
        <div className="flex items-center justify-between mb-2">
          <span
            className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: color.label }}
          >
            Layer
          </span>
          <div className="flex items-center gap-2">
            {data.searchMatchCount != null && data.searchMatchCount > 0 && (
              <span className="text-[10px] font-mono bg-accent/20 text-accent px-2 py-0.5 rounded-full">
                {data.searchMatchCount} match{data.searchMatchCount !== 1 ? "es" : ""}
              </span>
            )}
            <span className={`text-[10px] font-mono ${complexityColor}`}>
              {data.aggregateComplexity}
            </span>
          </div>
        </div>

        {/* Layer name */}
        <div className="text-lg font-heading text-text-primary mb-1">
          {data.layerName}
        </div>

        {/* Description */}
        <div className="text-[11px] text-text-secondary line-clamp-2 leading-tight mb-3">
          {data.layerDescription}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-text-muted">
            {data.fileCount} file{data.fileCount !== 1 ? "s" : ""}
          </span>
          <span className="text-[10px] text-text-muted opacity-0 group-hover:opacity-100 transition-opacity">
            Click to explore →
          </span>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-text-muted !w-2 !h-2"
      />
    </div>
  );
}

export default memo(LayerClusterNode);
