import React, { ReactNode, useCallback, useEffect, useMemo } from "react"
import { createPortal } from "react-dom"
import * as modalStyles from "./Modal.css"
import Button from "./Button"

type AlertTone = "danger" | "info" | "caution" | "default" | "success"

export interface AlertDialogAction {
  label: string
  onSelect?: () => void | Promise<void>
  tone?: AlertTone
  variant?: "norm" | "weak" | "danger"
  kind?: "solid" | "outline" | "ghost"
  isDefault?: boolean
  disabled?: boolean
  dismissOnSelect?: boolean
  dataTestId?: string
}

export interface AlertDialogProps {
  isOpen?: boolean
  onClose: () => void
  title?: string
  body: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  onConfirm?: () => void | Promise<void>
  onCancel?: () => void
  confirmTone?: AlertTone
  disableEscapeClose?: boolean
  disableOverlayClose?: boolean
  hasCancelButton?: boolean
  actions?: AlertDialogAction[]
}

const mapToneToButtonProps = (
  tone?: AlertTone
): { variant: "norm" | "weak" | "danger"; kind: "solid" | "outline" | "ghost" } => {
  switch (tone) {
    case "danger":
      return { variant: "danger", kind: "solid" }
    case "caution":
      return { variant: "weak", kind: "solid" }
    case "info":
    case "success":
    case "default":
    default:
      return { variant: "norm", kind: "solid" }
  }
}

export const AlertDialog: React.FC<AlertDialogProps> = ({
  isOpen = true,
  onClose,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  confirmTone = "default",
  disableEscapeClose = true,
  disableOverlayClose = true,
  hasCancelButton = true,
  actions,
}) => {
  useEffect(() => {
    if (!isOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previous
    }
  }, [isOpen])

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!disableOverlayClose && e.target === e.currentTarget) {
        onCancel?.()
        onClose()
      }
    },
    [disableOverlayClose, onCancel, onClose]
  )

  // Identify the preferred action so Enter keypress mirrors the visible default button.
  const defaultAction = useMemo(() => {
    if (!actions || actions.length === 0) {
      return undefined
    }
    const preferred = actions.find(action => action.isDefault && !action.disabled)
    if (preferred) {
      return preferred
    }
    return actions.find(action => !action.disabled)
  }, [actions])

  // Shared click handler so button wiring stays consistent across synchronous and async handlers.
  const runAction = useCallback(
    (action: AlertDialogAction | undefined) => {
      if (!action || action.disabled) {
        return
      }

      const result = action.onSelect?.()
      if (result && typeof (result as Promise<unknown>).then === "function") {
        ;(result as Promise<unknown>)
          .then(() => {
            if (action.dismissOnSelect !== false) {
              onClose()
            }
          })
          .catch(() => {})
        return
      }

      if (action.dismissOnSelect !== false) {
        onClose()
      }
    },
    [onClose]
  )

  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !disableEscapeClose) {
        onCancel?.()
        onClose()
      }
      if (e.key === "Enter") {
        if (actions && actions.length > 0) {
          runAction(defaultAction)
          return
        }

        if (onConfirm) {
          Promise.resolve(onConfirm())
            .then(() => onClose())
            .catch(() => {})
        } else {
          onClose()
        }
      }
    }
    document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [actions, defaultAction, disableEscapeClose, isOpen, onCancel, onClose, onConfirm, runAction])

  if (!isOpen) return null

  return createPortal(
    <div
      className={modalStyles.modalOverlay}
      onClick={handleOverlayClick}
      role="presentation"
      data-testid="alert-dialog-overlay"
    >
      <div
        className={`${modalStyles.modalContainer} ${modalStyles.small}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={title ? "alert-dialog-title" : undefined}
        data-testid="alert-dialog"
      >
        {title && (
          <div className={`${modalStyles.modalHeader} ${modalStyles.modalHeaderCentered}`}>
            <h2 id="alert-dialog-title" className={modalStyles.modalTitle}>
              {title}
            </h2>
          </div>
        )}
        <div className={modalStyles.modalContent}>{typeof body === "string" ? <p>{body}</p> : body}</div>
        <div className={modalStyles.modalFooter}>
          {actions && actions.length > 0 ? (
            actions.map((action, index) => {
              const toneProps =
                action.variant && action.kind
                  ? { variant: action.variant, kind: action.kind }
                  : mapToneToButtonProps(action.tone)
              return (
                <Button
                  key={action.dataTestId ?? `${action.label}-${index}`}
                  variant={toneProps.variant}
                  kind={toneProps.kind}
                  onClick={() => runAction(action)}
                  disabled={action.disabled}
                  data-testid={action.dataTestId}
                >
                  {action.label}
                </Button>
              )
            })
          ) : (
            <>
              {hasCancelButton && (
                <Button
                  onClick={() => {
                    onCancel?.()
                    onClose()
                  }}
                  data-testid="alert-cancel"
                >
                  {cancelLabel ?? "Cancel"}
                </Button>
              )}
              <Button
                {...mapToneToButtonProps(confirmTone)}
                onClick={() => {
                  if (onConfirm) {
                    Promise.resolve(onConfirm())
                      .then(() => onClose())
                      .catch(() => {})
                  } else {
                    onClose()
                  }
                }}
                data-testid="alert-confirm"
              >
                {confirmLabel}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

export default AlertDialog
