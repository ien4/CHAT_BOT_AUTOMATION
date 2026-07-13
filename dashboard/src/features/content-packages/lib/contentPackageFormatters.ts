export function getContentPackageItemTypeLabel(type: string) {
  switch (type) {
    case 'image_prompt': return '🎨 Prompt';
    case 'link': return '🔗 Link';
    case 'document': return '📄 Tài liệu';
    case 'skill': return '🛠 Kỹ năng';
    default: return type;
  }
}
