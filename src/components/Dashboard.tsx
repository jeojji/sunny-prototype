import type { CustomerProfile } from '../data/customers';
import { SunnyOrb } from './SunnyOrb';

const balance = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' });

interface Props {
  profile: CustomerProfile;
  hasConversation: boolean;
  onStart: () => void;
}

export function Dashboard({ profile, hasConversation, onStart }: Props) {
  return (
    <main className="dashboard" id="main">
      <h1 className="greeting">Welcome back, {profile.firstName}</h1>

      <section aria-labelledby="accounts-heading" className="accounts">
        <h2 id="accounts-heading" className="section-label">
          Your accounts
        </h2>
        <div className="account-grid">
          <article className="account-card">
            <p className="account-name">Chequing</p>
            <p className="account-number">•••• 4821</p>
            <p className="account-balance">{balance.format(profile.chequingBalance)}</p>
          </article>
          <article className="account-card">
            <p className="account-name">Savings</p>
            <p className="account-number">•••• 3307</p>
            <p className="account-balance">{balance.format(profile.savingsBalance)}</p>
          </article>
        </div>
      </section>

      <section className="hero-card" aria-labelledby="hero-heading">
        <div className="hero-copy">
          <p className="eyebrow">Meet Sunny</p>
          <h2 id="hero-heading">Your first home starts with a conversation.</h2>
          <p>
            Understand where you’re starting from, what information you still need, and what you might explore next. At
            your pace, in plain language.
          </p>
          <button type="button" className="btn btn-primary btn-lg" onClick={onStart}>
            {hasConversation ? 'Continue with Sunny' : 'Explore with Sunny'}
          </button>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <SunnyOrb size={168} />
        </div>
      </section>

      <p className="fine-print">
        Balances shown are synthetic. Sunny shares general information and doesn’t make financial decisions for you.
      </p>
    </main>
  );
}
