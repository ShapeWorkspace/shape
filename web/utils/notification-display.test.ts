import { describe, it, expect } from "vitest"
import {
  getEntityTypeDescription,
  getNotificationFallbackVerb,
  getNotificationDescription,
  buildNotificationVerb,
  buildNotificationDisplayCopy,
} from "./notification-display"

describe("getEntityTypeDescription", () => {
  it("returns correct description for common entity types", () => {
    expect(getEntityTypeDescription("task")).toBe("Task")
    expect(getEntityTypeDescription("paper")).toBe("Paper")
    expect(getEntityTypeDescription("folder")).toBe("Folder")
    expect(getEntityTypeDescription("group-chat")).toBe("Group chat")
    expect(getEntityTypeDescription("direct-message")).toBe("Direct message")
  })

  it("returns Item for unknown entity types", () => {
    // @ts-expect-error - testing unknown type
    expect(getEntityTypeDescription("unknown_type")).toBe("Item")
  })
})

describe("getNotificationFallbackVerb", () => {
  it("returns correct fallback verb for task actions", () => {
    expect(getNotificationFallbackVerb("task_assigned")).toBe("assigned you a task")
    expect(getNotificationFallbackVerb("task_comment")).toBe("commented on a task")
    expect(getNotificationFallbackVerb("task_mention")).toBe("mentioned you in a task")
  })

  it("returns correct fallback verb for discussion actions", () => {
    expect(getNotificationFallbackVerb("discussion_reply")).toBe("replied to a discussion")
    expect(getNotificationFallbackVerb("discussion_mention")).toBe("mentioned you in a discussion")
  })

  it("returns correct fallback verb for paper actions", () => {
    expect(getNotificationFallbackVerb("paper_comment")).toBe("commented on a paper")
    expect(getNotificationFallbackVerb("paper_mention")).toBe("mentioned you in a paper")
    expect(getNotificationFallbackVerb("paper_shared")).toBe("shared a paper with you")
  })

  it("returns correct fallback verb for messaging actions", () => {
    expect(getNotificationFallbackVerb("group_message")).toBe("sent a message in a group")
    expect(getNotificationFallbackVerb("group_added")).toBe("added you to a group")
    expect(getNotificationFallbackVerb("dm_received")).toBe("sent you a direct message")
  })

  it("handles task_mention with task_comment target entity type", () => {
    expect(getNotificationFallbackVerb("task_mention", "task-comment")).toBe(
      "mentioned you in a task comment"
    )
  })

  it("handles paper_shared with file target entity type", () => {
    expect(getNotificationFallbackVerb("paper_shared", "file")).toBe("shared a file with you")
  })

  it("returns generic fallback for unknown action type", () => {
    // @ts-expect-error - testing unknown type
    expect(getNotificationFallbackVerb("unknown_action")).toBe("sent an update")
  })
})

describe("getNotificationDescription", () => {
  it("returns Task for task-related actions", () => {
    expect(getNotificationDescription("task_assigned")).toBe("Task")
    expect(getNotificationDescription("task_comment")).toBe("Task")
    expect(getNotificationDescription("task_mention")).toBe("Task")
  })

  it("returns Paper for paper-related actions", () => {
    expect(getNotificationDescription("paper_comment")).toBe("Paper")
    expect(getNotificationDescription("paper_mention")).toBe("Paper")
    expect(getNotificationDescription("paper_comment_reply")).toBe("Paper")
  })

  it("returns File for paper_shared with file target", () => {
    expect(getNotificationDescription("paper_shared", "file")).toBe("File")
  })

  it("returns Direct message for dm_received", () => {
    expect(getNotificationDescription("dm_received")).toBe("Direct message")
  })
})

describe("buildNotificationVerb", () => {
  describe("with entity name", () => {
    it("builds verb with task name for task_assigned", () => {
      expect(buildNotificationVerb("task_assigned", "Fix login bug")).toBe(
        "assigned you Fix login bug"
      )
    })

    it("builds verb with task name for task_comment", () => {
      expect(buildNotificationVerb("task_comment", "Update docs")).toBe("commented on Update docs")
    })

    it("builds verb with discussion name for discussion_reply", () => {
      expect(buildNotificationVerb("discussion_reply", "Q3 Planning")).toBe("replied to Q3 Planning")
    })

    it("builds verb with paper name for paper_mention", () => {
      expect(buildNotificationVerb("paper_mention", "Design Spec")).toBe(
        "mentioned you in Design Spec"
      )
    })

    it("builds verb with group name for group_message", () => {
      expect(buildNotificationVerb("group_message", "Engineering")).toBe(
        "sent a message in Engineering"
      )
    })

    it("builds verb with folder name for folder_shared", () => {
      expect(buildNotificationVerb("folder_shared", "Project Assets")).toBe(
        "shared Project Assets"
      )
    })
  })

  describe("without entity name (null)", () => {
    it("returns fallback verb for task_assigned", () => {
      expect(buildNotificationVerb("task_assigned", null)).toBe("assigned you a task")
    })

    it("returns fallback verb for discussion_reply", () => {
      expect(buildNotificationVerb("discussion_reply", null)).toBe("replied to a discussion")
    })

    it("returns fallback verb for paper_comment", () => {
      expect(buildNotificationVerb("paper_comment", null)).toBe("commented on a paper")
    })
  })

  describe("with targetEntityType variations", () => {
    it("handles task_mention in task_comment context", () => {
      expect(buildNotificationVerb("task_mention", "Bug Report", "task-comment")).toBe(
        "mentioned you in a comment on Bug Report"
      )
      expect(buildNotificationVerb("task_mention", null, "task-comment")).toBe(
        "mentioned you in a task comment"
      )
    })

    it("handles paper_shared for file", () => {
      expect(buildNotificationVerb("paper_shared", "report.pdf", "file")).toBe("shared report.pdf")
      expect(buildNotificationVerb("paper_shared", null, "file")).toBe("shared a file")
    })
  })
})

describe("buildNotificationDisplayCopy", () => {
  it("builds complete display copy with entity name", () => {
    const copy = buildNotificationDisplayCopy("Alice", "task_assigned", "Fix bug")

    expect(copy.title).toBe("Alice assigned you Fix bug")
    expect(copy.description).toBe("Task")
  })

  it("builds complete display copy without entity name", () => {
    const copy = buildNotificationDisplayCopy("Bob", "paper_comment", null)

    expect(copy.title).toBe("Bob commented on a paper")
    expect(copy.description).toBe("Paper")
  })

  it("includes extra suffix when provided", () => {
    const copy = buildNotificationDisplayCopy(
      "Charlie",
      "task_comment",
      "Dashboard",
      undefined,
      " (+3 more notifications)"
    )

    expect(copy.title).toBe("Charlie commented on Dashboard (+3 more notifications)")
    expect(copy.description).toBe("Task")
  })

  it("handles targetEntityType for paper_shared file", () => {
    const copy = buildNotificationDisplayCopy("Dana", "paper_shared", "budget.xlsx", "file")

    expect(copy.title).toBe("Dana shared budget.xlsx")
    expect(copy.description).toBe("File")
  })

  it("handles dm_received action", () => {
    const copy = buildNotificationDisplayCopy("Eve", "dm_received", null)

    expect(copy.title).toBe("Eve sent you a direct message")
    expect(copy.description).toBe("Direct message")
  })
})
