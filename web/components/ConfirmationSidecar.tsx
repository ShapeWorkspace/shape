import React, { useCallback } from "react"
import { Sidecar, SidecarSection, SidecarMenu, SidecarRow } from "./SidecarUI"
import { AlertTriangle } from "lucide-react"
import * as styles from "../styles/sidecar.css"

/**
 * Configuration for a confirmation option button.
 */
export interface ConfirmationOption {
  // Display label for the option
  label: string
  // Callback when this option is selected
  onSelect: () => void
  // Whether this is a destructive action (renders in red)
  isDestructive?: boolean
  // Optional icon to display
  icon?: React.ReactNode
  // Optional test ID
  testId?: string
}

/**
 * Props for the ConfirmationSidecar component.
 */
interface ConfirmationSidecarProps {
  // Title displayed at the top of the confirmation
  title: string
  // Descriptive message explaining what the user is confirming
  message: string
  // Array of options to present to the user
  options: ConfirmationOption[]
  // Optional icon to display (defaults to AlertTriangle)
  icon?: React.ReactNode
}

/**
 * ConfirmationSidecar is a reusable component for presenting confirmation dialogs
 * in the sidecar. It supports multiple options with destructive styling for
 * dangerous actions like delete.
 *
 * Usage:
 * ```tsx
 * pushSidecar(
 *   <ConfirmationSidecar
 *     title="Delete Task"
 *     message="Are you sure you want to delete this task? This action cannot be undone."
 *     options={[
 *       { label: 'Delete', onSelect: handleDelete, isDestructive: true },
 *       { label: 'Cancel', onSelect: () => popSidecar() },
 *     ]}
 *   />,
 *   'Confirm'
 * )
 * ```
 */
export function ConfirmationSidecar({ title, message, options, icon }: ConfirmationSidecarProps) {
  // Handle keyboard selection - maps index to option
  const handleSelect = useCallback(
    (index: number) => {
      const option = options[index]
      if (option) {
        option.onSelect()
      }
    },
    [options]
  )

  return (
    <Sidecar itemCount={options.length} onSelect={handleSelect}>
      <SidecarSection title={title}>
        <div className={styles.sidecarConfirmationContent}>
          <div className={styles.sidecarConfirmationIcon}>{icon || <AlertTriangle size={24} />}</div>
          <p className={styles.sidecarConfirmationMessage}>{message}</p>
        </div>
      </SidecarSection>

      <SidecarSection title="Options">
        <SidecarMenu>
          {options.map((option, index) => (
            <SidecarRow
              key={index}
              index={index}
              icon={option.icon}
              title={option.label}
              onClick={option.onSelect}
              testId={option.testId}
              isDestructive={option.isDestructive}
            />
          ))}
        </SidecarMenu>
      </SidecarSection>
    </Sidecar>
  )
}
