/**
 * What stands out when something on the canvas is selected.
 *
 * Selecting a card keeps its own wires at full strength and fades the rest, so
 * the wires that belong to a mission or an agent can be read without the
 * others in the way. Pure set logic over the graph, pinned in node.
 */

/** Prefix of an agent node id; the rest is the roster name. */
export const AGENT_PREFIX = 'agent:'
/** Prefix of a mission node id; the rest is the mission id. */
export const MISSION_PREFIX = 'mission:'

/**
 * Resolve the nodes and wires related to a selection.
 *
 *  - the tower: everything, so nothing is faded;
 *  - a mission: itself, the tower, its agents, its dependency neighbours, and
 *    the wires between them;
 *  - an agent: itself, the mission it sits beside, the tower, and the wires
 *    between them;
 *  - a wire: itself and its two endpoints;
 *  - nothing, or an id that is not on the canvas: two empty sets.
 *
 * @param graph - a layout from `layoutCanvas`.
 * @param selectedId - the selected node or wire id, or null.
 * @returns `{ nodes, edges }`: two `Set`s of ids.
 */
export function relatedIds(graph, selectedId) {
  const nodes = new Set()
  const edges = new Set()
  if (selectedId === null || selectedId === undefined) return { nodes, edges }

  // Missions are drawn as groups; everything else is a node.
  const node = graph.nodes.find(candidate => candidate.id === selectedId)
    ?? graph.groups.find(candidate => candidate.id === selectedId)
  if (node !== undefined) {
    nodes.add(node.id)
    if (node.type === 'tower') {
      for (const candidate of graph.nodes) nodes.add(candidate.id)
      for (const group of graph.groups) nodes.add(group.id)
      for (const edge of graph.edges) edges.add(edge.id)
      return { nodes, edges }
    }
    nodes.add('tower')
    if (node.type === 'agent') {
      if (node.missionId !== '') nodes.add(`${MISSION_PREFIX}${node.missionId}`)
    } else {
      const group = node.type === 'mission' ? node : graph.groups.find(candidate => candidate.missionId === node.missionId)
      if (group !== undefined) {
        for (const name of group.agents) nodes.add(`${AGENT_PREFIX}${name}`)
        // The missions it depends on, or that depend on it.
        for (const edge of graph.edges) {
          if (edge.type !== 'dep') continue
          if (edge.from === group.id || edge.to === group.id) {
            edges.add(edge.id)
            nodes.add(edge.from)
            nodes.add(edge.to)
          }
        }
      }
    }
    for (const edge of graph.edges) {
      if (edges.has(edge.id)) continue
      if (nodes.has(edge.from) && nodes.has(edge.to)) edges.add(edge.id)
    }
    return { nodes, edges }
  }

  const edge = graph.edges.find(candidate => candidate.id === selectedId)
  if (edge !== undefined) {
    edges.add(edge.id)
    nodes.add(edge.from)
    nodes.add(edge.to)
  }
  return { nodes, edges }
}

/**
 * The kind of thing an id names.
 *
 * @param id - a node or wire id.
 * @returns `tower`, `mission`, `agent`, `edge` or null.
 */
export function kindOf(id) {
  if (id === 'tower') return 'tower'
  if (id.startsWith(MISSION_PREFIX)) return 'mission'
  if (id.startsWith(AGENT_PREFIX)) return 'agent'
  return null
}
