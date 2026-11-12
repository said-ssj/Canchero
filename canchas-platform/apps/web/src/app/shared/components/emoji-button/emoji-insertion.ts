export function insertEmoji(
  text: string,
  emoji: string,
  start: number,
  end: number,
  maxLength: number,
) {
  const from = Math.max(0, Math.min(start, text.length)),
    to = Math.max(from, Math.min(end, text.length));
  const value = text.slice(0, from) + emoji + text.slice(to);
  if (maxLength >= 0 && value.length > maxLength) return null;
  return { value, caret: from + emoji.length };
}
