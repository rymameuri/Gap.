import js from "@eslint/js";
import tseslint from "typescript-eslint";

// Scoped to backend code owned by the backend team. Frontend and agent
// modules have separate owners and are linted by their own tooling.
export default tseslint.config(
  {
    ignores: [
      "apps/frontend/**",
      "apps/backend/src/agents/**",
      "apps/backend/build/**",
      "dist/**",
      "node_modules/**",
    ],
  },
  {
    files: ["apps/backend/**/*.ts"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        project: "./apps/backend/tsconfig.test.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      eqeqeq: ["error", "always"],
      "no-console": "error",
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          message:
            "Read configuration through loadConfig (src/config.ts); only the entry point passes process.env to it.",
        },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/explicit-module-boundary-types": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
    },
  },
  {
    files: ["apps/backend/src/index.ts"],
    rules: { "no-restricted-properties": "off" },
  },
  {
    files: ["apps/backend/**/*.test.ts"],
    rules: {
      // Tests clear the agent provider variables that src/agents reads directly.
      "no-restricted-properties": "off",
      // node:test tracks the promises returned by describe/test itself.
      "@typescript-eslint/no-floating-promises": [
        "error",
        {
          allowForKnownSafeCalls: [
            {
              from: "package",
              package: "node:test",
              name: ["describe", "test", "it", "suite"],
            },
          ],
        },
      ],
    },
  },
);
