import ROSLIB from 'roslib';
import { useMapStore } from '../stores/map';
import {
  extractPositionFromOdometry,
  extractPositionFromPoseStamped,
  extractGpsFromNavSatFix,
  extractPathFromNavPath,
} from '../utils/coordinates';

export interface RosServiceConfig {
  url?: string;
  mapFrame?: string;
}

export class RosService {
  private ros: ROSLIB.Ros | null = null;
  private subscribers: Map<string, ROSLIB.Topic> = new Map();
  private publishers: Map<string, ROSLIB.Topic> = new Map();
  private config: RosServiceConfig;
  private get store() {
    return useMapStore.getState();
  }

  constructor(config: RosServiceConfig = {}) {
    const defaultUrl = config.url || import.meta.env.VITE_ROS_BRIDGE_URL || 'ws://localhost:9090';
    const defaultMapFrame = config.mapFrame || 'map';

    this.config = {
      url: defaultUrl,
      mapFrame: defaultMapFrame,
    };

    this.store.setMapFrame(defaultMapFrame);
    this.store.setRosBridgeUrl(defaultUrl);
  }

  updateConfig(config: RosServiceConfig = {}): void {
    const nextUrl = config.url || this.config.url || import.meta.env.VITE_ROS_BRIDGE_URL || 'ws://localhost:9090';
    const nextMapFrame = config.mapFrame || this.config.mapFrame || 'map';

    const urlChanged = nextUrl !== this.config.url;
    const frameChanged = nextMapFrame !== this.config.mapFrame;

    this.config = {
      url: nextUrl,
      mapFrame: nextMapFrame,
    };

    if (urlChanged) {
      this.store.setRosBridgeUrl(nextUrl);
    }

    if (frameChanged) {
      this.store.setMapFrame(nextMapFrame);
    }
  }

  /**
   * Connect to rosbridge WebSocket server
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.store.setRosConnectionStatus('connecting');
        this.store.setRosError(null);

        // Ensure URL is properly formatted
        let url = this.config.url;
        if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
          url = `ws://${url}`;
        }
        // Remove trailing slash if present
        url = url.replace(/\/$/, '');

        console.log('Connecting to ROS bridge at:', url);
        this.store.setRosBridgeUrl(url);

        this.ros = new ROSLIB.Ros({
          url: url,
        });

        // Timeout after 5 seconds
        const timeoutId = setTimeout(() => {
          if (this.store.rosConnectionStatus === 'connecting') {
            this.ros?.close();
            const errorMsg = `连接超时。请确保rosbridge_server正在运行: roslaunch rosbridge_server rosbridge_websocket.launch port:=9090`;
            console.error(errorMsg);
            this.store.setRosConnectionStatus('error');
            this.store.setRosError(errorMsg);
            reject(new Error(errorMsg));
          }
        }, 5000);

        this.ros.on('connection', () => {
          clearTimeout(timeoutId);
          console.log('ROS connected successfully to:', url);
          this.store.setRosConnectionStatus('connected');
          this.store.setRosError(null);
          resolve();
        });

        this.ros.on('error', (error: any) => {
          clearTimeout(timeoutId);
          const errorMsg = error?.message || error?.toString() || 'Connection failed';
          console.error('ROS connection error:', errorMsg, 'URL:', url, { raw: error });
          this.store.setRosConnectionStatus('error');
          this.store.setRosError(`连接失败: ${errorMsg}。请确保rosbridge_server正在运行: roslaunch rosbridge_server rosbridge_websocket.launch port:=9090`);
          reject(new Error(errorMsg));
        });

        this.ros.on('close', (event?: CloseEvent) => {
          clearTimeout(timeoutId);
          console.warn('ROS connection closed', {
            code: event?.code,
            reason: event?.reason || 'No reason provided',
            wasClean: event?.wasClean,
            url,
          });
          this.store.setRosConnectionStatus('disconnected');
          // Clear all subscribers
          this.subscribers.forEach((sub) => sub.unsubscribe());
          this.subscribers.clear();
        });
      } catch (error) {
        const err = error instanceof Error ? error : new Error('Unknown error');
        console.error('Failed to create ROS connection:', err);
        this.store.setRosConnectionStatus('error');
        this.store.setRosError(`创建连接失败: ${err.message}`);
        reject(err);
      }
    });
  }

  /**
   * Disconnect from rosbridge
   */
  disconnect(): void {
    console.warn('RosService disconnect invoked');
    this.subscribers.forEach((sub) => sub.unsubscribe());
    this.subscribers.clear();
    this.publishers.clear();
    
    if (this.ros) {
      this.ros.close();
      this.ros = null;
    }
    
    this.store.setRosConnectionStatus('disconnected');
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ros?.isConnected ?? false;
  }

