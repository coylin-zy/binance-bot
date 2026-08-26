# Release checklist

本文档是 Neural Terminal 的发布门槛。所有项目均有当前环境证据后，才允许部署或标记发布完成。

## 1. Source and Git

- [ ] 当前发布提交已记录，工作区无未解释变更
- [ ] `.env*`、Cookie、访问令牌、截图和跟踪文件未进入 Git
- [ ] 版本号与发布说明一致

## 2. Build and dependencies

- [ ] `npm ci` 可从干净依赖状态完成
- [ ] `npm run check` 通过
- [ ] `npm audit` 无未接受的漏洞
- [ ] `docker compose config` 通过且不打印或固化密钥
- [ ] Docker 镜像从空缓存构建成功
- [ ] 容器以非 root 用户运行并通过健康检查

## 3. Security boundary

- [ ] Freqtrade API 仅绑定回环地址或私有容器网络
- [ ] 未认证 BFF 与 SSE 请求返回 `401`
- [ ] `forceenter`、`forceexit`、交易删除、`reload_config` 返回 `403`
- [ ] 浏览器存储中没有 Freqtrade token 或凭据
- [ ] CSP、点击劫持防护、MIME 嗅探防护与权限策略存在
- [ ] 登录限流能锁定并在冷却后恢复

## 4. Product behavior

- [ ] 登录、退出和会话过期回收正常
- [ ] 总览、图表、历史和运行控制四个页面正常
- [ ] K 线使用运行策略周期并可在新事件后刷新
- [ ] SSE 在线、断线降级和恢复状态正确
- [ ] `RUNNING → PAUSED → RUNNING` 可逆冒烟测试通过
- [ ] 加载、空数据、API 失败、渲染错误和 404 状态可用
- [ ] CSV 导出内容与当前筛选结果一致

## 5. Visual and accessibility QA

- [ ] 桌面端首屏与长页面无裁切、覆盖或横向溢出
- [ ] 390px 移动端首屏与长页面无裁切、覆盖或横向溢出
- [ ] 键盘可到达跳转链接、导航、筛选、表单和控制按钮
- [ ] 焦点状态清晰，语义快照包含正确标题、区域和状态
- [ ] 浏览器控制台无相关错误或警告

## 6. Deployment

- [ ] 服务器现有容器、端口、Nginx 和磁盘状态已只读复核
- [ ] 部署目录、Compose 项目名、容器名和端口与其他服务隔离
- [ ] Nginx 配置备份完成，`nginx -t` 通过后才允许 reload
- [ ] HTTPS、登录、所有页面、SSE 和健康探针在线复验通过
- [ ] Freqtrade API 从公网不可直接访问
- [ ] 回滚命令和上一可用镜像/提交已记录
