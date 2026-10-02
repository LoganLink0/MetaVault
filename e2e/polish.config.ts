// 视觉打磨专用 Playwright 配置：独立端口/DB，webServer 由 Playwright 管理
import { defineConfig } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverDist = path.resolve(__dirname, "../server/dist/index.js").replace(/\\/g, "/");
const dbPath = path.resolve(__dirname, "../data/metavault-polish.db").replace(/\\/g, "/");

export default defineConfig({
  testDir: "./polish",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  timeout: 180000,
  use: {
    baseURL: "http://localhost:3999",
    actionTimeout: 10000,
  },
  webServer: {
    command: `node ${serverDist}`,
    port: 3999,
    timeout: 30000,
    reuseExistingServer: false,
    env: {
      NODE_ENV: "test",
      DB_PATH: dbPath,
      PORT: "3999",
    },
  },
});
