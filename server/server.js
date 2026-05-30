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

app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/chat", chatRouter);
app.get("/mobile", (_req, res) => {
  res.sendFile(path.join(publicDir, "mobile", "index.html"));
});
app.get("/desktop", (_req, res) => {
  res.sendFile(path.join(publicDir, "desktop", "index.html"));
});
app.use("/mobile", express.static(path.join(publicDir, "mobile")));
app.use("/desktop", express.static(path.join(publicDir, "desktop")));
app.use(express.static(publicDir));

app.listen(PORT, () => {
  console.log(`Dify TRPG frontend running at http://localhost:${PORT}`);
});
