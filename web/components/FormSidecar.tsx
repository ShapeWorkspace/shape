import React, { useState, useCallback, useRef, useEffect, useMemo } from "react"
import { Sidecar, SidecarSection } from "./SidecarUI"
import * as styles from "../styles/sidecar.css"

/**
 * Configuration for a single form field.
 */
export interface FormFieldConfig {
  // Unique identifier for the field, used as key in the values object
  name: string
  // Field type determines rendering
  type: "text" | "password" | "textarea" | "select" | "checkbox" | "radio"
  // Display label shown above the field
  label: string
  // Placeholder text for text/textarea inputs
  placeholder?: string
  // Whether the field is required (enables built-in empty validation)
  required?: boolean
  // Initial value - string for text/textarea/select/radio, boolean for checkbox
  defaultValue?: string | boolean
  // Options for select/radio field types
  options?: Array<{ value: string; label: string }>
  // Custom validator function - receives current value, returns error message or null if valid
  validator?: (value: string | boolean) => string | null
  // Optional test ID for e2e testing
  testId?: string
  // Whether the field should autofocus (defaults to first field)
  autoFocus?: boolean
}

/**
 * Ref handle for member selection field integration.
 * Components that implement this interface can receive focus via ArrowDown from form fields.
 */
export interface MemberSelectionRefHandle {
  focusFirstAvailable: () => void
}

/**
 * Props for the FormSidecar component.
 */
export interface FormSidecarProps {
  // Title displayed at the top of the form
  title: string
  // Array of field configurations
  fields: FormFieldConfig[]
  // Callback when form is submitted with all values. Can be async.
  onSubmit: (values: Record<string, string | boolean>) => void | Promise<void>
  // Callback when user cancels the form
  onCancel: () => void
  // Label for the submit button (defaults to "Submit")
  submitLabel?: string
  // Label for the cancel button (defaults to "Cancel")
  cancelLabel?: string
  // Whether the form is currently submitting (disables inputs and shows loading state)
  isPending?: boolean
  // Optional description shown below title
  description?: string
  // Optional form-level error message (displayed above fields)
  errorMessage?: string | null
  // Optional custom content rendered below the standard fields (e.g., member selection)
  children?: React.ReactNode
  // Optional ref for member selection field, enables ArrowDown navigation from form fields
  memberSelectionRef?: React.RefObject<MemberSelectionRefHandle | null>
}

/**
 * FormSidecar is a generic, reusable form component for the sidecar.
 * Supports multiple field types with validation.
 *
 * Usage:
 * ```tsx
 * pushSidecar(
 *   <FormSidecar
 *     title="Create Channel"
 *     fields={[
 *       { name: 'name', type: 'text', label: 'Name', required: true, placeholder: 'Channel name...' },
 *       { name: 'description', type: 'textarea', label: 'Description', placeholder: 'Optional...' },
 *     ]}
 *     onSubmit={(values) => createChannel(values.name, values.description)}
 *     onCancel={() => popSidecar()}
 *     submitLabel="Create"
 *   />,
 *   'New Channel'
 * )
 * ```
 */
