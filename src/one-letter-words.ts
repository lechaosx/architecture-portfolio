// A one-letter word not inside another word, a link or a hyphenated word,
// then the spaces after it. A trailing space is bound too: in rich text, the
// next word starts the following piece, as in `v **Brně**`.
const WORD = String.raw`(?<![\p{L}\p{M}\p{N}/-])([vszkouai])`;
const ON_THE_LINE = new RegExp(`${WORD}[^\\S\\r\\n]+`, 'giu');
const ACROSS_NEWLINES = new RegExp(`${WORD}\\s+`, 'giu');

/**
 * Czech typography: a one-letter preposition or conjunction never ends a line,
 * so the space after it becomes a no-break space. With `newlinesAreSpaces`,
 * for text whose newlines render as spaces, so does a newline after it.
 */
export function bindOneLetterWords(text: string, { newlinesAreSpaces = false } = {}) {
  return text.replace(newlinesAreSpaces ? ACROSS_NEWLINES : ON_THE_LINE, '$1\u00A0');
}
