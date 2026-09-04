import Database from "better-sqlite3";
import { readFileSync } from "fs";
import { mkdir } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

let db: Database.Database | null = null;

// 旧库的 notifications 表是 8 种类型 + asset_id NOT NULL 的 v1 schema，
// CREATE TABLE IF NOT EXISTS 不会更新已存在的表；检测到旧表时重建为 v2
// （asset_id/checklist_id 均可空 + checklist_due 类型），保留全部历史数据
function migrateNotificationsSchema(database: Database.Database): void {
  const table = database
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'notifications'")
    .get() as { sql: string } | undefined;
  if (!table || table.sql.includes("checklist_due")) return;

  database.pragma("foreign_keys = OFF");
  const migration = database.transaction(() => {
    database.exec(`
      CREATE TABLE notifications_new (
        id          TEXT PRIMARY KEY,
        asset_id    TEXT REFERENCES assets(id) ON DELETE CASCADE,
        checklist_id TEXT REFERENCES checklists(id) ON DELETE CASCADE,
        type        TEXT NOT NULL CHECK(type IN ('warranty_expiry','subscription_renewal','digital_expiry','trial_expiry','usage_stagnation','deprecation','cancellation_suggestion','replacement_suggestion','checklist_due')),
        message     TEXT NOT NULL,
        trigger_date TEXT NOT NULL,
        is_read     INTEGER DEFAULT 0,
        is_dismissed INTEGER DEFAULT 0,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO notifications_new (id, asset_id, type, message, trigger_date, is_read, is_dismissed, created_at)
        SELECT id, asset_id, type, message, trigger_date, is_read, is_dismissed, created_at FROM notifications;
      DROP TABLE notifications;
      ALTER TABLE notifications_new RENAME TO notifications;
      CREATE INDEX IF NOT EXISTS idx_notifications_asset ON notifications(asset_id);
      CREATE INDEX IF NOT EXISTS idx_notifications_checklist ON notifications(checklist_id);
      CREATE INDEX IF NOT EXISTS idx_notifications_trigger ON notifications(trigger_date);
      CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(is_read, is_dismissed);
    `);
  });
  migration();
  database.pragma("foreign_keys = ON");
}

// 旧库的 checklists 表没有 kind 列（v0.6 唤醒计划机器标记），
// CREATE TABLE IF NOT EXISTS 不会更新已存在的表；缺列时 ALTER TABLE 补列（加带默认值的列不需重建表）
function migrateChecklistsKind(database: Database.Database): void {
  const columns = database.prepare("PRAGMA table_info(checklists)").all() as Array<{ name: string }>;
  if (columns.length === 0 || columns.some((c) => c.name === "kind")) return;
  database.exec("ALTER TABLE checklists ADD COLUMN kind TEXT NOT NULL DEFAULT 'normal'");
}

export async function getDb(): Promise<Database.Database> {
  if (db) return db;

  const dbPath = process.env.DB_PATH || join(__dirname, "../../data/metavault.db");
  await mkdir(dirname(dbPath), { recursive: true });

  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // 必须在 init.sql 之前迁移：旧表没有 checklist_id 列，
  // init.sql 里的 CREATE INDEX ... ON notifications(checklist_id) 会直接报错
  migrateNotificationsSchema(db);

  const sql = readFileSync(join(__dirname, "init.sql"), "utf-8");
  db.exec(sql);

  // init.sql 之后迁移：表由 CREATE TABLE IF NOT EXISTS 保证存在
  migrateChecklistsKind(db);

  return db;
}
