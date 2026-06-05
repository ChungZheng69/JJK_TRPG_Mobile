import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chatRouter } from "./routes/chat.js";
import { cloudSaveRouter } from "./routes/cloudSave.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const publicDir = path.join(projectRoot, "public");

const app = express();
const PORT = process.env.PORT || 3000;
const llmProvider = process.env.LLM_PROVIDER || "openrouter";
const modelName = process.env.MODEL_NAME || (llmProvider.toLowerCase() === "gemini" ? "gemini-2.5-flash" : "openai/gpt-4.1-mini");
const staticOptions = {
  setHeaders(res, filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".html") res.type("text/html; charset=utf-8");
    if (ext === ".css") res.type("text/css; charset=utf-8");
    if (ext === ".js") res.type("application/javascript; charset=utf-8");
  }
};

app.use(express.json({ limit: "5mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/debug-config", (_req, res) => {
  res.json({
    llmProvider,
    hasOpenrouterApiKey: Boolean(process.env.OPENROUTER_API_KEY),
    hasGeminiApiKey: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
    modelName,
    nodeEnv: process.env.NODE_ENV || ""
  });
});

app.use("/api/chat", chatRouter);
app.use("/api/cloud-save", cloudSaveRouter);
console.log("CLOUD_SAVE_ROUTE_MOUNTED", "/api/cloud-save");
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
  console.log("LLM_PROVIDER", llmProvider);
  console.log("MODEL_NAME", modelName);
  console.log("GEMINI_API_KEY_PRESENT", Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY));
  console.log(`TRPG local engine frontend running at http://localhost:${PORT}`);
});
