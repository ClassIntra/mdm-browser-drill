# mdm-browser-drill

MDM 浏览器层过滤器黑盒测绘套件。不 root、不越狱、不装证书、不做中间人，62 个探针，把一台受管平板上浏览器过滤引擎的判定规则收敛成 12 行伪代码。

> 配套阅读：过程叙事见 [`docs/文章-让软破再次伟大.md`](docs/文章-让软破再次伟大.md)，62 探针逐项判读见 [`03-完整测试报告.html`](03-完整测试报告.html)。

## 结论速览（模型 v6 终稿）

引擎对 GURL 规范化后的 URL authority（`userinfo@host:port`）做判定：

```python
BLACKLIST = {"192.168.40.1", "192.168.40.90", "192.168.125.1"}  # 纯子串匹配，全端口

def decide(authority: str) -> bool:
    if authority.count("@") >= 2:
        return DENY                                     # 粗糙合法性检查

    token, _, hostport = authority.partition("@")

    if token == "":                                     # 空/无 userinfo → 查 host
        host = strip_port(hostport)
        return DENY if any(ip in host for ip in BLACKLIST) else ALLOW

    return DENY if any(ip in token for ip in BLACKLIST) else ALLOW
    # token 非空 → 只查 token，host 不看 —— userinfo 旁路的真正机理
```

要点：

- 判定输入是**规范化前、凭据剥离前**的 URL；判定通过后网络栈才剥离凭据
- 黑名单为**纯字符串子串匹配**（192.168.40.100 被 192.168.40.1 前缀连坐）
- siteList「白名单」不参与浏览器层判定（同一策略三条目三种判法）
- token 非空即短路：`http://a@192.168.40.90:9011/` 任意非空串可过；host 完全不被查
- IPv4-mapped IPv6（`[::ffff:192.168.40.90]`）被 hex 化后点分四段消失，同样放行
- 拦截为合成响应软拦（顶层导航「无效的响应」/ 子资源合成 404），目标侧零痕迹；逐导航重判，无会话信任

## 目录结构

```
mdm-browser-drill/
├── 01-演习方案.html          演习总方案（用例矩阵、授权声明与红线）
├── 02-首轮实测结论.html      第一轮结论（30 探针，v3 模型，后被二轮修正）
├── 03-完整测试报告.html      完整报告（62 探针全量判读、模型演进史、E1-E7）
├── server/lab-server.mjs     靶机（零依赖 Node，9011+18081 双端口，逐请求留痕）
├── server/probe-variants.mjs DP 变体 URL 在 WHATWG URL 下的规范化验证脚本
├── pages/                    探针页（index 总控台 + nav/sub/dom/ab/dp/dp2/dp3）
├── records/                  两轮原始留痕：access.log / observe.csv / server.log
└── docs/                     文章、防御侧配对建议、CI 适配方案
```

## 复现

```bash
node server/lab-server.mjs                # 或双击 start.cmd
curl -s http://127.0.0.1:9011/api/ping    # 返回 {"ok":1,...} 即正常
```

受管设备连入同网段，浏览器打开 `http://<靶机IP>:9011/`（若被拦，用 userinfo 形态进入：`http://a@<靶机IP>:9011/`），从总控台按 N → S → DN → DP 组顺序执行，每步以 `records/` 落账为准。

参数：`PORT` / `ALT_PORT` / `ROOT` / `REC` 环境变量；探针页顶部 `LAB` / `DOM` 常量，支持 `?dom=` 临时覆盖。

## 判读规则

- **放行** = access.log 出现该请求（含 `?case=`）落账；「连接被拒绝」/ 超时 / 长转圈都是真实网络错误，属于放行侧
- **拦** = 日志零落账 + 设备端「无效的响应」（顶层）或 onerror 404（子资源），秒出
- 页面文案只作旁证，服务端日志才是判据

## 授权与边界

全部实验在自有受管设备、自有靶机与授权网段内完成，探测目标只指向实验者自己的服务器地址；不下载、不执行外部载荷，不触碰厂商云端。结论用于管理端策略修复工单、厂商沟通与本地检测规则（见 [`docs/detection-pairing.md`](docs/detection-pairing.md)）。请勿将本套件用于未授权网络。
