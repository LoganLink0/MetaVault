import { defineConfig } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverDist = path.resolve(__dirname, "../server/dist/index.js").replace(/\\/g, "/");
const dbPath = path.resolve(__dirname, "../data/metavault-test.db").replace(/\\/g, "/");

export default defineConfig({
  testDir: "./specs",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "list",
  timeout: 30000,
  screenshot: "only-on-failure",
  use: {
    baseURL: "http://localhost:3001",
    trace: "on-first-retry",
    actionTimeout: 10000,
  },
  webServer: {
    command: `node ${serverDist}`,
    port: 3001,
    timeout: 30000,
    reuseExistingServer: true,
    env: {
      NODE_ENV: "test",
      DB_PATH: dbPath,
      PORT: "3001",
    },
  },
});