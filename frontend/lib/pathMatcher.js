export function isPathActive(pathname, searchParams, targetPath) {
  if (!pathname || !targetPath) return false;
  
  const [basePath, query] = targetPath.split('?');
  
  // Home route
  if (basePath === '/') {
    return pathname === '/';
  }
  
  // Base path match
  const baseMatch = pathname === basePath || pathname.startsWith(`${basePath}/`);
  if (!baseMatch) return false;
  
  // Target path specifies query parameters (e.g. /reports?tab=today)
  if (query) {
    const params = new URLSearchParams(query);
    for (const [key, val] of params.entries()) {
      const currentVal = searchParams?.get?.(key);
      // Default fallback for /reports when tab param is missing (defaults to 'today')
      if (!currentVal && basePath === '/reports' && key === 'tab' && val === 'today') {
        continue;
      }
      if (currentVal !== val) return false;
    }
    return true;
  }
  
  // Target path does NOT specify query parameters.
  // If current searchParams has 'tab', generic links without ?tab should not match.
  if (searchParams && searchParams.get('tab')) {
    return false;
  }
  
  return true;
}

export function isGroupActive(pathname, searchParams, item) {
  if (!item) return false;
  if (item.path && isPathActive(pathname, searchParams, item.path)) return true;
  return (item.children || []).some((child) => isPathActive(pathname, searchParams, child.path));
}
