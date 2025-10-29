import { WebSocketServer, WebSocket } from 'ws';
import type { MessageData } from '@can-telemetry/common';
import config from '../config.js';
import { createLogger } from '../utils/logger.js';
import { transportMonitor } from '../db/transport-monitor.js';
import { performanceManager } from '../performance/manager.js';

const logger = createLogger('ws-server');

interface WsClient extends WebSocket {
  subscribedTopics?: Set<string>;
  lastPing?: number;
}

export class WSServer {
  private wss: WebSocketServer;
  private messageBuffer: Map<string, MessageData> = new Map();
  private bufferMaxSize = 1000;
  private heartbeatInterval?: NodeJS.Timeout;
  private messageSequence = 0;

  constructor(port: number) {
    this.wss = new WebSocketServer({ port });
    this.updatePerformanceSettings();
    this.setupHandlers();
    this.startHeartbeat();

    this.wss.on('error', (error: Error) => {
      if ((error as any).code === 'EADDRINUSE') {
        logger.error(`Port ${port} is already in use. Please close the process using this port or change the WS_PORT environment variable.`);
        logger.error('To find the process using the port, run: lsof -i :' + port + ' or ss -tlnp | grep :' + port);
      } else {
        logger.error({ error }, 'WebSocket server error');
      }
    });
  }

  private updatePerformanceSettings(): void {
    const perfConfig = performanceManager.getConfig();
    this.bufferMaxSize = perfConfig.wsBufferMaxSize;
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
        const clientId = `client-${Date.now()}`;
        logger.logWsClientDisconnect(clientId, 'normal_close');
        transportMonitor.recordWsClientDisconnect(clientId, 'normal_close');
      });

      ws.on('error', (error) => {
        logger.logWsError('connection_error', error);
      });

      const clientId = `client-${Date.now()}`;
      const ip = (ws as any)._socket?.remoteAddress || 'unknown';
      logger.logWsClientConnect(clientId, ip);
      transportMonitor.recordWsClientConnect(clientId, ip);
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
    this.updatePerformanceSettings();
    
    const topic = `realtime/${msg.name}`;
    const sendStartTime = Date.now();
    
    if (this.messageBuffer.size >= this.bufferMaxSize) {
      const firstKey = this.messageBuffer.keys().next().value;
      if (firstKey) {
        this.messageBuffer.delete(firstKey);
      }
    }
    this.messageBuffer.set(topic, msg);

    this.messageSequence++;
    const payload = JSON.stringify({ 
      topic, 
      data: msg,
      sequence: this.messageSequence,
    });

    let clientCount = 0;
    let successCount = 0;
    let errorCount = 0;

    this.wss.clients.forEach((ws: WebSocket) => {
      const client = ws as WsClient;
      if (ws.readyState === WebSocket.OPEN && client.subscribedTopics) {
        const shouldSend = 
          client.subscribedTopics.has(topic) || 
          client.subscribedTopics.has('realtime/*') ||
          client.subscribedTopics.has('realtime/overview');
        
        if (shouldSend) {
          clientCount++;
          try {
            ws.send(payload);
            successCount++;
          } catch (error) {
            errorCount++;
            logger.logWsError('send', error as Error, {
              errorCode: 'WS_SEND_FAILED',
              topic,
            });
          }
        }
      }
    });

    const duration = Date.now() - sendStartTime;
    logger.logWsSend(topic, payload.length, clientCount, duration);
    transportMonitor.recordWsSend(topic, payload.length, clientCount, duration, errorCount === 0);
  }

  getConnectedClientsCount(): number {
    return this.wss.clients.size;
  }

  close(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
    this.wss.close();
  }
}

