import { describe, it, expect } from "vitest"
import * as Y from "yjs"
import { extractPlaintextFromYDoc } from "./yjs-utils"

function buildParagraphNode(text: string): Y.XmlElement {
  const paragraph = new Y.XmlElement("p")
  const textNode = new Y.XmlText()
  textNode.insert(0, text)
  paragraph.insert(0, [textNode])
  return paragraph
}

function buildYDocWithParagraphs(paragraphs: string[]): Y.Doc {
  const ydoc = new Y.Doc()
  const fragment = ydoc.getXmlFragment("content")

  // Preserve authoring order by inserting each paragraph sequentially.
  paragraphs.forEach((paragraphText, index) => {
    fragment.insert(index, [buildParagraphNode(paragraphText)])
  })

  return ydoc
}

describe("extractPlaintextFromYDoc", () => {
  it("preserves paragraph breaks with blank lines", () => {
    const ydoc = buildYDocWithParagraphs(["what id to 22 43", "asdf", "asdf", "123"])

    const plaintext = extractPlaintextFromYDoc(ydoc)

    expect(plaintext).toBe("what id to 22 43\n\nasdf\n\nasdf\n\n123")
  })

  it("falls back to text nodes when no block elements exist", () => {
    const ydoc = new Y.Doc()
    const fragment = ydoc.getXmlFragment("content")
    const textNode = new Y.XmlText()
    textNode.insert(0, "inline text")
    fragment.insert(0, [textNode])

    const plaintext = extractPlaintextFromYDoc(ydoc)

    expect(plaintext).toBe("inline text")
  })
})
