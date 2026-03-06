import { useCallback, useState, type MouseEvent } from "react"
import { X, SmilePlus } from "lucide-react"
import Picker from "@emoji-mart/react"
import data from "@emoji-mart/data"
import { Popover, PopoverTrigger, PopoverContent } from "../tiptap-ui-primitive/popover"
import { useIsBreakpoint } from "../../hooks/use-is-breakpoint"
import * as reactionStyles from "../../styles/reactions.css"

type EmojiSelection = {
  native: string
}

interface ReactionPickerProps {
  onEmojiSelect: (emoji: string) => void
  isDisabled?: boolean
  testId?: string
  ariaLabel?: string
  // If true, only show the icon without the "React" label
  iconOnly?: boolean
  // Optional custom className for the trigger button
  triggerClassName?: string
}

export function ReactionPicker({
  onEmojiSelect,
  isDisabled = false,
  testId,
  ariaLabel = "Add reaction",
  iconOnly = false,
  triggerClassName,
}: ReactionPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const isMobile = useIsBreakpoint("max", 768)
  // Quick-pick emojis keep common reactions one click away (and make tests deterministic).
  const quickPickEmojis = ["👍", "🎉", "❤️"]
  const quickPickTestIdPrefix = testId ? `${testId}-quick` : "reaction-picker-quick"

  const handleEmojiSelection = useCallback(
    (emojiSelection: EmojiSelection) => {
      if (!emojiSelection.native) {
        setIsOpen(false)
        return
      }
      onEmojiSelect(emojiSelection.native)
      setIsOpen(false)
    },
    [onEmojiSelect]
  )

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (isDisabled) {
        setIsOpen(false)
        return
      }
      setIsOpen(nextOpen)
    },
    [isDisabled]
  )

  const handleButtonClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      if (isDisabled) {
        return
      }
      setIsOpen(true)
    },
    [isDisabled]
  )

  const handleClose = useCallback(() => {
    setIsOpen(false)
  }, [])

  const handleQuickPick = useCallback(
    (emoji: string) => {
      onEmojiSelect(emoji)
      setIsOpen(false)
    },
    [onEmojiSelect]
  )

  const quickPickElement = (
    <div className={reactionStyles.reactionQuickPicks}>
      {quickPickEmojis.map((emoji, index) => (
        <button
          key={emoji}
          type="button"
          className={reactionStyles.reactionQuickPickButton}
          onClick={() => handleQuickPick(emoji)}
          data-testid={`${quickPickTestIdPrefix}-${index}`}
          aria-label={`Quick reaction ${emoji}`}
        >
          {emoji}
        </button>
      ))}
    </div>
  )

  const pickerElement = (
    <Picker
      data={data}
      onEmojiSelect={handleEmojiSelection}
      theme="light"
      previewPosition="none"
    />
  )

  // Determine button class - use custom class or default
  const buttonClassName = triggerClassName ?? reactionStyles.reactionAddButton

  if (isMobile) {
    return (
      <>
        <button
          type="button"
          className={buttonClassName}
          onClick={handleButtonClick}
          aria-label={ariaLabel}
          data-testid={testId}
        >
          <SmilePlus size={14} />
          {!iconOnly && "React"}
        </button>
        {isOpen && (
          <div
            className={reactionStyles.reactionPickerOverlay}
            onClick={handleClose}
            role="presentation"
          >
            <div
              className={reactionStyles.reactionPickerModal}
              onClick={event => event.stopPropagation()}
              role="dialog"
              aria-label="Emoji picker"
            >
              <div className={reactionStyles.reactionPickerHeader}>
                <span>Pick a reaction</span>
                <button
                  type="button"
                  className={reactionStyles.reactionPickerCloseButton}
                  onClick={handleClose}
                  aria-label="Close reaction picker"
                >
                  <X size={16} />
                </button>
              </div>
              <div className={reactionStyles.reactionPickerBody}>
                {quickPickElement}
                {pickerElement}
              </div>
            </div>
          </div>
        )}
      </>
    )
  }

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={buttonClassName}
          onClick={handleButtonClick}
          aria-label={ariaLabel}
          data-testid={testId}
        >
          <SmilePlus size={14} />
          {!iconOnly && "React"}
        </button>
      </PopoverTrigger>
      <PopoverContent className={reactionStyles.reactionPickerPopover} side="top" align="start">
        <div className={reactionStyles.reactionPickerBody}>
          {quickPickElement}
          {pickerElement}
        </div>
      </PopoverContent>
    </Popover>
  )
}
