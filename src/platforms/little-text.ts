/**
 * LinkedIn posts use "little text format": reserved characters must be escaped with a backslash.
 * Hashtags written as #word are kept so they still become real hashtags.
 */
export function toLittleText(text: string): string {
  return text.replace(/[|{}@[\]()<>#\\*_~]/g, (ch, offset: number, s: string) => {
    if (ch === "#" && /[\p{L}\p{N}]/u.test(s[offset + 1] ?? "")) return ch; // #hashtag
    return `\\${ch}`;
  });
}
