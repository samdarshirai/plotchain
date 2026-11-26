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
    // Desktop: the table itself must fit. Phones (<=1199px): it may scroll inside itself, only the page must not.
    if (window.innerWidth > 1199 && !t.hasAttribute('data-scroll') && t.scrollWidth > t.clientWidth + 1) bad.push(`${name}: table ${t.scrollWidth} > ${t.clientWidth}`);
  });
  const d = document.documentElement;
  if (d.scrollWidth > d.clientWidth) bad.push(`page ${d.scrollWidth} > ${d.clientWidth}`);
  return bad;
}
