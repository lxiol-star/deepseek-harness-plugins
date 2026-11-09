import { h as SourceContext, m as SourceKind, p as Localized, st as Trigger } from "./store-DytLJokq.js";
import { Context } from "@deepseek-ai/cordis";
import { z } from "zod";
//#region src/sources/workspaces.d.ts
declare const SOURCE = "workspace";
/** 去掉被其它根目录包含的路径，避免父子目录同时递归监听造成重复事件。 */
declare function outermost(paths: readonly string[]): string[];
/** DSH 把工作区表存在 `$DSH_HOME/storages/workspace.json`；服务拿不到时直接读它。 */
declare function dshWorkspaces(): Array<{
  path: string;
  title: string;
}>;
declare const WorkspaceConfigSchema: z.ZodObject<{
  enabled: z.ZodDefault<z.ZodBoolean>;
  roots: z.ZodDefault<z.ZodArray<z.ZodObject<{
    path: z.ZodString;
  }, z.core.$strip>>>;
  ignore: z.ZodDefault<z.ZodArray<z.ZodObject<{
    pattern: z.ZodString;
  }, z.core.$strip>>>;
  debounceMs: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
type WorkspaceConfig = z.infer<typeof WorkspaceConfigSchema>;
/** 一个文件事件的主题固定为 path 前两段，同主题的后续会路由到同一 Worker。 */
declare const workspaceTopic = "workspace.file";
/** 把一次文件活动变成 Trigger；导出让测试直接验证映射。 */
declare function workspaceTrigger(event: {
  root: string;
  file: string;
  kind: string;
  at?: string;
}, config: Pick<WorkspaceConfig, 'roots'>): Trigger | undefined;
declare const workspaceKind: SourceKind<WorkspaceConfig>;
/** 盯住配置的工作区根目录，把文件活动送进 Engine。 */
declare function runWorkspaces(ctx: SourceContext, signal: AbortSignal): Promise<unknown>;
declare const name = "dsh-superagent-workspaces";
declare const inject: string[];
declare function apply(ctx: Context): void;
//#endregion
export { type Localized, SOURCE, WorkspaceConfig, WorkspaceConfigSchema, apply, dshWorkspaces, inject, name, outermost, runWorkspaces, workspaceKind, workspaceTopic, workspaceTrigger };