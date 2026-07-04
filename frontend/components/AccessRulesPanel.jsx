'use client';

import { ACCESS_RULES } from '@/lib/accessRules';

export function RequiredStepsList({ steps, title = 'Required steps' }) {
  if (!steps?.length) return null;

  return (
    <div className="access-rules-steps">
      <p className="access-rules-steps__title">{title}</p>
      <ol className="access-rules-steps__list">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </div>
  );
}

export default function AccessRulesPanel({ compact = false }) {
  return (
    <div className={`card access-rules-panel ${compact ? 'access-rules-panel--compact' : ''}`}>
      <h3 className="access-rules-panel__title">Access flow rules</h3>
      {!compact && (
        <p className="access-rules-panel__intro">
          These rules apply to every person scan. Complete each step in order.
        </p>
      )}
      <ul className="access-rules-panel__list">
        {ACCESS_RULES.map((item) => (
          <li key={item.id} className="access-rules-panel__item">
            <strong>{item.title}:</strong> {item.rule}
          </li>
        ))}
      </ul>
    </div>
  );
}
