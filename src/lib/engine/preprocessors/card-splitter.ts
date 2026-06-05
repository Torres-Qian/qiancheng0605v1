import { RawDataGrid, CardDetectionConfig } from '@/types/rule';
import { WaybillRecord } from '@/types/waybill';

interface CardBlock {
  title: string;
  rows: string[][];
}

// 识别卡片边界
export function detectCards(data: RawDataGrid, config: CardDetectionConfig): CardBlock[] {
  const cards: CardBlock[] = [];
  let currentCard: CardBlock | null = null;
  const startRegex = new RegExp(config.startPattern, 'i');
  const endRegex = config.endPattern ? new RegExp(config.endPattern, 'i') : null;

  for (const row of data.rows) {
    const rowText = row.join(' ').trim();
    if (!rowText) continue;

    if (startRegex.test(rowText)) {
      // 保存上一个卡片
      if (currentCard) cards.push(currentCard);
      currentCard = { title: rowText, rows: [] };
    } else if (endRegex && endRegex.test(rowText) && currentCard) {
      cards.push(currentCard);
      currentCard = null;
    } else if (currentCard) {
      currentCard.rows.push(row);
    }
  }

  // 保存最后一个卡片
  if (currentCard) cards.push(currentCard);

  return cards;
}

// 从卡片中提取字段
export function extractFromCard(card: CardBlock, config: CardDetectionConfig): Record<string, string> {
  const result: Record<string, string> = {};
  const allText = card.rows.map(r => r.join(' ')).join('\n');

  for (const fieldConfig of config.fieldsInsideCard) {
    const regex = new RegExp(fieldConfig.pattern, 'i');
    const match = allText.match(regex);
    if (match) {
      result[fieldConfig.field] = (match[1] || match[0]).trim();
    }
  }

  return result;
}
