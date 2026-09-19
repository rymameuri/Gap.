import { exactShapley, type Explanation } from "./shapley.js";

export const PRIORITY_FEATURES = ["students", "severity"] as const;

export interface PriorityInput {
  /** Open gaps in the cluster, one per student. */
  readonly students: number;
  /** Sum of the open gaps' severities; the dashboard ranks by it. */
  readonly priority: number;
}

export interface PriorityExplanation extends Explanation {
  readonly method: "exact-shapley";
}

// priority = sum of severities = students x mean severity, the "frequency and
// severity" the dashboard ranks by. The product makes the split between the
// two informative; a sum would give each term its own deviation.
const priorityModel = (features: Readonly<Record<string, number>>): number =>
  (features.students ?? 0) * (features.severity ?? 0);

function features(cluster: PriorityInput): Record<string, number> {
  if (cluster.students <= 0)
    throw new RangeError("A cluster needs at least one student");
  return {
    students: cluster.students,
    severity: cluster.priority / cluster.students,
  };
}

/**
 * Explains each cluster's priority against the class's open clusters: the
 * baseline is their mean priority, and each feature's contribution is its
 * exact Shapley value, so baseline + contributions = priority.
 * @throws RangeError for a cluster without students.
 */
export function explainClusterPriorities(
  clusters: readonly PriorityInput[],
): PriorityExplanation[] {
  const background = clusters.map(features);
  return clusters.map((cluster) => ({
    method: "exact-shapley",
    ...exactShapley(
      priorityModel,
      features(cluster),
      background,
      PRIORITY_FEATURES,
    ),
  }));
}
