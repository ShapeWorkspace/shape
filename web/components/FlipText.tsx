import { useEffect, useState, useRef } from "react"

interface FlipTextProps {
  text: string
  // Duration of the slide animation in milliseconds
  duration?: number
}

/**
 * FlipText animates text changes with a slide-up transition.
 * Old text slides up and out, new text slides up from below.
 */
export function FlipText({ text, duration = 120 }: FlipTextProps) {
  const [displayText, setDisplayText] = useState(text)
  const [animationState, setAnimationState] = useState<"idle" | "exiting" | "entering">("idle")
  const previousTextRef = useRef(text)

  useEffect(() => {
    if (text !== previousTextRef.current) {
      // Start exit animation (slide up and out)
      setAnimationState("exiting")

      // Swap text and start enter animation
      const swapTimer = setTimeout(() => {
        setDisplayText(text)
        setAnimationState("entering")
        previousTextRef.current = text
      }, duration)

      // Return to idle
      const endTimer = setTimeout(() => {
        setAnimationState("idle")
      }, duration * 2)

      return () => {
        clearTimeout(swapTimer)
        clearTimeout(endTimer)
      }
    }
  }, [text, duration])

  const getTransform = () => {
    switch (animationState) {
      case "exiting":
        return "translateY(-100%)"
      case "entering":
        return "translateY(0)"
      default:
        return "translateY(0)"
    }
  }

  const getInitialTransform = () => {
    // When entering, start from below
    if (animationState === "entering") {
      return "translateY(50%)"
    }
    return undefined
  }

  return (
    <span
      style={{
        display: "inline-block",
        overflow: "hidden",
        verticalAlign: "bottom",
      }}
    >
      <span
        ref={node => {
          // Set initial position for entering animation
          if (node && animationState === "entering") {
            const initial = getInitialTransform()
            if (initial && node.style.transform !== getTransform()) {
              node.style.transition = "none"
              node.style.transform = initial
              // Force reflow
              void node.offsetHeight
              node.style.transition = `transform ${duration}ms ease-out`
              node.style.transform = getTransform()
            }
          }
        }}
        style={{
          display: "inline-block",
          transition: animationState === "exiting" ? `transform ${duration}ms ease-in` : undefined,
          transform: animationState === "exiting" ? getTransform() : undefined,
        }}
      >
        {displayText}
      </span>
    </span>
  )
}
