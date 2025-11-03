import { create } from 'zustand';

// Map coordinate point
export interface MapPoint {
  x: number;
  y: number;
  z?: number;
}

// GPS coordinate point (WGS84)
export interface GpsPoint {
  latitude: number;
  longitude: number;
  altitude?: number;
}

// Vehicle position in map frame
export interface VehiclePosition {
  x: number;
  y: number;
  z?: number;
  orientation?: {
    x: number;
    y: number;
    z: number;
    w: number;
  };
  timestamp: number;
}

// Waypoint
export interface Waypoint {
  id: string;
  position: MapPoint;
  timestamp: number;
}

// Path point (from nav_msgs/Path)
export interface PathPoint {
  x: number;
  y: number;
  z?: number;
  timestamp?: number;
}

// Obstacle area (simplified from point cloud)
export interface ObstacleArea {
  id: string;
  position: MapPoint;
  radius?: number; // For circular obstacles
  polygon?: MapPoint[]; // For polygonal obstacles
  timestamp: number;
}

// ROS connection status
export type RosConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

// Topic subscription status
export interface TopicStatus {
  name: string;
  subscribed: boolean;
  hasData: boolean;
  lastUpdate?: number;
  error?: string;
}

interface MapState {
  // Vehicle position
  vehiclePosition: VehiclePosition | null;
  gpsPosition: GpsPoint | null;
  
  // Waypoints
  waypoints: Waypoint[];
  
  // Path/trajectory
  pathPoints: PathPoint[];
  
  // Obstacles
  obstacles: ObstacleArea[];
  
  // ROS connection
  rosConnectionStatus: RosConnectionStatus;
  rosBridgeUrl: string;
  rosError: string | null;
  
  // Topic statuses
  topicStatuses: Map<string, TopicStatus>;
  
  // Map frame configuration
  mapFrame: string;
  mapOrigin: MapPoint | null; // Origin point in display coordinates
  mapScale: number; // Scale factor for coordinate conversion
  
  // Actions
  setVehiclePosition: (position: VehiclePosition | null) => void;
  setGpsPosition: (position: GpsPoint | null) => void;
  addWaypoint: (waypoint: Waypoint) => void;
  clearWaypoints: () => void;
  setPathPoints: (points: PathPoint[]) => void;
  addObstacle: (obstacle: ObstacleArea) => void;
  clearObstacles: () => void;
  updateObstacles: (obstacles: ObstacleArea[]) => void;
  setRosConnectionStatus: (status: RosConnectionStatus) => void;
  setRosBridgeUrl: (url: string) => void;
  setRosError: (error: string | null) => void;
  updateTopicStatus: (topic: string, status: Partial<TopicStatus>) => void;
  setMapFrame: (frame: string) => void;
  setMapOrigin: (origin: MapPoint | null) => void;
  setMapScale: (scale: number) => void;
  clear: () => void;
}

export const useMapStore = create<MapState>((set) => ({
  vehiclePosition: null,
  gpsPosition: null,
  waypoints: [],
  pathPoints: [],
  obstacles: [],
  rosConnectionStatus: 'disconnected',
  rosBridgeUrl: '',
  rosError: null,
  topicStatuses: new Map(),
  mapFrame: 'map',
  mapOrigin: null,
  mapScale: 1.0,
  
  setVehiclePosition: (position) => set({ vehiclePosition: position }),
  
  setGpsPosition: (position) => set({ gpsPosition: position }),
  
  addWaypoint: (waypoint) => set((state) => ({
    waypoints: [...state.waypoints, waypoint],
  })),
  
  clearWaypoints: () => set({ waypoints: [] }),
  
  setPathPoints: (points) => set({ pathPoints: points }),
  
  addObstacle: (obstacle) => set((state) => ({
    obstacles: [...state.obstacles, obstacle],
  })),
  
  clearObstacles: () => set({ obstacles: [] }),
  
  updateObstacles: (obstacles) => set({ obstacles }),
  
  setRosConnectionStatus: (status) => set({ rosConnectionStatus: status }),
  
  setRosBridgeUrl: (url) => set({ rosBridgeUrl: url }),
  
  setRosError: (error) => set({ rosError: error }),
  
  updateTopicStatus: (topic, status) => set((state) => {
    const newStatuses = new Map(state.topicStatuses);
    const existing = newStatuses.get(topic) || { name: topic, subscribed: false, hasData: false };
    newStatuses.set(topic, { ...existing, ...status });
    return { topicStatuses: newStatuses };
  }),
  
  setMapFrame: (frame) => set({ mapFrame: frame }),
  
  setMapOrigin: (origin) => set({ mapOrigin: origin }),
  
  setMapScale: (scale) => set({ mapScale: scale }),
  
  clear: () => set({
    vehiclePosition: null,
    gpsPosition: null,
    waypoints: [],
    pathPoints: [],
    obstacles: [],
    rosError: null,
  }),
}));

