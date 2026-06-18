const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "../outputs");
const port = parseInt(process.env.PORT || "4175", 10);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8"
};

http.createServer((request, response) => {
  let pathname = decodeURIComponent(request.url.split("?")[0]);
  if (pathname === "/" || pathname === "") pathname = "/index.html";
  const filePath = path.resolve(root, `.${pathname}`);

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    response.writeHead(200, { "Content-Type": types[path.extname(filePath)] || "application/octet-stream" });
    response.end(data);
  });
}).listen(port, "127.0.0.1", () => {
  console.log(`Preview server listening on http://127.0.0.1:${port}`);
});
