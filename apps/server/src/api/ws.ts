import { WebSocketServer, WebSocket } from 'ws';
import type { MessageData } from '@can-telemetry/common';
import pino from 'pino';
import config from '../config.js';

const logger = pino({ level: config.LOG_LEVEL });

interface WsClient extends WebSocket {
  subscribedTopics?: Set<string>;
  lastPing?: number;
}

export class WSServer {
  private wss: WebSocketServer;
  private messageBuffer: Map<string, MessageData> = new Map();
  private bufferMaxSize = 1000;
  private heartbeatInterval: NodeJS.Timeout;

  constructor(port: number) {
    this.wss = new WebSocketServer({ port });
    this.setupHandlers();
    this.startHeartbeat();
  }

  private setupHandlers(): void {
    this.wss.on('connection', (ws: WsClient) => {
      ws.subscribedTopics = new Set();
      ws.lastPing = Date.now();

      ws.on('message', (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'subscribe') {
            if (Array.isArray(msg.topics)) {
              msg.topics.forEach((topic: string) => {
                ws.subscribedTopics!.add(topic);
              });
              // Send buffered messages for subscribed topics
              this.sendBufferedMessages(ws);
            }
          } else if (msg.type === 'unsubscribe') {
            if (Array.isArray(msg.topics)) {
              msg.topics.forEach((topic: string) => {
                ws.subscribedTopics!.delete(topic);
              });
            }
          } else if (msg.type === 'pong') {
            ws.lastPing = Date.now();
          }
        } catch (error) {
          logger.warn({ error }, 'Invalid WebSocket message');
        }
      });

      ws.on('close', () => {
        logger.info('WebSocket client disconnected');
      });

      ws.on('error', (error) => {
        logger.error({ error }, 'WebSocket error');
      });

      logger.info('WebSocket client connected');
    });
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.wss.clients.forEach((ws: WebSocket) => {
        const client = ws as WsClient;
        const now = Date.now();
        
        if (client.lastPing && now - client.lastPing > 30000) {
          logger.warn('Client heartbeat timeout, closing connection');
          client.terminate();
          return;
        }

        if (ws.readyState === WebSocket.OPEN) {
          client.lastPing = now;
          ws.send(JSON.stringify({ type: 'ping', timestamp: now }));
        }
      });
    }, 10000);
  }

  private sendBufferedMessages(ws: WebSocket): void {
    const client = ws as WsClient;
    if (!client.subscribedTopics || ws.readyState !== WebSocket.OPEN) {
      return;
    }

    for (const [topic, msg] of this.messageBuffer.entries()) {
      const shouldSend = 
        client.subscribedTopics.has(topic) || 
        client.subscribedTopics.has('realtime/*') ||
        client.subscribedTopics.has('realtime/overview');
      
      if (shouldSend) {
        const payload = JSON.stringify({ topic, data: msg });
        ws.send(payload);
      }
    }
  }

  broadcastMessage(msg: MessageData): void {
    const topic = `realtime/${msg.name}`;
    
    if (this.messageBuffer.size >= this.bufferMaxSize) {
      const firstKey = this.messageBuffer.keys().next().value;
      this.messageBuffer.delete(firstKey);
    }
    this.messageBuffer.set(topic, msg);

    const payload = JSON.stringify({ topic, data: msg });

    this.wss.clients.forEach((ws: WebSocket) => {
      const client = ws as WsClient;
      if (ws.readyState === WebSocket.OPEN && client.subscribedTopics) {
        const shouldSend = 
          client.subscribedTopics.has(topic) || 
          client.subscribedTopics.has('realtime/*') ||
          client.subscribedTopics.has('realtime/overview');
        
        if (shouldSend) {
          ws.send(payload);
        }
      }
    });
  }

  close(): void {
    clearInterval(this.heartbeatInterval);
    this.wss.close();
  }
}

