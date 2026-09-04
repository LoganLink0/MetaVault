import { Router, Request, Response } from "express";
import type { Router as RouterType } from "express";
import { getDb } from "../db/init.js";

const router: RouterType = Router();

// DELETE /api/usage-events/:id — 删除误记的使用记录
// 设计取舍：digital 资产的 ext.usage_stats.last_access 不回滚（活跃度通道，只前进），历史事件保留语义见 PRD 6.10
router.delete("/:id", async (req: Request, res: Response) => {
  const db = await getDb();
  const result = db.prepare("DELETE FROM usage_events WHERE id = ?").run(req.params.id);
  if (result.changes === 0) {
    res.status(404).json({ error: "Usage event not found" });
    return;
  }
  res.json({ success: true });
});

export default router;
