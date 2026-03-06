import path from "path"
import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin"

export default defineConfig({
  plugins: [react(), vanillaExtractPlugin()],

  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname!, "."),
    },
  },

  test: {
    // Use jsdom for DOM simulation in component tests.
    environment: "jsdom",

    // Setup file runs before each test file - configures jest-dom matchers.
    setupFiles: ["./vitest.setup.ts"],

    // Include pattern for test files.
    include: ["**/*.test.{ts,tsx}"],

    // Enable global test APIs (describe, it, expect) without imports.
    globals: true,

    // CSS handling - don't process CSS modules in tests.
    css: false,
  },
})
