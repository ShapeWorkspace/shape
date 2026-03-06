import { Folder } from "lucide-react"

/**
 * FolderIcon displays a plain folder icon.
 *
 * Folders are unified containers that can hold both files and papers,
 * so no type badge is needed.
 *
 * @param size - The size of the folder icon in pixels (default 16)
 */
interface FolderIconProps {
  size?: number
}

export function FolderIcon({ size = 16 }: FolderIconProps) {
  return <Folder size={size} />
}
