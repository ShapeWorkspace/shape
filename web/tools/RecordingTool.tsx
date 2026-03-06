import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLocation, useNavigate, useParams } from "react-router-dom"
import { useBlocker } from "react-router"
import { Mic, StopCircle, Circle, Check } from "lucide-react"
import { useUploadFileFromStream } from "../store/queries/use-files"
import { useEngineStore } from "../store/engine-store"
import { useWindowStore } from "../store/window-store"
import { useSidecar } from "../contexts/SidecarContext"
import { Sidecar, SidecarSection, SidecarDescription, SidecarMenu, SidecarRow } from "../components/SidecarUI"
import { parseWindowLocationFromUrl } from "../utils/window-navigation"
import { getDefaultAudioRecordingName, getDefaultVideoRecordingName } from "../utils/default-entity-titles"
import * as recordingStyles from "../styles/recording.css"

type RecordingKind = "video" | "audio"

type RecordingLifecycleStatus = "idle" | "starting" | "recording" | "stopping"

const RECORDING_TIMESLICE_MS = 1000

const VIDEO_RECORDING_MIME_TYPES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4",
]

const AUDIO_RECORDING_MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/mpeg"]

const MIME_EXTENSION_OVERRIDES: Record<string, string> = {
  "video/webm": "webm",
  "video/mp4": "mp4",
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
}

interface RecordingToolProps {
  recordingKind: RecordingKind
  folderId: string | null
}

interface RecordingSidecarProps {
  status: RecordingLifecycleStatus
  durationLabel: string
  isUploadBlocked: boolean
  errorMessage: string | null
  navigationBlockMessage: string | null
  isMicrophoneEnabled: boolean
  availableVideoInputs: MediaDeviceInfo[]
  availableAudioInputs: MediaDeviceInfo[]
  selectedVideoInputId: string
  selectedAudioInputId: string
  isVideoRecording: boolean
  isRecordingStopping: boolean
  isRecordingStarting: boolean
  onStartRecording: () => void
  onStopRecording: () => void
  onSelectVideoInput: (deviceId: string) => void
  onSelectAudioInput: (deviceId: string) => void
  onDisableMicrophone: () => void
}

