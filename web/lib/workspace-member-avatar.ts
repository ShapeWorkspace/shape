const WORKSPACE_MEMBER_AVATAR_SIZE_PX = 128
const WORKSPACE_MEMBER_AVATAR_MAX_BASE64_LENGTH = 50 * 1024

const LOSSY_AVATAR_QUALITY_STEPS = [0.92, 0.85, 0.78, 0.7, 0.6, 0.5]

type AvatarEncodingCandidate = {
  base64: string
  mimeType: string
  base64Length: number
}

type ImageSourcePayload = {
  source: CanvasImageSource
  width: number
  height: number
  cleanup: () => void
}

function assertCanvasContext(
  context: CanvasRenderingContext2D | null
): asserts context is CanvasRenderingContext2D {
  if (!context) {
    throw new Error("Avatar processing failed: canvas context unavailable")
  }
}

async function loadImageSourceFromFile(file: File): Promise<ImageSourcePayload> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file)
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      cleanup: () => {
        bitmap.close()
      },
    }
  }

  const objectUrl = URL.createObjectURL(file)
  const image = new Image()
  image.decoding = "async"
  image.src = objectUrl

  const loadedImage = await new Promise<HTMLImageElement>((resolve, reject) => {
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("Avatar processing failed: unable to load image"))
  })

  if (loadedImage.decode) {
    await loadedImage.decode()
  }

  return {
    source: loadedImage,
    width: loadedImage.naturalWidth,
    height: loadedImage.naturalHeight,
    cleanup: () => URL.revokeObjectURL(objectUrl),
  }
}

function getCenteredSquareCropDimensions(width: number, height: number) {
  const size = Math.min(width, height)
  const offsetX = Math.floor((width - size) / 2)
  const offsetY = Math.floor((height - size) / 2)

  return {
    size,
    offsetX,
    offsetY,
  }
}

async function convertBlobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error("Avatar processing failed: unable to read image"))
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Avatar processing failed: unsupported image encoding"))
        return
      }
      const commaIndex = reader.result.indexOf(",")
      if (commaIndex === -1) {
        reject(new Error("Avatar processing failed: invalid image encoding"))
        return
      }
      resolve(reader.result.slice(commaIndex + 1))
    }
    reader.readAsDataURL(blob)
  })
}

async function encodeCanvasToBase64(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality?: number
): Promise<AvatarEncodingCandidate | null> {
  const blob = await new Promise<Blob | null>(resolve => {
    canvas.toBlob(result => resolve(result), mimeType, quality)
  })

  if (!blob) {
    return null
  }

  const base64 = await convertBlobToBase64(blob)

  return {
    base64,
    mimeType,
    base64Length: base64.length,
  }
}

async function findBestCandidateForType(
  canvas: HTMLCanvasElement,
  mimeType: string,
  qualitySteps: number[] | null
): Promise<AvatarEncodingCandidate | null> {
  if (!qualitySteps || qualitySteps.length === 0) {
    const candidate = await encodeCanvasToBase64(canvas, mimeType)
    if (!candidate || candidate.base64Length > WORKSPACE_MEMBER_AVATAR_MAX_BASE64_LENGTH) {
      return null
    }
    return candidate
  }

  let bestCandidate: AvatarEncodingCandidate | null = null

  for (const quality of qualitySteps) {
    const candidate = await encodeCanvasToBase64(canvas, mimeType, quality)
    if (!candidate) {
      continue
    }
    if (candidate.base64Length > WORKSPACE_MEMBER_AVATAR_MAX_BASE64_LENGTH) {
      continue
    }
    if (!bestCandidate || candidate.base64Length < bestCandidate.base64Length) {
      bestCandidate = candidate
    }
  }

  return bestCandidate
}

export async function processWorkspaceMemberAvatarFile(file: File): Promise<{
  avatarBase64: string
  avatarType: string
}> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Avatar must be an image file")
  }

  const { source, width, height, cleanup } = await loadImageSourceFromFile(file)

  try {
    // Normalize the image into a square canvas at the target size.
    const canvas = document.createElement("canvas")
    canvas.width = WORKSPACE_MEMBER_AVATAR_SIZE_PX
    canvas.height = WORKSPACE_MEMBER_AVATAR_SIZE_PX

    const context = canvas.getContext("2d")
    assertCanvasContext(context)

    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = "high"

    // Center-crop the largest possible square before resizing.
    const { size, offsetX, offsetY } = getCenteredSquareCropDimensions(width, height)
    context.drawImage(
      source,
      offsetX,
      offsetY,
      size,
      size,
      0,
      0,
      WORKSPACE_MEMBER_AVATAR_SIZE_PX,
      WORKSPACE_MEMBER_AVATAR_SIZE_PX
    )

    // Encode in multiple formats and keep the smallest option under the size cap.
    const [webpCandidate, jpegCandidate, pngCandidate] = await Promise.all([
      findBestCandidateForType(canvas, "image/webp", LOSSY_AVATAR_QUALITY_STEPS),
      findBestCandidateForType(canvas, "image/jpeg", LOSSY_AVATAR_QUALITY_STEPS),
      findBestCandidateForType(canvas, "image/png", null),
    ])

    const candidates = [webpCandidate, jpegCandidate, pngCandidate].filter(
      (candidate): candidate is AvatarEncodingCandidate => candidate !== null
    )

    if (candidates.length === 0) {
      throw new Error("Avatar exceeds 50KB after compression")
    }

    let bestCandidate = candidates[0]
    for (const candidate of candidates.slice(1)) {
      if (candidate.base64Length < bestCandidate.base64Length) {
        bestCandidate = candidate
      } else if (
        candidate.base64Length === bestCandidate.base64Length &&
        candidate.mimeType === "image/webp"
      ) {
        bestCandidate = candidate
      }
    }

    return {
      avatarBase64: bestCandidate.base64,
      avatarType: bestCandidate.mimeType,
    }
  } finally {
    cleanup()
  }
}

export const workspaceMemberAvatarConstraints = {
  sizePx: WORKSPACE_MEMBER_AVATAR_SIZE_PX,
  maxBase64Length: WORKSPACE_MEMBER_AVATAR_MAX_BASE64_LENGTH,
}
