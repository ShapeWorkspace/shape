import { useEffect, useState } from "react"

interface ReachabilityState {
  isOnline: boolean
}

/**
 * Tracks browser reachability using window online/offline events.
 * Returns a stable boolean to drive offline-first UI and retry behavior.
 */
export function useReachability(): ReachabilityState {
  const [isOnline, setIsOnline] = useState(() => {
    if (typeof navigator === "undefined") {
      return true
    }
    return navigator.onLine !== false
  })

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  return { isOnline }
}
