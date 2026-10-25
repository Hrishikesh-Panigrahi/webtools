// The URL hash is the route: `#id`, or `#id?s=<state>` for a shared link
// that carries its input. An empty or unknown id is the home page.

import { findTool } from '../registry.js';

/** @returns {{ tool: Object|null, query: string }} */
export function currentRoute() {
  const route = location.hash.replace(/^#/, '');
  const queryStart = route.indexOf('?');
  const id = queryStart === -1 ? route : route.slice(0, queryStart);
  return { tool: findTool(id) ?? null, query: queryStart === -1 ? '' : route.slice(queryStart + 1) };
}
