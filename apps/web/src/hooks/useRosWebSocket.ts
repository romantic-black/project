import { useEffect, useRef } from 'react';
import { getRosService } from '../services/ros';
import { useMapStore } from '../stores/map';

export interface UseRosWebSocketOptions {
  autoConnect?: boolean;
  rosBridgeUrl?: string;
  mapFrame?: string;
}

export function useRosWebSocket(options: UseRosWebSocketOptions = {}) {
  const {
    autoConnect = true,
    rosBridgeUrl,
    mapFrame,
  } = options;

  const rosServiceRef = useRef<ReturnType<typeof getRosService> | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const isConnectingRef = useRef(false);
  const rosConnectionStatus = useMapStore((state) => state.rosConnectionStatus);
  const setRosConnectionStatus = useMapStore((state) => state.setRosConnectionStatus);
  const setRosError = useMapStore((state) => state.setRosError);

  useEffect(() => {
    let mounted = true;

    const connect = async () => {
      if (!mounted || isConnectingRef.current) return;

      try {
        isConnectingRef.current = true;

        // Get or create ROS service
        const config: any = {};
        if (rosBridgeUrl) config.url = rosBridgeUrl;
        if (mapFrame) config.mapFrame = mapFrame;

        const rosService = getRosService(config);
        rosServiceRef.current = rosService;

        // Connect
        await rosService.connect();

        if (!mounted) {
          rosService.disconnect();
          return;
        }

        // Subscribe to all topics
        rosService.subscribeAll();

        isConnectingRef.current = false;
      } catch (error) {
        isConnectingRef.current = false;
        
        if (!mounted) return;

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Failed to connect to ROS:', errorMessage);
        setRosError(errorMessage);
        setRosConnectionStatus('error');

        // Retry connection after delay
        reconnectTimeoutRef.current = setTimeout(() => {
          if (mounted && autoConnect) {
            connect();
          }
        }, 5000);
      }
    };

    if (autoConnect) {
      connect();
    }

    return () => {
      mounted = false;
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      if (rosServiceRef.current) {
        rosServiceRef.current.disconnect();
        rosServiceRef.current = null;
      }
    };
  }, [autoConnect, rosBridgeUrl, mapFrame, setRosConnectionStatus, setRosError]);

  const connect = async () => {
    if (isConnectingRef.current) return;
    
    try {
      isConnectingRef.current = true;
      const config: any = {};
      if (rosBridgeUrl) config.url = rosBridgeUrl;
      if (mapFrame) config.mapFrame = mapFrame;

      const rosService = getRosService(config);
      rosServiceRef.current = rosService;
      await rosService.connect();
      rosService.subscribeAll();
      isConnectingRef.current = false;
    } catch (error) {
      isConnectingRef.current = false;
      throw error;
    }
  };

  const disconnect = () => {
    if (rosServiceRef.current) {
      rosServiceRef.current.disconnect();
      rosServiceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
  };

  const publishWaypoint = (x: number, y: number, z: number = 0) => {
    if (rosServiceRef.current && rosServiceRef.current.isConnected()) {
      rosServiceRef.current.publishWaypoint(x, y, z);
    } else {
      console.warn('ROS not connected, cannot publish waypoint');
    }
  };

  return {
    connect,
    disconnect,
    publishWaypoint,
    isConnected: rosConnectionStatus === 'connected',
    connectionStatus: rosConnectionStatus,
  };
}
