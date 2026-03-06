import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { RouterProvider } from "react-router-dom"
import "./styles/global.css"
// Tiptap UI component styles (CSS custom properties and keyframe animations)
import "./styles/_variables.scss"
import "./styles/_keyframe-animations.scss"
import "./styles/_bubble-menu.scss"
import { router } from "./router/router"
import { AppProvider } from "./providers/AppProvider"

/**
 * Application entry point.
 *
 * Provider hierarchy:
 * 1. StrictMode - React development checks
 * 2. AppProvider - QueryClient + Engine/Auth/Workspace initialization
 * 3. RouterProvider - React Router with route definitions
 */
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProvider>
      <RouterProvider router={router} />
    </AppProvider>
  </StrictMode>
)
