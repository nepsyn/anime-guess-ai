# AI 猜动画名

一个基于 Nuxt + TypeScript + Tailwind + Bun 的 Bangumi 猜动画名 Web 小游戏。

## 功能

- 从玩家预设筛选条件中随机抽取 Bangumi 动画条目
- 使用 Bangumi 公共 API 获取条目、关联条目和搜索结果
- 使用 Bun SQL / PostgreSQL 持久化缓存条目信息，默认 7 天过期
- 玩家可向 AI 提问，AI 只回答「是 / 不是 / 不确定」
- 玩家可索取提示，提示从已缓存 Bangumi 资料生成
- 玩家输入动画名时同步搜索 Bangumi，最终按 subject id 判断
- 关联条目也算正确答案，例如续集/前传等关联动画
- 支持 GPT / OpenAI-compatible 与 Gemini 两类模型接口

## 环境要求

- Bun 1.3+
- Node/Nuxt 依赖通过 `bun install` 安装

## 配置

复制配置模板：

```bash
cp .env.example .env
```

按需编辑 `.env`：

```env
HOST=127.0.0.1
PORT=3010
NITRO_PORT=3010
DATABASE_URL=postgres://anime_user:password@127.0.0.1:5432/anime_guess

BANGUMI_TOKEN=
BANGUMI_USER_AGENT=anime-guess-ai/0.1 (https://github.com/nepsyn/anime-guess-ai)
SUBJECT_CACHE_TTL_MS=604800000

AI_PROVIDER=gpt

OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini

GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash
```

> 没有配置模型 API Key 时，AI 提问接口会保守返回「不确定」，不会编造答案。

## 安装与开发

```bash
bun install
bun run dev
```

## 生产构建与启动

```bash
bun run build
bun run start
```

`start` 脚本会通过 Bun 的 `--env-file=.env` 加载配置。

## 测试

```bash
bun test
```

## 主要目录

```text
app/app.vue                       前端页面
server/api/game/start.post.ts      开始游戏
server/api/game/ask.post.ts        AI 提问
server/api/game/hint.post.ts       获取提示
server/api/game/guess.post.ts      提交答案
server/api/bangumi/search.get.ts   Bangumi 搜索
server/utils/bangumi.ts            Bangumi API 封装
server/utils/ai.ts                 GPT / Gemini 调用
server/utils/db.ts                 Bun SQL / PostgreSQL
server/utils/game.ts               游戏规则工具函数
tests/game-utils.test.ts           核心逻辑测试
```

## Nginx 反代示例

应用默认监听 `127.0.0.1:3010`。可在 nginx 中配置：

```nginx
location /anime-guess/ {
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_pass http://127.0.0.1:3010/;
}

location /_nuxt/ {
    proxy_pass http://127.0.0.1:3010/_nuxt/;
}

location /api/ {
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_pass http://127.0.0.1:3010/api/;
}
```
