import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io({ path: '/socket.io', transports: ['websocket', 'polling'] });
  }
  return socket;
}

export function useSocketEvent<T>(event: string, handler: (data: T) => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const s = getSocket();
    const fn = (data: T) => handlerRef.current(data);
    s.on(event, fn);
    return () => {
      s.off(event, fn);
    };
  }, [event]);
}

export function joinConsultation(id: string) {
  getSocket().emit('join:consultation', id);
}

export function joinUser(id: string) {
  getSocket().emit('join:user', id);
}
