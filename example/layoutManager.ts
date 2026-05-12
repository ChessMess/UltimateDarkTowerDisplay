import type { DomElements } from './dom';

function constrainRenderedPanelHeight(els: DomElements): void {
  if (!els.renderedPanel) return;
  const rect = els.renderedPanel.getBoundingClientRect();
  const docTop = rect.top + window.scrollY;
  const bottomPad = parseFloat(getComputedStyle(document.body).paddingBottom) || 0;
  const available = window.innerHeight - docTop - bottomPad;
  const maxH = Math.max(240, available);
  els.renderedPanel.style.height = maxH + 'px';
}

export function initLayoutManager(els: DomElements): void {
  window.addEventListener('resize', () => constrainRenderedPanelHeight(els));

  const observer = new ResizeObserver(() => constrainRenderedPanelHeight(els));
  if (els.toolbarEl) observer.observe(els.toolbarEl);

  constrainRenderedPanelHeight(els);
}
