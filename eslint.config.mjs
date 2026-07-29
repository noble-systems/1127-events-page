import next from "eslint-config-next";
import nextTypescript from "eslint-config-next/typescript";

/**
 * Flat config. `eslint-config-next` brings the React, hooks, a11y and Next
 * rules; the TypeScript entry layers on type-aware linting.
 */
const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      ".data/**",
      "next-env.d.ts",
      "out/**",
      "build/**",
    ],
  },

  ...next,
  ...nextTypescript,

  {
    rules: {
      // Unused symbols are a real smell, but an intentional `_`-prefixed
      // placeholder (e.g. an unused route handler argument) is fine.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "none",
        },
      ],
    },
  },

  {
    // Tests deliberately poke at process.env and pass deliberately-wrong types.
    files: ["**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
];

export default config;
