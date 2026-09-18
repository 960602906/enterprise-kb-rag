# 部署与运维指南 / Deploy & Operations Guide

面向**初学者**的逐步说明：把 [Atlas KB](./README.md)（企业知识库 RAG）部署到本机或一台 VPS，并完成日常运维。

This guide is for beginners who want to **self-host** this open-source project. It is **not** a free public SaaS — you run the app, Postgres, and bring your own LLM / embedding keys.

> **相关文档 / Related**
>
> - 快速开始：[README.md](./README.md)
> - 环境变量模板：[`.env.example`](./.env.example)
> - 单机脚本说明：[scripts/README-prod.md](./scripts/README-prod.md)
> - 安全报告：[SECURITY.md](./SECURITY.md)

---

## 目录 / Contents

1. [前置条件 / Prerequisites](#1-前置条件--prerequisites)
2. [本机快速启动 / Local quick start](#2-本机快速启动--local-quick-start)
3. [单机 / VPS 生产部署 / Single-machine production](#3-单机--vps-生产部署--single-machine-production)
4. [对话模型 vs 向量模型 / Chat vs embeddings](#4-对话模型-vs-向量模型--chat-vs-embeddings)
5. [首次登录与日常操作 / First login & daily ops](#5-首次登录与日常操作--first-login--daily-ops)
6. [SearchKnowledge 调用示例 / API curl](#6-searchknowledge-调用示例--api-curl)
7. [常见故障 / Common failures](#7-常见故障--common-failures)
8. [运维清单 / Ops checklist](#8-运维清单--ops-checklist)

---

## 1. 前置条件 / Prerequisites

请先确认本机或服务器已安装：

| 软件 | 建议版本 | 说明 |
|------|----------|------|
| **Node.js** | **22+**（与 CI 一致） | [nodejs.org](https://nodejs.org/) |
| **pnpm** | **10.x**（见 `package.json` → `packageManager`） | `corepack enable && corepack prepare pnpm@10.33.3 --activate` |
| **Docker** + Compose | 较新的稳定版 | 用于一键启动 Postgres + pgvector |
| **Git** | 任意近期版本 | 克隆本仓库 |

可选（生产 / 隧道）：

| 软件 | 用途 |
|------|------|
| **SSH 客户端** | `scripts/ensure-tunnel.sh` 反向隧道 |
| **Nginx / Caddy** 等 | 反向代理与 HTTPS（高阶，见下文） |

检查命令：

```bash
node -v          # 应 >= v22
pnpm -v          # 应显示 10.x
docker --version
docker compose version
```

---

## 2. 本机快速启动 / Local quick start

按顺序复制执行即可。

### 2.1 克隆并安装依赖

```bash
git clone https://github.com/960602906/enterprise-kb-rag.git
cd enterprise-kb-rag

pnpm install
cp .env.example .env.local
```

### 2.2 编辑 `.env.local`（最少必填）

用编辑器打开 `.env.local`，至少设置：

```bash
# 生成密钥（在终端执行，把输出粘贴进 .env.local）
openssl rand -base64 32
```

```bash
# .env.local 中至少改这几项：
AUTH_SECRET=<上一步生成的随机串>
AUTH_URL=http://localhost:43123
DATABASE_URL=postgresql://kb_rag:kb_rag@localhost:5433/kb_rag
```

本地演示可暂时打开 Mock（**仅演示，检索质量很差**）：

```bash
MOCK_EMBEDDINGS=true
MOCK_CHAT=true
```

真实问答请配置 API 密钥（见 [第 4 节](#4-对话模型-vs-向量模型--chat-vs-embeddings)），并保持 `MOCK_*=false`。

### 2.3 启动 Postgres + pgvector

```bash
docker compose up -d
docker compose ps
```

期望：容器 `atlas-kb-pg` 为 **healthy**，端口映射 **localhost:5433 → 5432**。

### 2.4 迁移与种子数据

```bash
pnpm db:migrate
pnpm db:seed
```

- `db:migrate`：创建表、启用 `vector` / `pg_trgm` 等扩展
- `db:seed`：创建演示用户与演示知识库

默认种子账号（**对外暴露前必须修改密码**）：

| 角色 | 邮箱 | 密码 |
|------|------|------|
| 管理员 `manage` | `admin@example.com` | `admin123456` |
| 成员 `read` | `member@example.com` | `member123456` |

可通过 `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` 等覆盖（见 `.env.example`）。

### 2.5 启动应用

**开发模式：**

```bash
pnpm dev
```

**或接近生产的方式：**

```bash
pnpm build
pnpm start
```

浏览器打开：<http://localhost:43123>

---

## 3. 单机 / VPS 生产部署 / Single-machine production

适合：**一台 Linux 机器**长期跑本项目（自托管）。不要求使用任何付费托管平台。

> 可选：若你已有带 pgvector 的托管 Postgres（如 Neon / Supabase），也可只把数据库放到云端，应用仍跑在自己的机器上。主路径仍是「自己的机器 + Docker Compose」。

### 3.1 服务器上准备环境

1. 安装 Node 22+、pnpm、Docker（同第 1 节）
2. 克隆仓库并 `pnpm install`
3. `cp .env.example .env.local`，按下面清单填写

### 3.2 生产环境变量清单

在 `.env.local` 中建议至少：

```bash
# --- 必填 ---
DATABASE_URL=postgresql://kb_rag:kb_rag@localhost:5433/kb_rag
AUTH_SECRET=<openssl rand -base64 32 的结果>
AUTH_URL=https://kb.example.com          # 改成你的公网 Origin（含协议）

# --- 安全 ---
DISABLE_REGISTER=true
SEARCH_KNOWLEDGE_ALLOW_ALL=false
SEED_ADMIN_PASSWORD=<强密码>             # 若仍用 seed，务必改掉默认值

# --- 模型（真实 RAG；不要用 MOCK_*）---
OPENAI_API_KEY=sk-...
# OPENAI_BASE_URL=                       # DeepSeek 等兼容网关时再设
CHAT_MODEL=gpt-4o-mini
EMBEDDING_MODEL=text-embedding-3-small
MOCK_EMBEDDINGS=false
MOCK_CHAT=false

# --- 入库队列（生产推荐关闭 inline）---
INGEST_WORKER_INLINE=false
# CRON_SECRET=<随机串>                   # 若用 HTTP drain / Vercel Cron

# --- 上传（单机磁盘即可）---
STORAGE_DRIVER=local
UPLOAD_DIR=./uploads
```

说明：

| 项 | 原因 |
|----|------|
| `DISABLE_REGISTER=true` | 关闭公开注册 |
| `INGEST_WORKER_INLINE=false` | 上传/处理请求内不做耗时 embed，避免超时 |
| `MOCK_*=false` | Mock 仅适合冒烟，不适合生产检索 |
| `AUTH_URL` | 必须与用户浏览器访问的 Origin 一致 |

### 3.3 数据库、迁移、构建、启动

```bash
# 1) 数据库
docker compose up -d

# 2) 迁移 +（可选）种子
pnpm db:migrate
pnpm db:seed          # 仅首次；之后用控制台改密，勿反复用弱默认密码 seed

# 3) 构建并前台启动（调试用）
pnpm build
pnpm start            # 默认监听 43123
```

或使用仓库自带的单机助手（后台 `next start`，日志写到 `/tmp`）：

```bash
./scripts/run-prod.sh
# 日志: /tmp/atlas-kb-prod.log
# PID:  /tmp/atlas-kb-prod.pid
```

详见 [scripts/README-prod.md](./scripts/README-prod.md)。

### 3.4 启动入库 Worker（生产必做之一）

当 `INGEST_WORKER_INLINE=false` 时，文档会进入队列，需要有人消费：

**方式 A — 常驻 Worker（推荐自托管）：**

```bash
# 另开一个终端 / systemd 服务
pnpm jobs:work
```

一次性排空（可放进系统 cron）：

```bash
pnpm jobs:work:once
```

**方式 B — 请求内处理（仅小流量 / 本机调试）：**

```bash
# .env.local
INGEST_WORKER_INLINE=true
# 或不设置该变量（开发默认偏 inline）
```

**方式 C — HTTP drain（可选）：**

```bash
curl -sS -X POST "https://kb.example.com/api/ingest" \
  -H "authorization: Bearer $CRON_SECRET" \
  -H "content-type: application/json" \
  -d '{"drain":true,"limit":3}'
```

（若部署在 Vercel 等 serverless 上，可用 `vercel.json` 里的 Cron 调 `/api/cron/ingest`；自托管主路径请用方式 A。）

### 3.5 反向代理与 HTTPS（高阶概要）

应用默认监听 **43123**。对外建议：

1. 用 **Nginx / Caddy / Traefik** 把 `443` 反代到 `127.0.0.1:43123`
2. 用 Let’s Encrypt 等签发证书
3. 将 `AUTH_URL` 设为 `https://你的域名`
4. 防火墙只开放 `80/443`（以及 SSH），不要把数据库端口暴露到公网

示例（Nginx 逻辑，按你的发行版调整配置路径）：

```nginx
server {
  listen 443 ssl http2;
  server_name kb.example.com;

  # ssl_certificate     ...;
  # ssl_certificate_key ...;

  location / {
    proxy_pass http://127.0.0.1:43123;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

本仓库**不绑定**特定云厂商；证书与域名请按你的环境配置。

### 3.6 可选：SSH 反向隧道

若应用跑在内网机器、需要通过一台**你自己的**公网跳板暴露端口，可用：

```bash
export ATLAS_KB_REMOTE_HOST=your.public.host   # 必填：你的跳板主机名或 IP（勿提交进仓库）
export ATLAS_KB_REMOTE_USER=root                 # 可选，默认 root
export ATLAS_KB_PORT=43123                       # 可选

./scripts/ensure-tunnel.sh
# 或持续守护：
./scripts/ensure-tunnel.sh --loop
```

行为概要：在跳板上把 `0.0.0.0:43123` 反代到本机 `127.0.0.1:43123`。

健康检查：

```bash
ATLAS_KB_REMOTE_HOST=your.public.host ./scripts/prod-status.sh
```

**注意：**

- **必须**设置 `ATLAS_KB_REMOTE_HOST`，脚本无默认公网 IP
- 不要把真实主机名、私钥、密码写进 Git
- 隧道只是连通手段；生产仍建议在跳板前配 HTTPS

---

## 4. 对话模型 vs 向量模型 / Chat vs embeddings

本项目把两类能力都接到 **OpenAI 兼容** HTTP API，但职责不同：

| 能力 | 环境变量 | 用途 |
|------|----------|------|
| **Chat** | `OPENAI_API_KEY` + `CHAT_MODEL`（+ 可选 `OPENAI_BASE_URL`） | 流式问答 |
| **Embeddings** | 同上密钥栈 + `EMBEDDING_MODEL` | 文档入库向量化、检索 |

### 4.1 OpenAI（聊天 + 向量同一家）

```bash
OPENAI_API_KEY=sk-...
# 不要设置空的 OPENAI_BASE_URL
CHAT_MODEL=gpt-4o-mini
EMBEDDING_MODEL=text-embedding-3-small
MOCK_EMBEDDINGS=false
MOCK_CHAT=false
```

向量维度需与库表一致（当前 schema 为 **1536**，与 `text-embedding-3-small` 匹配）。

### 4.2 DeepSeek 等兼容网关（常见：只有聊天）

```bash
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.deepseek.com/v1   # 示例，以厂商文档为准
CHAT_MODEL=deepseek-chat
```

若该厂商**没有** embeddings 接口：

- 聊天走 DeepSeek；
- 向量仍需能提供 `text-embedding-3-small`（或同维度）的兼容端点（例如另配 OpenAI / AI Gateway）；
- 或短期使用 `MOCK_EMBEDDINGS=true` **仅演示**（检索效果差，不建议上线）。

当前实现通过**同一组** `OPENAI_API_KEY` / `OPENAI_BASE_URL` 调用聊天与向量。若聊天与向量必须指向不同 Base URL，请选用同时提供两者的网关，或临时对向量使用 Mock（仅本地冒烟）。

### 4.3 Mock（仅演示）

```bash
MOCK_EMBEDDINGS=true
MOCK_CHAT=true
```

- 不产生 API 费用
- 答案与检索质量**明显弱于**真实向量
- CI / 本地冒烟可以；**生产与真实评测请关掉**

---

## 5. 首次登录与日常操作 / First login & daily ops

### 5.1 登录

1. 打开 `AUTH_URL`（本机一般为 <http://localhost:43123>）
2. 使用种子管理员：`admin@example.com` / `admin123456`（若你改过 `SEED_*`，用你的值）
3. **立刻修改密码**（或删除弱账号、创建新管理员）。切勿把默认密码暴露到公网。

生产请确认：`DISABLE_REGISTER=true`。

### 5.2 创建知识库

1. 进入 **Knowledge bases / 知识库**
2. 新建知识库，记下名称与 UUID（API 绑定时会用到）

### 5.3 上传并处理文档

1. 打开知识库详情 → 上传 PDF / Markdown / TXT / DOCX  
   （可用仓库样例 [`samples/employee-handbook.md`](./samples/employee-handbook.md)）
2. 点击 **Process / 处理**
3. 状态应变为 `ready`（若一直 `queued` / `processing`，见 [第 7 节](#7-常见故障--common-failures)）
4. 到 **Chat** 勾选该知识库提问，例如：「How many PTO days?」/「病假有几天？」

### 5.4 创建 API Key（供外部系统检索）

1. 使用对目标知识库有 **manage** 权限的账号登录
2. 打开 **Settings → API keys**：路径 **`/settings/api-keys`**
3. 新建密钥 → 绑定知识库 UUID → **只显示一次**明文，请立即保存到密钥管理器
4. 页面内有「How to use / 使用示范」，示例路径均为相对的 `/api/search-knowledge`

优先使用 UI 多密钥；遗留的 `SEARCH_KNOWLEDGE_API_KEY` 环境变量仅作兼容。

---

## 6. SearchKnowledge 调用示例 / API curl

将 `{BASE}` 换成你的 Origin（本机示例：`http://localhost:43123`）。**不要**在文档或 issue 里粘贴真实密钥。

```bash
export BASE="http://localhost:43123"
export ATLAS_SEARCH_API_KEY="你的密钥"   # 来自 /settings/api-keys

curl -sS -X POST "${BASE}/api/search-knowledge" \
  -H "content-type: application/json" \
  -H "x-api-key: ${ATLAS_SEARCH_API_KEY}" \
  -d '{"query":"How many PTO days?","topK":8,"knowledgeBaseIds":["<kb-uuid>"]}'
```

相对路径（给集成方看的稳定写法）：

```text
POST {BASE}/api/search-knowledge
Header: x-api-key: <secret>
Body: { "query": "...", "topK": 8, "knowledgeBaseIds": ["<uuid>"] }
```

成功响应形如：`{ "items": [{ "title", "snippet", "sourcePath", "score", ... }] }`。  
该接口**只检索、不调用聊天 LLM**。

常见 HTTP 状态：

| 状态 | 含义 |
|------|------|
| **401** | 密钥缺失 / 未知 / 已禁用 |
| **403** | 密钥未绑定 KB，或请求了未绑定的 `knowledgeBaseIds` |
| **200** | 成功（`items` 可能为空，表示无命中） |

---

## 7. 常见故障 / Common failures

### 7.1 文档一直 `queued` / `pending`，不进入 `ready`

**可能原因**

1. 生产设置了 `INGEST_WORKER_INLINE=false`，但没有跑 Worker  
2. Worker / Cron 挂了，或 `CRON_SECRET` 不匹配  
3. 嵌入 API 报错（密钥、Base URL、模型名）  
4. 任务卡在 `running`（进程崩溃）——默认约 `INGEST_LOCK_TTL_MS=180000`（3 分钟）后会重新入队

**处理步骤**

```bash
# 1) 确认 Worker 在跑
pnpm jobs:work

# 或单次排空
pnpm jobs:work:once

# 2) 看应用 / Worker 终端日志里的 embed / OpenAI 错误

# 3) 确认未误开且不可用的 MOCK / 空密钥组合
grep -E 'MOCK_|OPENAI_|INGEST_' .env.local
```

### 7.2 SearchKnowledge 返回 401 / 403

| 状态 | 检查 |
|------|------|
| **401** | `x-api-key` 是否传对；密钥是否被禁用 / 轮换；是否用了过期明文 |
| **403** | UI 里该 key 是否绑定了目标 KB；请求里的 `knowledgeBaseIds` 是否全部在绑定列表内；未绑定任何 KB 的 key 会直接 403 |

创建 key 后请用第 6 节 curl 自测。保持 `SEARCH_KNOWLEDGE_ALLOW_ALL=false`。

### 7.3 启动报错，提示需要 migrate / 表不存在

```bash
pnpm db:migrate
# 若库是空的再：
pnpm db:seed
```

确认 `DATABASE_URL` 指向正在运行的 Postgres（Compose 默认端口 **5433**，不是 5432）。

### 7.4 `docker compose` 起不来 / 连不上库

```bash
docker compose ps
docker compose logs postgres --tail=80
# 确认 DATABASE_URL 端口为 5433
```

### 7.5 SSH 反向隧道不通

```bash
# 必须设置跳板主机
export ATLAS_KB_REMOTE_HOST=your.public.host

./scripts/ensure-tunnel.sh
./scripts/prod-status.sh
```

检查：

1. 本机能否 `ssh ${ATLAS_KB_REMOTE_USER}@${ATLAS_KB_REMOTE_HOST}`（密钥登录、`BatchMode`）
2. 本机应用是否在 `127.0.0.1:43123` 监听（`./scripts/run-prod.sh` 或 `pnpm start`）
3. 跳板防火墙是否放行对应端口
4. 日志：`/tmp/atlas-kb-tunnel.log`

### 7.6 登录循环 / Cookie 异常

- `AUTH_URL` 是否与浏览器地址栏 Origin **完全一致**（`http` vs `https`、域名、端口）
- 生产勿用 `pnpm dev` 长期对外服务

### 7.7 聊天无流式回复 / 明显胡编

- 是否仍开启 `MOCK_CHAT=true`
- `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `CHAT_MODEL` 是否匹配厂商文档
- 文档是否已 `ready`；Chat 页是否勾选了对应知识库

---

## 8. 运维清单 / Ops checklist

### 日常

- [ ] Postgres 在跑（`docker compose ps` 或系统服务）
- [ ] 应用在跑（`pnpm start` 或 `./scripts/run-prod.sh`）
- [ ] 若 `INGEST_WORKER_INLINE=false`：`pnpm jobs:work` 在跑
- [ ] 可选隧道：`ATLAS_KB_REMOTE_HOST=... ./scripts/ensure-tunnel.sh`

### 发布新版本

```bash
git pull
pnpm install
pnpm db:migrate          # 有 schema 变更时必须
pnpm build
# 重启 next start / run-prod.sh
# 重启 jobs:work（如有）
```

### 安全底线

- [ ] 强 `AUTH_SECRET`
- [ ] 已改默认 seed 密码
- [ ] `DISABLE_REGISTER=true`（不需要开放注册时）
- [ ] `SEARCH_KNOWLEDGE_ALLOW_ALL=false`
- [ ] `.env.local` 永不提交
- [ ] 不在 README / Issue / PR 中粘贴真实 IP、主机名、密钥

### 关机 / 重启后

1. `docker compose up -d`（或启动系统 Postgres）
2. `./scripts/run-prod.sh` 或 `pnpm start`
3. `pnpm jobs:work`（若使用队列模式）
4. 如需隧道：`ATLAS_KB_REMOTE_HOST=... ./scripts/ensure-tunnel.sh`
5. `./scripts/prod-status.sh`（可选自检）

---

## 附录：命令速查 / Command cheat sheet

| 命令 | 作用 |
|------|------|
| `docker compose up -d` | 启动 Postgres + pgvector |
| `pnpm db:migrate` | 执行数据库迁移 |
| `pnpm db:seed` | 写入演示用户 / KB |
| `pnpm dev` | 开发服务器 `:43123` |
| `pnpm build && pnpm start` | 生产构建并启动 |
| `pnpm jobs:work` | 常驻入库 Worker |
| `pnpm jobs:work:once` | 单次排空队列 |
| `./scripts/run-prod.sh` | 单机构建 + 后台启动 |
| `./scripts/ensure-tunnel.sh` | SSH 反向隧道（需 `ATLAS_KB_REMOTE_HOST`） |
| `./scripts/prod-status.sh` | 健康检查 |

更多产品说明与 API ACL 细节见 [README.md](./README.md)。
