import { m as SourceKind, st as Trigger } from "./store-LYPmcn8x.js";
import { Context } from "@deepseek-ai/cordis";
import { z } from "zod";
//#region src/sources/session.d.ts
declare const SOURCE = "session";
/** 操作者的固定 actor id：它只由主会话工具写入，不来自任何外部输入。 */
declare const OPERATOR = "operator";
declare const SessionConfigSchema: z.ZodObject<{
  enabled: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
type SessionConfig = z.infer<typeof SessionConfigSchema>;
/** 把主会话里的一句任务变成 Trigger；导出让测试直接验证映射。 */
declare function sessionTrigger(input: {
  sessionId: string;
  text: string;
  workspaceRoot?: string;
  at?: string;
}): Trigger;
declare const sessionKind: SourceKind<SessionConfig>;
declare const name = "dsh-superagent-session";
declare const inject: string[];
declare function apply(ctx: Context): void;
//#endregion
export { OPERATOR, SOURCE, SessionConfig, SessionConfigSchema, apply, inject, name, sessionKind, sessionTrigger };