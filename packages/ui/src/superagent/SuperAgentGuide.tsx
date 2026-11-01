import type { ReactNode } from "react";

/**
 * 程序内使用指南。
 *
 * 与 docs/superagent/usage.md 同源，但按面板宽度重排为短段落与列表；
 * 内容更新时两处都要改，避免用户在应用内看到过期步骤。
 */
export function SuperAgentGuide() {
  return (
    <article className="space-y-5 pb-8">
      <header>
        <h2 className="text-base font-semibold">SuperAgent 使用指南</h2>
        <p className="mt-1 text-ui-xs text-foreground-subtle">
          把一个会话变成常驻路由器：接收请求、判断是否接单、派给独立的 Worker，再把结果发回原对话。
        </p>
      </header>

      <Section title="它解决什么问题">
        <p>
          传统 Agent 一次只在一个会话里工作，多任务要靠你切换和盯梢。SuperAgent
          把「接单」和「干活」拆开：路由器只负责判断和派工，Worker
          在独立目录与独立会话里执行，你只在需要决定时被打断。
        </p>
        <p className="mt-2">
          运行时只在桌面 App 打开期间工作。关闭窗口会停止轮询与派工，重新打开后按持久化状态继续。
        </p>
      </Section>

      <Section title="三步开启">
        <Steps
          items={[
            "在设置 → 通用里把「默认会话模式」设为 SuperAgent，或者直接在输入框左下角的模式下拉里切换当前会话。",
            "打开会话右上角的 SuperAgent 面板，在「设置 → 执行」里显式开启「允许无人值守 Worker」。不开启时工单只会排队，不会执行。",
            "在「来源」里启用 GitHub 或飞书，并在「评估」里确认接单模式。新安装默认是 observe：只记录会接的单，不真的接。",
          ]}
        />
        <Notice>
          一个 workspace 同时只允许一个 SuperAgent 会话。已有路由器时，切换第二个会话会被拒绝。
        </Notice>
      </Section>

      <Section title="面板六个页签">
        <Table
          rows={[
            ["总览", "需要你处理的工单数、系统健康、最近决定"],
            ["来源", "GitHub 与飞书的运行开关和账户信息"],
            ["触发", "正在订阅的线程与事件数，可取消订阅"],
            ["评估", "策略版本、接单模式、每次评估的结论，可重新评估"],
            ["执行", "工单阶段，以及重试、停止操作"],
            ["设置", "并发数、执行目录、prepare 命令、无人值守开关、Policy、提示词"],
          ]}
        />
        <p className="mt-2 text-ui-xs text-foreground-subtle">
          面板每 5 秒刷新一次，执行操作后立即刷新。
        </p>
      </Section>

      <Section title="工单阶段怎么读">
        <Table
          rows={[
            ["person/delivery", "输入没有送达 Worker → 点重试"],
            ["person/answer", "Worker 提了问题 → 在原对话回答"],
            ["person/review", "完成，等待评审 → 看结果或 PR"],
            ["person/blocked-failed", "受阻或失败 → 看报告，决定重试或停止"],
            ["working/queued", "已接单，等待执行槽 → 无需操作"],
            ["working", "正在执行 → 无需操作"],
            ["idle", "本轮结束，等待新事件 → 无需操作"],
          ]}
        />
        <p className="mt-2">
          人在工单自己的线程里说话会直接唤醒该工单，不需要重新评估；被你停止的工单不会被消息唤醒。
        </p>
      </Section>

      <Section title="配置 GitHub">
        <Steps
          items={[
            "确保 gh 已登录一个有仓库写权限的账号。建议给 Agent 单独建账号并隔离 CLI 配置。",
            "在面板「设置 → 来源配置」的 JSON 里填 repository（owner/name）与 cli。",
            "需要仓库内所有 Issue/PR 时再打开 observeIssues / observePulls；默认只走账号通知。",
            "回到「来源 → GitHub」启用来源；repository 未填成 owner/name 时启用按钮保持禁用。",
            "确认接单模式。建议先 observe 观察几天，再切 auto。",
          ]}
        />
        <p className="mt-2">
          Agent 通过 gh 评论、推送分支、开 PR；默认不会自动合并。需要自动合并时，在提示词的「交付」段写明条件与账号。
        </p>
      </Section>

      <Section title="配置飞书">
        <p>
          飞书依赖一个与 lark-cli 兼容的包装脚本，约定三个子命令：
        </p>
        <Code>{`poll  --chat <chatId> [--after <cursor>] --json
reply --message <messageId> --key <idempotencyKey> --text <text>
thread --chat <chatId> --root <messageId> --json`}</Code>
        <p className="mt-2">
          poll 返回 items 与 next；条目包含 id、chat_id、root_id、sender、text、create_time、mentions_me。
          目标永久不可达时 reply 以非零退出并在 stderr 写 gone，其余错误会被重试。
        </p>
        <p className="mt-2">
          在「设置 → 来源配置」的 JSON 里配置 chats，再到「来源 → 飞书」启用；listen 设为 all 的会话里，没点名 Agent 的消息也会进入准入判断。
        </p>
      </Section>

      <Section title="授权与安全">
        <Bullets
          items={[
            "只有允许名单里的人点名 Agent，或规则明确允许的推断候选，才会接单。",
            "off 只接受显式点名；observe 评估但不接单；auto 命中已启用规则才接单。",
            "Worker 以无人值守方式运行，默认关闭，需要在面板里显式开启。",
            "Worker 使用当前系统账号权限；blockedCommands 只是约定，不构成安全边界。需要隔离时用独立系统账号。",
            "凭据由 gh 或飞书包装脚本自己读取，不放进环境变量。",
            "面板里的停止是人工命令，立即结束工单；在线程里说「停止」则走正常评估。",
          ]}
        />
      </Section>

      <Section title="提示词">
        <p>
          设置页签的提示词有三段团队文本：沟通方式、工单范围、交付要求。保存后生成新版本，Worker
          下一次请求读取新版本，已在运行的会话不会被重启。
        </p>
        <p className="mt-2">
          覆盖 environment 或 policy 这类生成段时，必须保留 {`{variables}`}、{`{rules}`} 等占位符，否则保存会被拒绝，避免升级后静默丢字段。
        </p>
      </Section>

      <Section title="常见问题">
        <Faq
          items={[
            ["面板一直显示读取中", "确认会话模式是 SuperAgent，并且当前构建装配了运行时。"],
            ["GitHub 没有新事件", "gh api /notifications 只返回账号未读通知；编辑已有 Issue 正文不会产生通知，需要新增评论。"],
            ["工单停在 working/queued", "并发槽已满，或「允许无人值守 Worker」没有开启。看「执行」页签的健康条目。"],
            ["接单后没有回复", "回复依赖来源通道；飞书在会话删除或消息撤回时记为 gone，不会无限重试。"],
            ["提示已有路由器", "同一个 workspace 只能有一个 SuperAgent 会话，先停用旧的。"],
          ]}
        />
      </Section>

      <Section title="当前边界">
        <Bullets
          items={[
            "只在桌面 App 运行期间工作，没有常驻后台服务。",
            "不支持在远程 workspace 里开启 SuperAgent。",
            "面板是轮询快照，还没有实时增量推送。",
            "默认评估器是规则关键词匹配；显式请求不受影响。",
          ]}
        />
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-ui-xs font-semibold uppercase tracking-wide text-foreground-subtle">
        {title}
      </h3>
      <div className="text-ui-base leading-6">{children}</div>
    </section>
  );
}

