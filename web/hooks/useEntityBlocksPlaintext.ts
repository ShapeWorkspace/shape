/**
 * Shared hook for decoding entity blocks into plaintext for export.
 * Used by Notes, Papers, and Tasks export sidecars.
 */

import { useEffect, useState } from "react"
import * as Y from "yjs"
import type { ServerBlock } from "../../engine/models/entity"
import { decodeBlocksFromBase64 } from "../../engine/usecase/crypto/block-crypto-utils"
import { useEngineStore } from "../store/engine-store"
import { useEntityKey } from "./useEntityKey"
import { extractPlaintextFromYDoc } from "../utils/yjs-utils"

interface UseEntityBlocksPlaintextOptions {
  blocks: ServerBlock[] | undefined
  isBlocksLoading: boolean
  blocksError: Error | null
}

interface UseEntityBlocksPlaintextResult {
  plaintext: string
  isLoading: boolean
  errorMessage: string | null
}

/**
 * Decrypts Yjs entity blocks and returns a plaintext snapshot for export.
 */
export function useEntityBlocksPlaintext({
  blocks,
  isBlocksLoading,
  blocksError,
}: UseEntityBlocksPlaintextOptions): UseEntityBlocksPlaintextResult {
  const { application } = useEngineStore()
  const getEntityKey = useEntityKey()

  const [plaintext, setPlaintext] = useState("")
  const [isDecoding, setIsDecoding] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!blocksError) {
      return
    }

    setErrorMessage(blocksError.message)
  }, [blocksError])

  useEffect(() => {
    let isCancelled = false

    const decodeBlocksToPlaintext = async () => {
      if (isBlocksLoading) {
        setIsDecoding(true)
        return
      }

      if (!blocks || blocks.length === 0) {
        setPlaintext("")
        setIsDecoding(false)
        return
      }

      if (!application) {
        setErrorMessage("Application not initialized")
        setIsDecoding(false)
        return
      }

      const entityId = blocks[0].entity_id
      const entityKey = getEntityKey(entityId)
      if (!entityKey) {
        setErrorMessage("Failed to get entity key")
        setIsDecoding(false)
        return
      }

      setIsDecoding(true)
      setErrorMessage(null)

      const ydoc = new Y.Doc()
      const decryptDelta = application.getDecryptDelta()

      for (const block of blocks) {
        const blocksMessage = decodeBlocksFromBase64(block.encrypted_data)
        if (!blocksMessage) {
          continue
        }

        for (const encryptedDelta of blocksMessage.deltas) {
          const yjsUpdate = decryptDelta.execute({ delta: encryptedDelta, entityKey })
          if (yjsUpdate) {
            Y.applyUpdate(ydoc, yjsUpdate)
          }
        }
      }

      const nextPlaintext = extractPlaintextFromYDoc(ydoc)

      if (!isCancelled) {
        setPlaintext(nextPlaintext)
        setIsDecoding(false)
      }
    }

    decodeBlocksToPlaintext().catch(error => {
      if (isCancelled) {
        return
      }

      const message = error instanceof Error ? error.message : "Failed to decode content"
      setErrorMessage(message)
      setIsDecoding(false)
    })

    return () => {
      isCancelled = true
    }
  }, [application, blocks, getEntityKey, isBlocksLoading])

  return {
    plaintext,
    isLoading: isBlocksLoading || isDecoding,
    errorMessage,
  }
}
