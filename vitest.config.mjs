import { defineConfig } from "vitest/config"
import { loadEnv } from "vite"
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ mode }) => {
  // Load env from root and web directories
  const rootEnv = loadEnv(mode, __dirname, "")
  const webEnv = loadEnv(mode, path.join(__dirname, "web"), "")
  const env = { ...webEnv, ...rootEnv }

  // Resolve VITE_API_URL - require either VITE_API_URL or VITE_SERVER_PORT
  const resolveApiUrl = () => {
    if (env.VITE_API_URL) {
      if (env.VITE_API_URL.startsWith("/") && env.VITE_SERVER_PORT) {
        return `http://127.0.0.1:${env.VITE_SERVER_PORT}${env.VITE_API_URL}`
      }
      return env.VITE_API_URL
    }
    if (env.VITE_SERVER_PORT) return `http://127.0.0.1:${env.VITE_SERVER_PORT}/api`
    throw new Error("VITE_API_URL or VITE_SERVER_PORT environment variable is required")
  }

  return {
    plugins: [vanillaExtractPlugin()],
    define: {
      "import.meta.env.VITE_API_URL": JSON.stringify(resolveApiUrl()),
    },
    test: {
      environment: "jsdom",
      // Engine v2 integration tests have their own setup in engine/tests/v2/setup.ts
      setupFiles: ["./engine/tests/v2/setup.ts"],
      globals: true,
      exclude: ["node_modules/**/*", "web/tests/playwright/**/*"],
    },
    optimizeDeps: {
      exclude: ["@vitest/web-worker"],
    },
  }
})
