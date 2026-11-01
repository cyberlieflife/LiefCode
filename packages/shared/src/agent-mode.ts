/**
 * 会话模式：传统 Agent 与 SuperAgent 路由模式。
 * 作为共享值域，供设置、协议与会话配置共同引用，避免各层重复定义。
 */
export const AGENT_MODES = ["agent", "superagent"] as const;

export type AgentMode = (typeof AGENT_MODES)[number];

/** 历史会话与历史设置没有该字段，统一按传统 Agent 处理。 */
export const DEFAULT_AGENT_MODE: AgentMode = "agent";