function Steps({ items }: { items: string[] }) {
  return (
    <ol className="space-y-2">
      {items.map((item, index) => (
        <li key={item} className="flex gap-2">
          <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-tag text-ui-xs font-medium">
            {index + 1}
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <span className="mt-2 size-1 shrink-0 rounded-full bg-foreground-subtle" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Table({ rows }: { rows: [string, string][] }) {
  return (
    <div className="overflow-hidden rounded-md border border-border">
      {rows.map(([left, right], index) => (
        <div
          key={left}
          className={index === 0 ? "grid grid-cols-[120px_1fr] gap-2 px-2 py-1.5" : "grid grid-cols-[120px_1fr] gap-2 border-t border-border/60 px-2 py-1.5"}
        >
          <span className="text-ui-xs text-foreground-subtle">{left}</span>
          <span className="text-ui-xs">{right}</span>
        </div>
      ))}
    </div>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="mt-2 overflow-x-auto rounded-md bg-tag px-2 py-2 font-mono text-ui-xs leading-5">
      {children}
    </pre>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="mt-2 rounded-md border border-border bg-tag px-2 py-1.5 text-ui-xs text-foreground-subtle">
      {children}
    </div>
  );
}

function Faq({ items }: { items: [string, string][] }) {
  return (
    <div className="space-y-2">
      {items.map(([question, answer]) => (
        <div key={question}>
          <div className="text-ui-base font-medium">{question}</div>
          <div className="text-ui-xs text-foreground-subtle">{answer}</div>
        </div>
      ))}
    </div>
  );
}
