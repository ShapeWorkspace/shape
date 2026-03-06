import type { Meta, StoryObj } from "@storybook/react"
import React, { useState } from "react"
import Modal from "../Modal"
import Button from "../Button"
import { Settings } from "lucide-react"

const ModalWrapper = ({ children, ...props }: React.ComponentProps<typeof Modal>) => {
  const [isOpen, setIsOpen] = useState(true)
  return (
    <>
      <Button onClick={() => setIsOpen(true)}>Open Modal</Button>
      <Modal {...props} isOpen={isOpen} onClose={() => setIsOpen(false)}>
        {children}
      </Modal>
    </>
  )
}

const modalStoryMetaConfiguration: Meta<typeof Modal> = {
  title: "Theme/Modal",
  component: ModalWrapper,
  args: {
    title: "Modal Title",
    subtitle: "Optional subtitle text",
    width: "medium",
  },
}

export default modalStoryMetaConfiguration

type ModalStory = StoryObj<typeof modalStoryMetaConfiguration>

export const Playground: ModalStory = {
  render: args => (
    <ModalWrapper {...args}>
      <p>This is the modal content. You can put any content here.</p>
    </ModalWrapper>
  ),
}

const SizesRender = () => {
  const [openSize, setOpenSize] = useState<
    "small" | "medium" | "large" | "xlarge" | "xxlarge" | "fluid" | null
  >(null)
  return (
    <>
      <div style={{ display: "flex", gap: "8px", padding: "20px", flexWrap: "wrap" }}>
        <Button onClick={() => setOpenSize("small")}>Small</Button>
        <Button onClick={() => setOpenSize("medium")}>Medium</Button>
        <Button onClick={() => setOpenSize("large")}>Large</Button>
        <Button onClick={() => setOpenSize("xlarge")}>XLarge</Button>
        <Button onClick={() => setOpenSize("xxlarge")}>XXLarge</Button>
        <Button onClick={() => setOpenSize("fluid")}>Fluid</Button>
      </div>
      {openSize && (
        <Modal
          isOpen={true}
          onClose={() => setOpenSize(null)}
          title={`${openSize.charAt(0).toUpperCase() + openSize.slice(1)} Modal`}
          width={openSize}
        >
          <p>This is a {openSize} modal.</p>
        </Modal>
      )}
    </>
  )
}

export const Sizes: ModalStory = {
  render: () => <SizesRender />,
}

const WithFooterRender = () => {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setIsOpen(true)}>Open Modal with Footer</Button>
      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Modal with Footer"
        footer={
          <>
            <Button onClick={() => setIsOpen(false)}>Cancel</Button>
            <Button kind="solid" variant="norm" onClick={() => setIsOpen(false)}>
              Save
            </Button>
          </>
        }
      >
        <p>This modal has a footer with action buttons.</p>
      </Modal>
    </>
  )
}

export const WithFooter: ModalStory = {
  render: () => <WithFooterRender />,
}

const WithIconRender = () => {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setIsOpen(true)}>Open Modal with Icon</Button>
      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Settings"
        titleIcon={<Settings size={16} />}
      >
        <p>This modal has an icon in the title.</p>
      </Modal>
    </>
  )
}

export const WithIcon: ModalStory = {
  render: () => <WithIconRender />,
}

const WithoutSubtitleRender = () => {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setIsOpen(true)}>Open Modal</Button>
      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Simple Modal">
        <p>This modal has no subtitle, so the header is centered vertically.</p>
      </Modal>
    </>
  )
}

export const WithoutSubtitle: ModalStory = {
  render: () => <WithoutSubtitleRender />,
}
