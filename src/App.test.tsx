import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import App from './App';
import { AiRequestError } from './conversation/aiClient';
import type { ChatRequest, ChatResponse, StatusResponse } from './shared/api';

beforeAll(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});

const SLOW = { timeout: 3000 };
const noAi = async (): Promise<StatusResponse> => ({ aiAvailable: false, model: null, reason: 'Gemini conversation is not configured. Add GEMINI_API_KEY to .env.local (key from Google AI Studio) and restart the server.' });
const aiOn = async (): Promise<StatusResponse> => ({ aiAvailable: true, model: 'test-model', reason: null });

async function reply(user: ReturnType<typeof userEvent.setup>, name: string | RegExp) {
  await user.click(await screen.findByRole('button', { name }, SLOW));
}

describe('scripted demo mode (no API key)', () => {
  it('is clearly labelled and answers education questions immediately', async () => {
    const user = userEvent.setup();
    render(<App status={noAi} />);
    await user.click(screen.getByRole('button', { name: 'Explore with Sunny' }));
    expect(screen.getByText('Hi Alex, what would you like to understand about saving for your first home?')).toBeInTheDocument();
    expect(screen.getByText('Scripted demo')).toBeInTheDocument();
    // No goal panel until there is something to show.
    expect(screen.queryByRole('complementary', { name: 'Your goal at a glance' })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Message Sunny'), 'Does Tangerine offer an FHSA?{Enter}');
    expect(await screen.findByText(/I can’t confirm that/, {}, SLOW)).toBeInTheDocument();
    expect(screen.getAllByText(/Sources \(/).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: /Demo settings/ }));
    const dialog = screen.getByRole('dialog', { name: 'Demo settings' });
    expect(within(dialog).getByText('Replies are pre-written and keyword-matched. This is not live AI.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Live AI' })).toBeDisabled();
    expect(within(dialog).getByText(/GEMINI_API_KEY/)).toBeInTheDocument();
  }, 20000);

  it('runs the optional savings-goal journey to a summary', async () => {
    const user = userEvent.setup();
    render(<App status={noAi} />);
    await user.click(screen.getByRole('button', { name: 'Explore with Sunny' }));
    await reply(user, 'Help me explore a savings goal.');
    await reply(user, 'Use my account snapshot.');
    await reply(user, 'In 1–5 years');
    await reply(user, 'Confirm');
    await reply(user, 'Confirm');
    await reply(user, 'Keep $10,000 aside for emergencies');
    expect(await screen.findByText(/I’ll keep that \$10,000 separate and use \$14,000/, {}, SLOW)).toBeInTheDocument();
    const monthly = await screen.findByLabelText('Monthly amount to explore', {}, SLOW);
    await user.clear(monthly);
    await user.type(monthly, '700');
    await reply(user, 'Confirm');
    expect(await screen.findByText(/\$10,800 short of your \$50,000 target/, {}, SLOW)).toBeInTheDocument();
    await reply(user, 'See my summary');
    const scenario = await screen.findByRole('region', { name: 'Monthly-saving scenario explored' }, SLOW);
    expect(within(scenario).getByText('$39,200')).toBeInTheDocument();
  }, 20000);

  it('switching presets resets the conversation', async () => {
    const user = userEvent.setup();
    render(<App status={noAi} />);
    await user.click(screen.getByRole('button', { name: 'Explore with Sunny' }));
    await reply(user, 'Explain home-saving accounts.');
    await user.click(screen.getByRole('button', { name: /Demo settings/ }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Jordan: buying within one year/ }));
    expect(screen.getByRole('heading', { name: 'Welcome back, Jordan' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Explore with Sunny' }));
    expect(screen.queryByText(/main registered options/)).not.toBeInTheDocument();
  }, 20000);
});

describe('live AI mode (mocked API)', () => {
  it('sends the conversation, renders sources and suggestions, and handles permission', async () => {
    const user = userEvent.setup();
    const requests: ChatRequest[] = [];
    const chat = vi.fn(async (body: ChatRequest): Promise<ChatResponse> => {
      requests.push(body);
      if (requests.length === 1) {
        return {
          reply: 'An FHSA is a registered account for first-time buyers. **What’s inside it** decides the risk.',
          sourceIds: ['gov-fhsa-overview', 'not-a-real-id'],
          suggestions: ['Does Tangerine offer one?'],
          effects: [],
        };
      }
      if (requests.length === 2) {
        return { reply: 'May I look at your account snapshot to answer that?', sourceIds: [], suggestions: [], effects: [{ type: 'requestSnapshotPermission', reason: 'To see balances' }] };
      }
      return { reply: 'Your snapshot shows savings of $24,000.', sourceIds: [], suggestions: [], effects: [] };
    });
    render(<App status={aiOn} chat={chat} />);
    await user.click(screen.getByRole('button', { name: 'Explore with Sunny' }));
    expect(screen.queryByText('Scripted demo')).not.toBeInTheDocument();

    await reply(user, 'Explain home-saving accounts.');
    expect(await screen.findByText(/registered account for first-time buyers/, {}, SLOW)).toBeInTheDocument();
    expect(screen.getByText('What’s inside it').tagName).toBe('STRONG');
    await user.click(screen.getByText('Sources (1)'));
    expect(screen.getByRole('link', { name: /Canada Revenue Agency: First Home Savings Account/ })).toHaveAttribute(
      'href',
      'https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/first-home-savings-account.html',
    );
    expect(requests[0].snapshot).toBeNull();

    await user.type(screen.getByLabelText('Message Sunny'), 'How much do I have saved?{Enter}');
    await reply(user, 'Yes, use my account snapshot');
    await screen.findByText(/snapshot shows savings/, {}, SLOW);
    expect(requests[2].snapshotPermission).toBe('granted');
    expect(requests[2].snapshot?.savingsBalance).toBe(24000);
  }, 20000);

  it('shows an honest error with retry, and only switches to scripted when chosen', async () => {
    const user = userEvent.setup();
    let fail = true;
    const chat = vi.fn(async (): Promise<ChatResponse> => {
      if (fail) throw new AiRequestError('timeout', 'The AI service took too long to respond.');
      return { reply: 'A TFSA is flexible…', sourceIds: ['gov-tfsa'], suggestions: [], effects: [] };
    });
    render(<App status={aiOn} chat={chat} />);
    await user.click(screen.getByRole('button', { name: 'Explore with Sunny' }));
    await user.type(screen.getByLabelText('Message Sunny'), 'How is a TFSA different?{Enter}');
    expect(await screen.findByText('The AI service took too long to respond.', {}, SLOW)).toBeInTheDocument();
    expect(screen.queryByText('Scripted demo')).not.toBeInTheDocument();

    fail = false;
    await reply(user, 'Try again');
    expect(await screen.findByText('A TFSA is flexible…', {}, SLOW)).toBeInTheDocument();
    expect(chat).toHaveBeenCalledTimes(2);

    fail = true;
    await user.type(screen.getByLabelText('Message Sunny'), 'Can I lose money?{Enter}');
    await reply(user, 'Use scripted demo instead');
    expect(await screen.findByText(/Switched to the scripted demo/, {}, SLOW)).toBeInTheDocument();
    expect(screen.getByText('Scripted demo')).toBeInTheDocument();
    expect(await screen.findByText(/It depends on what you hold/, {}, SLOW)).toBeInTheDocument();
  }, 20000);

  it('missing key on the server is explained, with the scripted demo offered', async () => {
    const user = userEvent.setup();
    const chat = vi.fn(async (): Promise<ChatResponse> => {
      throw new AiRequestError('not_configured', 'Gemini conversation is not configured. Add GEMINI_API_KEY to .env.local (key from Google AI Studio) and restart the server.');
    });
    render(<App status={aiOn} chat={chat} />);
    await user.click(screen.getByRole('button', { name: 'Explore with Sunny' }));
    await user.type(screen.getByLabelText('Message Sunny'), 'Hi{Enter}');
    expect(await screen.findByText(/not configured/, {}, SLOW)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use scripted demo instead' })).toBeInTheDocument();
  }, 20000);
});
