import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { AiRequestError } from './conversation/aiClient';
import type { ChatRequest, ChatResponse, StatusResponse } from './shared/api';

beforeAll(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});
beforeEach(() => {
  window.localStorage.clear();
});

const SLOW = { timeout: 3000 };
const noAi = async (): Promise<StatusResponse> => ({ aiAvailable: false, model: null, reason: 'Gemini conversation is not configured. Add GEMINI_API_KEY to .env.local.' });
const aiOn = async (): Promise<StatusResponse> => ({ aiAvailable: true, model: 'test-model', reason: null });

type User = ReturnType<typeof userEvent.setup>;
async function reply(user: User, name: string | RegExp) {
  await user.click(await screen.findByRole('button', { name }, SLOW));
}
async function openSettings(user: User) {
  await user.click(screen.getByRole('button', { name: /Demo settings/ }));
  return screen.getByRole('dialog', { name: 'Demo settings' });
}

describe('scripted demo: the proactive loop', () => {
  it('nudge → permission → allocations → goal → offerings → next step → summary', async () => {
    const user = userEvent.setup();
    render(<App status={noAi} />);

    // Dashboard starts with a useful nudge built from the signal.
    expect(screen.getByRole('heading', { name: /chequing balance has stayed above \$25,000 over the past three months/ })).toBeInTheDocument();
    await user.click(screen.getByText('Why am I seeing this?'));
    expect(screen.getByText(/never below \$25,000/)).toBeInTheDocument();
    expect(screen.queryByText(/too much|doing nothing|should invest/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Explore with Sunny' }));
    expect(screen.getByText('Scripted demo')).toBeInTheDocument();
    await reply(user, 'Yes, use my account details');
    await reply(user, 'I need $3,000 for bills and $10,000 for emergencies.');
    expect(await screen.findByText(/That leaves \$15,000 not yet assigned to a purpose/, {}, SLOW)).toBeInTheDocument();
    await reply(user, 'Yes, that’s right');
    await reply(user, 'I want to build wealth, but I don’t know how investing works.');
    await reply(user, 'More than 5 years away');
    expect(await screen.findByLabelText('Tangerine offerings to learn about', {}, SLOW)).toBeInTheDocument();
    expect(screen.getAllByText('Tangerine Investment Funds').length).toBeGreaterThan(0);
    await reply(user, 'Learn about investment risk first');
    expect(await screen.findByText(/I’ll remember that you wanted to understand investment risk/, {}, SLOW)).toBeInTheDocument();

    await reply(user, 'See my summary');
    expect(await screen.findByRole('heading', { name: 'Your conversation with Sunny' }, SLOW)).toBeInTheDocument();
    expect(screen.getByText('Build wealth over time')).toBeInTheDocument();
    expect(screen.getByText('Learn about investment risk first')).toBeInTheDocument();
    expect(screen.getByText(/comfort with investment risk hasn’t been assessed/)).toBeInTheDocument();
  }, 30000);

  it('a later visit shows a check-in based on the saved next step; “Stop these check-ins” works', async () => {
    const user = userEvent.setup();
    render(<App status={noAi} />);
    await user.click(screen.getByRole('button', { name: 'Explore with Sunny' }));
    await reply(user, 'Yes, use my account details');
    await reply(user, 'I need $3,000 for bills and $10,000 for emergencies.');
    await reply(user, 'Yes, that’s right');
    await reply(user, 'I want to build wealth, but I don’t know how investing works.');
    await reply(user, 'More than 5 years away');
    await reply(user, 'Learn about investment risk first');
    await screen.findByText(/I’ll remember that you wanted to understand investment risk/, {}, SLOW);

    const dialog = await openSettings(user);
    await user.click(within(dialog).getByRole('button', { name: /Simulate a later visit/ }));
    expect(screen.getByRole('heading', { name: 'Last time, you wanted to understand investment risk before deciding what to do. Would you like to pick that up?' })).toBeInTheDocument();
    expect(screen.getByText('Build wealth over time')).toBeInTheDocument(); // goal shown on the dashboard
    expect(screen.getByText(/Next step: Learn about investment risk first/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Stop these check-ins' }));
    expect(screen.getByText(/Check-ins are off/)).toBeInTheDocument();

    const again = await openSettings(user);
    await user.click(within(again).getByRole('button', { name: /Simulate a later visit/ }));
    expect(screen.queryByRole('button', { name: 'Stop these check-ins' })).not.toBeInTheDocument();
  }, 30000);

  it('“Not now” and “already set aside” are respected', async () => {
    const user = userEvent.setup();
    render(<App status={noAi} />);
    await user.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.getByText(/won’t bring this up for a while/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Explore with Sunny' })).not.toBeInTheDocument();

    const dialog = await openSettings(user);
    await user.click(within(dialog).getByRole('button', { name: /Reset this scenario/ }));
    await user.click(screen.getByRole('button', { name: 'This money is already set aside' }));
    expect(screen.getByText(/won’t suggest exploring this balance again/)).toBeInTheDocument();
    const d2 = await openSettings(user);
    await user.click(within(d2).getByRole('button', { name: /Simulate a later visit/ }));
    expect(screen.queryByRole('button', { name: 'Explore with Sunny' })).not.toBeInTheDocument();
  }, 30000);

  it('Scenario C shows a normal dashboard with no manufactured opportunity, and Sunny is still available', async () => {
    const user = userEvent.setup();
    render(<App status={noAi} />);
    const dialog = await openSettings(user);
    await user.click(within(dialog).getByRole('button', { name: /C · Sam: no qualifying signal/ }));
    expect(screen.getByRole('heading', { name: 'Welcome back, Sam' })).toBeInTheDocument();
    expect(screen.queryByText(/Want to explore whether some of it/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ask Sunny' }));
    await user.type(screen.getByLabelText('Message Sunny'), 'What’s the difference between a GIC and an investment fund?{Enter}');
    expect(await screen.findByText(/They work very differently/, {}, SLOW)).toBeInTheDocument();
  }, 30000);
});

describe('header', () => {
  it('has no feedback control', () => {
    render(<App status={noAi} />);
    expect(screen.queryByText(/Give feedback/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /feedback/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Demo settings/ })).toBeInTheDocument();
  });
});

describe('live AI mode (mocked API)', () => {
  it('keeps “Explore other topics” and fallback suggestions when the model returns none', async () => {
    const user = userEvent.setup();
    const chat = vi.fn(async (): Promise<ChatResponse> => ({ reply: 'A GIC returns your principal at the end of a term.', sourceIds: ['cdic-gic'], suggestions: [], effects: [] }));
    render(<App status={aiOn} chat={chat} />);
    await user.click(await screen.findByRole('button', { name: 'Ask Sunny' }));
    await user.type(screen.getByLabelText('Message Sunny'), 'What is a GIC?{Enter}');
    await screen.findByText(/returns your principal/, {}, SLOW);
    const group = screen.getByRole('group', { name: 'Suggested replies' });
    expect(within(group).getAllByRole('button').length).toBeGreaterThanOrEqual(3);
    await user.click(screen.getByRole('button', { name: 'Explore other topics' }));
    const menu = screen.getByRole('group', { name: 'Other topics' });
    await user.click(within(menu).getByRole('button', { name: 'Browse all Tangerine offerings' }));
    await waitFor(() => expect(chat).toHaveBeenCalledTimes(2));
  }, 30000);

  it('asks permission before account details reach the model', async () => {
    const user = userEvent.setup();
    const requests: ChatRequest[] = [];
    const chat = vi.fn(async (body: ChatRequest): Promise<ChatResponse> => {
      requests.push(body);
      return { reply: 'Thanks. That leaves $15,000 not yet assigned to a purpose.', sourceIds: [], suggestions: ['Is a TFSA an investment?'], effects: [] };
    });
    render(<App status={aiOn} chat={chat} />);
    await user.click(await screen.findByRole('button', { name: 'Explore with Sunny' }));
    expect(screen.queryByText('Scripted demo')).not.toBeInTheDocument();
    expect(chat).not.toHaveBeenCalled(); // the opening and permission question are local
    await reply(user, 'Keep it general');
    await reply(user, 'I need $3,000 for bills and $10,000 for emergencies.');
    await screen.findByText(/not yet assigned/, {}, SLOW);
    expect(requests[0].permission).toBe('declined');
    expect(requests[0].account).toBeNull();
  }, 30000);

  it('shows an honest error with retry, and only switches to scripted when chosen', async () => {
    const user = userEvent.setup();
    let fail = true;
    const chat = vi.fn(async (): Promise<ChatResponse> => {
      if (fail) throw new AiRequestError('rate_limited', 'Gemini’s free-tier usage limit has been reached.');
      return { reply: 'A TFSA is an account, not an investment.', sourceIds: ['gov-tfsa'], suggestions: [], effects: [] };
    });
    render(<App status={aiOn} chat={chat} />);
    await user.click(await screen.findByRole('button', { name: 'Ask Sunny' }));
    await user.type(screen.getByLabelText('Message Sunny'), 'Is a TFSA an investment?{Enter}');
    expect(await screen.findByText('Gemini’s free-tier usage limit has been reached.', {}, SLOW)).toBeInTheDocument();
    expect(screen.queryByText('Scripted demo')).not.toBeInTheDocument();
    fail = false;
    await reply(user, 'Try again');
    expect(await screen.findByText('A TFSA is an account, not an investment.', {}, SLOW)).toBeInTheDocument();

    fail = true;
    await user.type(screen.getByLabelText('Message Sunny'), 'Can I lose money?{Enter}');
    await reply(user, 'Use scripted demo instead');
    expect(await screen.findByText(/Switched to the scripted demo/, {}, SLOW)).toBeInTheDocument();
    expect(screen.getByText('Scripted demo')).toBeInTheDocument();
    expect(await screen.findByText(/It depends on what you hold/, {}, SLOW)).toBeInTheDocument();
  }, 30000);
});
