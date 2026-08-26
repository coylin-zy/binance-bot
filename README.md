# Neural Terminal

面向 Freqtrade 的私有监控与生命周期控制台。前端采用 Next.js App Router，浏览器只访问同源 BFF；Freqtrade 凭据、访问令牌和 WebSocket token 不进入浏览器存储。

## 已实现能力

- 账户权益、累计收益、胜率、回撤和日/周/月收益概览
- 当前持仓、历史交易、收益曲线、筛选与 CSV 导出
- 白名单币对 K 线、最新 OHLC 和策略交易标记
- Freqtrade WebSocket 到浏览器 SSE 的服务端实时桥接
- 最近实时事件安全摘要与新 K 线自动刷新
- 暂停、停止、启动三个受控生命周期动作
- 登录限流、HttpOnly 会话、刷新令牌轮换与过期会话回收
- 自定义加载、空数据、错误和 404 状态
- Docker 健康检查与 `/api/health` 依赖探针
- 桌面端与移动端响应式终端界面

## 安全边界

```text
Browser
  └─ HTTPS / same-origin
      └─ Next.js BFF
          ├─ allowlisted REST reads
          ├─ pair_candles
          ├─ pause / stop / start
          └─ authenticated SSE
              └─ private Freqtrade API + WebSocket
```

- Freqtrade API 不应直接暴露到公网。
- BFF 明确阻断 `forceenter`、`forceexit`、交易删除和 `reload_config`。
- 不提供手动买入、卖出或强平入口。
- `.env.local`、访问令牌、Cookie 和截图测试产物均被 Git 忽略。
- 生产环境必须通过 HTTPS 反向代理访问。

## 本地开发

要求 Node.js 20+，并确保 Freqtrade API 在本机可访问。

```powershell
Copy-Item .env.example .env.local
npm ci
npm run dev
```

在 `.env.local` 中设置实际的 `FREQTRADE_WS_TOKEN`，不要提交该文件。默认页面地址为 `http://localhost:3000`。

## 验证

```powershell
npm run lint
npm run test
npm run build
npm audit
```

完整检查：

```powershell
npm run check
```

模拟 Freqtrade API：

```powershell
npm run qa:mock
```

健康探针：

```powershell
Invoke-RestMethod http://localhost:3000/api/health
```

## Docker

Compose 使用外部网络 `freqtrade_default`，应先启动 Freqtrade 服务。

```powershell
$env:FREQTRADE_WS_TOKEN = '<runtime token>'
docker compose config
docker compose up -d --build
docker compose ps
```

前端只映射到 `127.0.0.1:3000`。公网访问应由 Nginx 或同等反向代理提供 TLS、主机名校验和访问日志。

## 发布规则

部署不是构建成功的同义词。每次发布必须依次通过：

1. TypeScript、单元测试、生产构建和依赖审计。
2. Docker 镜像构建、健康检查和最小权限配置检查。
3. 真实 Freqtrade 登录、REST、SSE、K 线和生命周期回归。
4. 桌面端与移动端页面、交互、控制台和错误状态检查。
5. 禁止端点 `403`、未认证请求 `401` 和 API 非公网验证。
6. Git 工作区干净并包含可回滚的阶段提交。
7. 线上 HTTPS、健康探针、日志和用户可见行为复验。

详细发布门槛见 [`docs/release-checklist.md`](docs/release-checklist.md)。
