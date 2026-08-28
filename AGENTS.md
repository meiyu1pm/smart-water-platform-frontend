# Smart Water Frontend Agent Rules

Follow the backend repository's `AGENTS.md` and coordination board before substantial work. Frontend work stays in its own branch and PR, even when a backend API changes in the same feature.

## Documentation impact

Any feature, API, permission, workflow, algorithm, deployment, or user-behaviour change must assess documentation in the same task. Submit the matching documentation PR to `Schwarz-Hal/smart-water-platform-docs`, or record `documentation impact: none` with a concrete reason in the PR.

Do not place tokens, server addresses, credentials, screenshots with real data, or build outputs in the repository. Keep API calls relative to the browser origin and treat backend authorization as authoritative.

## 真实实现与占位约束 (Implementation Authenticity)

- **真实全链路落地优先**：优先接入真实后端 API、数据视图与算法工作流，避免编写脱离底层引擎的假数据/纯前端动画 Mock。
- **占位与模拟必须明确标注**：若在快速 UI 迭代中临时采用占位数据或局部 Stub，必须在交互与汇报中醒目指出“哪些部分为临时占位、哪些为真实后端执行”，严禁将占位呈现为正式上线效果。
- **进度真实透明**：确保开发进度与实际工程完成度完全吻合，避免表面工程。

