import type { Meta, StoryObj } from "@storybook/react"
import React, { useState } from "react"
import AlertDialog from "../AlertDialog"
import Button from "../Button"

const AlertDialogWrapper = (props: React.ComponentProps<typeof AlertDialog>) => {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setIsOpen(true)}>Open Alert Dialog</Button>
      <AlertDialog {...props} isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  )
}

const alertDialogStoryMetaConfiguration: Meta<typeof AlertDialog> = {
  title: "Theme/AlertDialog",
  component: AlertDialogWrapper,
  args: {
    title: "Confirm Action",
    body: "Are you sure you want to proceed?",
    confirmLabel: "Confirm",
    cancelLabel: "Cancel",
    confirmTone: "default",
    hasCancelButton: true,
  },
}

export default alertDialogStoryMetaConfiguration

type AlertDialogStory = StoryObj<typeof alertDialogStoryMetaConfiguration>

export const Playground: AlertDialogStory = {
  render: args => <AlertDialogWrapper {...args} />,
}

const ConfirmTonesRender = () => {
  const [openTone, setOpenTone] = useState<"danger" | "caution" | "default" | null>(null)
  return (
    <>
      <div style={{ display: "flex", gap: "8px", padding: "20px", flexWrap: "wrap" }}>
        <Button onClick={() => setOpenTone("default")}>Default</Button>
        <Button onClick={() => setOpenTone("caution")}>Caution</Button>
        <Button onClick={() => setOpenTone("danger")}>Danger</Button>
      </div>
      {openTone && (
        <AlertDialog
          isOpen={true}
          onClose={() => setOpenTone(null)}
          title={`${openTone.charAt(0).toUpperCase() + openTone.slice(1)} Action`}
          body={`This is a ${openTone} tone alert dialog.`}
          confirmTone={openTone}
          confirmLabel={openTone === "danger" ? "Delete" : "Confirm"}
        />
      )}
    </>
  )
}

export const ConfirmTones: AlertDialogStory = {
  render: () => <ConfirmTonesRender />,
}

const CustomActionsRender = () => {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setIsOpen(true)}>Open Custom Actions Dialog</Button>
      <AlertDialog
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Choose Action"
        body="Select one of the following actions:"
        actions={[
          {
            label: "Save",
            tone: "default",
            isDefault: true,
            onSelect: () => console.log("Saved"),
          },
          {
            label: "Save and Close",
            tone: "default",
            onSelect: () => console.log("Saved and closed"),
          },
          {
            label: "Cancel",
            tone: "default",
            onSelect: () => console.log("Cancelled"),
          },
        ]}
      />
    </>
  )
}

export const CustomActions: AlertDialogStory = {
  render: () => <CustomActionsRender />,
}

const WithoutCancelRender = () => {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setIsOpen(true)}>Open Confirm-Only Dialog</Button>
      <AlertDialog
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Information"
        body="This dialog only has a confirm button."
        hasCancelButton={false}
        confirmLabel="OK"
      />
    </>
  )
}

export const WithoutCancel: AlertDialogStory = {
  render: () => <WithoutCancelRender />,
}

const WithRichBodyRender = () => {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setIsOpen(true)}>Open Rich Body Dialog</Button>
      <AlertDialog
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Delete Item"
        body={
          <div>
            <p>Are you sure you want to delete this item?</p>
            <p style={{ marginTop: "8px", fontSize: "14px", color: "#666" }}>This action cannot be undone.</p>
          </div>
        }
        confirmTone="danger"
        confirmLabel="Delete"
      />
    </>
  )
}

export const WithRichBody: AlertDialogStory = {
  render: () => <WithRichBodyRender />,
}
