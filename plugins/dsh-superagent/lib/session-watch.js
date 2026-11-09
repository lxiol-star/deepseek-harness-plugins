import { n as sourceContext, t as health } from "./host-_39SpoCg.js";
import { z } from "zod";
//#region src/sources/session.ts
const SOURCE = "session";
/** 操作者的固定 actor id：它只由主会话工具写入，不来自任何外部输入。 */
const OPERATOR = "operator";
const SessionConfigSchema = z.object({ enabled: z.boolean().default(true) });
/** 把主会话里的一句任务变成 Trigger；导出让测试直接验证映射。 */
function sessionTrigger(input) {
	const at = typeof input.at === "string" && !Number.isNaN(Date.parse(input.at)) ? input.at : (/* @__PURE__ */ new Date()).toISOString();
	return {
		id: `session:${input.sessionId}:${at}:${input.text.slice(0, 80)}`,
		source: SOURCE,
		threads: [{
			source: SOURCE,
			id: `session.${input.sessionId}`
		}],
		actor: {
			source: SOURCE,
			id: OPERATOR
		},
		human: true,
		addressed: "direct",
		at,
		text: input.text,
		meta: {
			workspaceRoot: input.workspaceRoot ?? "",
			sessionId: input.sessionId,
			topic: "session.task"
		}
	};
}
const sessionKind = {
	kind: SOURCE,
	title: {
		zh: "主会话任务",
		en: "Main Session request"
	},
	description: {
		zh: "你在主会话里直接下达的任务；先记一条事件再开单，不需要外部平台。",
		en: "Work you ask for in the main Session; recorded as an event, then opened as a ticket, with no external platform."
	},
	schema: SessionConfigSchema,
	fields: [{
		key: "enabled",
		type: "switch",
		label: {
			zh: "启用",
			en: "Enabled"
		}
	}],
	health: ["session"],
	scope: () => ({
		listened: true,
		observed: true,
		row: "ambient"
	})
};
const name = "dsh-superagent-session";
const inject = ["orchestrator"];
function apply(ctx) {
	ctx.effect(() => {
		const dispose = ctx.orchestrator.sources.register(sessionKind);
		sourceContext(ctx.orchestrator, sessionKind).report("session", health("ready", "sessionReady"));
		return dispose;
	}, "session: source kind");
}
//#endregion
export { OPERATOR, SOURCE, SessionConfigSchema, apply, inject, name, sessionKind, sessionTrigger };
