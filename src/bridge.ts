import "dotenv/config";
import http from "node:http";
import { backupFile } from "./backup.js";

const PORT = Number(process.env.BRIDGE_PORT ?? 8765);
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN?.trim();

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
    "Access-Control-Allow-Origin": "chrome-extension://*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Bridge-Token",
  });
  res.end(payload);
}

function parseBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(err);
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "chrome-extension://*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Bridge-Token",
    });
    res.end();
    return;
  }

  if (req.method !== "POST" || req.url !== "/backup") {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  if (BRIDGE_TOKEN) {
    const token = req.headers["x-bridge-token"];
    if (token !== BRIDGE_TOKEN) {
      sendJson(res, 401, { error: "Invalid token" });
      return;
    }
  }

  try {
    const body = await parseBody(req);
    const ids: string[] = Array.isArray(body?.ids)
      ? body.ids
      : body?.id
      ? [body.id]
      : [];

    if (ids.length === 0) {
      sendJson(res, 400, { error: "No ids provided" });
      return;
    }

    const results: { id: string; ok: boolean; result?: string; error?: string }[] = [];
    for (const id of ids) {
      try {
        const destId = await backupFile(id);
        results.push({ id, ok: true, result: destId });
      } catch (err: any) {
        results.push({ id, ok: false, error: err?.message ?? String(err) });
      }
    }

    sendJson(res, 200, { ok: true, results });
  } catch (err: any) {
    sendJson(res, 500, { ok: false, error: err?.message ?? String(err) });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Bridge listening on http://127.0.0.1:${PORT}`);
});
