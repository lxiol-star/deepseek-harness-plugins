/**
 * Host half of the dsh-think-bounce-pet Web surface.
 *
 * The browser half is discovered from package.json's `dsh.client` declaration.
 * This plugin is purely a client-side UI pet (a ball that bounces while the
 * agent thinks), so the host half stays an empty apply: keeping the row in the
 * host Loader is what lets the client-modules roster scan pick up the browser
 * half. No file/process/network capabilities are needed here today.
 */
export function apply() {}
