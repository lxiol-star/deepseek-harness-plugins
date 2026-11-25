/**
 * The two reads the browser half makes of the Host's status route.
 *
 * Both are plain `fetch` calls with the response checked before anything is
 * drawn from it. They take the `fetch` to use as an argument so they can be
 * exercised in node without a network.
 */

/**
 * The URL of `/tower/state` for one session.
 *
 * @param sessionId - the tower's session.
 * @param detail - ask for the full snapshot (`detail=1`) the canvas needs.
 * @returns the path and query.
 */
export function towerStateUrl(sessionId, detail = false) {
  const query = `sessionId=${encodeURIComponent(typeof sessionId === 'string' ? sessionId : '')}`
  return detail ? `/tower/state?${query}&detail=1` : `/tower/state?${query}`
}

/**
 * Read a response body and make sure it is a snapshot object.
 *
 * @param response - the resolved `fetch` response.
 * @returns the parsed body.
 * @throws {Error} when the route failed or the body is not an object.
 */
async function readSnapshot(response) {
  if (!response.ok) throw new Error(`tower state ${response.status}`)
  const body = await response.json()
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('tower state: 响应不是快照对象')
  }
  return body
}

/**
 * Fetch the full snapshot the canvas draws from.
 *
 * @param sessionId - the tower's session.
 * @param signal - cancels the request.
 * @param fetchImpl - the `fetch` to use.
 * @returns the parsed snapshot.
 */
export async function fetchTowerDetail(sessionId, signal, fetchImpl = fetch) {
  return readSnapshot(await fetchImpl(towerStateUrl(sessionId, true), { cache: 'no-store', signal }))
}

/**
 * Fetch the light status the dock draws from.
 *
 * @param sessionId - the tower's session.
 * @param fetchImpl - the `fetch` to use.
 * @returns the parsed snapshot.
 */
export async function fetchTowerState(sessionId, fetchImpl = fetch) {
  return readSnapshot(await fetchImpl(towerStateUrl(sessionId), { cache: 'no-store' }))
}

/**
 * The sentence to show for a failed request.
 *
 * @param error - what the request rejected with.
 * @returns a short Chinese message.
 */
export function describeError(error) {
  if (error !== null && typeof error === 'object' && typeof error.message === 'string' && error.message !== '') {
    return error.message
  }
  return '未知错误'
}
