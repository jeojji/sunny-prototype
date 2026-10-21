import { useCallback, useEffect, useRef, useState } from 'react';
import { Chat } from './components/Chat';
import { Dashboard } from './components/Dashboard';
import { DemoDrawer } from './components/DemoDrawer';
import { HandoffPreview } from './components/HandoffPreview';
import { Header } from './components/Header';
import { SummaryView } from './components/SummaryView';
import { fetchStatus } from './conversation/aiClient';
import { scriptedProvider } from './conversation/provider';
import { useSunny, type ChatFn } from './conversation/useSunny';
import { DEFAULT_PROFILE, type CustomerProfile } from './data/customers';
import type { StatusResponse } from './shared/api';

interface Props {
  /** Injectable for tests. */
  chat?: ChatFn;
  status?: (verify?: boolean) => Promise<StatusResponse>;
}

export default function App({ chat, status = fetchStatus }: Props) {
  const { state, send, sendText, dispatch, retry, setMode, fallbackToScripted, pendingSay, thinking, orb } = useSunny(
    scriptedProvider,
    DEFAULT_PROFILE,
    chat,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aiStatus, setAiStatus] = useState<StatusResponse | null>(null);
  const startedRef = useRef(false);
  startedRef.current = state.messages.some((m) => m.role === 'customer');

  // Check once whether live AI is configured. Start in AI mode only if it is
  // and the customer hasn't started talking yet; otherwise the scripted demo is
  // used and labelled as such.
  useEffect(() => {
    let cancelled = false;
    status().then((s) => {
      if (cancelled) return;
      setAiStatus(s);
      if (s.aiAvailable && !startedRef.current) setMode('ai', false);
    });
    return () => {
      cancelled = true;
    };
  }, [status, setMode]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [state.view]);

  const applyProfile = useCallback(
    (profile: CustomerProfile) => {
      dispatch({ type: 'loadProfile', profile });
      setSettingsOpen(false);
    },
    [dispatch],
  );

  const restartConversation = useCallback(() => {
    dispatch({ type: 'confirmRestart' });
    setSettingsOpen(false);
  }, [dispatch]);

  const verify = useCallback(async () => {
    const s = await status(true);
    setAiStatus(s);
    return s;
  }, [status]);

  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  return (
    <div className="app" data-view={state.view}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Header
        onOpenSettings={() => setSettingsOpen(true)}
        onHome={state.view !== 'dashboard' ? () => dispatch({ type: 'setView', view: 'dashboard' }) : undefined}
      />

      {state.view === 'dashboard' && (
        <Dashboard
          profile={state.profile}
          hasConversation={state.messages.length > 0}
          onStart={() => dispatch({ type: 'open' })}
        />
      )}
      {state.view === 'chat' && (
        <Chat
          state={state}
          orb={orb}
          thinking={thinking}
          pendingSay={pendingSay}
          send={send}
          sendText={sendText}
          dispatch={dispatch}
          onRetry={retry}
          onUseScripted={fallbackToScripted}
        />
      )}
      {state.view === 'handoff' && <HandoffPreview state={state} dispatch={dispatch} />}
      {state.view === 'summary' && (
        <SummaryView
          state={state}
          dispatch={dispatch}
          onEditAssumptions={() => {
            if (state.mode === 'scripted') dispatch({ type: 'pickEdit' });
            else {
              dispatch({ type: 'setView', view: 'chat' });
              requestAnimationFrame(() => document.getElementById('goal-panel')?.scrollIntoView());
            }
          }}
          onRestart={() => dispatch({ type: 'loadProfile', profile: state.profile })}
        />
      )}

      <DemoDrawer
        open={settingsOpen}
        profile={state.profile}
        mode={state.mode}
        aiStatus={aiStatus}
        onSetMode={(mode) => setMode(mode, true)}
        onVerify={verify}
        onClose={closeSettings}
        onApplyProfile={applyProfile}
        onRestartConversation={restartConversation}
      />
    </div>
  );
}
