# 模型请求：中转网关「Upstream error」400 仍按瞬态失败重试

## 产品规则

- 部分 OpenAI-compatible 中转网关在上游不可达时返回 HTTP 400，响应正文只有
  `Upstream error (request id: ...)` 这类通用文案，不含任何请求参数校验信息。
- 该失败属于上游侧瞬时故障，重复发送同一请求通常可以恢复，因此分类器判为可重试，
  由既有 attempt 循环按指数退避继续重试。
- 只有文案是通用上游错误包装时才放宽。带具体校验信息（参数、schema、token 统计等）
  的 400/422 仍然判为 `invalid_request` 并立即终止，避免无意义重试。
- 上下文超窗仍优先判为不可重试，不受本规则影响。
- 重试次数沿用现有预算（默认 10 次重试）；预算耗尽后按原有错误路径失败。

## 状态所有者

```
provider HTTP 400 响应
  → APICallError / ProviderBusinessError（adapter 边界）
    → classifyModelFailure / classifyProviderBusinessFailure（唯一分类事实）
      → retryable=true, reason=server_error
        → runner attempt 循环（stream / generate 共用）继续重试
```

- 分类结果只在 `failure-classifier.ts` 产生，runner 不重复判定文案。
- workflow 无上限预算读取同一分类结果：`server_error` 不在停止表内，因此同样重试。

## 验收场景

1. HTTP 400，message 为 `Upstream error (request id: 202610170939060756107748268d9d6IgSTBKFK)`：
   分类为 `server_error` 且 `retryable=true`，runner 继续重试。
2. 同一文案出现在响应体 `error.message` 或 `cause.message` 中：同样判为可重试。
3. HTTP 400，message 含具体校验信息（如 `invalid tool schema`、上下文超窗文案）：
   维持 `invalid_request` / `context_exceeded`，不重试。
4. 重试预算耗尽：按原有失败路径结束 turn，错误上下文保留 `statusCode=400`。
