import { getDb } from "../db/init.js";
import { sendPushNotification } from "./push-service.js";

export async function scanNotifications(): Promise<number> {
  const db = await getDb();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const assets = db.prepare("SELECT id, name, type, ext, purchase_price FROM assets WHERE status = 'active'").all() as Record<string, unknown>[];

  // 查询收藏的物理/混合供应商（用于替换建议）
  const favPhysicalSuppliers = db.prepare(
    "SELECT name FROM suppliers WHERE is_favorite = 1 AND (type = 'physical' OR type = 'mixed') LIMIT 3"
  ).all() as { name: string }[];

  let count = 0;
  const insert = db.prepare(
    `INSERT OR IGNORE INTO notifications (id, asset_id, checklist_id, type, message, trigger_date, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  // 进行中的清单（用于清单到期提醒）
  const dueChecklists = db.prepare(
    "SELECT id, title, due_date FROM checklists WHERE status = 'active' AND due_date IS NOT NULL"
  ).all() as { id: string; title: string; due_date: string }[];

  const transaction = db.transaction(() => {
    for (const asset of assets) {
      const ext = JSON.parse(asset.ext as string || "{}") as Record<string, unknown>;
      const checks: Array<{ type: string; message: string; triggerDate: string }> = [];

      if (asset.type === "physical") {
        if (ext.warranty_expiry) {
          const exp = new Date(ext.warranty_expiry as string);
          const warn = new Date(exp.getTime() - 30 * 24 * 60 * 60 * 1000);
          if (warn <= now) {
            checks.push({ type: "warranty_expiry", message: `${asset.name} 保修即将到期`, triggerDate: ext.warranty_expiry as string });
          }
        }
        if (ext.current_value && asset.purchase_price) {
          if (Number(ext.current_value) <= Number(asset.purchase_price) * 0.1) {
            checks.push({ type: "deprecation", message: `${asset.name} 严重折旧`, triggerDate: today });
            if (favPhysicalSuppliers.length > 0) {
              const names = favPhysicalSuppliers.map(s => s.name).join("、");
              checks.push({ type: "replacement_suggestion", message: `${asset.name} 已严重折旧，推荐供应商：${names}`, triggerDate: today });
            }
          }
        }
      }

      if (asset.type === "subscription") {
        if (ext.next_billing_date) {
          const exp = new Date(ext.next_billing_date as string);
          const warn = new Date(exp.getTime() - 7 * 24 * 60 * 60 * 1000);
          if (warn <= now) {
            checks.push({ type: "subscription_renewal", message: `${asset.name} 即将续费`, triggerDate: ext.next_billing_date as string });
          }
        }
        if (ext.trial_end) {
          const exp = new Date(ext.trial_end as string);
          const warn = new Date(exp.getTime() - 3 * 24 * 60 * 60 * 1000);
          if (warn <= now) {
            checks.push({ type: "trial_expiry", message: `${asset.name} 试用即将到期`, triggerDate: ext.trial_end as string });
          }
        }
        // 低使用率订阅取消建议
        if (ext.usage_frequency === "rarely" && ext.next_billing_date) {
          const exp = new Date(ext.next_billing_date as string);
          const warn = new Date(exp.getTime() - 7 * 24 * 60 * 60 * 1000);
          if (warn <= now) {
            checks.push({ type: "cancellation_suggestion", message: `${asset.name} 使用频率低，建议考虑取消续费`, triggerDate: ext.next_billing_date as string });
          }
        }
      }

      if (asset.type === "digital") {
        if (ext.expiry_date) {
          const exp = new Date(ext.expiry_date as string);
          const warn = new Date(exp.getTime() - 30 * 24 * 60 * 60 * 1000);
          if (warn <= now) {
            checks.push({ type: "digital_expiry", message: `${asset.name} 即将到期`, triggerDate: ext.expiry_date as string });
          }
        }
        const usageStats = ext.usage_stats as Record<string, unknown> | undefined;
        if (usageStats?.last_access) {
          const lastAccess = new Date(usageStats.last_access as string);
          const stale = new Date(lastAccess.getTime() + 30 * 24 * 60 * 60 * 1000);
          if (stale <= now) {
            checks.push({ type: "usage_stagnation", message: `${asset.name} 长期未使用`, triggerDate: today });
          }
        }
      }

      for (const check of checks) {
        // 去重：同资产+同类型+同触发日不重复
        const exists = db.prepare(
          "SELECT id FROM notifications WHERE asset_id = ? AND type = ? AND trigger_date = ? AND is_dismissed = 0"
        ).get(asset.id, check.type, check.triggerDate);

        if (!exists) {
          insert.run(crypto.randomUUID(), asset.id, null, check.type, check.message, check.triggerDate, new Date().toISOString());
          count++;
        }
      }
    }

    // 清单到期提醒：进行中清单的 due_date 提前 3 天告警
    for (const cl of dueChecklists) {
      const due = new Date(cl.due_date);
      const warn = new Date(due.getTime() - 3 * 24 * 60 * 60 * 1000);
      if (warn > now) continue;

      const daysLeft = Math.ceil((due.getTime() - now.getTime()) / 86400000);
      const message = daysLeft > 0
        ? `清单「${cl.title}」还有 ${daysLeft} 天到期`
        : daysLeft === 0
          ? `清单「${cl.title}」今天到期`
          : `清单「${cl.title}」已过期 ${-daysLeft} 天`;

      // 去重：同清单+同类型+同触发日不重复
      const exists = db.prepare(
        "SELECT id FROM notifications WHERE checklist_id = ? AND type = ? AND trigger_date = ? AND is_dismissed = 0"
      ).get(cl.id, "checklist_due", cl.due_date);

      if (!exists) {
        insert.run(crypto.randomUUID(), null, cl.id, "checklist_due", message, cl.due_date, new Date().toISOString());
        count++;
      }
    }
  });

  transaction();

  // 有新通知时推送
  if (count > 0) {
    sendPushNotification({
      title: "MetaVault 提醒",
      body: count > 1 ? `你有 ${count} 条新提醒` : "你有一条新的资产提醒",
    }).catch(() => {});
  }

  return count;
}
