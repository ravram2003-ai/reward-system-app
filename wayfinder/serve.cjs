// Minimal static server for the Wayfinder app. Run: node wayfinder/serve.cjs
const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const PORT = process.env.PORT ? Number(process.env.PORT) : 8791;
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json; charset=utf-8",
};

http.createServer((req, res) => {
  let pathname = decodeURIComponent(req.url.split("?")[0]);
  if (pathname === "/" || pathname === "") pathname = "/index.html";
  const filePath = path.resolve(root, `.${pathname}`);
  if (!filePath.startsWith(root)) { res.writeHead(403); res.end("Forbidden"); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end("Not found"); return; }
    res.writeHead(200, { "Content-Type": types[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  });
}).listen(PORT, "127.0.0.1", () => {
  console.log(`Wayfinder running at http://localhost:${PORT}`);
});
