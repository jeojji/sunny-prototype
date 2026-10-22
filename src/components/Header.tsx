/** Team feedback goes to a GitHub issue using .github/ISSUE_TEMPLATE/feedback.md. */
const FEEDBACK_URL = 'https://github.com/jeojji/sunny-prototype/issues/new?template=feedback.md';

interface Props {
  onOpenSettings: () => void;
  onHome?: () => void;
}

export function Header({ onOpenSettings, onHome }: Props) {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <div className="brand">
          {onHome ? (
            <button type="button" className="wordmark wordmark-button" onClick={onHome} aria-label="Back to accounts">
              <Wordmark />
            </button>
          ) : (
            <span className="wordmark">
              <Wordmark />
            </span>
          )}
          <span className="concept-chip">Concept</span>
        </div>
        <div className="header-actions">
          <span className="prototype-label">Academic prototype · Synthetic data</span>
          <a className="settings-button" href={FEEDBACK_URL} target="_blank" rel="noreferrer">
            <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16">
              <path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" d="M4 5h16v11H9l-5 4z" />
            </svg>
            <span>Give feedback</span>
          </a>
          <button type="button" className="settings-button" onClick={onOpenSettings} aria-haspopup="dialog">
            <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16">
              <path
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                d="M4 7h10M18 7h2M4 17h4M12 17h8M16 4v6M10 14v6"
              />
            </svg>
            <span>Demo settings</span>
          </button>
        </div>
      </div>
    </header>
  );
}

function Wordmark() {
  return (
    <>
      <span className="wordmark-dot" aria-hidden="true" />
      <span className="wordmark-text">tangerine</span>
    </>
  );
}