function RecordingStatusSidecar({
  status,
  durationLabel,
  isUploadBlocked,
  errorMessage,
  navigationBlockMessage,
  isMicrophoneEnabled,
  availableVideoInputs,
  availableAudioInputs,
  selectedVideoInputId,
  selectedAudioInputId,
  isVideoRecording,
  isRecordingStopping,
  isRecordingStarting,
  onStartRecording,
  onStopRecording,
  onSelectVideoInput,
  onSelectAudioInput,
  onDisableMicrophone,
}: RecordingSidecarProps) {
  const isRecording = status === "recording"
  const isStartDisabled = isUploadBlocked || isRecordingStarting || isRecording || isRecordingStopping
  const canShowStopAction = isRecording || isRecordingStopping
  const isVideoInputDisabled = isRecording || isRecordingStarting || isRecordingStopping
  const isAudioInputDisabled = isRecording || isRecordingStarting || isRecordingStopping

  const sidecarActionHandlers: Array<(() => void) | null> = []
  const registerSidecarActionHandler = (handler?: () => void) => {
    sidecarActionHandlers.push(handler ?? null)
    return sidecarActionHandlers.length - 1
  }

  const handleSidecarSelect = (index: number) => {
    sidecarActionHandlers[index]?.()
  }

  // Status description lives in the sidecar to keep the preview panel clean.
  let statusContent: React.ReactNode = "Ready when you are."
  if (errorMessage) {
    statusContent = errorMessage
  } else if (navigationBlockMessage) {
    statusContent = <span data-testid="recording-navigation-blocked">{navigationBlockMessage}</span>
  } else if (isUploadBlocked) {
    statusContent = "Recordings require a synced workspace."
  } else if (isRecording) {
    statusContent = (
      <span className={recordingStyles.recordingSidecarStatus}>
        <span className={recordingStyles.recordingIndicatorDot} />
        Recording · {durationLabel}
      </span>
    )
  }

  const cameraRows = isVideoRecording
    ? availableVideoInputs.length > 0
      ? availableVideoInputs.map(device => {
          const isSelected = device.deviceId === selectedVideoInputId
          const handleVideoSelection = isVideoInputDisabled ? undefined : () => onSelectVideoInput(device.deviceId)
          return (
            <SidecarRow
              key={device.deviceId}
              index={registerSidecarActionHandler(handleVideoSelection)}
              title={device.label || "Camera"}
              icon={isSelected ? <Check size={14} /> : undefined}
              disabled={isVideoInputDisabled}
              onClick={handleVideoSelection}
              testId={`recording-camera-option-${device.deviceId}`}
            />
          )
        })
      : [
          <SidecarRow
            key="recording-camera-empty"
            index={registerSidecarActionHandler()}
            title="No cameras found"
            disabled={true}
            testId="recording-camera-option-empty"
          />,
        ]
    : []

  const microphoneRows: React.ReactNode[] = []
  if (isVideoRecording) {
    const isOffSelected = !isMicrophoneEnabled
    microphoneRows.push(
      <SidecarRow
        key="recording-microphone-off"
        index={registerSidecarActionHandler(
          isRecording || isRecordingStarting || isRecordingStopping ? undefined : onDisableMicrophone
        )}
        title="Microphone off"
        icon={isOffSelected ? <Check size={14} /> : undefined}
        disabled={isRecording || isRecordingStarting || isRecordingStopping}
        onClick={isRecording || isRecordingStarting || isRecordingStopping ? undefined : onDisableMicrophone}
        testId="recording-microphone-option-off"
      />
    )
  }

  if (availableAudioInputs.length > 0) {
    microphoneRows.push(
      ...availableAudioInputs.map(device => {
        const isSelected = device.deviceId === selectedAudioInputId && isMicrophoneEnabled
        const handleAudioSelection = isAudioInputDisabled ? undefined : () => onSelectAudioInput(device.deviceId)
        return (
          <SidecarRow
            key={device.deviceId}
            index={registerSidecarActionHandler(handleAudioSelection)}
            title={device.label || "Microphone"}
            icon={isSelected ? <Check size={14} /> : undefined}
            disabled={isAudioInputDisabled}
            onClick={handleAudioSelection}
            testId={`recording-microphone-option-${device.deviceId}`}
          />
        )
      })
    )
  } else {
    microphoneRows.push(
      <SidecarRow
        key="recording-microphone-empty"
        index={registerSidecarActionHandler()}
        title="No microphones found"
        disabled={true}
        testId="recording-microphone-option-empty"
      />
    )
  }

  return (
    <Sidecar itemCount={sidecarActionHandlers.length} onSelect={handleSidecarSelect}>
      <SidecarSection title="Status">
        <div data-testid="recording-status-text">
          <SidecarDescription>{statusContent}</SidecarDescription>
        </div>
      </SidecarSection>

      <SidecarSection title="Actions">
        <SidecarMenu>
          {!canShowStopAction && (
            (() => {
              const handleStartRecording = isStartDisabled ? undefined : onStartRecording
              return (
                <SidecarRow
                  index={registerSidecarActionHandler(handleStartRecording)}
                  title="Begin recording"
                  icon={<Circle size={14} />}
                  disabled={isStartDisabled}
                  onClick={handleStartRecording}
                  testId="recording-action-start"
                />
              )
            })()
          )}
          {canShowStopAction && (
            (() => {
              const handleStopRecording = isRecordingStopping ? undefined : onStopRecording
              return (
                <SidecarRow
                  index={registerSidecarActionHandler(handleStopRecording)}
                  title="Stop recording"
                  icon={<StopCircle size={14} />}
                  disabled={isRecordingStopping}
                  onClick={handleStopRecording}
                  testId="recording-action-stop"
                />
              )
            })()
          )}
        </SidecarMenu>
      </SidecarSection>

      {isVideoRecording && (
        <div data-testid="recording-camera-section">
          <SidecarSection title="Camera">
            <SidecarMenu>{cameraRows}</SidecarMenu>
          </SidecarSection>
        </div>
      )}

      <div data-testid="recording-microphone-section">
        <SidecarSection title="Microphone">
          <SidecarMenu>{microphoneRows}</SidecarMenu>
        </SidecarSection>
      </div>
    </Sidecar>
  )
}

