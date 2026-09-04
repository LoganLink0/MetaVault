// Force UTF-8 on Windows (code page 936 defaults to GBK)
if (process.platform === 'win32') {
  if (!process.env.LANG) process.env.LANG = 'en_US.UTF-8';
}

import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { getDb } from "./db/init.js";
import { errorHandler } from "./middleware/error-handler.js";
import assetsRouter from "./routes/assets.js";
import suppliersRouter from "./routes/suppliers.js";
import relationsRouter from "./routes/relations.js";
import notificationsRouter from "./routes/notifications.js";
import importRouter from "./routes/import.js";
import dashboardRouter from "./routes/dashboard.js";
import exportRouter from "./routes/export.js";
import checklistsRouter from "./routes/checklists.js";
import usageEventsRouter from "./routes/usage-events.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// 提供上传文件静态访问
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Test-only reset endpoint
if (process.env.NODE_ENV === "test") {
  app.post("/api/test/reset", async (_req, res) => {
    const db = await getDb();
    db.exec("DELETE FROM asset_relations");
    db.exec("DELETE FROM notifications");
    db.exec("DELETE FROM screenshots");
    db.exec("DELETE FROM push_subscriptions");
    db.exec("DELETE FROM checklist_items");
    db.exec("DELETE FROM checklists");
    db.exec("DELETE FROM usage_events");
    db.exec("DELETE FROM assets");
    db.exec("DELETE FROM suppliers");
    res.json({ success: true });
  });
}

app.use("/api/assets", assetsRouter);
app.use("/api/suppliers", suppliersRouter);
app.use("/api/relations", relationsRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/import", importRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/export", exportRouter);
app.use("/api/checklists", checklistsRouter);
app.use("/api/usage-events", usageEventsRouter);

// 生产部署：提供前端静态文件 + SPA fallback
const clientDist = path.join(__dirname, "../../client/dist");
app.use(express.static(clientDist));
app.get("/{*splat}", (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

app.use(errorHandler);

async function start() {
  await getDb();
  console.log("Database initialized");

  // 初始化 Web Push
  const { initPush } = await import("./services/push-service.js");
  initPush();

  // 启动时扫描一次提醒
  const { scanNotifications } = await import("./services/notification-scanner.js");
  const count = await scanNotifications();
  console.log(`Notification scan complete: ${count} new notifications`);

  // 每小时扫描一次
  setInterval(async () => {
    const c = await scanNotifications();
    if (c > 0) console.log(`Scheduled scan: ${c} new notifications`);
  }, 60 * 60 * 1000);

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

start();
