import express, { Router } from "express";
import { setupOAuth } from "./oauth.mjs";

const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;
const BACKEND_PORT = process.env.BACKEND_PORT || "3001";
const PORT = process.env.PORT || "3000";

if (!AUTH_TOKEN) {
  console.error("ERROR: MCP_AUTH_TOKEN required");
  process.exit(1);
}

const oauthClientId = process.env.MCP_OAUTH_CLIENT_ID;
const oauthClientSecret = process.env.MCP_OAUTH_CLIENT_SECRET;
const publicUrl = process.env.PUBLIC_URL;

if (!oauthClientId || !oauthClientSecret || !publicUrl) {
  console.error("ERROR: MCP_OAUTH_CLIENT_ID, MCP_OAUTH_CLIENT_SECRET, and PUBLIC_URL are required");
  process.exit(1);
}

const app = express();

// Body-parsing middleware (needed for /token POST and to re-serialize for proxy)
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Mount OAuth routes on a sub-router so they're processed as middleware
// before the catch-all app.all("*") proxy handler
const oauthRouter = Router();
const { validateToken } = setupOAuth(oauthRouter, {
  clientId: oauthClientId,
  clientSecret: oauthClientSecret,
  publicUrl,
  staticToken: AUTH_TOKEN,
});
app.use(oauthRouter);

app.get("/health", async (_req, res) => {
  try {
    const check = await fetch(`http://127.0.0.1:${BACKEND_PORT}/mcp`, { method: "HEAD" });
    res.json({ status: check.ok || check.status === 405 ? "ok" : "degraded" });
  } catch {
    res.status(503).json({ status: "backend_down" });
  }
});

app.all("*", async (req, res) => {
  if (!validateToken(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Re-serialize body since Express middleware already consumed the stream
  const contentType = req.headers["content-type"] || "application/json";
  let body;
  if (!["GET", "HEAD"].includes(req.method)) {
    if (contentType.includes("application/json") && req.body) {
      body = JSON.stringify(req.body);
    } else if (contentType.includes("urlencoded") && req.body) {
      body = new URLSearchParams(req.body).toString();
    }
  }

  try {
    // Forward MCP-relevant headers to the backend
    const proxyHeaders = {
      "content-type": contentType,
      "accept": req.headers.accept || "*/*",
    };
    if (req.headers["mcp-session-id"]) {
      proxyHeaders["mcp-session-id"] = req.headers["mcp-session-id"];
    }

    const upstream = await fetch(`http://127.0.0.1:${BACKEND_PORT}${req.originalUrl}`, {
      method: req.method,
      headers: proxyHeaders,
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
