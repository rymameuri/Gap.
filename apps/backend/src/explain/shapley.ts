/** Numeric feature values of one instance, keyed by feature name. */
export type Features = Readonly<Record<string, number>>;

export interface Attribution {
  readonly feature: string;
  /** The instance's value of the feature. */
  readonly value: number;
  /** Shapley value: the feature's share of prediction minus baseline. */
  readonly contribution: number;
}

export interface Explanation {
  /** Mean model output over the background instances. */
  readonly baseline: number;
  /** Model output for the explained instance. */
  readonly prediction: number;
  /** One per feature, in the order given. They sum to prediction - baseline. */
  readonly attributions: readonly Attribution[];
}

// 2^n coalitions are evaluated per background instance.
export const MAX_EXACT_FEATURES = 12;

function factorial(n: number): number {
  let result = 1;
  for (let k = 2; k <= n; k++) result *= k;
  return result;
}

function featureValue(features: Features, name: string): number {
  const value = features[name];
  if (value === undefined || !Number.isFinite(value))
    throw new RangeError(`Feature ${name} must be a finite number`);
  return value;
}

/**
 * Exact interventional Shapley values (SHAP with a background set) for a
 * model over a few numeric features. Features outside a coalition take each
 * background instance's value in turn, and the coalition's worth is the mean
 * model output. Every coalition is enumerated, so the result is exact and
 * deterministic; efficiency, symmetry and the dummy property hold exactly up
 * to floating-point rounding.
 * @throws RangeError for no features, too many features, an empty background
 * or a missing or non-finite feature value.
 */
export function exactShapley(
  model: (features: Features) => number,
  instance: Features,
  background: readonly Features[],
  featureNames: readonly string[],
): Explanation {
  const n = featureNames.length;
  if (n === 0 || n > MAX_EXACT_FEATURES)
    throw new RangeError(
      `Exact Shapley needs 1 to ${String(MAX_EXACT_FEATURES)} features`,
    );
  if (background.length === 0)
    throw new RangeError("Exact Shapley needs at least one background row");
  const own = featureNames.map((name) => featureValue(instance, name));
  const rows = background.map((row) =>
    featureNames.map((name) => featureValue(row, name)),
  );

  // worth[mask]: mean output when features in `mask` take the instance's value.
  const coalitions = 1 << n;
  const worth = new Float64Array(coalitions);
  for (let mask = 0; mask < coalitions; mask++) {
    let total = 0;
    for (const row of rows) {
      const mixed = Object.fromEntries(
        featureNames.map((name, index) => [
          name,
          mask & (1 << index) ? (own[index] ?? 0) : (row[index] ?? 0),
        ]),
      );
      total += model(mixed);
    }
    worth[mask] = total / rows.length;
  }

  const nFactorial = factorial(n);
  const weight = (size: number) =>
    (factorial(size) * factorial(n - size - 1)) / nFactorial;
  const attributions = featureNames.map((feature, index) => {
    const bit = 1 << index;
    let contribution = 0;
    for (let mask = 0; mask < coalitions; mask++) {
      if (mask & bit) continue;
      let size = 0;
      for (let rest = mask; rest; rest &= rest - 1) size++;
      contribution +=
        weight(size) * ((worth[mask | bit] ?? 0) - (worth[mask] ?? 0));
    }
    return { feature, value: own[index] ?? 0, contribution };
  });
  return {
    baseline: worth[0] ?? 0,
    prediction: worth[coalitions - 1] ?? 0,
    attributions,
  };
}
