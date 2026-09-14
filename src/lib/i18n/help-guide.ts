import type { Locale } from "./config";

export type HelpSection = {
  title: string;
  body: string[];
};

const zh: { title: string; subtitle: string; sections: HelpSection[] } = {
  title: "如何使用",
  subtitle: "注册只会拿到一个空账号。按下面这五步就能问出带引用的答案。",
  sections: [
    {
      title: "1. 登录或注册",
      body: [
        "用邮箱 + 密码注册。注册不会自动看到别人的知识库。",
        "如果只是被邀请，先注册同一个邮箱，再让管理员在库里把你加为成员。",
      ],
    },
    {
      title: "2. 新建知识库",
      body: [
        "开「知识库」 → 「新建」，你会成为该库的管理员。",
        "一个库建议只放一类文档（例如员工手册、产品说明），方便后面勾选。",
      ],
    },
    {
      title: "3. 上传并点「处理」",
      body: [
        "支持 PDF、Markdown、TXT、DOCX。",
        "上传完必须点「处理」。状态变成「就绪」才能被检索。",
        "生产环境处理是排队的，等一会儿刷新页面。失败可以再点一次。",
      ],
    },
    {
      title: "4. 去问答",
      body: [
        "打开「问答」，勾选刚才那个库，再输入问题。",
        "答案右侧会出引用（文档名、页码、片段）。没有就绪文档时会直说找不到。",
        "没配 AI Key 时是 Mock 模式：只展示检索到的片段。管理员在服务器环境变量里配 OPENAI_API_KEY 即可。",
      ],
    },
    {
      title: "5. 邀请同事",
      body: [
        "对方先用邮箱注册。",
        "你在知识库详情 → 成员 里填邮箱，选只读或管理。",
        "未注册的邮箱加不进去。",
      ],
    },
  ],
};

const en: { title: string; subtitle: string; sections: HelpSection[] } = {
  title: "How to use Atlas KB",
  subtitle:
    "A new account starts empty. Follow these five steps to get cited answers.",
  sections: [
    {
      title: "1. Sign in or register",
      body: [
        "Register with email and password. That does not grant access to anyone else's libraries.",
        "If you were invited, register with the same email, then ask an admin to add you as a member.",
      ],
    },
    {
      title: "2. Create a knowledge base",
      body: [
        "Open Knowledge Bases → New. You become the manage-role owner.",
        "Keep one topic per library (handbook, product spec) so Chat selection stays clear.",
      ],
    },
    {
      title: "3. Upload and click Process",
      body: [
        "PDF, Markdown, TXT, and DOCX are supported.",
        "After upload you must click Process. Retrieval only uses documents in ready status.",
        "Production processing is queued — refresh after a minute. Failed jobs can be retried.",
      ],
    },
    {
      title: "4. Ask in Chat",
      body: [
        "Open Chat, select that library, then ask.",
        "The right panel lists citations (title, page, snippet). Empty retrieval means no ready docs matched.",
        "Without an API key the app is in mock mode and only shows retrieved snippets. Set OPENAI_API_KEY on the server for full answers.",
      ],
    },
    {
      title: "5. Invite teammates",
      body: [
        "They register first with their email.",
        "On the knowledge-base page → Members, add that email as read or manage.",
        "Unknown emails cannot be added.",
      ],
    },
  ],
};

export function getHelpGuide(locale: Locale) {
  return locale === "en" ? en : zh;
}
