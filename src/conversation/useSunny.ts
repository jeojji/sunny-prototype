import { useCallback, useEffect, useRef, useState } from 'react';
import type { CustomerProfile } from '../data/customers';
import type { ChatRequest, ChatResponse } from '../shared/api';
import { AiRequestError, buildChatRequest, requestChat } from './aiClient';
import { createInitialState, reduce } from './engine';
import type { SunnyProvider } from './provider';
import type { ConversationState, CustomerTurn, EngineMode, SunnyEvent } from './types';

export type OrbMode = 'idle' | 'thinking' | 'speaking';

export type ChatFn = (body: ChatRequest, signal?: AbortSignal) => Promise<ChatResponse>;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Connects the conversation to React.
 *  - Scripted mode: the SunnyProvider maps text to events; a short pause precedes each reply.
 *  - AI mode: customer text goes to the local API; the response's effects are applied by the reducer.
 * UI-only events apply instantly. Resets cancel any reply still in flight.
 */
export function useSunny(provider: SunnyProvider, profile: CustomerProfile, chat: ChatFn = requestChat) {
  const [state, setState] = useState<ConversationState>(() => createInitialState(profile));
  const [pendingSay, setPendingSay] = useState<string | null>(null);
  const [orb, setOrb] = useState<OrbMode>('idle');
  const [busyFlag, setBusyFlag] = useState(false);
  const stateRef = useRef(state);
  const busy = useRef(false);
  const epoch = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const speakTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(speakTimer.current), []);

  const commit = useCallback((next: ConversationState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const setBusy = (v: boolean) => {
    busy.current = v;
    setBusyFlag(v);
  };

  const finish = useCallback((started: number) => {
    if (epoch.current !== started) return;
    setPendingSay(null);
    setBusy(false);
    setOrb('speaking');
    clearTimeout(speakTimer.current);
    speakTimer.current = setTimeout(() => setOrb('idle'), 1400);
  }, []);

  /** Apply an event immediately (navigation, edits, resets, mode). */
  const dispatch = useCallback(
    (event: SunnyEvent) => {
      const isReset = event.type === 'loadProfile' || event.type === 'confirmRestart' || event.type === 'setMode';
      if (busy.current && !isReset) return;
      if (isReset) {
        epoch.current += 1;
        abortRef.current?.abort();
        setBusy(false);
        setPendingSay(null);
        setOrb('idle');
      }
      commit(reduce(stateRef.current, { event }));
    },
    [commit],
  );

  /** Ask the AI to respond to the conversation as it stands (last message is the customer's). */
  const callAi = useCallback(async () => {
    const started = epoch.current;
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setOrb('thinking');
    try {
      const response = await chat(buildChatRequest(stateRef.current), controller.signal);
      if (epoch.current !== started) return;
      commit(reduce(stateRef.current, { event: { type: 'aiTurn', response } }));
    } catch (err) {
      if (epoch.current !== started) return;
      const e = err instanceof AiRequestError ? err : new AiRequestError('provider_error', 'Something went wrong.');
      commit(reduce(stateRef.current, { event: { type: 'aiError', code: e.code, message: e.message } }));
    } finally {
      finish(started);
    }
  }, [chat, commit, finish]);

  const sendAiText = useCallback(
    async (text: string) => {
      if (busy.current || !text.trim()) return;
      commit(reduce(stateRef.current, { event: { type: 'customerMessage', text } }));
      await callAi();
    },
    [callAi, commit],
  );

  /** A conversational turn (quick reply or input). */
  const send = useCallback(
    async (turn: CustomerTurn) => {
      if (busy.current) return;
      const s = stateRef.current;
      if (s.mode === 'ai') {
        if (turn.event.type === 'customerMessage') return sendAiText(turn.event.text);
        if (turn.event.type === 'snapshotDecision') {
          commit(reduce(s, { event: turn.event }));
          return sendAiText(turn.say ?? (turn.event.allow ? 'Yes, you can use my account snapshot.' : 'Not now.'));
        }
      }
      setBusy(true);
      const started = epoch.current;
      setPendingSay(turn.say ?? null);
      setOrb('thinking');
      try {
        const next = await provider.respond(stateRef.current, turn);
        await wait(prefersReducedMotion() ? 150 : 650);
        if (epoch.current !== started) return;
        commit(next);
      } finally {
        finish(started);
      }
    },
    [provider, commit, finish, sendAiText],
  );

  const sendText = useCallback(
    async (text: string) => {
      if (busy.current || !text.trim()) return;
      if (stateRef.current.mode === 'ai') return sendAiText(text);
      const turn = await provider.interpret(text, stateRef.current);
      await send(turn);
    },
    [provider, send, sendAiText],
  );

  /** Retry the last AI request after an error. */
  const retry = useCallback(async () => {
    if (busy.current) return;
    commit(reduce(stateRef.current, { event: { type: 'clearAiError' } }));
    await callAi();
  }, [callAi, commit]);

  const setMode = useCallback(
    (mode: EngineMode, announce = true) => {
      dispatch({ type: 'clearAiError' });
      dispatch({ type: 'setMode', mode, announce });
    },
    [dispatch],
  );

  /** Explicit customer choice after an AI error: switch to the labelled scripted demo and answer the last message. */
  const fallbackToScripted = useCallback(async () => {
    const lastCustomer = [...stateRef.current.messages].reverse().find((m) => m.role === 'customer');
    setMode('scripted', true);
    if (lastCustomer) {
      const turn = await provider.interpret(lastCustomer.text, stateRef.current);
      await send({ event: turn.event });
    }
  }, [provider, send, setMode]);

  return {
    state,
    send,
    sendText,
    dispatch,
    retry,
    setMode,
    fallbackToScripted,
    pendingSay,
    thinking: busyFlag || orb === 'thinking',
    orb,
  };
}
