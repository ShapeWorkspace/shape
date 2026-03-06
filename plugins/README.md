# Plugin Registry System

This system allows you to dynamically register and use plugins without the limitations of React hooks.

## How it works

### 1. Plugin Definition

Plugins are now regular objects, not hooks:

```typescript
// plugins/text/plugin.tsx
export const textPlugin: Plugin<TextData> = {
  activityName: "Text",
  activityType: ActivityType.Text,
  activityIcon: MessageCircle,
  hasCollapsedMode: true,
  placeholder: textPlaceholder,
  composer: TextComposer,
  renderer: TextRenderer,
}
```

### 2. Plugin Registration

Plugins are registered at app startup:

```typescript
// plugins/index.ts
import { registerPlugin } from "./plugin"
import { textPlugin } from "./text/plugin"

export function initializePlugins(): void {
  registerPlugin(textPlugin)
  // Add more plugins here...
}
```

### 3. Using Plugins

You can now get plugins conditionally:

```typescript
// In any component
import { getRegisteredPlugins, getPlugin } from "@shape/plugins"

// Get all plugins
const allPlugins = getRegisteredPlugins()

// Get a specific plugin
const textPlugin = getPlugin(ActivityType.Text)

// Use conditionally (this wasn't possible with hooks!)
if (someCondition) {
  const plugin = getPlugin(ActivityType.Text)
  // Use plugin...
}
```

## Benefits

1. **No hook limitations** - Can be called conditionally
2. **Dynamic registration** - Add/remove plugins at runtime
3. **Better performance** - No unnecessary re-renders from hook dependencies
4. **Cleaner architecture** - Separation of concerns

## Creating New Plugins

1. Create your plugin object following the `Plugin<D>` interface
2. Add it to `plugins/index.ts` in the `initializePlugins()` function
3. That's it! It will be available throughout the app.
