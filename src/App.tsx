import { useCallback, useEffect, useRef, useState } from 'react';
import { Chat } from './components/Chat';
import { Dashboard } from './components/Dashboard';
import { DemoDrawer } from './components/DemoDrawer';
import { HandoffPreview } from './components/HandoffPreview';
import { Header } from './components/Header';
import { SummaryView } from './components/SummaryView';
import { fetchStatus } from './conversation/aiClient';
import { createInitialState } from './conversation/engine';
import { scriptedProvider } from './conversation/provider';
import type { ConversationState, EngineMode, Memory } from './conversation/types';
import { useSunny, type ChatFn } from './conversation/useSunny';
import { buildPreset, PRESETS } from './data/customers';
import type { SignalConfig } from './domain/signal';
import type { StatusResponse } from './shared/api';

/**
 * Demo memory is synthetic and stored only in this browser, per scenario, so a
 * "later visit" can show continuity. Messages are never stored. Reset clears it.
 */
export const STORAGE_KEY = 'sunny-demo-v2';

interface SavedScenario {
  memory: Memory;
  todayIndex: number;
  reviewFlag: boolean;
  historyDaysAvailable: number | null;
}
interface Store {
  active: string;
  signalConfig?: SignalConfig;
  scenarios: Record<string, SavedScenario>;
}

function readStore(): Store {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as Store;
      if (s && typeof s === 'object' && s.scenarios) return s;
    }
  } catch {
    // Storage unavailable (private mode etc.): the demo still works without it.
  }
  return { active: PRESETS[0].id, scenarios: {} };
}

function writeStore(store: Store) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore
  }
}

function clearStore() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

function stateFor(id: string, store: Store, mode: EngineMode): ConversationState {
  const profile = buildPreset(id);
  const saved = store.scenarios[id];
  if (saved) {
    profile.reviewFlag = saved.reviewFlag;
    profile.historyDaysAvailable = saved.historyDaysAvailable;
  }
  return createInitialState(profile, { memory: saved?.memory, todayIndex: saved?.todayIndex, mode, signalConfig: store.signalConfig });
}

interface Props {
  /** Injectable for tests. */
  chat?: ChatFn;
  status?: (verify?: boolean) => Promise<StatusResponse>;
}

export default function App({ chat, status = fetchStatus }: Props) {
  const storeRef = useRef<Store>(readStore());
  const { state, send, sendText, dispatch, retry, setMode, fallbackToScripted, pendingSay, thinking, orb } = useSunny(
    scriptedProvider,
    () => stateFor(storeRef.current.active, storeRef.current, 'scripted'),
    chat,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aiStatus, setAiStatus] = useState<StatusResponse | null>(null);
  const startedRef = useRef(false);
  startedRef.current = state.messages.some((m) => m.role === 'customer');

  // Live AI only if configured and the customer hasn't started talking; otherwise the labelled scripted demo.
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

  // Persist this scenario's synthetic memory, simulated day and demo flags.
  useEffect(() => {
    const store = storeRef.current;
    store.active = state.profile.id;
    store.signalConfig = state.signalConfig;
    store.scenarios[state.profile.id] = {
      memory: state.memory,
      todayIndex: state.todayIndex,
      reviewFlag: state.profile.reviewFlag,
      historyDaysAvailable: state.profile.historyDaysAvailable,
    };
    writeStore(store);
  }, [state.memory, state.todayIndex, state.profile, state.signalConfig]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [state.view]);

  const loadPreset = useCallback(
    (id: string) => {
      const next = stateFor(id, storeRef.current, state.mode);
      dispatch({ type: 'loadPreset', profile: next.profile, memory: next.memory, todayIndex: next.todayIndex });
      setSettingsOpen(false);
    },
    [dispatch, state.mode],
  );

  const resetCustomer = useCallback(() => {
    delete storeRef.current.scenarios[state.profile.id];
    dispatch({ type: 'loadPreset', profile: buildPreset(state.profile.id) });
    setSettingsOpen(false);
  }, [dispatch, state.profile.id]);

  const resetAll = useCallback(() => {
    clearStore();
    storeRef.current = { active: PRESETS[0].id, scenarios: {} };
    dispatch({ type: 'setSignalConfig', config: createInitialState(buildPreset(PRESETS[0].id)).signalConfig });
    dispatch({ type: 'loadPreset', profile: buildPreset(PRESETS[0].id) });
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
      <Header onOpenSettings={() => setSettingsOpen(true)} onHome={state.view !== 'dashboard' ? () => dispatch({ type: 'setView', view: 'dashboard' }) : undefined} />

      {state.view === 'dashboard' && (
        <Dashboard
          state={state}
          onOpen={(origin) => dispatch({ type: 'open', origin })}
          onCheckin={(action) => dispatch({ type: 'checkin', action })}
          dispatch={dispatch}
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
      {state.view === 'summary' && <SummaryView state={state} dispatch={dispatch} onRestart={resetCustomer} />}

      <DemoDrawer
        open={settingsOpen}
        state={state}
        aiStatus={aiStatus}
        onSetMode={(mode) => setMode(mode, true)}
        onVerify={verify}
        onClose={closeSettings}
        onLoadPreset={loadPreset}
        onResetCustomer={resetCustomer}
        onResetAll={resetAll}
        onLaterVisit={() => {
          dispatch({ type: 'simulateLaterVisit', days: 30 });
          setSettingsOpen(false);
        }}
        dispatch={dispatch}
      />
    </div>
  );
}
