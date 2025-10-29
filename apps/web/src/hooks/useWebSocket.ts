import { useEffect, useRef } from 'react';
import { useTelemetryStore } from '../stores/telemetry';
import type { MessageData } from '@can-telemetry/common';

// Use direct WebSocket connection to avoid proxy issues
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080';
const MAX_QUEUE_SIZE = 1000;
const INITIAL_RECONNECT_DELAY = 3000;
const MAX_RECONNECT_DELAY = 30000;

export function useWebSocket(topics: string[] = ['realtime/*']) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const isConnectingRef = useRef(false);
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY);
  const errorShownRef = useRef(false);
  const { setMessage, setConnected } = useTelemetryStore();

  useEffect(() => {
    let mounted = true;

    const connect = () => {
      if (!mounted || isConnectingRef.current) return;
      
      // Close existing connection if any
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch (e) {
          // Ignore errors when closing
        }
        wsRef.current = null;
      }

      isConnectingRef.current = true;

      try {
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!mounted) {
            ws.close();
            return;
          }
          console.log('WebSocket connected');
          errorShownRef.current = false;
          reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;
          isConnectingRef.current = false;
          setConnected(true);
          ws.send(JSON.stringify({
            type: 'subscribe',
            topics,
          }));
        };

        ws.onmessage = (event) => {
          if (!mounted) return;
          try {
            const parsed = JSON.parse(event.data);
            
            // Handle ping messages
            if (parsed.type === 'ping') {
              ws.send(JSON.stringify({ type: 'pong', timestamp: parsed.timestamp }));
              return;
            }
            
            // Handle data messages
            const { topic, data } = parsed;
            if (data && typeof data === 'object') {
              const msg = data as MessageData;
              setMessage(msg);
            }
          } catch (error) {
            console.warn('Failed to parse WebSocket message', error);
          }
        };

        ws.onclose = (event) => {
          isConnectingRef.current = false;
          if (!mounted) return;
          
          setConnected(false);
          
          // Only reconnect if it wasn't a manual close
          if (event.code !== 1000) {
            reconnectTimeoutRef.current = setTimeout(() => {
              if (mounted) {
                reconnectDelayRef.current = Math.min(
                  reconnectDelayRef.current * 1.5,
                  MAX_RECONNECT_DELAY
                );
                connect();
              }
            }, reconnectDelayRef.current);
          }
        };

        ws.onerror = (error) => {
          isConnectingRef.current = false;
          if (!mounted) return;
          
          // Only log error once to avoid spam
          if (!errorShownRef.current) {
            console.debug('WebSocket connection error (will retry silently)');
            errorShownRef.current = true;
          }
          setConnected(false);
        };
      } catch (error) {
        isConnectingRef.current = false;
        if (!mounted) return;
        
        // Only log error once to avoid spam
        if (!errorShownRef.current) {
          console.debug('Failed to create WebSocket (will retry silently)', error);
          errorShownRef.current = true;
        }
        setConnected(false);
        
        reconnectTimeoutRef.current = setTimeout(() => {
          if (mounted) {
            reconnectDelayRef.current = Math.min(
              reconnectDelayRef.current * 1.5,
              MAX_RECONNECT_DELAY
            );
            connect();
          }
        }, reconnectDelayRef.current);
      }
    };

    connect();

    return () => {
      mounted = false;
      isConnectingRef.current = false;
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = undefined;
      }
      
      if (wsRef.current) {
        try {
          wsRef.current.close(1000); // Normal closure
        } catch (e) {
          // Ignore errors when closing
        }
        wsRef.current = null;
      }
    };
  }, [topics.join(','), setMessage, setConnected]);

  return {
    send: (data: any) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(data));
      }
    },
  };
}

