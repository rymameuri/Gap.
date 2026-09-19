import { ChevronDown, Info } from "lucide-react";
import type { Cluster } from "../../services/types";

const number = (value: number) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);

function signed(value: number): string {
  if (Math.abs(value) < 0.05) return "0";
  return `${value > 0 ? "+" : ""}${number(value)}`;
}

export function PriorityRationale({ cluster }: { cluster: Cluster }) {
  const { priorityExplanation } = cluster;
  const reach = priorityExplanation.attributions.find(
    (item) => item.feature === "students",
  );
  const severity = priorityExplanation.attributions.find(
    (item) => item.feature === "severity",
  );
  return (
    <details className="priority-rationale">
      <summary>
        <Info size={16} aria-hidden="true" />
        Why this topic ranks first
        <ChevronDown size={16} aria-hidden="true" />
      </summary>
      <p>
        Priority is the total severity of open gaps. The comparison below uses
        this class&apos;s open topics as its baseline.
      </p>
      <dl>
        <div>
          <dt>Class topic average</dt>
          <dd>{number(priorityExplanation.baseline)}</dd>
        </div>
        <div>
          <dt>Students affected ({cluster.students})</dt>
          <dd>{signed(reach?.contribution ?? 0)}</dd>
        </div>
        <div>
          <dt>Average gap severity ({number(severity?.value ?? 0)})</dt>
          <dd>{signed(severity?.contribution ?? 0)}</dd>
        </div>
        <div className="priority-total">
          <dt>Priority score</dt>
          <dd>{number(priorityExplanation.prediction)}</dd>
        </div>
      </dl>
    </details>
  );
}
