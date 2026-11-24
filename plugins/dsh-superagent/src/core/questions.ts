/**
 * The first line of a message about one ticket. The main Session's prompt tells the model to read a message that carries this
 * line as the operator's question about that ticket, whether the operator typed the line or a task view wrote it for them.
 */

/** Replaces the characters that would close or break the line inside a title. */
const oneLine = (title: string): string => title.replace(/[[\]\r\n]+/g, ' ').trim()

/** The line that names a ticket in a message: its id, which `orchestrator_read` reads as `ticket/<id>`, and its title. */
export const ticketLine = (ticketId: string, title: string): string => `[ticket ${ticketId} · ${oneLine(title)}]`
