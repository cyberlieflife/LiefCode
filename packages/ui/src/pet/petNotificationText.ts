import type { PetDesktopStatus, PetDesktopTaskCard } from "@zcode/shared";
import type { IntlInstance } from "@/i18n/IntlProvider.js";

import type { PetTaskCard } from "./contract.js";
import type { PetTaskCardLabels } from "./petTaskCards.js";

export const PET_DESKTOP_LABEL_IDS = {
  collapseTasks: "settings.pet.tasks.collapse",
  expandTasks: "settings.pet.tasks.expand",
} as const;

export const PET_TASK_LABEL_IDS = {
  untitled: "taskList.untitled",
  thinking: "settings.pet.task.thinking",
  waiting: "settings.pet.notification.waiting",
  completed: "settings.pet.notification.review",
  failed: "settings.pet.notification.failed",
} as const;

/** 宠物窗口没有 i18n 上下文，折叠/展开的可访问名称同样由主窗口解析。 */
export function buildPetDesktopLabels(intl: IntlInstance): PetDesktopStatus["labels"] {
  return {
    collapseTasks: intl.formatMessage({ id: PET_DESKTOP_LABEL_IDS.collapseTasks }),
    expandTasks: intl.formatMessage({ id: PET_DESKTOP_LABEL_IDS.expandTasks }),
  };
}

/** 主窗口负责本地化；宠物窗口只渲染已解析好的标题与小字。 */
export function buildPetTaskCardLabels(intl: IntlInstance): PetTaskCardLabels {
  return {
    untitled: intl.formatMessage({ id: PET_TASK_LABEL_IDS.untitled }),
    thinking: intl.formatMessage({ id: PET_TASK_LABEL_IDS.thinking }),
    waiting: intl.formatMessage({ id: PET_TASK_LABEL_IDS.waiting }),
    completed: intl.formatMessage({ id: PET_TASK_LABEL_IDS.completed }),
    failed: intl.formatMessage({ id: PET_TASK_LABEL_IDS.failed }),
  };
}

/** UI 侧任务卡 → IPC 载荷；只保留宠物窗口需要的字段。 */
export function toPetDesktopTaskCards(
  cards: readonly PetTaskCard[],
): PetDesktopTaskCard[] {
  return cards.map((card) => ({
    taskId: card.taskId,
    kind: card.kind,
    title: card.title,
    detail: card.detail,
    expiresAt: card.expiresAt,
  }));
}
