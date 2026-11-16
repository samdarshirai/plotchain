// Shared by the table specs. Runs in the page, so it must stay self-contained (page.evaluate serialises it).
// Runs in the page. Returns one message per broken rule.
export function audit(): string[] {
  const bad: string[] = [];
  const container = (t: Element) => {
    let el = t.parentElement;
    while (el && ['inline', 'contents'].includes(getComputedStyle(el).display)) el = el.parentElement;
    return el;
  };
  document.querySelectorAll('table').forEach((t, i) => {
    if (!(t as HTMLElement).offsetParent) return; // hidden
    const name = `table#${i}(${t.className || 'plain'})`;
    const c = container(t);
    if (c && c.scrollWidth > c.clientWidth + 1) bad.push(`${name}: container ${c.scrollWidth} > ${c.clientWidth}`);
    for (let el = t.parentElement; el && el !== document.body; el = el.parentElement) {
      const ox = getComputedStyle(el).overflowX;
      if ((ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth + 1) bad.push(`${name}: scrolls inside .${el.className}`);
    }
    if (t.classList.contains('table--stacked')) {
      const unlabeled = Array.from(t.querySelectorAll('tbody tr')).some(r =>
        r.children.length > 1 && Array.from(r.children).some(td => !td.hasAttribute('colspan') && !td.hasAttribute('data-label') && !td.classList.contains('table__sno')) && t.tHead);
      if (unlabeled) bad.push(`${name}: stacked cell without data-label`);
    }
  });
  const d = document.documentElement;
  if (d.scrollWidth > d.clientWidth) bad.push(`page ${d.scrollWidth} > ${d.clientWidth}`);
  return bad;
}
