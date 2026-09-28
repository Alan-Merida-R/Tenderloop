export interface ExplorerSelectionInput {
  orderedKeys: string[];
  selectedKeys: ReadonlySet<string>;
  activeKey: string | null;
  anchorKey: string | null;
  clickedKey: string;
  ctrlOrMeta: boolean;
  shift: boolean;
}

export interface ExplorerSelectionResult {
  selectedKeys: Set<string>;
  activeKey: string | null;
  anchorKey: string | null;
}

/** Pure Windows-Explorer-style click selection, shared by UI and regression checks. */
export const computeExplorerSelection = ({
  orderedKeys,
  selectedKeys,
  activeKey,
  anchorKey,
  clickedKey,
  ctrlOrMeta,
  shift,
}: ExplorerSelectionInput): ExplorerSelectionResult => {
  const visible = new Set(orderedKeys);
  const current = new Set([...selectedKeys].filter(key => visible.has(key)));
  const validActive = activeKey && current.has(activeKey) ? activeKey : null;
  const validAnchor = anchorKey && visible.has(anchorKey) ? anchorKey : null;

  if (!visible.has(clickedKey)) {
    return {
      selectedKeys: current,
      activeKey: validActive || orderedKeys.find(key => current.has(key)) || null,
      anchorKey: validAnchor,
    };
  }

  if (shift && validAnchor) {
    const start = orderedKeys.indexOf(validAnchor);
    const end = orderedKeys.indexOf(clickedKey);
    const [lo, hi] = [Math.min(start, end), Math.max(start, end)];
    const range = orderedKeys.slice(lo, hi + 1);
    const next = ctrlOrMeta ? new Set([...current, ...range]) : new Set(range);
    return { selectedKeys: next, activeKey: clickedKey, anchorKey: validAnchor };
  }

  if (ctrlOrMeta) {
    const next = new Set(current);
    if (next.has(clickedKey)) next.delete(clickedKey);
    else next.add(clickedKey);
    const clickedRemains = next.has(clickedKey);
    const nextActive = clickedRemains
      ? clickedKey
      : (validActive && next.has(validActive) ? validActive : orderedKeys.find(key => next.has(key)) || null);
    return { selectedKeys: next, activeKey: nextActive, anchorKey: clickedKey };
  }

  return { selectedKeys: new Set([clickedKey]), activeKey: clickedKey, anchorKey: clickedKey };
};