  /**
   * Subscribe to /state_estimation topic (nav_msgs/Odometry or geometry_msgs/PoseStamped)
   */
  subscribeStateEstimation(): void {
    if (!this.ros || !this.ros.isConnected) {
      console.warn('ROS not connected, cannot subscribe to /state_estimation');
      return;
    }

    const topic = new ROSLIB.Topic({
      ros: this.ros,
      name: '/state_estimation',
      messageType: 'nav_msgs/Odometry', // Try Odometry first
    });

    topic.subscribe((message: any) => {
      this.store.updateTopicStatus('/state_estimation', {
        hasData: true,
        lastUpdate: Date.now(),
      });

      // Try to extract position from Odometry first
      let position = extractPositionFromOdometry(message);
      
      // If that fails, try PoseStamped
      if (!position) {
        position = extractPositionFromPoseStamped(message);
      }

      if (position) {
        this.store.setVehiclePosition(position);
        
        // Set map origin to vehicle position if not set
        if (!this.store.mapOrigin) {
          this.store.setMapOrigin({ x: position.x, y: position.y, z: position.z });
        }
      }
    });

    this.subscribers.set('/state_estimation', topic);
    this.store.updateTopicStatus('/state_estimation', {
      subscribed: true,
      hasData: false,
    });
  }

  /**
   * Subscribe to /chcnav_fix_demo/fix topic (sensor_msgs/NavSatFix) - GPS/RTK
   */
  subscribeGpsFix(): void {
    if (!this.ros || !this.ros.isConnected) {
      console.warn('ROS not connected, cannot subscribe to GPS fix');
      return;
    }

    const topic = new ROSLIB.Topic({
      ros: this.ros,
      name: '/chcnav_fix_demo/fix',
      messageType: 'sensor_msgs/NavSatFix',
    });

    topic.subscribe((message: any) => {
      this.store.updateTopicStatus('/chcnav_fix_demo/fix', {
        hasData: true,
        lastUpdate: Date.now(),
      });

      const gps = extractGpsFromNavSatFix(message);
      if (gps) {
        this.store.setGpsPosition(gps);

        const currentState = this.store;
        if (currentState.vehiclePosition && (!currentState.mapOriginGps || !currentState.mapOrigin)) {
          currentState.alignMapWithGps(
            {
              x: currentState.vehiclePosition.x,
              y: currentState.vehiclePosition.y,
              z: currentState.vehiclePosition.z,
            },
            gps
          );
        }
      }
    });

    this.subscribers.set('/chcnav_fix_demo/fix', topic);
    this.store.updateTopicStatus('/chcnav_fix_demo/fix', {
      subscribed: true,
      hasData: false,
    });
  }

  /**
   * Subscribe to /path topic (nav_msgs/Path) - trajectory
   */
  subscribePath(): void {
    if (!this.ros || !this.ros.isConnected) {
      console.warn('ROS not connected, cannot subscribe to /path');
      return;
    }

    const topic = new ROSLIB.Topic({
      ros: this.ros,
      name: '/path',
      messageType: 'nav_msgs/Path',
    });

    topic.subscribe((message: any) => {
      this.store.updateTopicStatus('/path', {
        hasData: true,
        lastUpdate: Date.now(),
      });

      const pathPoints = extractPathFromNavPath(message);
      this.store.setPathPoints(pathPoints);
    });

    this.subscribers.set('/path', topic);
    this.store.updateTopicStatus('/path', {
      subscribed: true,
      hasData: false,
    });
  }

