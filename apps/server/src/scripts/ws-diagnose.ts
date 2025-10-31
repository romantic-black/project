import { WebSocket } from 'ws';
import config from '../config.js';

const defaultUrl = `ws://localhost:${config.WS_PORT}/`;
const targetUrl = process.argv[2] ?? defaultUrl;
const topics = process.argv.slice(3).filter((arg) => !arg.startsWith('--'));
const subscribeTopics = topics.length > 0 ? topics : ['realtime/*'];
const maxMessages = 5;
const timeoutMs = 10_000;

console.log('[ws-diagnose] Attempting connection:');
console.log(`  URL: ${targetUrl}`);
console.log(`  Topics: ${subscribeTopics.join(', ')}`);
console.log(`  Timeout: ${timeoutMs}ms`);

const ws = new WebSocket(targetUrl, {
  handshakeTimeout: 5_000,
  followRedirects: true,
});

const timeout = setTimeout(() => {
  console.error('[ws-diagnose] No data received within timeout window. Closing connection.');
  ws.close(4000, 'diagnostic-timeout');
}, timeoutMs);

let messageCount = 0;

ws.on('open', () => {
  console.log('[ws-diagnose] Connection established. Sending subscribe message...');
  ws.send(
    JSON.stringify({
      type: 'subscribe',
      topics: subscribeTopics,
    })
  );
});

ws.on('message', (data) => {
  try {
    const parsed = JSON.parse(data.toString());
    if (parsed?.type === 'ping') {
      ws.send(
        JSON.stringify({
          type: 'pong',
          timestamp: parsed.timestamp,
          meta: 'ws-diagnose',
        })
      );
      return;
    }

    messageCount += 1;
    console.log(`[ws-diagnose] Message #${messageCount}:`, JSON.stringify(parsed, null, 2));

    if (messageCount >= maxMessages) {
      console.log('[ws-diagnose] Reached message limit. Closing connection.');
      ws.close(1000, 'diagnostic-complete');
    }
  } catch (error) {
    console.error('[ws-diagnose] Failed to parse message:', error);
  }
});

ws.on('close', (code, reason) => {
  clearTimeout(timeout);
  const reasonText =
    typeof reason === 'string'
      ? reason
      : reason instanceof Buffer
        ? reason.toString('utf8')
        : '';
  console.log('[ws-diagnose] Connection closed.', { code, reason: reasonText });
  process.exit(code === 1000 || code === 4000 ? 0 : 1);
});

ws.on('error', (error) => {
  clearTimeout(timeout);
  console.error('[ws-diagnose] Connection error:', error);
  process.exit(1);
});
