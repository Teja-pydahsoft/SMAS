'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * Reusable tab navigation component for page-level sub-navigation.
 * @param {Object[]} tabs - Array of tab objects { label, path }
 */
export default function PageTabs({ tabs = [] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const isTabActive = (tabPath) => {
    const [basePath, query] = tabPath.split('?');
    
    // Check if base paths match exactly
    if (pathname !== basePath) return false;

    // If the tab requires query params, ensure they match
    if (query) {
      const params = new URLSearchParams(query);
      for (const [key, value] of params.entries()) {
        if (searchParams.get(key) !== value) return false;
      }
      return true;
    }

    // If the tab has no query params, but the current URL does, it might still be active
    // EXCEPT if another tab specifically matches those query params.
    // For simplicity, if the tab has no query params and the base path matches, we consider it active
    // if no other tab with a more specific query match is active.
    
    // We'll do a strict check: if the tab has NO query, but current URL HAS query,
    // we only match if no other tab exactly matches the current query.
    const currentQueryString = searchParams.toString();
    if (currentQueryString) {
      const moreSpecificMatchExists = tabs.some(t => {
        if (t.path === tabPath) return false;
        const [tBase, tQuery] = t.path.split('?');
        if (tBase !== pathname || !tQuery) return false;
        
        const tParams = new URLSearchParams(tQuery);
        for (const [key, value] of tParams.entries()) {
          if (searchParams.get(key) !== value) return false;
        }
        return true;
      });
      if (moreSpecificMatchExists) return false;
    }

    return true;
  };

  return (
    <div style={{ borderBottom: '1px solid var(--border-color)', marginBottom: '24px' }}>
      <nav style={{ display: 'flex', gap: '32px', padding: '0 24px' }}>
        {tabs.map((tab) => {
          const active = isTabActive(tab.path);
          return (
            <Link
              key={tab.path + tab.label}
              href={tab.path}
              style={{
                padding: '12px 0',
                borderBottom: active ? '2px solid var(--primary-color)' : '2px solid transparent',
                color: active ? 'var(--primary-color)' : 'var(--text-secondary)',
                fontWeight: active ? 600 : 500,
                fontSize: '14px',
                transition: 'all 0.2s ease',
                display: 'inline-block',
                textDecoration: 'none'
              }}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
