import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chatRouter } from "./routes/chat.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const publicDir = path.join(projectRoot, "public");

const app = express();
const PORT = process.env.PORT || 3000;
const staticOptions = {
  setHeaders(res, filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".html") res.type("text/html; charset=utf-8");
    if (ext === ".css") res.type("text/css; charset=utf-8");
    if (ext === ".js") res.type("application/javascript; charset=utf-8");
  }
};

app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/chat", chatRouter);
app.get("/mobile", (_req, res) => {
  res.type("text/html; charset=utf-8").sendFile(path.join(publicDir, "mobile", "index.html"));
});
app.get("/desktop", (_req, res) => {
  res.type("text/html; charset=utf-8").sendFile(path.join(publicDir, "desktop", "index.html"));
});
app.use("/mobile", express.static(path.join(publicDir, "mobile"), staticOptions));
app.use("/desktop", express.static(path.join(publicDir, "desktop"), staticOptions));
app.use(express.static(publicDir, staticOptions));

app.listen(PORT, () => {
  console.log(`Dify TRPG frontend running at http://localhost:${PORT}`);
});
