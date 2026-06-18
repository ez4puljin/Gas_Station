'use client';

import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { tokenStore } from './api';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:4000';

type Handler = (payload: unknown) => void;

/**
 * Realtime эвент сонсох hook — §4. JWT-аар холбогдож, салбарын эвентүүдийг авна.
 * handlers: { 'sale.created': (p) => ..., 'inventory.changed': (p) => ... }
 */
export function useRealtime(handlers: Record<string, Handler>): { connected: boolean } {
  const [connected, setConnected] = useState(false);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const token = tokenStore.access;
    if (!token) return;

    const socket: Socket = io(`${WS_URL}/realtime`, {
      auth: { token },
      transports: ['websocket'],
    });

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    for (const event of Object.keys(handlersRef.current)) {
      socket.on(event, (payload: unknown) => handlersRef.current[event]?.(payload));
    }

    return () => {
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { connected };
}
