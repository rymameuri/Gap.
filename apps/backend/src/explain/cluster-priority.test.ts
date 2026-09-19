import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { explainClusterPriorities } from "./cluster-priority.js";
import { startTestServer, type TestServer } from "../../test/support.js";

const TOLERANCE = 1e-9;

function close(actual: number, expected: number): void {
  assert.ok(
    Math.abs(actual - expected) <= TOLERANCE,
    `${String(actual)} != ${String(expected)}`,
  );
}

const contribution = (
  explanation: {
    attributions: readonly { feature: string; contribution: number }[];
  },
  feature: string,
): number => {
  const found = explanation.attributions.find((a) => a.feature === feature);
  if (!found) assert.fail(`missing ${feature}`);
  return found.contribution;
};

// The seeded class: 12 students at severity 3, 8 and 5 students at severity 2.
const seeded = [
  { students: 12, priority: 36 },
  { students: 8, priority: 16 },
  { students: 5, priority: 10 },
];

describe("explainClusterPriorities", () => {
  test("baseline is the mean priority and contributions add up to each priority", () => {
    const explanations = explainClusterPriorities(seeded);
    explanations.forEach((explanation, index) => {
      const cluster = seeded[index];
      assert.ok(cluster);
      assert.equal(explanation.method, "exact-shapley");
      close(explanation.baseline, (36 + 16 + 10) / 3);
      close(explanation.prediction, cluster.priority);
      close(
        explanation.baseline +
          explanation.attributions.reduce((sum, a) => sum + a.contribution, 0),
        cluster.priority,
      );
    });
  });

  test("the top cluster ranks high mostly because many students are affected", () => {
    const [top] = explainClusterPriorities(seeded);
    assert.ok(top);
    assert.deepEqual(
      top.attributions.map(({ feature, value }) => [feature, value]),
      [
        ["students", 12],
        ["severity", 3],
      ],
    );
    assert.ok(contribution(top, "students") > contribution(top, "severity"));
    assert.ok(contribution(top, "severity") > 0);
  });

  test("clusters below average get negative contributions", () => {
    const smallest = explainClusterPriorities(seeded)[2];
    assert.ok(smallest);
    assert.ok(contribution(smallest, "students") < 0);
    assert.ok(contribution(smallest, "severity") < 0);
  });

  test("matches the closed form for a product against each background row", () => {
    // For f = s * v and one background row (s0, v0):
    // phi_s = (s - s0)(v + v0) / 2 and phi_v = (v - v0)(s + s0) / 2.
    const explanations = explainClusterPriorities(seeded);
    const rows = seeded.map((c) => ({
      s: c.students,
      v: c.priority / c.students,
    }));
    explanations.forEach((explanation, index) => {
      const row = rows[index];
      assert.ok(row);
      const expectedStudents =
        rows.reduce((sum, b) => sum + ((row.s - b.s) * (row.v + b.v)) / 2, 0) /
        rows.length;
      const expectedSeverity =
        rows.reduce((sum, b) => sum + ((row.v - b.v) * (row.s + b.s)) / 2, 0) /
        rows.length;
      close(contribution(explanation, "students"), expectedStudents);
      close(contribution(explanation, "severity"), expectedSeverity);
    });
  });

  test("a single cluster is explained entirely by the baseline", () => {
    const [only] = explainClusterPriorities([{ students: 4, priority: 10 }]);
    assert.ok(only);
    close(only.baseline, 10);
    for (const a of only.attributions) close(a.contribution, 0);
  });

  test("no clusters give no explanations", () => {
    assert.deepEqual(explainClusterPriorities([]), []);
  });

  test("a cluster without students is rejected", () => {
    assert.throws(
      () => explainClusterPriorities([{ students: 0, priority: 0 }]),
      RangeError,
    );
  });
});

describe("teacher workspace clusters", () => {
  let app: TestServer;
  let teacher: string;
  before(async () => {
    app = await startTestServer();
    teacher = await app.login("teacher@gap.demo");
  });
  after(() => app.close());

  test("every open cluster carries an explanation that adds up to its priority", async () => {
    const response = await app.request("/api/teacher/workspace", {
      cookie: teacher,
    });
    assert.equal(response.status, 200);
    const { clusters } = response.body as {
      clusters: {
        priority: number;
        students: number;
        priorityExplanation: {
          method: string;
          baseline: number;
          prediction: number;
          attributions: {
            feature: string;
            value: number;
            contribution: number;
          }[];
        };
      }[];
    };
    assert.equal(clusters.length, 3);
    for (const { priority, students, priorityExplanation } of clusters) {
      assert.equal(priorityExplanation.method, "exact-shapley");
      close(priorityExplanation.prediction, priority);
      close(
        priorityExplanation.baseline +
          priorityExplanation.attributions.reduce(
            (sum, a) => sum + a.contribution,
            0,
          ),
        priority,
      );
      assert.equal(
        priorityExplanation.attributions.find((a) => a.feature === "students")
          ?.value,
        students,
      );
    }
  });
});
