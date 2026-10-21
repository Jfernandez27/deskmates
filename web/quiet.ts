/** A shared office is quiet: nothing on the page says "needs you" (no bell, no waiting count, no notifications).
 *  ?quiet forces it on, ?alerts forces it off, otherwise the server's `shared` flag decides. */
export function quietMode(params: URLSearchParams, config: { shared?: boolean }): boolean {
  if (params.has("quiet")) return true;
  if (params.has("alerts")) return false;
  return !!config.shared;
}
