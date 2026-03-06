import js from "@eslint/js"
import globals from "globals"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import tseslint from "@typescript-eslint/eslint-plugin"
import tsParser from "@typescript-eslint/parser"
import react from "eslint-plugin-react"
import prettierConfig from "eslint-config-prettier"

export default [
  {
    ignores: [
      "dist",
      "node_modules",
      "engine/dist",
      "client/dist",
      "client/storybook-static",
      ".yarn",
      "server",
      "emails",
      "website/.astro",
      "client/test/setup.ts",
      "client/playwright.config.ts",
      "Inspiration",
      "plugins/docs/protobuf/docs.d.ts",
      "plugins/docs/protobuf/docs.js",
      "desktop/src-tauri/target",
      ".tools",
      "infra/aws-report",
      ".gocache",
      ".gomodcache",
      ".cache",
      "website/dist",
      "admin/dist",
      "web/dist",
      "legacy",
      "protobufs",
      "engine/protobufs",
      "docs/The Book of Shape/.obsidian", // Obsidian plugin folder with third-party code
      "web/protobufs/generated", // Auto-generated protobuf files
    ],
  },
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        ecmaFeatures: { jsx: true },
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      react: react,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tseslint.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...prettierConfig.rules,
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/rules-of-hooks": "error",
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
    settings: {
      react: {
        version: "detect",
      },
    },
  },
  // TypeScript-specific overrides: disable JS rules that don't understand TS semantics
  // See: https://typescript-eslint.io/troubleshooting/faqs#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      // TypeScript handles undefined variable checking better than eslint
      "no-undef": "off",
      // TypeScript understands function overloads; use @typescript-eslint/no-redeclare if needed
      "no-redeclare": "off",
    },
  },
  // Type-aware rules for TypeScript files in src directory
  {
    files: ["client/**/*.{ts,tsx}", "engine/**/*.{ts,tsx}", "plugins/**/*.{ts,tsx}", "admin/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        projectService: true,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      ...prettierConfig.rules,
      "@typescript-eslint/no-floating-promises": "error",
    },
  },
]
