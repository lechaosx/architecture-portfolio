import { expect, type Locator, type Page } from '@playwright/test';

/**
 * At each width, in both languages, the services line shows every service; a
 * service wraps only when it alone is wider than the line, and no separator
 * starts or ends a line.
 */
export async function expectServicesWrapWhole(page: Page, fixture: string, servicesLine: (page: Page) => Locator) {
  for (const lang of ['en', 'cs']) {
    await page.goto(`/${lang}/e2e/${fixture}/`);
    await page.evaluate(() => document.fonts.ready);
    for (const width of [320, 390, 768, 1024, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(servicesLine(page), `${lang} ${width}px`).toBeVisible();
      const { lines, names, wrapped } = await servicesLine(page).evaluate((list) => {
        const { left, width } = list.getBoundingClientRect();
        const walker = document.createTreeWalker(list, NodeFilter.SHOW_TEXT);
        const lines: string[] = [];
        const names: string[] = [];
        const wrapped: string[] = [];
        let top: number | undefined;
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const text = node.textContent!;
          if (!text.trim()) continue;
          const range = document.createRange();
          for (let i = 0; i < text.length; i++) {
            range.setStart(node, i);
            range.setEnd(node, i + 1);
            const rect = range.getBoundingClientRect();
            // Clipped off the list's left edge.
            if (rect.width === 0 || rect.right <= left) continue;
            if (top === undefined || Math.abs(rect.top - top) > 5) lines.push('');
            top = rect.top;
            lines[lines.length - 1] += text[i];
          }
          // The separators are hidden from assistive technology; the rest is a service.
          if (node.parentElement!.closest('[aria-hidden="true"]')) continue;
          names.push(text);
          range.selectNodeContents(node);
          const rects = [...range.getClientRects()].filter((rect) => rect.width > 0);
          const tops = new Set(rects.map((rect) => Math.round(rect.top)));
          const natural = rects.reduce((sum, rect) => sum + rect.width, 0);
          if (tops.size > 1 && natural <= width) wrapped.push(text);
        }
        return { lines: lines.map((line) => line.trim()), names, wrapped };
      });
      const shown = lines.join(' ');
      expect(names.length, `${lang} ${width}px`).toBeGreaterThan(0);
      for (const name of names) expect(shown, `${lang} ${width}px`).toContain(name);
      expect(wrapped, `${lang} ${width}px: ${lines.join(' / ')}`).toEqual([]);
      for (const line of lines) {
        expect(line, `${lang} ${width}px`).not.toMatch(/^·|·$/);
      }
    }
  }
}
