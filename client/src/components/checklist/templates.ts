import type { AssetType } from "@/types/asset";
import type { ChecklistScenario } from "@/types/checklist";

export interface ItemTemplate {
  content: string;
  assetTypes?: AssetType[];
  assetCategories?: string[];
  always?: boolean;
}

export interface ScenarioTemplate {
  scenario: ChecklistScenario;
  title: string;
  description: string;
  items: ItemTemplate[];
}

const scenarioColor: Record<ChecklistScenario, string> = {
  business_trip: "bg-phy/10 text-phy border-phy/30",
  travel: "bg-dig/10 text-dig border-dig/30",
  daily_check: "bg-sub/10 text-sub border-sub/30",
  moving: "bg-ink/5 text-ink2 border-ink3",
  custom: "bg-ink/5 text-ink3 border-ink4",
};

export { scenarioColor };

export const scenarioTemplates: ScenarioTemplate[] = [
  {
    scenario: "business_trip",
    title: "出差清单",
    description: "根据持有资产生成出差必备物品检查",
    items: [
      { content: "身份证/护照", always: true },
      { content: "笔记本电脑", assetCategories: ["physical.laptop"] },
      { content: "笔记本充电器", assetCategories: ["physical.laptop"] },
      { content: "手机充电器", assetTypes: ["physical"] },
      { content: "充电宝", assetCategories: ["physical.other"] },
      { content: "耳机", assetCategories: ["physical.other"] },
      { content: "检查订阅续费", assetTypes: ["subscription"] },
      { content: "确认酒店/机票", always: true },
      { content: "差旅文件/发票", always: true },
    ],
  },
  {
    scenario: "travel",
    title: "旅行清单",
    description: "旅行出行物品与数字资产检查",
    items: [
      { content: "身份证/护照", always: true },
      { content: "手机充电器", assetTypes: ["physical"] },
      { content: "相机及电池", assetCategories: ["physical.camera"] },
      { content: "充电宝", assetCategories: ["physical.other"] },
      { content: "耳机", assetCategories: ["physical.other"] },
      { content: "书/电子书", assetCategories: ["physical.book", "digital.ebook"] },
      { content: "确认酒店/机票", always: true },
      { content: "检查数字资产到期", assetTypes: ["digital"] },
      { content: "旅行保险", always: true },
    ],
  },
  {
    scenario: "daily_check",
    title: "日常检查",
    description: "定期检查资产状态、到期与续费",
    items: [
      { content: "检查保修到期资产", assetCategories: ["physical.laptop", "physical.phone", "physical.monitor"] },
      { content: "检查订阅续费", assetTypes: ["subscription"] },
      { content: "检查数字资产到期", assetTypes: ["digital"] },
      { content: "检查闲置资产", always: true },
      { content: "检查过期资产", always: true },
      { content: "更新资产估值", assetTypes: ["physical"] },
    ],
  },
  {
    scenario: "moving",
    title: "搬家清单",
    description: "搬家打包与资产位置更新",
    items: [
      { content: "打包电子设备", assetCategories: ["physical.laptop", "physical.phone", "physical.monitor"] },
      { content: "打包相机设备", assetCategories: ["physical.camera"] },
      { content: "打包书籍", assetCategories: ["physical.book"] },
      { content: "打包家具", assetCategories: ["physical.furniture"] },
      { content: "打包其他物品", assetCategories: ["physical.other"] },
      { content: "更新资产存放位置", assetTypes: ["physical"], always: true },
      { content: "检查数字资产（无需打包）", assetTypes: ["digital"] },
      { content: "转移订阅地址", assetTypes: ["subscription"] },
    ],
  },
];

export function generateItemsFromTemplate(
  template: ScenarioTemplate,
  userAssets: { id: string; type: string; category: string }[]
): { content: string; asset_id: string | null }[] {
  const items: { content: string; asset_id: string | null }[] = [];

  for (const tpl of template.items) {
    const matchingAssets = userAssets.filter((a) => {
      if (tpl.always) return false;
      if (tpl.assetTypes && tpl.assetTypes.includes(a.type as AssetType)) return true;
      if (tpl.assetCategories && tpl.assetCategories.includes(a.category)) return true;
      return false;
    });

    if (tpl.always || matchingAssets.length > 0) {
      items.push({
        content: tpl.content,
        asset_id: matchingAssets.length > 0 ? matchingAssets[0].id : null,
      });
    }
  }

  return items;
}