export function FormSidecar({
  title,
  fields,
  onSubmit,
  onCancel,
  submitLabel = "Submit",
  cancelLabel = "Cancel",
  isPending = false,
  description,
  errorMessage,
  children,
  memberSelectionRef,
}: FormSidecarProps) {
  // Initialize values from field defaults
  const initialValues = useMemo(() => {
    const values: Record<string, string | boolean> = {}
    fields.forEach(field => {
      if (field.defaultValue !== undefined) {
        values[field.name] = field.defaultValue
      } else if (field.type === "checkbox") {
        values[field.name] = false
      } else {
        values[field.name] = ""
      }
    })
    return values
  }, [fields])

  const [values, setValues] = useState<Record<string, string | boolean>>(initialValues)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  // Track submission state internally to avoid dependency issues with parent callbacks
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Ref for the first focusable input
  const firstInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null)

  // Focus first input on mount
  useEffect(() => {
    // Small delay to ensure DOM is ready
    const timer = setTimeout(() => {
      firstInputRef.current?.focus()
      // Select text if it's a text input with a default value
      if (firstInputRef.current instanceof HTMLInputElement && firstInputRef.current.value) {
        firstInputRef.current.select()
      }
    }, 50)
    return () => clearTimeout(timer)
  }, [])

  // Update a single field value
  const handleValueChange = useCallback((fieldName: string, value: string | boolean) => {
    setValues(prev => ({ ...prev, [fieldName]: value }))
    // Clear error when user starts typing
    setErrors(prev => {
      const next = { ...prev }
      delete next[fieldName]
      return next
    })
  }, [])

  // Mark field as touched (for showing validation errors)
  const handleFieldBlur = useCallback((fieldName: string) => {
    setTouched(prev => ({ ...prev, [fieldName]: true }))
  }, [])

  // Validate a single field
  const validateField = useCallback((field: FormFieldConfig, value: string | boolean): string | null => {
    // Check required first
    if (field.required) {
      if (typeof value === "string" && !value.trim()) {
        return `${field.label} is required`
      }
      if (typeof value === "boolean" && !value && field.type === "checkbox") {
        // Checkboxes: required means must be checked
        return `${field.label} must be checked`
      }
    }
    // Run custom validator
    if (field.validator) {
      return field.validator(value)
    }
    return null
  }, [])

  // Validate all fields and return whether form is valid
  const validateAllFields = useCallback((): boolean => {
    const newErrors: Record<string, string> = {}
    let isValid = true

    fields.forEach(field => {
      const value = values[field.name]
      const error = validateField(field, value ?? "")
      if (error) {
        newErrors[field.name] = error
        isValid = false
      }
    })

    setErrors(newErrors)
    // Mark all fields as touched so errors show
    const allTouched: Record<string, boolean> = {}
    fields.forEach(field => {
      allTouched[field.name] = true
    })
    setTouched(allTouched)

    return isValid
  }, [fields, values, validateField])

  // Combine external isPending with internal isSubmitting
  const isCurrentlyPending = isPending || isSubmitting

  // Handle form submission
  const handleSubmit = useCallback(async () => {
    if (isCurrentlyPending) return

    if (!validateAllFields()) {
      return
    }

    setIsSubmitting(true)
    try {
      await onSubmit(values)
    } finally {
      setIsSubmitting(false)
    }
  }, [isCurrentlyPending, validateAllFields, onSubmit, values])

  // Handle keyboard events at the form level
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onCancel()
      } else if (e.key === "Enter" && !e.shiftKey) {
        // Only submit on Enter if not in a textarea and not on a button (e.g., member selection items)
        const target = e.target as HTMLElement
        if (target.tagName !== "TEXTAREA" && target.tagName !== "BUTTON") {
          e.preventDefault()
          handleSubmit()
        }
        // Let buttons handle Enter natively (adds member when focused on available item)
      } else if (e.key === "ArrowDown" && memberSelectionRef?.current) {
        // ArrowDown from a form input navigates to the member selection field
        const target = e.target as HTMLElement
        if (target.tagName === "INPUT" || target.tagName === "SELECT") {
          e.preventDefault()
          memberSelectionRef.current.focusFirstAvailable()
        }
      }
    },
    [onCancel, handleSubmit, memberSelectionRef]
  )

  // Check if submit should be disabled (any required field empty, or pending)
  const isSubmitDisabled = useMemo(() => {
    if (isCurrentlyPending) return true
    // Check required fields have values
    return fields.some(field => {
      if (!field.required) return false
      const value = values[field.name]
      if (typeof value === "string") return !value.trim()
      if (typeof value === "boolean") return !value
      return true
    })
  }, [isCurrentlyPending, fields, values])

  // Determine which field should get the autofocus ref
  const autoFocusFieldIndex = useMemo(() => {
    const explicitIndex = fields.findIndex(f => f.autoFocus)
    return explicitIndex >= 0 ? explicitIndex : 0
  }, [fields])

  // Render a single field based on its type
  const renderField = useCallback(
    (field: FormFieldConfig, index: number) => {
      const value = values[field.name]
      const error = touched[field.name] ? errors[field.name] : undefined
      const shouldAutoFocus = index === autoFocusFieldIndex
      const commonProps = {
        disabled: isCurrentlyPending,
        "data-testid": field.testId,
        onBlur: () => handleFieldBlur(field.name),
      }

      switch (field.type) {
        case "text":
        case "password":
          return (
            <input
              ref={shouldAutoFocus ? (firstInputRef as React.RefObject<HTMLInputElement>) : undefined}
              type={field.type}
              className={`${styles.sidecarInput} ${error ? styles.sidecarInputError : ""}`}
              value={value as string}
              placeholder={field.placeholder}
              onChange={e => handleValueChange(field.name, e.target.value)}
              {...commonProps}
            />
          )

        case "textarea":
          return (
            <textarea
              ref={shouldAutoFocus ? (firstInputRef as React.RefObject<HTMLTextAreaElement>) : undefined}
              className={`${styles.sidecarTextarea} ${error ? styles.sidecarInputError : ""}`}
              value={value as string}
              placeholder={field.placeholder}
              onChange={e => handleValueChange(field.name, e.target.value)}
              rows={4}
              {...commonProps}
            />
          )

        case "select":
          return (
            <select
              ref={shouldAutoFocus ? (firstInputRef as React.RefObject<HTMLSelectElement>) : undefined}
              className={`${styles.sidecarSelect} ${error ? styles.sidecarInputError : ""}`}
              value={value as string}
              onChange={e => handleValueChange(field.name, e.target.value)}
              {...commonProps}
            >
              {field.placeholder && (
                <option value="" disabled>
                  {field.placeholder}
                </option>
              )}
              {field.options?.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          )

        case "checkbox":
          return (
            <label className={styles.sidecarCheckboxLabel}>
              <input
                ref={shouldAutoFocus ? (firstInputRef as React.RefObject<HTMLInputElement>) : undefined}
                type="checkbox"
                className={styles.sidecarCheckbox}
                checked={value as boolean}
                onChange={e => handleValueChange(field.name, e.target.checked)}
                {...commonProps}
              />
              <span className={styles.sidecarCheckboxText}>{field.placeholder || field.label}</span>
            </label>
          )

        case "radio":
          return (
            <div className={styles.sidecarRadioGroup}>
              {field.options?.map((option, optionIndex) => (
                <label key={option.value} className={styles.sidecarRadioLabel}>
                  <input
                    ref={
                      shouldAutoFocus && optionIndex === 0
                        ? (firstInputRef as React.RefObject<HTMLInputElement>)
                        : undefined
                    }
                    type="radio"
                    className={styles.sidecarRadio}
                    name={field.name}
                    value={option.value}
                    checked={value === option.value}
                    onChange={() => handleValueChange(field.name, option.value)}
                    {...commonProps}
                  />
                  <span className={styles.sidecarRadioText}>{option.label}</span>
                </label>
              ))}
            </div>
          )

        default:
          return null
      }
    },
    [values, errors, touched, isCurrentlyPending, autoFocusFieldIndex, handleValueChange, handleFieldBlur]
  )

  return (
    <Sidecar itemCount={0} onSelect={() => {}}>
      <div onKeyDown={handleKeyDown}>
        <SidecarSection title={title}>
          {description && <p className={styles.sidecarFormDescription}>{description}</p>}
          {errorMessage && (
            <div className={styles.sidecarFormError} data-testid="form-sidecar-error">
              {errorMessage}
            </div>
          )}

          <div className={styles.sidecarFormFields}>
            {fields.map((field, index) => (
              <div key={field.name} className={styles.sidecarFormField}>
                {/* Don't show label for checkbox (inline label) */}
                {field.type !== "checkbox" && (
                  <label className={styles.sidecarFormLabel}>{field.label}</label>
                )}
                {renderField(field, index)}
                {touched[field.name] && errors[field.name] && (
                  <span className={styles.sidecarFormError}>{errors[field.name]}</span>
                )}
              </div>
            ))}
          </div>

          {/* Custom content (e.g., member selection) rendered below standard fields */}
          {children}
        </SidecarSection>

        <SidecarSection title="">
          <div className={styles.sidecarInputActions}>
            <button
              className={styles.sidecarCancelButton}
              onClick={onCancel}
              disabled={isCurrentlyPending}
              type="button"
              data-testid="form-sidecar-cancel"
            >
              {cancelLabel}
            </button>
            <button
              className={styles.sidecarConfirmButton}
              onClick={handleSubmit}
              disabled={isSubmitDisabled}
              type="button"
              data-testid="form-sidecar-submit"
            >
              {isCurrentlyPending ? "Saving..." : submitLabel}
            </button>
          </div>
        </SidecarSection>
      </div>
    </Sidecar>
  )
}
