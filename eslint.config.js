import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import js from "@eslint/js";
import vitest from "@vitest/eslint-plugin";
import sonarjs from "eslint-plugin-sonarjs";
import globals from "globals";
import tseslint from "typescript-eslint";

const tsconfigRootDir = dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
  {
    ignores: [
      ".cache/**",
      "artifacts/**",
      "coverage/**",
      "**/dist/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**"
    ]
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: "error",
      reportUnusedInlineConfigs: "error"
    }
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        project: [
          "./tsconfig.json",
          "./config/test/tsconfig.test.json",
          "./packages/*/tsconfig.json"
        ],
        tsconfigRootDir
      }
    },
    plugins: { sonarjs },
    rules: {
      "@typescript-eslint/ban-ts-comment": "error",
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/no-deprecated": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/no-unnecessary-condition": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/prefer-readonly": "error",
      "@typescript-eslint/strict-boolean-expressions": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "max-depth": ["error", 4],
      "max-lines": ["error", { max: 500, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": [
        "error",
        { IIFEs: true, max: 90, skipBlankLines: true, skipComments: true }
      ],
      "max-params": ["error", 4],
      "max-statements": ["error", 40],
      "no-console": ["error", { allow: ["error", "warn"] }],
      "no-debugger": "error",
      "sonarjs/cognitive-complexity": ["error", 15],
      "sonarjs/no-collapsible-if": "error",
      "sonarjs/no-commented-code": "error",
      "sonarjs/no-duplicate-string": ["error", { threshold: 5 }],
      "sonarjs/no-duplicated-branches": "error",
      "sonarjs/no-identical-conditions": "error",
      "sonarjs/no-identical-functions": "error",
      "sonarjs/no-nested-conditional": "error"
    }
  },
  {
    files: ["packages/web/**/*.ts", "tests/e2e/**/*.ts"],
    languageOptions: { globals: globals.browser }
  },
  {
    files: ["**/*.test.ts", "**/*.spec.ts"],
    plugins: { vitest },
    rules: {
      ...vitest.configs.recommended.rules,
      "max-lines-per-function": [
        "error",
        { IIFEs: true, max: 220, skipBlankLines: true, skipComments: true }
      ],
      "max-statements": ["error", 80],
      "sonarjs/no-duplicate-string": "off",
      "vitest/no-conditional-in-test": "error",
      "vitest/no-conditional-tests": "error",
      "vitest/no-disabled-tests": "error"
    }
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      ecmaVersion: "latest",
      globals: globals.node,
      sourceType: "module"
    }
  }
);