  /**
   * Subscribe to /terrain_map topic (sensor_msgs/PointCloud2) - obstacles
   */
  subscribeTerrainMap(): void {
    if (!this.ros || !this.ros.isConnected) {
      console.warn('ROS not connected, cannot subscribe to /terrain_map');
      return;
    }

    const topic = new ROSLIB.Topic({
      ros: this.ros,
      name: '/terrain_map',
      messageType: 'sensor_msgs/PointCloud2',
    });

    topic.subscribe((message: any) => {
      this.store.updateTopicStatus('/terrain_map', {
        hasData: true,
        lastUpdate: Date.now(),
      });

      // Process point cloud data (simplified)
      // For now, we'll just mark that we received data
      // Actual point cloud processing would require decoding the binary data
      // This is a placeholder - you may need to implement proper PointCloud2 decoding
      try {
        // TODO: Implement PointCloud2 decoding based on message format
        // For now, we'll create placeholder obstacles if needed
        console.log('Received terrain map point cloud (size:', message.width, 'x', message.height, ')');
      } catch (error) {
        console.error('Error processing terrain map:', error);
      }
    });

    this.subscribers.set('/terrain_map', topic);
    this.store.updateTopicStatus('/terrain_map', {
      subscribed: true,
      hasData: false,
    });
  }

  /**
   * Subscribe to all required topics
   */
  subscribeAll(): void {
    this.subscribeStateEstimation();
    this.subscribeGpsFix();
    this.subscribePath();
    this.subscribeTerrainMap();
  }

  /**
   * Unsubscribe from a topic
   */
  unsubscribe(topicName: string): void {
    const subscriber = this.subscribers.get(topicName);
    if (subscriber) {
      subscriber.unsubscribe();
      this.subscribers.delete(topicName);
      this.store.updateTopicStatus(topicName, {
        subscribed: false,
        hasData: false,
      });
    }
  }

  /**
   * Publish waypoint to /way_point topic (geometry_msgs/PointStamped)
   */
  publishWaypoint(x: number, y: number, z: number = 0): void {
    if (!this.ros || !this.ros.isConnected) {
      console.warn('ROS not connected, cannot publish waypoint');
      return;
    }

    if (!this.publishers.has('/way_point')) {
      const publisher = new ROSLIB.Topic({
        ros: this.ros,
        name: '/way_point',
        messageType: 'geometry_msgs/PointStamped',
      });
      this.publishers.set('/way_point', publisher);
    }

    const publisher = this.publishers.get('/way_point')!;
    const message = new ROSLIB.Message({
      header: {
        frame_id: this.config.mapFrame || 'map',
        stamp: {
          secs: Math.floor(Date.now() / 1000),
          nsecs: (Date.now() % 1000) * 1000000,
        },
      },
      point: {
        x,
        y,
        z,
      },
    });

    publisher.publish(message);
    console.log('Published waypoint:', { x, y, z });
  }

  /**
   * Get ROS connection status
   */
  getConnectionStatus(): 'disconnected' | 'connecting' | 'connected' | 'error' {
    return this.store.rosConnectionStatus;
  }

  /**
   * Get ROS bridge URL
   */
  getBridgeUrl(): string {
    return this.config.url || '';
  }
}

// Singleton instance
let rosServiceInstance: RosService | null = null;

export function getRosService(config?: RosServiceConfig): RosService {
  if (!rosServiceInstance) {
    rosServiceInstance = new RosService(config);
  } else if (config) {
    rosServiceInstance.updateConfig(config);
  }
  return rosServiceInstance;
}

export function resetRosService(): void {
  if (rosServiceInstance) {
    rosServiceInstance.disconnect();
    rosServiceInstance = null;
  }
}
