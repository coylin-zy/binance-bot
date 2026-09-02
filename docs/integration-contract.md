# Binance Bot 集成契约

这份契约冻结 Dashboard BFF、Freqtrade 和可选外部服务之间的能力边界。它描述的是
接口语义，不包含任何运行时凭据。所有浏览器请求都必须先通过认证的 Next.js BFF。

## 能力分层

| 能力 | 数据源 | 是否改变状态 | 是否允许浏览器直接访问 |
| --- | --- | --- | --- |
| `market_data` | Binance Global 公共行情 / Freqtrade | 否 | 否，必须经 BFF |
| `account_read` | Binance Global 私有只读 API（可选） | 否 | 否，服务端签名 |
| `order_simulation` | Freqtrade dry-run | 仅更新模拟状态 | 否，当前 UI 不提供手动下单 |
| `order_live` | Binance 实盘 | 会产生真实资金风险 | 禁止，需独立审批和隔离配置 |

## Freqtrade BFF

允许的读取端点包括余额、收益、交易、白名单、K 线、运行配置和状态；暂停、停止、
启动是唯一保留的生命周期动作。`forceenter`、`forceexit`、删除交易和配置热重载必须
始终返回 `403`，即使上游 Freqtrade 支持这些端点。

服务端只向浏览器暴露脱敏后的 JSON 和 SSE 事件。Freqtrade token、WebSocket token、
Cookie 和上游 `Authorization` header 永不进入客户端 bundle、localStorage 或日志。

## Binance 私有账户

账户观测使用服务端 HMAC 签名请求，默认只调用 `/api/v3/time` 和 `/api/v3/account`。
返回状态必须属于以下枚举，并且不能阻断公共行情或 dry-run：

```text
not_configured | available | unauthorized | rate_limited | network_error | api_error
```

账户余额必须标记为 `OPTIONAL ACCOUNT DATA`，与 `SIMULATED BALANCE` 分开显示。Key 只
允许读取权限、关闭提现并限制 IP；本仓库只提交空值示例变量。

## LLM Gateway

LLM 由服务端调用 OpenAI-compatible `chat/completions`，第一阶段仅支持：

```text
market_summary | strategy_review | trade_explanation
```

输出 schema 固定为 `summary`、`risk_flags`、`evidence`、`limitations`、`expires_at`。
模型不得返回或驱动下单、`force-entry`、`force-exit`、策略配置修改、`bias` 或
`confidence` 信号。未配置、超时、429、预算耗尽、熔断和非法响应都必须降级为可解释的
只读状态，不能暂停 Freqtrade。

## 数据血缘与审计

每个决策或解释事件至少记录：

```text
decision_id, experiment_id, git_sha, strategy_sha, strategy_version,
freqtrade_version, docker_image_digest, protocol_version, prompt_version,
provider, model, input_snapshot_hash, market_data_timestamp,
request_timestamp, latency_ms, token_usage, result_status
```

审计日志为追加式 JSONL；写入前递归脱敏 credential-shaped 字段。原始 prompt、API
Key、完整账户标识和 Authorization header 不得持久化。

## 版本与兼容性

- 当前协议版本：`v1`。
- 任何字段删除、状态枚举变更或能力升级必须提升协议版本，并同时更新测试、Dashboard
  和部署清单。
- `dry_run=true` 是默认且必须的安全门；`order_live` 不属于当前部署契约。
