export const INDUSTRIES: { code: string; label: string }[] = [
  { code: 'manufacturing', label: '製造業' },
  { code: 'construction', label: '建設業' },
  { code: 'information', label: '情報通信業' },
  { code: 'wholesale', label: '卸売業' },
  { code: 'retail', label: '小売業' },
  { code: 'transport', label: '運輸業' },
  { code: 'realestate', label: '不動産業' },
  { code: 'food', label: '飲食・宿泊業' },
  { code: 'medical', label: '医療・福祉' },
  { code: 'services', label: 'サービス業' },
  { code: 'other', label: 'その他' },
];

export function industryLabel(code: string): string {
  return INDUSTRIES.find((i) => i.code === code)?.label ?? code;
}
