const STORAGE_KEY = 'udtd.inspector.tab';

type TabId = 'state' | 'visual' | 'physics' | 'json';

function isValidTab(value: string | null): value is TabId {
  return value === 'state' || value === 'visual' || value === 'physics' || value === 'json';
}

function readStoredTab(): TabId {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return isValidTab(v) ? v : 'state';
  } catch {
    return 'state';
  }
}

function writeStoredTab(id: TabId): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // ignore quota / private-mode errors
  }
}

export function initInspectorTabs(): void {
  const inspector = document.getElementById('inspector');
  if (!inspector) return;

  const tabs = Array.from(
    inspector.querySelectorAll<HTMLButtonElement>('button[role="tab"]'),
  );
  const panels = Array.from(
    inspector.querySelectorAll<HTMLElement>('[data-tab-panel]'),
  );

  function activate(id: TabId): void {
    tabs.forEach((t) => {
      t.setAttribute('aria-selected', String(t.dataset.tab === id));
    });
    panels.forEach((p) => {
      p.hidden = p.dataset.tabPanel !== id;
    });
    inspector!.dataset.activeTab = id;
    writeStoredTab(id);
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const id = tab.dataset.tab;
      if (isValidTab(id ?? null)) activate(id as TabId);
    });
  });

  activate(readStoredTab());
}
