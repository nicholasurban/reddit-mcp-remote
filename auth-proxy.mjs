import express from "express";

const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;
const BACKEND_PORT = process.env.BACKEND_PORT || "3001";
const PORT = process.env.PORT || "3000";

if (!AUTH_TOKEN) {
  console.error("ERROR: MCP_AUTH_TOKEN required");
  process.exit(1);
}

const app = express();

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.all("*", async (req, res) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (token !== AUTH_TOKEN) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);

  try {
    const upstream = await fetch(`http://127.0.0.1:${BACKEND_PORT}${req.path}`, {
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
    const responseBody = await upstream.arrayBuffer();
    res.send(Buffer.from(responseBody));
  } catch (err) {
    console.error("Proxy error:", err.message);
    res.status(502).json({ error: "Backend unavailable" });
  }
});

app.listen(Number(PORT), () => {
  console.error(`Auth proxy on :${PORT} -> backend :${BACKEND_PORT}`);
});
