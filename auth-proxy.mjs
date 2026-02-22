import express from "express";
import { timingSafeEqual } from "node:crypto";

const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;
const BACKEND_PORT = process.env.BACKEND_PORT || "3001";
const PORT = process.env.PORT || "3000";

if (!AUTH_TOKEN) {
  console.error("ERROR: MCP_AUTH_TOKEN required");
  process.exit(1);
}

function tokensMatch(provided) {
  if (typeof provided !== "string") return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(AUTH_TOKEN);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

const app = express();

app.get("/health", async (_req, res) => {
  try {
    const check = await fetch(`http://127.0.0.1:${BACKEND_PORT}/mcp`, { method: "HEAD" });
    res.json({ status: check.ok || check.status === 405 ? "ok" : "degraded" });
  } catch {
    res.status(503).json({ status: "backend_down" });
  }
});

app.all("*", async (req, res) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!tokensMatch(token)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);

  try {
    const upstream = await fetch(`http://127.0.0.1:${BACKEND_PORT}${req.originalUrl}`, {
      method: req.method,
      headers: {
        "content-type": req.headers["content-type"] || "application/json",
        "accept": req.headers.accept || "*/*",
      },
      body: ["GET", "HEAD"].includes(req.method) ? undefined : body,
    });

    res.status(upstream.status);
    for (const [key, value] of upstream.headers) {
      if (!["transfer-encoding", "connection"].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    }

    // Stream response body instead of buffering (critical for SSE/httpStream)
    if (upstream.body) {
      const reader = upstream.body.getReader();
      const pump = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) { res.end(); return; }
          res.write(value);
        }
      };
      await pump();
    } else {
      res.end();
    }
  } catch (err) {
    console.error("Proxy error:", err.message);
    if (!res.headersSent) {
      res.status(502).json({ error: "Backend unavailable" });
    }
  }
});

app.listen(Number(PORT), () => {
  console.error(`Auth proxy on :${PORT} -> backend :${BACKEND_PORT}`);
});
