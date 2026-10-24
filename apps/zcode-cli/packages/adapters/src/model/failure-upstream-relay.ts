import { getApiCallResponseBody, getResponseHeaders } from "./failure-inspection.js";

/**
 * 中转网关的通用「上游错误」包装。
 *
 * 部分 OpenAI-compatible 中转网关在上游不可达时返回 HTTP 400，正文只有上游错误与
 * request id，不含任何请求参数校验信息。请求本身没有问题，重发同一请求通常可以恢复，
 * 因此这类失败按瞬态故障重试，而不是当作 invalid_request 直接终止。
 */

// 只匹配「整条文案就是上游错误」的形状；带具体校验原因的 400 仍落到 invalid_request。
const UPSTREAM_RELAY_ERROR_PATTERNS = [
  /^(?:upstream\s+(?:service\s+|relay\s+)?(?:error|failure)|upstream\s+request\s+(?:error|failed)|error\s+from\s+upstream)\b(?:[\s:：—–-]*\(?\s*request\s*id\s*[:：=#]?\s*[^)\s]*\s*\)?)?[\s.!。]*$/iu,
  // Envoy 等网关的连接级失败文案，明确指向连接建立或中断。
  /^upstream\s+connect\s+error\b/iu,
];

export function isTransientUpstreamRelayFailure(error: unknown): boolean {
  // provider 显式声明不要重试时以它为准，不能被文案规则覆盖。
  const headers = getResponseHeaders(error);
  if (headers && isShouldRetryHeaderFalse(headers)) {
    return false;
  }
  return hasTransientUpstreamRelaySignal(error, new WeakSet<object>());
}

function hasTransientUpstreamRelaySignal(error: unknown, seen: WeakSet<object>): boolean {
  if (markSeen(error, seen)) {
    return false;
  }

  const record = asRecord(error);
  const responseBody = getApiCallResponseBody(error);
  if (
    isUpstreamRelayMessage(stringProperty(record, "message")) ||
    // ProviderBusinessError 把原始文案放在 providerMessage。
    isUpstreamRelayMessage(stringProperty(record, "providerMessage")) ||
    isUpstreamRelayMessage(standardResponseBodyMessage(responseBody))
  ) {
    return true;
  }

  const cause = record.cause;
  return cause && cause !== error ? hasTransientUpstreamRelaySignal(cause, seen) : false;
}

function isUpstreamRelayMessage(value: string | undefined): boolean {
  const message = value?.trim();
  if (!message) {
    return false;
  }
  return UPSTREAM_RELAY_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

function standardResponseBodyMessage(body: unknown): string | undefined {
  const record = asRecord(body);
  const nestedError = asRecord(record.error);
  return stringProperty(nestedError, "message") ?? stringProperty(record, "message");
}

function isShouldRetryHeaderFalse(headers: Record<string, string>): boolean {
  const value = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === "x-should-retry",
  )?.[1];
  const normalized = value?.trim().toLowerCase();
  return normalized === "false" || normalized === "0";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function stringProperty(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function markSeen(value: unknown, seen: WeakSet<object>): boolean {
  if (value === null || typeof value !== "object") {
    return false;
  }
  if (seen.has(value)) {
    return true;
  }
  seen.add(value);
  return false;
}
