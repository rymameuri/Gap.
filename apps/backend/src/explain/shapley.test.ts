import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { MAX_EXACT_FEATURES, exactShapley, type Features } from "./shapley.js";

const TOLERANCE = 1e-9;

function close(actual: number, expected: number, label = ""): void {
  assert.ok(
    Math.abs(actual - expected) <= TOLERANCE * Math.max(1, Math.abs(expected)),
    `${label} ${String(actual)} != ${String(expected)}`,
  );
}

// Deterministic pseudo-random numbers so the property tests never flake.
function generator(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map(
      (rest) => [item, ...rest],
    ),
  );
}

// Textbook definition, independent of the implementation: the average over
// all feature orderings of each feature's marginal contribution.
function shapleyByPermutations(
  model: (features: Features) => number,
  instance: Features,
  background: readonly Features[],
  names: readonly string[],
): number[] {
  const worth = (present: ReadonlySet<string>): number =>
    background.reduce(
      (sum, row) =>
        sum +
        model(
          Object.fromEntries(
            names.map((name) => [
              name,
              (present.has(name) ? instance[name] : row[name]) ?? 0,
            ]),
          ),
        ),
      0,
    ) / background.length;
  const orders = permutations(names);
  const totals = names.map(() => 0);
  for (const order of orders) {
    const present = new Set<string>();
    for (const name of order) {
      const before = worth(present);
      present.add(name);
      const index = names.indexOf(name);
      totals[index] = (totals[index] ?? 0) + worth(present) - before;
    }
  }
  return totals.map((total) => total / orders.length);
}

const names = ["a", "b", "c", "d"];
const nonlinear = (x: Features): number =>
  (x.a ?? 0) * (x.b ?? 0) +
  Math.sin(x.c ?? 0) * (x.a ?? 0) +
  (x.d ?? 0) ** 2 -
  3 * (x.b ?? 0);

function randomRow(next: () => number): Features {
  return Object.fromEntries(names.map((name) => [name, next() * 10 - 5]));
}

describe("exactShapley", () => {
  test("matches the permutation definition on random nonlinear cases", () => {
    const next = generator(42);
    for (let trial = 0; trial < 25; trial++) {
      const instance = randomRow(next);
      const background = Array.from({ length: 1 + (trial % 5) }, () =>
        randomRow(next),
      );
      const exact = exactShapley(nonlinear, instance, background, names);
      const reference = shapleyByPermutations(
        nonlinear,
        instance,
        background,
        names,
      );
      exact.attributions.forEach((attribution, index) => {
        close(
          attribution.contribution,
          reference[index] ?? NaN,
          attribution.feature,
        );
      });
    }
  });

  test("contributions add up to prediction minus baseline", () => {
    const next = generator(7);
    for (let trial = 0; trial < 25; trial++) {
      const instance = randomRow(next);
      const background = [randomRow(next), randomRow(next), randomRow(next)];
      const { baseline, prediction, attributions } = exactShapley(
        nonlinear,
        instance,
        background,
        names,
      );
      close(prediction, nonlinear(instance), "prediction");
      close(
        baseline,
        background.reduce((sum, row) => sum + nonlinear(row), 0) / 3,
        "baseline",
      );
      close(
        attributions.reduce((sum, a) => sum + a.contribution, 0),
        prediction - baseline,
        "efficiency",
      );
    }
  });

  test("a linear model gets weight times distance from the background mean", () => {
    const weights: Record<string, number> = { a: 2, b: -3, c: 0.5, d: 7 };
    const linear = (x: Features) =>
      names.reduce(
        (sum, name) => sum + (weights[name] ?? 0) * (x[name] ?? 0),
        0,
      );
    const instance = { a: 1, b: 4, c: -2, d: 3 };
    const background = [
      { a: 0, b: 0, c: 0, d: 0 },
      { a: 2, b: 2, c: 2, d: 1 },
    ];
    const result = exactShapley(linear, instance, background, names);
    for (const { feature, contribution } of result.attributions) {
      const mean =
        background.reduce(
          (sum, row) => sum + row[feature as keyof typeof row],
          0,
        ) / background.length;
      close(
        contribution,
        (weights[feature] ?? 0) *
          (instance[feature as keyof typeof instance] - mean),
        feature,
      );
    }
  });

  test("a two-feature product has the closed-form split", () => {
    const product = (x: Features) => (x.a ?? 0) * (x.b ?? 0);
    const result = exactShapley(
      product,
      { a: 12, b: 3 },
      [{ a: 4, b: 2 }],
      ["a", "b"],
    );
    close(
      result.attributions[0]?.contribution ?? NaN,
      ((12 - 4) * (3 + 2)) / 2,
    );
    close(
      result.attributions[1]?.contribution ?? NaN,
      ((3 - 2) * (12 + 4)) / 2,
    );
  });

  test("symmetric features with equal values get equal contributions", () => {
    const symmetric = (x: Features) =>
      (x.a ?? 0) * (x.b ?? 0) + (x.a ?? 0) + (x.b ?? 0);
    const result = exactShapley(
      symmetric,
      { a: 5, b: 5 },
      [{ a: 1, b: 1 }],
      ["a", "b"],
    );
    close(
      result.attributions[0]?.contribution ?? NaN,
      result.attributions[1]?.contribution ?? NaN,
    );
  });

  test("a feature the model ignores contributes nothing", () => {
    const ignoresB = (x: Features) => (x.a ?? 0) ** 3;
    const result = exactShapley(
      ignoresB,
      { a: 2, b: 99 },
      [{ a: 1, b: -5 }],
      ["a", "b"],
    );
    assert.equal(result.attributions[1]?.contribution, 0);
  });

  test("an instance equal to its only background row is explained by nothing", () => {
    const row = { a: 1, b: 2, c: 3, d: 4 };
    const result = exactShapley(nonlinear, row, [row], names);
    close(result.baseline, result.prediction);
    for (const { contribution } of result.attributions) close(contribution, 0);
  });

  test("returns attributions in the requested order with the instance values", () => {
    const result = exactShapley(
      nonlinear,
      { a: 1, b: 2, c: 3, d: 4 },
      [{ a: 0, b: 0, c: 0, d: 0 }],
      ["d", "a", "c", "b"],
    );
    assert.deepEqual(
      result.attributions.map(({ feature, value }) => [feature, value]),
      [
        ["d", 4],
        ["a", 1],
        ["c", 3],
        ["b", 2],
      ],
    );
  });

  test("rejects invalid inputs", () => {
    const model = () => 0;
    const one = { a: 1 };
    assert.throws(() => exactShapley(model, one, [one], []), RangeError);
    assert.throws(() => exactShapley(model, one, [], ["a"]), RangeError);
    assert.throws(() => exactShapley(model, {}, [one], ["a"]), RangeError);
    assert.throws(
      () => exactShapley(model, { a: NaN }, [one], ["a"]),
      RangeError,
    );
    assert.throws(
      () => exactShapley(model, one, [{ a: Infinity }], ["a"]),
      RangeError,
    );
    const many = Array.from(
      { length: MAX_EXACT_FEATURES + 1 },
      (_, i) => `f${String(i)}`,
    );
    const wide = Object.fromEntries(many.map((name) => [name, 1]));
    assert.throws(() => exactShapley(model, wide, [wide], many), RangeError);
  });
});
