export function hintText(n: number, total: number, source?: 'ai' | 'user'): string {
  return source === 'ai'
    ? `Gemini zoomed in to ${n} of ${total} communities`
    : `Showing ${n} of ${total} communities`;
}
