import { n as sourceContext, t as health } from "./host-_39SpoCg.js";
import { t as KV } from "./kv-Dp1nVXMG.js";
import { readFileSync, statSync, watch } from "node:fs";
import { join, relative } from "node:path";
import { z } from "zod";
import { homedir } from "node:os";
//#region src/sources/workspaces.ts
/**
* Workspace Source：本地工作区树就是部署的工作范围。
*
* 远端 Source 都需要账号与凭据；本地工作区树两者都没有。这个 kind 把配置的
* 根目录（工作区树的上层目录，或单个工作区）枚举出来，把其中的文件活动变成
* Trigger，于是工单可以由本地工作发起，而不是某个 GitHub 仓库。
*
* 与 MSP 的区别：MSP 听的是别的软件主动推来的信号；这里由本插件自己盯着目录。
* 两者都是 senderless 的机器事件，Policy 按 `inferred` 候选处理。
*/
const SOURCE = "workspace";
/** 目录名里出现这些片段就不看（默认忽略；可在面板里按行覆盖）。 */
const DEFAULT_IGNORE = [
	"node_modules",
	".git",
	"dist",
	"lib",
	".pnpm-store",
	".cache",
	"tmp"
];
let registry;
/** 去掉被其它根目录包含的路径，避免父子目录同时递归监听造成重复事件。 */
function outermost(paths) {
	const sorted = [...new Set(paths)].sort((left, right) => left.length - right.length);
	const kept = [];
	for (const path of sorted) {
		if (kept.some((parent) => path === parent || path.startsWith(parent.endsWith("/") ? parent : `${parent}/`))) continue;
		kept.push(path);
	}
	return kept;
}
/** DSH 把工作区表存在 `$DSH_HOME/storages/workspace.json`；服务拿不到时直接读它。 */
function dshWorkspaces() {
	const home = process.env.DSH_HOME ?? `${homedir()}/.dsh`;
	for (const file of [`${home}/storages/workspace.json`]) try {
		const raw = JSON.parse(readFileSync(file, "utf8"));
		return Object.values(raw.tables?.workspaces ?? {}).flatMap((row) => typeof row.path === "string" && row.path !== "" ? [{
			path: row.path,
			title: row.title ?? row.path.split("/").filter(Boolean).pop() ?? row.path
		}] : []);
	} catch {}
	return [];
}
const WorkspaceConfigSchema = z.object({
	enabled: z.boolean().default(true),
	/** 要盯的工作区树根目录；一行一个路径。 */
	roots: z.array(z.object({ path: z.string() })).default([]),
	/** 忽略的目录名片段（不是 glob，命中片段即跳过）。 */
	ignore: z.array(z.object({ pattern: z.string() })).default(DEFAULT_IGNORE.map((pattern) => ({ pattern }))),
	/** 同一文件的连续事件合并窗口。 */
	debounceMs: z.number().int().min(200).max(6e4).default(1500)
});
/** 一个文件事件的主题固定为 path 前两段，同主题的后续会路由到同一 Worker。 */
const workspaceTopic = "workspace.file";
/** 把一次文件活动变成 Trigger；导出让测试直接验证映射。 */
function workspaceTrigger(event, config) {
	const absolute = event.file.startsWith("/") ? event.file : join(event.root, event.file);
	const root = (config.roots ?? []).map((entry) => entry.path).filter(Boolean).filter((path) => absolute === path || absolute.startsWith(`${path}/`)).sort((left, right) => right.length - left.length)[0];
	if (root === void 0) return void 0;
	const at = typeof event.at === "string" && !Number.isNaN(Date.parse(event.at)) ? event.at : (/* @__PURE__ */ new Date()).toISOString();
	const file = relative(root, absolute) || ".";
	return {
		id: `workspace:${root}:${file}:${at}`,
		source: SOURCE,
		threads: [{
			source: SOURCE,
			id: workspaceTopic
		}],
		actor: {
			source: SOURCE,
			id: ""
		},
		human: false,
		at,
		text: `${file}\n${event.kind}`,
		meta: {
			workspaceRoot: root,
			workspaceFile: file,
			workspaceEvent: event.kind,
			topic: workspaceTopic
		}
	};
}
const workspaceKind = {
	kind: SOURCE,
	title: {
		zh: "本地工作区树",
		en: "Local workspace tree"
	},
	description: {
		zh: "把本地工作区树里的文件活动变成事件：不依赖 GitHub，也没有账号与凭据。",
		en: "Turns activity inside local workspace roots into events; no GitHub account, no credentials."
	},
	schema: WorkspaceConfigSchema,
	fields: [
		{
			key: "roots",
			label: {
				zh: "工作区树根目录",
				en: "Workspace roots"
			},
			hint: {
				zh: "留空则自动接入 DSH 的工作区树；也可以只列几个目录",
				en: "Leave empty to use the DSH workspace tree; or list a few roots"
			},
			type: "rows",
			columns: [{
				key: "path",
				label: {
					zh: "路径",
					en: "Path"
				},
				type: "text",
				choose: {
					zh: "选择本机工作区",
					en: "Choose a workspace"
				},
				refresh: {
					zh: "刷新工作区列表",
					en: "Refresh workspaces"
				}
			}]
		},
		{
			key: "ignore",
			label: {
				zh: "忽略的目录",
				en: "Ignored segments"
			},
			hint: {
				zh: "命中片段即跳过",
				en: "A matching segment is skipped"
			},
			type: "rows",
			advanced: true,
			columns: [{
				key: "pattern",
				label: {
					zh: "片段",
					en: "Segment"
				},
				type: "text"
			}]
		},
		{
			key: "debounceMs",
			label: {
				zh: "合并窗口（毫秒）",
				en: "Debounce (ms)"
			},
			hint: {
				zh: "同一文件的连续事件合并",
				en: "Merges consecutive events for one file"
			},
			type: "number",
			min: 200,
			max: 6e4,
			advanced: true
		}
	],
	health: ["workspace"],
	/** 机器事件全部在范围内、也被观察到；`row` 指向 Policy 的 ambient 行。 */
	scope: () => ({
		listened: true,
		observed: true,
		row: "ambient"
	}),
	/** 把本机工作区树暴露给面板的“选择本机工作区”下拉框：值为路径，标签为工作区标题。 */
	refreshLabels: (host) => {
		const rows = registry?.list() ?? dshWorkspaces();
		const labels = {};
		for (const workspace of rows) {
			const title = workspace.title || workspace.path.split("/").filter(Boolean).pop() || workspace.path;
			labels[workspace.path] = title;
		}
		sourceContext(host, workspaceKind).state.set(KV.sources.labels(SOURCE), labels);
		return Promise.resolve(labels);
	},
	environment: {
		variables: [{
			key: "DSH_SUPERAGENT_WORKSPACE_ROOT",
			description: {
				zh: "触发本工单的工作区根目录",
				en: "The workspace root that started this ticket"
			}
		}, {
			key: "DSH_SUPERAGENT_WORKSPACE_FILE",
			description: {
				zh: "触发本工单的文件（相对根目录）",
				en: "The file (relative to the root) that started this ticket"
			}
		}],
		values: ({ trigger }) => ({
			DSH_SUPERAGENT_WORKSPACE_ROOT: trigger?.source === "workspace" ? String(trigger.meta.workspaceRoot ?? "") : "",
			DSH_SUPERAGENT_WORKSPACE_FILE: trigger?.source === "workspace" ? String(trigger.meta.workspaceFile ?? "") : ""
		})
	}
};
const available = (ctx) => {
	const config = ctx.config(SOURCE);
	if (!config || config.enabled === false) {
		ctx.report("workspace", health("paused", "sourceOff"));
		return;
	}
	return config;
};
const ignored = (path, config) => {
	const segments = path.split(/[\\/]/u).filter(Boolean);
	return (config.ignore ?? []).map((entry) => entry.pattern).filter(Boolean).some((pattern) => segments.includes(pattern));
};
/** 盯住配置的工作区根目录，把文件活动送进 Engine。 */
async function runWorkspaces(ctx, signal) {
	const config = available(ctx);
	if (!config) return;
	const configured = (config.roots ?? []).map((entry) => entry.path).filter(Boolean);
	const home = (process.env.DSH_HOME ?? `${homedir()}/.dsh`).replace(/\/+$/, "");
	const stateDir = (ctx.deployment?.stateDir ?? "").replace(/\/+$/, "");
	const safe = (path) => {
		const under = (parent) => parent !== "" && (path === parent || path.startsWith(`${parent}/`));
		return !under(home) && !under(stateDir);
	};
	const discovered = configured.length > 0 ? [] : (registry?.list()?.map((workspace) => workspace.path) ?? dshWorkspaces().map((workspace) => workspace.path)).filter(safe);
	const roots = outermost(configured.length > 0 ? configured : discovered);
	const auto = configured.length === 0 && roots.length > 0;
	if (roots.length === 0) {
		ctx.report("workspace", health("paused", "workspaceNoRoots"));
		return;
	}
	const watchers = [];
	const timers = /* @__PURE__ */ new Map();
	let watching = 0;
	for (const root of roots) {
		try {
			if (!statSync(root).isDirectory()) {
				ctx.report("workspace", health("error", "workspaceRootMissing", { path: root }));
				continue;
			}
		} catch {
			ctx.report("workspace", health("error", "workspaceRootMissing", { path: root }));
			continue;
		}
		try {
			const watcher = watch(root, { recursive: process.platform !== "linux" }, (event, filename) => {
				if (filename === null || ignored(String(filename), config)) return;
				const file = String(filename);
				const key = `${root}:${file}`;
				const timer = timers.get(key);
				if (timer !== void 0) clearTimeout(timer);
				timers.set(key, setTimeout(() => {
					timers.delete(key);
					const trigger = workspaceTrigger({
						root,
						file,
						kind: String(event)
					}, config);
					if (trigger === void 0) return;
					Promise.resolve(ctx.receive(trigger)).catch((error) => {
						ctx.report("workspace", {
							state: "error",
							detail: `receive failed: ${String(error).slice(0, 200)}`
						});
					});
				}, config.debounceMs));
			});
			watchers.push(watcher);
			watching += 1;
		} catch (error) {
			ctx.report("workspace", {
				state: "error",
				detail: `watch failed: ${String(error).slice(0, 200)}`
			});
		}
	}
	if (watching === 0) return;
	ctx.report("workspace", health("ready", "workspaceWatching", { count: String(watching) }));
	if (auto) ctx.report("workspace", {
		state: "ready",
		detail: `DSH workspace tree: ${watching} workspace(s)`
	});
	signal.addEventListener("abort", () => {
		for (const timer of timers.values()) clearTimeout(timer);
		for (const watcher of watchers) try {
			watcher.close();
		} catch {}
	}, { once: true });
}
const name = "dsh-superagent-workspaces";
const inject = ["orchestrator"];
function apply(ctx) {
	ctx.effect(() => ctx.orchestrator.sources.register(workspaceKind), "workspace: source kind");
	let current;
	const start = () => {
		const controller = new AbortController();
		current = {
			controller,
			running: runWorkspaces(sourceContext(ctx.orchestrator, workspaceKind), controller.signal)
		};
	};
	start();
	ctx.effect(() => () => {
		current?.controller.abort();
		current?.running;
	}, "workspace: stop");
	ctx.inject(["workspaceRegistry"], (scoped) => {
		const candidate = scoped.get?.("workspaceRegistry");
		if (candidate === void 0 || candidate === null) return;
		if (typeof candidate.list !== "function") return;
		registry = candidate;
		current?.controller.abort();
		start();
	});
}
//#endregion
export { SOURCE, WorkspaceConfigSchema, apply, dshWorkspaces, inject, name, outermost, runWorkspaces, workspaceKind, workspaceTopic, workspaceTrigger };
