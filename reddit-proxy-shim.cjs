/**
 * Fetch interceptor that routes reddit.com requests through a Cloudflare Worker proxy.
 * Loaded via --require before the reddit-mcp-server starts.
 *
 * Set REDDIT_PROXY_URL env var to the Worker URL (no trailing slash).
 */
const PROXY_URL = process.env.REDDIT_PROXY_URL;

if (PROXY_URL) {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = function (input, init) {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input && input.url) || "";

    if (url && (url.includes("reddit.com") || url.includes("redd.it"))) {
      let proxied = url;
      if (url.includes("oauth.reddit.com")) {
        proxied = url.replace(/https?:\/\/oauth\.reddit\.com/, PROXY_URL + "/oauth");
      } else {
        proxied = url.replace(/https?:\/\/(www\.)?reddit\.com/, PROXY_URL);
      }

      if (typeof input === "string") {
        return originalFetch.call(globalThis, proxied, init);
      } else if (input instanceof URL) {
        return originalFetch.call(globalThis, new URL(proxied), init);
      } else {
        return originalFetch.call(globalThis, new Request(proxied, input), init);
      }
    }

    return originalFetch.call(globalThis, input, init);
  };

  console.error("[proxy-shim] Routing reddit.com -> " + PROXY_URL);
}
