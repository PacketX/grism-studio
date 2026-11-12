/* Where the device's API is, for a Studio GRISM Manager serves.

   The manager loads this page at /n/<id>/grism-studio/ with
   window.GRISM_API_BASE = "/n/<id>" (and window.GRISM_MANAGER, which names the
   node and the way back). Every fetch and XHR of an absolute path then goes to
   /n/<id>/<path>, which the manager hands to that node. Imported first, before
   anything can call fetch; on the device itself neither global is set and
   nothing here changes anything.

   Links (<a href>) are not requests the page makes, so the few that point at the
   device -- downloads -- go through apiUrl() themselves. */
import { prefixApiPath } from "./grism-core.js";

const w = typeof window !== "undefined" ? window : null;
export const API_BASE = w && typeof w.GRISM_API_BASE === "string" ? w.GRISM_API_BASE.replace(/\/+$/, "") : "";
export const MANAGER = (w && w.GRISM_MANAGER && typeof w.GRISM_MANAGER === "object") ? w.GRISM_MANAGER : null;
export const apiUrl = (path) => prefixApiPath(path, API_BASE);

if (API_BASE && w) {
  const nativeFetch = w.fetch.bind(w);
  const sameOrigin = (u) => { try { return new URL(u, w.location.href).origin === w.location.origin; } catch { return false; } };
  w.fetch = (input, init) => {
    if (typeof input === "string") return nativeFetch(apiUrl(input), init);
    if (input instanceof URL && sameOrigin(input)) return nativeFetch(apiUrl(input.pathname) + input.search, init);
    if (input instanceof Request && sameOrigin(input.url)) {
      const u = new URL(input.url);
      const p = apiUrl(u.pathname);
      if (p !== u.pathname) return nativeFetch(new Request(p + u.search, input), init);
    }
    return nativeFetch(input, init);
  };
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    return open.call(this, method, typeof url === "string" ? apiUrl(url) : url, ...rest);
  };
  if (MANAGER && MANAGER.node && MANAGER.node.name) document.title = MANAGER.node.name + " · GRISM Studio";
}
