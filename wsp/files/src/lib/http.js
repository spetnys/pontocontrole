import { createReadStream, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";

const PUBLIC_DIR = resolve(process.cwd(), "public");

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".pdf": "application/pdf",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

export async function parseBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const body = Buffer.concat(chunks).toString("utf-8");
  const type = req.headers["content-type"] ?? "";

  if (type.includes("application/json")) {
    return body ? JSON.parse(body) : {};
  }

  if (type.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(body));
  }

  return {};
}

export async function parseMultipart(req, uploadDir = "/tmp") {
  const contentType = req.headers["content-type"] ?? "";
  const boundaryMatch = contentType.match(/boundary=(.+)$/);
  if (!boundaryMatch) {
    return { fields: {}, files: [] };
  }

  const boundary = `--${boundaryMatch[1]}`;
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  const raw = buffer.toString("binary");
  const segments = raw.split(boundary).slice(1, -1);
  const fields = {};
  const files = [];

  segments.forEach((segment) => {
    const cleaned = segment.replace(/^\r\n/, "").replace(/\r\n$/, "");
    const [headerBlock, bodyBlock = ""] = cleaned.split("\r\n\r\n");
    const disposition = /name="([^"]+)"/.exec(headerBlock);
    if (!disposition) return;
    const name = disposition[1];
    const fileNameMatch = /filename="([^"]*)"/.exec(headerBlock);
    const contentTypeMatch = /Content-Type:\s*([^\r\n]+)/i.exec(headerBlock);
    const body = bodyBlock.replace(/\r\n$/, "");

    if (fileNameMatch && fileNameMatch[1]) {
      const safeName = fileNameMatch[1].replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${uploadDir}/g360-${Date.now()}-${safeName}`;
      writeFileSync(path, Buffer.from(body, "binary"));
      files.push({
        name,
        filename: fileNameMatch[1],
        path,
        type: contentTypeMatch?.[1] ?? "application/octet-stream",
        size: Buffer.byteLength(body, "binary"),
      });
    } else {
      fields[name] = body;
    }
  });

  return { fields, files };
}

export function parseCookies(req) {
  const cookieHeader = req.headers.cookie ?? "";
  return cookieHeader.split(";").reduce((acc, entry) => {
    const [rawKey, ...rawValue] = entry.trim().split("=");
    if (!rawKey) return acc;
    acc[rawKey] = decodeURIComponent(rawValue.join("="));
    return acc;
  }, {});
}

export function appendCookie(res, cookie) {
  const previous = res.getHeader("Set-Cookie");
  if (!previous) {
    res.setHeader("Set-Cookie", [cookie]);
    return;
  }

  const list = Array.isArray(previous) ? previous : [previous];
  list.push(cookie);
  res.setHeader("Set-Cookie", list);
}

export function setCookie(
  res,
  name,
  value,
  { maxAge, httpOnly = true, path = "/", sameSite = "Lax" } = {},
) {
  const segments = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`];

  if (maxAge !== undefined) {
    segments.push(`Max-Age=${maxAge}`);
  }

  if (httpOnly) {
    segments.push("HttpOnly");
  }

  segments.push(`SameSite=${sameSite}`);
  appendCookie(res, segments.join("; "));
}

export function clearCookie(res, name) {
  appendCookie(res, `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
}

export function redirect(res, location, statusCode = 302) {
  res.writeHead(statusCode, { Location: location });
  res.end();
}

export function sendHtml(res, html, statusCode = 200) {
  res.writeHead(statusCode, {
    "Content-Type": "text/html; charset=utf-8",
  });
  res.end(html);
}

export function sendJson(res, payload, statusCode = 200) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(payload));
}

export function notFound(res) {
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Pagina nao encontrada.");
}

export function serveStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  const filePath = resolve(PUBLIC_DIR, `.${url.pathname}`);

  if (!filePath.startsWith(PUBLIC_DIR) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    return false;
  }

  const mimeType = MIME_TYPES[extname(filePath)] ?? "application/octet-stream";
  res.writeHead(200, { "Content-Type": mimeType });
  createReadStream(filePath).pipe(res);
  return true;
}

export function readPublicFile(pathname) {
  return readFileSync(resolve(PUBLIC_DIR, pathname), "utf-8");
}
