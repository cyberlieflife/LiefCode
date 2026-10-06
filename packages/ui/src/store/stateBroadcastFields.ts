/**
 * 跨窗口同步的 store 字段登记表。
 *
 * 只有登记在这里的字段会在变更时广播给其他窗口；字段名同时用于
 * `state:<field>` 频道，接收端按同一份列表判断是否属于状态同步消息。
 */
export const STATE_BROADCAST_FIELDS = [
  "theme",
  "locale",
  "uiFontSizePx",
  "uiFontFamilyLatin",
  "uiFontFamilyCjk",
  "interfaceMode",
  "uiCardStyleSidebar",
  "uiCardStyleCardLarge",
  "uiCardStyleCardSmall",
  "uiCardStylePanel",
  "uiCardStyleBackground",
] as const;

export type StateBroadcastField = (typeof STATE_BROADCAST_FIELDS)[number];

/** 界面字体偏好字段；接收端据此把消息分派到对应的字体 setter。 */
export const UI_FONT_FAMILY_BROADCAST_FIELDS = ["uiFontFamilyLatin", "uiFontFamilyCjk"] as const;

export type UiFontFamilyBroadcastField = (typeof UI_FONT_FAMILY_BROADCAST_FIELDS)[number];

export function isUiFontFamilyBroadcastField(
  field: string,
): field is UiFontFamilyBroadcastField {
  return (UI_FONT_FAMILY_BROADCAST_FIELDS as readonly string[]).includes(field);
}

/** 卡片样式偏好字段（每个区域一个）；接收端据此把消息分派到对应的卡片样式 setter。 */
export const UI_CARD_STYLE_BROADCAST_FIELDS = [
  "uiCardStyleSidebar",
  "uiCardStyleCardLarge",
  "uiCardStyleCardSmall",
  "uiCardStylePanel",
  "uiCardStyleBackground",
] as const;

export type UiCardStyleBroadcastField = (typeof UI_CARD_STYLE_BROADCAST_FIELDS)[number];

export function isUiCardStyleBroadcastField(field: string): field is UiCardStyleBroadcastField {
  return (UI_CARD_STYLE_BROADCAST_FIELDS as readonly string[]).includes(field);
}
