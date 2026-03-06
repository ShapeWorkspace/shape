import { useCallback, useMemo } from "react"
import { Bell } from "lucide-react"
import { List, ListRow, ListEmpty } from "../components/ListUI"
import { useNotificationSettings } from "../store/queries/use-notification-settings"
import { useAuthStore } from "../store/auth-store"
import { useEngineStore } from "../store/engine-store"
import {
  NOTIFICATION_ACTION_DEFINITIONS,
  type NotificationActionType,
} from "../../engine/models/notification"

/**
 * NotificationSettingsTool allows users to enable/disable push notifications per action.
 * In-app notifications are always on (per spec), so we expose only push toggles here.
 */
export function NotificationSettingsTool() {
  const { currentUser } = useAuthStore()
  const { application } = useEngineStore()
  const isNotificationSettingsDisabled = !currentUser || !application?.isWorkspaceRemote()
  const disabledMessage = currentUser
    ? "Notification settings are available after the workspace syncs."
    : "Sign in to manage notification settings."

  const {
    data: preferences,
    preferencesByActionType,
    isLoading,
    pendingActionType,
    updatePreference,
  } = useNotificationSettings()

  const orderedDefinitions = useMemo(() => NOTIFICATION_ACTION_DEFINITIONS, [])

  const handleToggleNotificationPreference = useCallback(
    (actionType: NotificationActionType) => {
      const preference = preferencesByActionType.get(actionType)
      const nextValue = preference ? !preference.pushEnabled : false
      updatePreference({
        actionType,
        pushEnabled: nextValue,
      })
    },
    [preferencesByActionType, updatePreference]
  )

  if (isNotificationSettingsDisabled) {
    return (
      <List itemCount={0} testId="notification-settings-tool-container">
        <ListEmpty message={disabledMessage} />
      </List>
    )
  }

  if (isLoading && preferences.length === 0) {
    return (
      <List itemCount={0} testId="notification-settings-tool-container">
        <ListEmpty message="Loading notification settings..." />
      </List>
    )
  }

  return (
    <List itemCount={orderedDefinitions.length} testId="notification-settings-tool-container">
      {orderedDefinitions.map((definition, index) => {
        const preference = preferencesByActionType.get(definition.actionType)
        const pushEnabled = preference?.pushEnabled ?? true
        const isPending = pendingActionType === definition.actionType
        const metaText = isPending ? "Saving..." : pushEnabled ? "Push on" : "Push off"

        return (
          <ListRow
            key={definition.actionType}
            index={index}
            icon={<Bell size={16} />}
            title={definition.label}
            meta={metaText}
            onClick={() => handleToggleNotificationPreference(definition.actionType)}
            testId={`notification-setting-${definition.actionType}`}
          />
        )
      })}
    </List>
  )
}
