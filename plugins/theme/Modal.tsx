import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
  useImperativeHandle,
  forwardRef,
  ReactNode,
} from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import * as styles from "./Modal.css"

export interface ModalRef {
  animatedClose: () => void
}

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  titleIcon?: ReactNode
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
  className?: string
  contentClassName?: string
  disableEscapeClose?: boolean
  disableOverlayClose?: boolean
  width?: "small" | "medium" | "large" | "xlarge" | "xxlarge" | "fluid"
  headingTestId?: string
  showHeaderDivider?: boolean
}

export const Modal = forwardRef<ModalRef, ModalProps>(
  (
    {
      isOpen,
      onClose,
      title,
      titleIcon,
      subtitle,
      children,
      footer,
      className,
      contentClassName,
      disableEscapeClose = false,
      disableOverlayClose = false,
      width = "medium",
      headingTestId,
      showHeaderDivider = false,
    },
    ref
  ) => {
    const modalRef = useRef<HTMLDivElement>(null)
    const [isClosing, setIsClosing] = useState(false)
    const [isOpening, setIsOpening] = useState(false)
    const prevIsOpenRef = useRef(isOpen)
    const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const handleClose = useCallback(
      (
        event?:
          | React.MouseEvent<HTMLButtonElement>
          | React.KeyboardEvent<HTMLButtonElement>
          | React.MouseEvent<HTMLDivElement>
          | KeyboardEvent
      ) => {
        event?.stopPropagation()
        if (isClosing) {
          return
        }

        setIsOpening(false)
        setIsClosing(true)

        if (closeTimerRef.current) {
          clearTimeout(closeTimerRef.current)
          closeTimerRef.current = null
        }

        closeTimerRef.current = setTimeout(() => {
          setIsClosing(false)
          onClose()
          closeTimerRef.current = null
        }, 150)
      },
      [onClose, isClosing]
    )

    useImperativeHandle(
      ref,
      () => ({
        animatedClose: handleClose,
      }),
      [handleClose]
    )

    useLayoutEffect(() => {
      const wasOpen = prevIsOpenRef.current
      prevIsOpenRef.current = isOpen

      if (isOpen && !wasOpen) {
        setIsClosing(false)
        setIsOpening(true)
      }
    }, [isOpen])

    useEffect(() => {
      if (isOpening) {
        const timer = setTimeout(() => {
          setIsOpening(false)
        }, 150)

        return () => clearTimeout(timer)
      }
    }, [isOpening])

    useEffect(() => {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === "Escape" && !disableEscapeClose && !isClosing && !isOpening) {
          handleClose(e)
        }
      }

      if (isOpen) {
        document.addEventListener("keydown", handleEscape)
        return () => document.removeEventListener("keydown", handleEscape)
      }
    }, [isOpen, disableEscapeClose, isClosing, isOpening, handleClose])

    const handleOverlayClick = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (!disableOverlayClose && e.target === e.currentTarget && !isClosing && !isOpening) {
          handleClose(e)
        }
      },
      [disableOverlayClose, isClosing, isOpening, handleClose]
    )

    useEffect(() => {
      if (isOpen || isClosing) {
        document.body.style.overflow = "hidden"
        return () => {
          document.body.style.overflow = ""
        }
      }
    }, [isOpen, isClosing])

    useEffect(() => {
      // Ensure we do not attempt state updates after the component unmounts.
      return () => {
        if (closeTimerRef.current) {
          clearTimeout(closeTimerRef.current)
          closeTimerRef.current = null
        }
      }
    }, [])

    if (!isOpen && !isClosing) return null

    const getOverlayClasses = () => {
      let classes = styles.modalOverlay
      if (isClosing) {
        classes += ` ${styles.modalOverlayClosing}`
      } else if (isOpening) {
        classes += ` ${styles.modalOverlayOpening}`
      }
      if (className) {
        classes += ` ${className}`
      }
      return classes
    }

    const getContainerClasses = () => {
      let classes = `${styles.modalContainer} ${styles[width]}`
      if (isClosing) {
        classes += ` ${styles.modalContainerClosing}`
      } else if (isOpening) {
        classes += ` ${styles.modalContainerOpening}`
      }
      return classes
    }

    return createPortal(
      <div className={getOverlayClasses()} onClick={handleOverlayClick}>
        <div ref={modalRef} className={getContainerClasses()} onClick={e => e.stopPropagation()}>
          <div className={`${styles.modalHeader} ${!subtitle ? styles.modalHeaderCentered : ""}`}>
            <div className={styles.modalTitleContainer}>
              <div className={styles.modalTitleRow}>
                {titleIcon && <div className={styles.modalTitleIcon}>{titleIcon}</div>}
                <h2
                  className={styles.modalTitle}
                  data-testid={headingTestId ?? `${title.toLowerCase().replace(/\s+/g, "-")}-heading`}
                >
                  {title}
                </h2>
              </div>
              {subtitle && <p className={styles.modalSubtitle}>{subtitle}</p>}
            </div>
            <button
              className={styles.closeButton}
              onClick={handleClose}
              aria-label="Close"
              data-testid="modal-close"
            >
              <X size={16} />
            </button>
          </div>

          {showHeaderDivider && <div className={styles.headerDivider} />}

          <div className={`${styles.modalContent} ${contentClassName || ""}`}>{children}</div>

          {footer && <div className={styles.modalFooter}>{footer}</div>}
        </div>
      </div>,
      document.body
    )
  }
)

Modal.displayName = "Modal"

export default Modal
