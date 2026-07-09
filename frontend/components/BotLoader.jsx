'use client';

/**
 * BotLoader — full-screen friendly robot loading animation.
 * Used on the login page Suspense fallback and during session loading in AuthGuard.
 */
export default function BotLoader({ message = 'Loading…' }) {
  return (
    <div className="bot-loader" role="status" aria-label={message}>
      <div className="bot-loader__scene">
        {/* Floating bubbles */}
        <div className="bot-loader__bubble bot-loader__bubble--chat-left" aria-hidden="true">
          <span className="bot-loader__dot" />
          <span className="bot-loader__dot" />
          <span className="bot-loader__dot" />
        </div>

        <div className="bot-loader__bubble bot-loader__bubble--alert-right" aria-hidden="true">
          <span className="bot-loader__exclaim">!</span>
        </div>

        {/* Robot body */}
        <div className="bot-loader__robot" aria-hidden="true">
          <div className="bot-loader__antenna" />
          <div className="bot-loader__head">
            <div className="bot-loader__face">
              <span className="bot-loader__eye bot-loader__eye--left" />
              <span className="bot-loader__eye bot-loader__eye--right" />
              <span className="bot-loader__mouth" />
            </div>
            <div className="bot-loader__mic" />
          </div>
          <div className="bot-loader__body">
            <div className="bot-loader__center-orb" />
          </div>
        </div>

        {/* Bottom floating icons */}
        <div className="bot-loader__icon bot-loader__icon--gear" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </div>

        <div className="bot-loader__icon bot-loader__icon--wrench" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
          </svg>
        </div>
      </div>

      <p className="bot-loader__message">{message}</p>
    </div>
  );
}
