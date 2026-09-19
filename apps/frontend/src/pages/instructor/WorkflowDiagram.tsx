import { useEffect, useId, useRef } from "react";
import {
  BookOpen,
  Bot,
  Check,
  CircleAlert,
  Clock3,
  ShieldCheck,
  UserRound,
} from "lucide-react";

export type DiagramNode = {
  id: string;
  actor: string;
  label: string;
  detail: string;
  column: number;
  row: number;
  type?: "person" | "agent" | "source" | "decision" | "result";
  state?: "complete" | "pending" | "failed";
};
type Side = "left" | "right" | "top" | "bottom";
export type DiagramEdge = {
  from: string;
  to: string;
  fromSide?: Side;
  toSide?: Side;
  label?: string;
  source?: boolean;
};

const WIDTH = 200;
const HEIGHT = 96;
const COLUMN = 264;
const ROW = 180;
const PAD = 24;
const edgeColors = {
  neutral: "#adbab6",
  complete: "#25846b",
  pending: "#b48124",
  failed: "#b5574b",
};
const icons = {
  person: UserRound,
  agent: Bot,
  source: BookOpen,
  decision: ShieldCheck,
  result: Check,
};

function anchor(node: DiagramNode, side: Side) {
  const x = PAD + node.column * COLUMN;
  const y = PAD + node.row * ROW;
  return {
    x: x + (side === "left" ? 0 : side === "right" ? WIDTH : WIDTH / 2),
    y: y + (side === "top" ? 0 : side === "bottom" ? HEIGHT : HEIGHT / 2),
  };
}

export function WorkflowDiagram({
  nodes,
  edges,
  selectedId,
  onSelect,
  label,
  recorded = false,
  replaying = false,
}: {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  selectedId: string;
  onSelect: (id: string) => void;
  label: string;
  recorded?: boolean;
  replaying?: boolean;
}) {
  const markerId = useId().replaceAll(":", "");
  const scroll = useRef<HTMLDivElement>(null);
  const width =
    Math.max(1, ...nodes.map((node) => node.column + 1)) * COLUMN -
    (COLUMN - WIDTH) +
    PAD * 2;
  const height =
    Math.max(1, ...nodes.map((node) => node.row + 1)) * ROW -
    (ROW - HEIGHT) +
    PAD * 2;
  const selectedIndex = nodes.findIndex((node) => node.id === selectedId);

  useEffect(() => {
    if (!replaying) return;
    const node = nodes.find((item) => item.id === selectedId);
    if (node && scroll.current) {
      scroll.current.scrollLeft =
        PAD + node.column * COLUMN + WIDTH / 2 - scroll.current.clientWidth / 2;
    }
  }, [selectedId, replaying, nodes]);

  return (
    <div className="workflow-diagram-scroll" ref={scroll}>
      <div
        className="workflow-diagram"
        role="group"
        aria-label={label}
        style={{ width, height }}
      >
        <svg
          className="workflow-connectors"
          width={width}
          height={height}
          aria-hidden="true"
        >
          <defs>
            {Object.entries(edgeColors).map(([tone, color]) => (
              <marker
                key={tone}
                id={`${markerId}-${tone}`}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path
                  d="M 1 1 L 9 5 L 1 9"
                  fill="none"
                  stroke={color}
                  strokeWidth="1.7"
                />
              </marker>
            ))}
          </defs>
          {edges.map((edge) => {
            const from = nodes.find((node) => node.id === edge.from);
            const to = nodes.find((node) => node.id === edge.to);
            if (!from || !to) return null;
            const fromSide = edge.fromSide ?? "right";
            const start = anchor(from, fromSide);
            const end = anchor(to, edge.toSide ?? "left");
            const vertical = fromSide === "top" || fromSide === "bottom";
            const midX = (start.x + end.x) / 2;
            const midY = (start.y + end.y) / 2;
            const path = vertical
              ? `M ${start.x} ${start.y} V ${midY} H ${end.x} V ${end.y}`
              : `M ${start.x} ${start.y} H ${midX} V ${end.y} H ${end.x}`;
            const targetIndex = nodes.indexOf(to);
            const active = recorded
              ? to.id === selectedId
              : from.id === selectedId || to.id === selectedId;
            const traversed = recorded && targetIndex <= selectedIndex;
            const tone =
              recorded && (active || traversed)
                ? (to.state ?? "complete")
                : "complete";
            return (
              <g
                key={`${edge.from}-${edge.to}`}
                className={`workflow-connection ${tone} ${active ? "is-active" : ""} ${traversed ? "is-traversed" : ""} ${edge.source ? "is-source" : ""} ${replaying && active ? "is-moving" : ""}`}
              >
                <path className="workflow-connection-track" d={path} />
                <path
                  className="workflow-connection-line"
                  d={path}
                  markerEnd={`url(#${markerId}-${active || traversed ? tone : "neutral"})`}
                />
              </g>
            );
          })}
          {edges
            .filter((edge) => edge.label)
            .map((edge) => {
              const from = nodes.find((node) => node.id === edge.from);
              const to = nodes.find((node) => node.id === edge.to);
              if (!from || !to) return null;
              const start = anchor(from, edge.fromSide ?? "right");
              const end = anchor(to, edge.toSide ?? "left");
              const straightVertical = start.x === end.x;
              return (
                <text
                  key={`label-${edge.from}-${edge.to}`}
                  className="workflow-connection-label"
                  x={(start.x + end.x) / 2 + (straightVertical ? 10 : 0)}
                  y={(start.y + end.y) / 2 - 9}
                  textAnchor={straightVertical ? "start" : "middle"}
                >
                  {edge.label}
                </text>
              );
            })}
        </svg>
        {nodes.map((node, index) => {
          const Icon = icons[node.type ?? "agent"];
          const StateIcon =
            node.state === "pending"
              ? Clock3
              : node.state === "failed"
                ? CircleAlert
                : Check;
          return (
            <button
              key={node.id}
              type="button"
              className={`workflow-diagram-node ${node.type ?? "agent"} ${node.state ?? ""} ${node.id === selectedId ? "is-selected" : ""}`}
              style={{
                left: PAD + node.column * COLUMN,
                top: PAD + node.row * ROW,
                width: WIDTH,
                height: HEIGHT,
              }}
              aria-pressed={node.id === selectedId}
              aria-label={`${recorded ? `${index + 1}. ` : ""}${node.actor}: ${node.label}${node.state ? ` (${node.state})` : ""}`}
              title={node.label}
              onClick={() => onSelect(node.id)}
            >
              <span className="workflow-node-heading">
                <Icon size={15} aria-hidden="true" />
                <span>{node.actor}</span>
                {node.state && <StateIcon size={14} aria-hidden="true" />}
              </span>
              <strong>{node.label}</strong>
              {recorded && (
                <span className="workflow-node-order">{index + 1}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
