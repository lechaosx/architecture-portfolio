export function canSplitProse(text: string) {
  return (text.match(/\S+/g)?.length ?? 0) >= 150;
}
