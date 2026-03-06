import { QueryClient } from "@tanstack/react-query"

/**
 * Global QueryClient instance for TanStack Query.
 * Configured with sensible defaults for the app.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't refetch on window focus by default (can be noisy)
      refetchOnWindowFocus: false,
      // Retry failed queries up to 2 times
      retry: 2,
      // Consider data stale after 30 seconds
      staleTime: 30_000,
    },
    mutations: {
      // Retry mutations once on failure
      retry: 1,
    },
  },
})
