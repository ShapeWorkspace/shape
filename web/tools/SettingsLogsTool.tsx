import { useCallback, useEffect, useMemo, useState } from "react"
import { Clipboard, FileText, Server, Trash2 } from "lucide-react"
import { List, ListEmpty, ListHeader, ListRow, ListSearch, ListSectionHeader } from "../components/ListUI"
import { useLogStore } from "../store/log-store"
import { useStatusStore } from "../store/status-store"
import { useEngineStore } from "../store/engine-store"
import { useSidecar } from "../contexts/SidecarContext"
import { WorkspaceInfoSidecar } from "../components/WorkspaceInfoSidecar"
import * as logStyles from "../styles/settings-logs.css"

const LOG_COPY_STATUS_ID = "settings-logs-copy-status"

const copyTextToClipboard = async (text: string): Promise<boolean> => {
  if (typeof navigator === "undefined" || !navigator.clipboard) {
    return false
  }

  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/**
 * SettingsLogsTool shows the in-app client logs so mobile builds can be diagnosed without console access.
 */
export function SettingsLogsTool() {
  const { logEntries, clearLogEntries, buildClipboardLogExport } = useLogStore()
  const { upsertStatus, removeStatus } = useStatusStore()
  const { application } = useEngineStore()
  const { setSidecar, clearSidecar } = useSidecar()
  const [searchQuery, setSearchQuery] = useState("")

  // Get the current API server URL from the network service.
  const serverUrl = application?.getAccountStore().getHttpClient().getBaseUrl() ?? "Unknown"

  // Keep the workspace info sidecar visible for consistent settings navigation.
  useEffect(() => {
    setSidecar(<WorkspaceInfoSidecar />, "Workspace")
    return () => clearSidecar()
  }, [setSidecar, clearSidecar])

  const normalizedQuery = searchQuery.trim().toLowerCase()

  const visibleLogEntries = useMemo(() => {
    if (!normalizedQuery) {
      return logEntries
    }

    return logEntries.filter(entry => {
      const messageMatches = entry.message.toLowerCase().includes(normalizedQuery)
      const loggerMatches = entry.loggerName.toLowerCase().includes(normalizedQuery)
      const argumentMatches = entry.argumentSummaries.some(argument =>
        argument.toLowerCase().includes(normalizedQuery)
      )
      return messageMatches || loggerMatches || argumentMatches
    })
  }, [logEntries, normalizedQuery])

  const showLogStatus = useCallback(
    (message: string, variant: "info" | "success" | "warning" | "error") => {
      upsertStatus({
        id: LOG_COPY_STATUS_ID,
        message,
        variant,
        isDismissible: true,
      })

      window.setTimeout(() => {
        removeStatus(LOG_COPY_STATUS_ID)
      }, 2500)
    },
    [upsertStatus, removeStatus]
  )

  const handleCopyAllLogs = useCallback(async () => {
    const exportPayload = buildClipboardLogExport()
    const didCopy = await copyTextToClipboard(exportPayload)
    if (didCopy) {
      showLogStatus("Logs copied to clipboard.", "success")
      return
    }

    showLogStatus("Unable to copy logs from this device.", "warning")
  }, [buildClipboardLogExport, showLogStatus])

  const handleClearLogs = useCallback(() => {
    clearLogEntries()
    showLogStatus("Logs cleared.", "info")
  }, [clearLogEntries, showLogStatus])

  const buildSingleLogExport = useCallback(
    (entryIndex: number) => {
      const entry = visibleLogEntries[entryIndex]
      if (!entry) {
        return ""
      }

      const argumentSummary =
        entry.argumentSummaries.length > 0 ? ` | ${entry.argumentSummaries.join(" | ")}` : ""
      return `${entry.timestampIso} [${entry.loggerName}:${entry.levelName}] ${entry.message}${argumentSummary}`
    },
    [visibleLogEntries]
  )

  const handleCopySingleLogEntry = useCallback(
    async (entryIndex: number) => {
      const exportPayload = buildSingleLogExport(entryIndex)
      if (!exportPayload) {
        return
      }

      const didCopy = await copyTextToClipboard(exportPayload)
      if (didCopy) {
        showLogStatus("Log entry copied.", "success")
        return
      }

      showLogStatus("Unable to copy logs from this device.", "warning")
    },
    [buildSingleLogExport, showLogStatus]
  )

  const handleCopyServerUrl = useCallback(async () => {
    const didCopy = await copyTextToClipboard(serverUrl)
    if (didCopy) {
      showLogStatus("Server URL copied.", "success")
      return
    }
    showLogStatus("Unable to copy server URL.", "warning")
  }, [serverUrl, showLogStatus])

  const actionRows = useMemo(
    () => [
      {
        id: "server-url",
        title: "Server",
        meta: serverUrl,
        icon: <Server size={16} />,
        onClick: handleCopyServerUrl,
        testId: "settings-logs-server-row",
      },
      {
        id: "copy-all",
        title: "Copy Logs",
        icon: <Clipboard size={16} />,
        onClick: handleCopyAllLogs,
        testId: "settings-logs-copy-row",
      },
      {
        id: "clear",
        title: "Clear Logs",
        icon: <Trash2 size={16} />,
        onClick: handleClearLogs,
        testId: "settings-logs-clear-row",
      },
    ],
    [serverUrl, handleCopyServerUrl, handleCopyAllLogs, handleClearLogs]
  )

  const totalSelectableRows = actionRows.length + visibleLogEntries.length

  const handleSelect = useCallback(
    (index: number) => {
      if (index < actionRows.length) {
        actionRows[index]?.onClick()
        return
      }

      const logIndex = index - actionRows.length
      void handleCopySingleLogEntry(logIndex)
    },
    [actionRows, handleCopySingleLogEntry]
  )

  return (
    <List itemCount={totalSelectableRows} onSelect={handleSelect} testId="settings-logs-tool-container">
      <ListHeader title="Logs" />
      <ListSearch
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Search logs..."
        testId="settings-logs-search"
      />

      <ListSectionHeader title="Actions" />
      {actionRows.map((row, index) => (
        <ListRow
          key={row.id}
          index={index}
          icon={row.icon}
          title={row.title}
          meta={"meta" in row ? row.meta : undefined}
          onClick={row.onClick}
          testId={row.testId}
        />
      ))}

      <ListSectionHeader title="Recent Entries" count={visibleLogEntries.length} hasSeparator />
      {visibleLogEntries.length === 0 ? (
        <ListEmpty message="No logs captured yet." testId="settings-logs-empty" />
      ) : (
        visibleLogEntries.map((entry, entryIndex) => {
          const rowIndex = actionRows.length + entryIndex
          const message = entry.message || "Log entry"
          const argumentSummary =
            entry.argumentSummaries.length > 0 ? entry.argumentSummaries.join("\n") : "No details"
          const details = `${entry.loggerName}\n${argumentSummary}`

          return (
            <ListRow
              key={entry.id}
              index={rowIndex}
              icon={<FileText size={16} />}
              title={`${entry.levelName}: ${message}`}
              meta={entry.timestampIso}
              onClick={() => handleCopySingleLogEntry(entryIndex)}
              testId={`settings-logs-entry-${entry.id}`}
            >
              <span className={logStyles.logRowDetails}>{details}</span>
            </ListRow>
          )
        })
      )}
    </List>
  )
}
