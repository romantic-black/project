import { useEffect, useRef } from 'react';
import { useTelemetryStore } from '../stores/telemetry';
import type { MessageData } from '@can-telemetry/common';

declare global {
  interface Window {
    desktop?: {
      platform?: string;
      versions?: Record<string, string>;
      config?: {
        wsUrl?: string;
      };
    };
  }
}

function resolveWsUrl(): string {
  const runtimeDesktopUrl = typeof window !== 'undefined'
    ? window.desktop?.config?.wsUrl?.trim()
    : undefined;

  if (runtimeDesktopUrl) {
    console.log('Using runtime desktop config WS URL:', runtimeDesktopUrl);
    console.log('Current location:', typeof window !== 'undefined' ? window.location.href : 'unknown (no window)');
    return runtimeDesktopUrl;
  }

  const explicitUrl = import.meta.env.VITE_WS_URL;
  if (explicitUrl && explicitUrl.length > 0) {
    console.log('Using VITE_WS_URL:', explicitUrl);
    console.log('Current location:', window.location.href);
    return explicitUrl;
  }

  // Default to same-origin relative path; Vite dev server proxies '/ws' → ws backend
  const url = '/ws';
  console.log('Using default WebSocket URL (via proxy):', url);
  console.log('Current location:', window.location.href);
  return url;
}

const WS_URL = resolveWsUrl();
const INITIAL_RECONNECT_DELAY = 500; // Reduced from 3000ms for faster initial connection
const MAX_RECONNECT_DELAY = 30000;
const CONNECTION_TIMEOUT = 5000; // 5 seconds timeout for connection attempt

export function useWebSocket(topics: string[] = ['realtime/*']) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const connectionTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
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
        console.log('Attempting to connect WebSocket:', WS_URL);
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        // Set connection timeout
        connectionTimeoutRef.current = setTimeout(() => {
          if (ws.readyState === WebSocket.CONNECTING) {
            console.warn('WebSocket connection timeout, closing and retrying...');
            ws.close();
          }
        }, CONNECTION_TIMEOUT);

        ws.onopen = () => {
          if (!mounted) {
            ws.close();
            return;
          }
          
          // Clear connection timeout on successful connection
          if (connectionTimeoutRef.current) {
            clearTimeout(connectionTimeoutRef.current);
            connectionTimeoutRef.current = undefined;
          }
          
          console.log('WebSocket connected to:', WS_URL);
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
            const data = parsed.data;
            if (data && typeof data === 'object') {
              setMessage(data as MessageData);
            }
          } catch (error) {
            console.warn('Failed to parse WebSocket message', error);
          }
        };

        ws.onclose = (event) => {
          isConnectingRef.current = false;
          
          // Clear connection timeout if still active
          if (connectionTimeoutRef.current) {
            clearTimeout(connectionTimeoutRef.current);
            connectionTimeoutRef.current = undefined;
          }
          
          if (!mounted) return;
          
          setConnected(false);
          
          // Log close details for debugging
          if (!errorShownRef.current) {
            console.error('WebSocket closed:', {
              code: event.code,
              reason: event.reason || 'No reason provided',
              wasClean: event.wasClean,
              url: WS_URL,
            });
          }
          
          // Only reconnect if it wasn't a manual close
          if (event.code !== 1000) {
            // Use shorter delay for first retry, then exponential backoff
            const delay = reconnectDelayRef.current;
            reconnectTimeoutRef.current = setTimeout(() => {
              if (mounted) {
                reconnectDelayRef.current = Math.min(
                  reconnectDelayRef.current * 1.5,
                  MAX_RECONNECT_DELAY
                );
                connect();
              }
            }, delay);
          }
        };

        ws.onerror = (error) => {
          isConnectingRef.current = false;
          
          // Clear connection timeout if still active
          if (connectionTimeoutRef.current) {
            clearTimeout(connectionTimeoutRef.current);
            connectionTimeoutRef.current = undefined;
          }
          
          if (!mounted) return;
          
          // Only log error once to avoid spam
          if (!errorShownRef.current) {
            console.error('WebSocket connection error:', {
              error,
              url: WS_URL,
              currentOrigin: window.location.origin,
              willRetry: true,
            });
            errorShownRef.current = true;
          }
          setConnected(false);
        };
      } catch (error) {
        isConnectingRef.current = false;
        if (!mounted) return;
        
        // Only log error once to avoid spam
        if (!errorShownRef.current) {
          console.error('Failed to create WebSocket:', {
            error,
            url: WS_URL,
            currentOrigin: window.location.origin,
            willRetry: true,
          });
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
      
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = undefined;
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

