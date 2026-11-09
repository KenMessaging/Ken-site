const homePages = {
  "register.kenmessaging.app": "/register.html",
  "news.kenmessaging.app": "/news.html"
};
const publicPaths = new Set([
  "/index.html", "/features.html", "/register.html", "/news.html", "/ken-plus.html",
  "/donate.html", "/legal.html", "/styles.css", "/site.js", "/ken-logo.png",
  "/sol-donation-qr.svg", "/robots.txt", "/sitemap.xml"
]);

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const home = homePages[url.hostname];
    if (!home) return new Response("Unknown Ken website.", { status: 404 });
    if (!["GET", "HEAD"].includes(request.method)) {
      return new Response("This preview does not accept submissions or payments.", {
        status: 405, headers: { Allow: "GET, HEAD" }
      });
    }
    const path = url.pathname === "/" ? home : url.pathname;
    if (!publicPaths.has(path)) return new Response("Page not found.", { status: 404 });
    const origin = new URL(path, "https://kenmessaging.app");
    if (url.searchParams.has("v")) origin.searchParams.set("v", url.searchParams.get("v"));
    const response = await fetch(origin, { method: request.method, redirect: "manual" });
    if (response.status >= 300 && response.status < 400) {
      return new Response("Ken's website origin is redirecting. Please try again later.", { status: 502 });
    }
    const headers = new Headers(response.headers);
    headers.delete("set-cookie");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    return new Response(response.body, { status: response.status, headers });
  }
};
