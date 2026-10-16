/** Flatten Blender parent links for a compact, expandable object list. */
export function visibleObjectRows(objects, collapsed = new Set()) {
  const byId = new Map(objects.map(object => [object.id, object]));
  const children = new Map(objects.map(object => [object.id, []]));
  const roots = [];
  for (const object of objects) {
    const parent = object.parent_id;
    if (parent && parent !== object.id && byId.has(parent)) children.get(parent).push(object);
    else roots.push(object);
  }
  const rows = [];
  const seen = new Set();
  function append(root) {
    const stack = [{ object: root, depth: 0, hidden: false }];
    while (stack.length) {
      const { object, depth, hidden } = stack.pop();
      if (seen.has(object.id)) continue;
      seen.add(object.id);
      const descendants = children.get(object.id);
      const expanded = !collapsed.has(object.id);
      if (!hidden) rows.push({ object, depth, hasChildren: descendants.length > 0, expanded });
      for (let index = descendants.length - 1; index >= 0; index--)
        stack.push({ object: descendants[index], depth: depth + 1, hidden: hidden || !expanded });
    }
  }
  for (const root of roots) append(root);
  // A malformed parent cycle has no root; still show each object once.
  for (const object of objects) if (!seen.has(object.id)) append(object);
  return rows;
}