function resolvePreferredRecordingMimeType(recordingKind: RecordingKind): string {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return ""
  }

  const candidates = recordingKind === "video" ? VIDEO_RECORDING_MIME_TYPES : AUDIO_RECORDING_MIME_TYPES
  const supported = candidates.find(candidate => MediaRecorder.isTypeSupported(candidate))
  return supported ?? ""
}

function resolveRecordingFileExtension(mimeType: string, recordingKind: RecordingKind): string {
  const normalizedMimeType = mimeType.split(";")[0]?.trim() ?? ""
  const override = MIME_EXTENSION_OVERRIDES[normalizedMimeType]
  if (override) {
    return override
  }
  return recordingKind === "video" ? "webm" : "webm"
}

function formatRecordingDurationLabel(seconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const remainingSeconds = totalSeconds % 60
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`
  }
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`
}

export function VideoRecordingTool({ folderId }: { folderId: string | null }) {
  return <RecordingTool recordingKind="video" folderId={folderId} />
}

export function AudioRecordingTool({ folderId }: { folderId: string | null }) {
  return <RecordingTool recordingKind="audio" folderId={folderId} />
}

function RecordingTool({ recordingKind, folderId }: RecordingToolProps) {
  const { workspaceId: workspaceIdFromRoute } = useParams<{ workspaceId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { syncFromUrl, navigateTo, navigateBack, getCurrentItem } = useWindowStore()
  const { replaceSidecarStack, clearSidecar } = useSidecar()
  const { application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? workspaceIdFromRoute ?? ""
  const { mutateAsync: uploadFileFromStream } = useUploadFileFromStream()

  const isUploadBlocked = !application?.isWorkspaceRemote()
  const isVideoRecording = recordingKind === "video"

  const [recordingStatus, setRecordingStatus] = useState<RecordingLifecycleStatus>("idle")
  const [recordingErrorMessage, setRecordingErrorMessage] = useState<string | null>(null)
  const [recordingDurationSeconds, setRecordingDurationSeconds] = useState(0)
  const [navigationBlockMessage, setNavigationBlockMessage] = useState<string | null>(null)
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null)

  const initialMockDevices = (globalThis as { __recordingMockDevices?: MediaDeviceInfo[] }).__recordingMockDevices ?? []
  const initialVideoInputs = initialMockDevices.filter(device => device.kind === "videoinput")
  const initialAudioInputs = initialMockDevices.filter(device => device.kind === "audioinput")
  const [availableVideoInputs, setAvailableVideoInputs] = useState<MediaDeviceInfo[]>(() => initialVideoInputs)
  const [availableAudioInputs, setAvailableAudioInputs] = useState<MediaDeviceInfo[]>(() => initialAudioInputs)
  const [selectedVideoInputId, setSelectedVideoInputId] = useState<string>(
    () => initialVideoInputs[0]?.deviceId ?? ""
  )
  const [selectedAudioInputId, setSelectedAudioInputId] = useState<string>(
    () => initialAudioInputs[0]?.deviceId ?? ""
  )
  const [isMicrophoneEnabled, setIsMicrophoneEnabled] = useState(true)

  const mediaStreamRef = useRef<MediaStream | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null)
  const recordingDurationTimerRef = useRef<number | null>(null)
  const recordingStartTimeRef = useRef<number | null>(null)
  const mediaStreamRequestIdRef = useRef(0)
  const shouldAutoRequestStreamRef = useRef(true)
  const recordingStreamControllerRef = useRef<ReadableStreamDefaultController<Uint8Array> | null>(null)
  const recordingStreamPendingWriteRef = useRef<Promise<void>>(Promise.resolve())
  const recordingStreamClosePromiseRef = useRef<Promise<void> | null>(null)
  const recordingStreamCloseResolverRef = useRef<(() => void) | null>(null)
  const recordingUploadPromiseRef = useRef<ReturnType<typeof uploadFileFromStream> | null>(null)

  // Block navigation only while actively recording or spinning up so stop flows can navigate to the new file.
  const shouldBlockNavigation = recordingStatus === "starting" || recordingStatus === "recording"
  const navigationBlocker = useBlocker(shouldBlockNavigation)

  const recordingDurationLabel = useMemo(
    () => formatRecordingDurationLabel(recordingDurationSeconds),
    [recordingDurationSeconds]
  )
  const isRecordingStarting = recordingStatus === "starting"
  const isRecordingStopping = recordingStatus === "stopping"
  const shouldShowAudioRecordingIndicator = !isVideoRecording && (recordingStatus === "starting" || recordingStatus === "recording")

  const stopMediaStreamTracks = useCallback((stream: MediaStream | null) => {
    if (!stream) {
      return
    }
    for (const track of stream.getTracks()) {
      track.stop()
    }
  }, [])

  const refreshAvailableDevices = useCallback(async () => {
    try {
      const mockDevices = (globalThis as { __recordingMockDevices?: MediaDeviceInfo[] }).__recordingMockDevices
      if (!navigator.mediaDevices?.enumerateDevices) {
        if (!mockDevices) {
          return
        }
        const videoInputs = mockDevices.filter(device => device.kind === "videoinput")
        const audioInputs = mockDevices.filter(device => device.kind === "audioinput")
        setAvailableVideoInputs(videoInputs)
        setAvailableAudioInputs(audioInputs)
        if (!selectedVideoInputId && videoInputs[0]?.deviceId) {
          setSelectedVideoInputId(videoInputs[0].deviceId)
        }
        if (!selectedAudioInputId && audioInputs[0]?.deviceId) {
          setSelectedAudioInputId(audioInputs[0].deviceId)
        }
        return
      }

      const devices = await navigator.mediaDevices.enumerateDevices()
      // Test fallback: Playwright sets __recordingMockDevices to keep device lists stable in headless runs.
      const fallbackDevices = devices.length > 0 ? devices : mockDevices ?? devices
      const videoInputs = fallbackDevices.filter(device => device.kind === "videoinput")
      const audioInputs = fallbackDevices.filter(device => device.kind === "audioinput")

      setAvailableVideoInputs(videoInputs)
      setAvailableAudioInputs(audioInputs)

      if (!selectedVideoInputId && videoInputs[0]?.deviceId) {
        setSelectedVideoInputId(videoInputs[0].deviceId)
      }
      if (!selectedAudioInputId && audioInputs[0]?.deviceId) {
        setSelectedAudioInputId(audioInputs[0].deviceId)
      }
    } catch {
      setRecordingErrorMessage("Unable to read available input devices.")
    }
  }, [selectedVideoInputId, selectedAudioInputId])

  const requestMediaStream = useCallback(async () => {
    const requestId = (mediaStreamRequestIdRef.current += 1)
    const mockDevices = (globalThis as { __recordingMockDevices?: MediaDeviceInfo[] }).__recordingMockDevices
    if (!navigator.mediaDevices?.getUserMedia) {
      if (mockDevices) {
        const mockStream = new MediaStream()
        if (mediaStreamRequestIdRef.current !== requestId) {
          stopMediaStreamTracks(mockStream)
          return null
        }
        stopMediaStreamTracks(mediaStreamRef.current)
        mediaStreamRef.current = mockStream
        setMediaStream(mockStream)
        await refreshAvailableDevices()
        return mockStream
      }
      setRecordingErrorMessage("Your browser does not support recording.")
      return null
    }

    if (recordingStatus === "recording" || recordingStatus === "starting") {
      return mediaStreamRef.current
    }


    const includeAudio = recordingKind === "audio" || (isMicrophoneEnabled && isVideoRecording)
    const videoConstraints =
      recordingKind === "video"
        ? selectedVideoInputId
          ? { deviceId: { exact: selectedVideoInputId } }
          : true
        : false
    const audioConstraints = includeAudio
      ? selectedAudioInputId
        ? { deviceId: { exact: selectedAudioInputId } }
        : true
      : false

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: audioConstraints,
      })

      if (mediaStreamRequestIdRef.current !== requestId) {
        stopMediaStreamTracks(stream)
        return null
      }

      stopMediaStreamTracks(mediaStreamRef.current)
      mediaStreamRef.current = stream
      setMediaStream(stream)
      await refreshAvailableDevices()

      return stream
    } catch {
      if (mockDevices) {
        const mockStream = new MediaStream()
        if (mediaStreamRequestIdRef.current !== requestId) {
          stopMediaStreamTracks(mockStream)
          return null
        }
        stopMediaStreamTracks(mediaStreamRef.current)
        mediaStreamRef.current = mockStream
        setMediaStream(mockStream)
        await refreshAvailableDevices()
        return mockStream
      }
      setRecordingErrorMessage("Permission denied for the selected inputs.")
      return null
    }
  }, [
    recordingKind,
    isMicrophoneEnabled,
    isVideoRecording,
    selectedVideoInputId,
    selectedAudioInputId,
    recordingStatus,
    refreshAvailableDevices,
    stopMediaStreamTracks,
  ])

  const ensureMediaStreamForPreview = useCallback(async () => {
    if (mediaStreamRef.current) {
      return mediaStreamRef.current
    }
    return await requestMediaStream()
  }, [requestMediaStream])

  const handleStartRecordingButtonClick = useCallback(async () => {
    if (isUploadBlocked) {
      setRecordingErrorMessage("Recordings require a synced workspace.")
      return
    }
    if (!workspaceId) {
      setRecordingErrorMessage("Missing workspace context.")
      return
    }

    setRecordingErrorMessage(null)
    setRecordingStatus("starting")

    const mockDevices = (globalThis as { __recordingMockDevices?: MediaDeviceInfo[] }).__recordingMockDevices
    let stream = await ensureMediaStreamForPreview()
    if (!stream && mockDevices) {
      const mockStream = new MediaStream()
      stopMediaStreamTracks(mediaStreamRef.current)
      mediaStreamRef.current = mockStream
      setMediaStream(mockStream)
      stream = mockStream
    }
    if (!stream) {
      setRecordingStatus("idle")
      return
    }

    if (typeof MediaRecorder === "undefined") {
      setRecordingErrorMessage("Your browser does not support recording.")
      setRecordingStatus("idle")
      return
    }

    const preferredMimeType = resolvePreferredRecordingMimeType(recordingKind)
    const recorder = preferredMimeType ? new MediaRecorder(stream, { mimeType: preferredMimeType }) : new MediaRecorder(stream)

    const effectiveMimeType = recorder.mimeType || preferredMimeType || (recordingKind === "video" ? "video/webm" : "audio/webm")
    const baseName =
      recordingKind === "video" ? getDefaultVideoRecordingName(new Date()) : getDefaultAudioRecordingName(new Date())
    const extension = resolveRecordingFileExtension(effectiveMimeType, recordingKind)
    const finalFileName = `${baseName}.${extension}`

    setRecordingErrorMessage(null)

    const recordingStream = new ReadableStream<Uint8Array>({
      start(controller) {
        recordingStreamControllerRef.current = controller
      },
    })

    recordingStreamPendingWriteRef.current = Promise.resolve()
    recordingStreamClosePromiseRef.current = new Promise(resolve => {
      recordingStreamCloseResolverRef.current = resolve
    })

    recorder.ondataavailable = event => {
      if (!event.data || event.data.size === 0) {
        return
      }

      recordingStreamPendingWriteRef.current = recordingStreamPendingWriteRef.current.then(async () => {
        const buffer = await event.data.arrayBuffer()
        const controller = recordingStreamControllerRef.current
        if (controller) {
          controller.enqueue(new Uint8Array(buffer))
        }
      })
    }

    recorder.onstop = () => {
      const finalizePromise = recordingStreamPendingWriteRef.current.then(() => {
        const controller = recordingStreamControllerRef.current
        if (controller) {
          controller.close()
        }
      })

      void finalizePromise.finally(() => {
        recordingStreamCloseResolverRef.current?.()
      })
    }

    recorder.onerror = () => {
      setRecordingErrorMessage("Recording failed unexpectedly.")
      setRecordingStatus("idle")
      recordingStreamCloseResolverRef.current?.()
    }

    mediaRecorderRef.current = recorder
    recordingUploadPromiseRef.current = uploadFileFromStream({
      streamSource: recordingStream,
      fileName: finalFileName,
      mimeType: effectiveMimeType,
      folderId,
    })

    recorder.start(RECORDING_TIMESLICE_MS)

    recordingStartTimeRef.current = Date.now()
    setRecordingDurationSeconds(0)
    setRecordingStatus("recording")

    if (recordingDurationTimerRef.current) {
      window.clearInterval(recordingDurationTimerRef.current)
    }
    recordingDurationTimerRef.current = window.setInterval(() => {
      if (!recordingStartTimeRef.current) {
        return
      }
      const elapsedSeconds = (Date.now() - recordingStartTimeRef.current) / 1000
      setRecordingDurationSeconds(elapsedSeconds)
    }, 1000)
  }, [
    isUploadBlocked,
    workspaceId,
    ensureMediaStreamForPreview,
    uploadFileFromStream,
    folderId,
    recordingKind,
    stopMediaStreamTracks,
  ])

  const handleStopRecordingButtonClick = useCallback(async () => {
    if (!workspaceId) {
      return
    }

    const recorder = mediaRecorderRef.current
    if (!recorder) {
      return
    }

    setRecordingStatus("stopping")
    shouldAutoRequestStreamRef.current = false
    mediaStreamRequestIdRef.current += 1
    recorder.stop()

    // Release camera/microphone immediately so OS indicators turn off after stop.
    stopMediaStreamTracks(mediaStreamRef.current)
    mediaStreamRef.current = null
    setMediaStream(null)

    if (recordingDurationTimerRef.current) {
      window.clearInterval(recordingDurationTimerRef.current)
      recordingDurationTimerRef.current = null
    }

    if (recordingStreamClosePromiseRef.current) {
      await recordingStreamClosePromiseRef.current
    }

    try {
      const pendingUpload = recordingUploadPromiseRef.current
      if (!pendingUpload) {
        throw new Error("Recording upload failed.")
      }

      const uploadedFile = await pendingUpload

      const folderParam = folderId ? `&folder=${folderId}` : ""
      const currentItem = getCurrentItem()
      const isRecordingBreadcrumb =
        currentItem?.tool === "files" &&
        (currentItem.itemType === "video-recording" || currentItem.itemType === "audio-recording")

      // Drop the recording breadcrumb so back-navigation returns to the files list.
      if (isRecordingBreadcrumb) {
        navigateBack()
      }

      navigateTo({
        id: uploadedFile.id,
        label: uploadedFile.content.name,
        tool: "files",
        itemId: uploadedFile.id,
        itemType: "file",
        folderId: folderId ?? undefined,
      })
      navigate(`/w/${workspaceId}/files/${uploadedFile.id}?type=file${folderParam}`)
    } catch {
      setRecordingErrorMessage("Failed to upload recording. Please try again.")
    } finally {
      setRecordingStatus("idle")
      mediaRecorderRef.current = null
      recordingStreamControllerRef.current = null
      recordingStreamClosePromiseRef.current = null
      recordingStreamCloseResolverRef.current = null
      recordingUploadPromiseRef.current = null
    }
  }, [workspaceId, folderId, navigate, navigateTo, stopMediaStreamTracks, getCurrentItem, navigateBack])

  const handleMicrophoneDeviceSelection = useCallback(
    (deviceId: string) => {
      if (recordingStatus === "recording" || recordingStatus === "starting" || recordingStatus === "stopping") {
        return
      }
      setSelectedAudioInputId(deviceId)
      setIsMicrophoneEnabled(true)
    },
    [recordingStatus]
  )

  const handleVideoDeviceSelection = useCallback(
    (deviceId: string) => {
      if (recordingStatus === "recording" || recordingStatus === "starting" || recordingStatus === "stopping") {
        return
      }
      setSelectedVideoInputId(deviceId)
    },
    [recordingStatus]
  )

  const handleMicrophoneDisabledSelection = useCallback(() => {
    if (recordingStatus === "recording" || recordingStatus === "starting" || recordingStatus === "stopping") {
      return
    }
    setIsMicrophoneEnabled(false)
  }, [recordingStatus])

  useEffect(() => {
    if (recordingStatus !== "idle") {
      return
    }
    if (!shouldAutoRequestStreamRef.current) {
      return
    }
    void requestMediaStream()
  }, [recordingStatus, requestMediaStream])

  useEffect(() => {
    // Populate input lists even before recording starts.
    void refreshAvailableDevices()
  }, [refreshAvailableDevices])

  useEffect(() => {
    if (!navigator.mediaDevices?.addEventListener) {
      return
    }
    const handleDeviceChange = () => {
      void refreshAvailableDevices()
    }
    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange)
    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange)
    }
  }, [refreshAvailableDevices])

  useEffect(() => {
    if (!isVideoRecording) {
      return
    }

    const videoElement = videoPreviewRef.current
    if (!videoElement) {
      return
    }

    if (mediaStream) {
      videoElement.srcObject = mediaStream
      videoElement.muted = true
      void videoElement.play().catch(() => {})
    } else {
      videoElement.srcObject = null
    }
  }, [isVideoRecording, mediaStream])

  useEffect(() => {
    if (!shouldBlockNavigation) {
      setNavigationBlockMessage(null)
      return
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }

    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
    }
  }, [shouldBlockNavigation])

  useEffect(() => {
    if (navigationBlocker.state !== "blocked") {
      return
    }

    navigationBlocker.reset()
    syncFromUrl(parseWindowLocationFromUrl(location.pathname, location.search))
    setNavigationBlockMessage("Stop recording before navigating away.")
  }, [navigationBlocker, location.pathname, location.search, syncFromUrl])

  useEffect(() => {
    const sidecarTitle = recordingKind === "video" ? "Video recording" : "Audio recording"
    // Always replace the stack so dynamic device + recording status updates are reflected immediately.
    replaceSidecarStack([
      {
        title: sidecarTitle,
        content: (
          <RecordingStatusSidecar
            status={recordingStatus}
            durationLabel={recordingDurationLabel}
            isUploadBlocked={isUploadBlocked}
            errorMessage={recordingErrorMessage}
            navigationBlockMessage={navigationBlockMessage}
            isMicrophoneEnabled={isMicrophoneEnabled}
            availableVideoInputs={availableVideoInputs}
            availableAudioInputs={availableAudioInputs}
            selectedVideoInputId={selectedVideoInputId}
            selectedAudioInputId={selectedAudioInputId}
            isVideoRecording={isVideoRecording}
            isRecordingStopping={isRecordingStopping}
            isRecordingStarting={isRecordingStarting}
            onStartRecording={handleStartRecordingButtonClick}
            onStopRecording={handleStopRecordingButtonClick}
            onSelectVideoInput={handleVideoDeviceSelection}
            onSelectAudioInput={handleMicrophoneDeviceSelection}
            onDisableMicrophone={handleMicrophoneDisabledSelection}
          />
        ),
      },
    ])
  }, [
    recordingStatus,
    recordingDurationLabel,
    isUploadBlocked,
    recordingErrorMessage,
    navigationBlockMessage,
    isMicrophoneEnabled,
    availableVideoInputs,
    availableAudioInputs,
    selectedVideoInputId,
    selectedAudioInputId,
    isVideoRecording,
    isRecordingStopping,
    isRecordingStarting,
    handleStartRecordingButtonClick,
    handleStopRecordingButtonClick,
    handleVideoDeviceSelection,
    handleMicrophoneDeviceSelection,
    handleMicrophoneDisabledSelection,
    replaceSidecarStack,
    recordingKind,
  ])

  useEffect(() => {
    return () => {
      clearSidecar()
    }
  }, [clearSidecar])

  useEffect(() => {
    return () => {
      if (recordingDurationTimerRef.current) {
        window.clearInterval(recordingDurationTimerRef.current)
      }
      mediaStreamRequestIdRef.current += 1
      stopMediaStreamTracks(mediaStreamRef.current)
    }
  }, [stopMediaStreamTracks])

  return (
    <div className={recordingStyles.recordingContainer} data-testid="recording-tool">
      <div className={recordingStyles.recordingPreviewPanel}>
        {isVideoRecording ? (
          <video
            ref={videoPreviewRef}
            className={recordingStyles.recordingVideoPreview}
            data-testid="recording-video-preview"
            playsInline
          />
        ) : (
          <div className={recordingStyles.recordingAudioPlaceholder} data-testid="recording-audio-placeholder">
            {shouldShowAudioRecordingIndicator ? (
              <span className={recordingStyles.recordingAudioIndicator} aria-label="Recording" />
            ) : (
              <>
                <Mic size={32} />
                <span>Audio ready</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
