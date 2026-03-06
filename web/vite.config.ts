import path from "path"
import { defineConfig, loadEnv } from "vite"
import react from "@vitejs/plugin-react"
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin"

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const envDirectoryPath = path.resolve(import.meta.dirname, ".")

  // Load env files from the web package directory, not the monorepo root.
  // This keeps mobile-specific config (like .env.mobile) working under Yarn workspaces.
  // Command-line env vars (process.env) take precedence over file-based env vars.
  const fileEnv = loadEnv(mode, envDirectoryPath, "")
  const env = { ...fileEnv, ...process.env }

  return {
    // Base URLs now stay root-relative in production because the app runs on app.shape.work.
    // Allow overrides via VITE_BASE_URL for bespoke deployments, but fall back to "/" otherwise.
    base: env.VITE_BASE_URL || "/",

    // Ensure Vite reads env files from the web package directory.
    envDir: envDirectoryPath,

    plugins: [react(), vanillaExtractPlugin()],

    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname!, "."),
      },
    },

    esbuild: {
      logOverride: {
        "css-syntax-error": "silent" as const,
        "js-comment-in-css": "silent" as const,
      },
    },

    // Server config only applies during development (yarn dev), not production builds
    ...(mode !== "production" && {
      server: {
        watch: {
          ignored: ["**/.tools/**"],
        },
        allowedHosts: "true" as unknown as string[],
        host: true,
        // strictPort ensures Vite fails if the assigned port is unavailable,
        // rather than silently picking another port (which breaks worktree isolation).
        strictPort: true,
        port: env.VITE_CLIENT_PORT
          ? parseInt(env.VITE_CLIENT_PORT, 10)
          : mode === "mobile"
            ? 5173
            : (() => {
                throw new Error("VITE_CLIENT_PORT environment variable is required")
              })(),
        proxy: (() => {
          // Mobile mode: check VITE_API_URL first
          if (mode === "mobile" && env.VITE_API_URL) {
            const isLocalUrl = /^https?:\/\/(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/i.test(
              env.VITE_API_URL
            )
            if (isLocalUrl) {
              // Extract base URL (remove /api suffix) for proxy target
              const proxyTarget = env.VITE_API_URL.replace(/\/api\/?$/, "")
              console.log("[vite.config] Mobile mode: proxying /api to", proxyTarget)
              return {
                "/api": {
                  target: proxyTarget,
                  changeOrigin: true,
                  // Allow self-signed certs for local HTTPS dev
                  secure: false,
                },
              }
            }
            // Production URL: no proxy needed
            console.log("[vite.config] Mobile mode: no proxy (production URL)")
            return {}
          }

          // Desktop dev: use VITE_SERVER_PORT (supports HTTPS via VITE_SERVER_HTTPS=true)
          if (env.VITE_SERVER_PORT) {
            const protocol = env.VITE_SERVER_HTTPS === "true" ? "https" : "http"
            const target = `${protocol}://localhost:${env.VITE_SERVER_PORT}`
            console.log("[vite.config] Desktop mode: proxying /api to", target)
            return {
              "/api": {
                target,
                changeOrigin: true,
                secure: false,
              },
            }
          }

          // Mobile without VITE_API_URL: no proxy
          if (mode === "mobile") {
            return {}
          }

          throw new Error("VITE_SERVER_PORT environment variable is required")
        })(),
      },
    }),

    optimizeDeps: {
      include: [
        // ProseMirror core
        "prosemirror-model",
        "prosemirror-state",
        "prosemirror-view",
        "prosemirror-commands",
        "prosemirror-history",
        "prosemirror-keymap",
        "prosemirror-inputrules",
        "prosemirror-schema-basic",
        "prosemirror-schema-list",
        // UI libs
        "lucide-react",
      ],
    },

    build: {
      outDir: "dist",
      emptyOutDir: true,
    },

    // Expose specific env vars to process.env for engine code that can't use import.meta.env
    define: {
      "process.env.VITE_INVITE_LINK_BASE_URL": JSON.stringify(env.VITE_INVITE_LINK_BASE_URL),
    },
  }
})
