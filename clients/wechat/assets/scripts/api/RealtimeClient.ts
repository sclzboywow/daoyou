import { getRealtimeUrl } from '../config/RuntimeConfig';
import { getWx, type WxSocketTask } from '../platform/WechatRuntime';
import { sessionStore } from './SessionStore';

export type RealtimeEvent = {
  type: string;
  payload?: unknown;
};

export class RealtimeClient {
  private socket: WxSocketTask | null = null;
  private listeners = new Set<(event: RealtimeEvent) => void>();

  connect(channels = ['player-state', 'world-chat']): void {
    this.close();
    const token = sessionStore.get();
    if (!token) throw new Error('未登录，无法建立实时连接');

    const url = `${getRealtimeUrl()}?channels=${encodeURIComponent(channels.join(','))}`;

    const socket = getWx().connectSocket({
      url,
      header: { Authorization: `Bearer ${token}` },
    });
    this.socket = socket;

    socket.onMessage((message) => {
      if (typeof message.data !== 'string') return;
      try {
        const event = JSON.parse(message.data) as RealtimeEvent;
        if (event.type === 'ping') {
          socket.send({ data: JSON.stringify({ type: 'pong' }) });
        }
        for (const listener of this.listeners) listener(event);
      } catch {
        // Ignore malformed frames. The server also bounds/validates client frames.
      }
    });

    socket.onClose(() => {
      if (this.socket === socket) this.socket = null;
    });
    socket.onError(() => {
      if (this.socket === socket) this.socket = null;
    });
  }

  subscribe(listener: (event: RealtimeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    this.socket?.close({ code: 1000, reason: 'client closing' });
    this.socket = null;
  }
}

export const realtimeClient = new RealtimeClient();
