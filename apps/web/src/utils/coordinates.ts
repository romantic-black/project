import type { MapPoint, GpsPoint, VehiclePosition, PathPoint } from '../stores/map';

/**
 * Extract position from nav_msgs/Odometry message
 */
export function extractPositionFromOdometry(msg: any): VehiclePosition | null {
  try {
    if (!msg.pose || !msg.pose.pose) {
      return null;
    }
    
    const pose = msg.pose.pose;
    return {
      x: pose.position?.x ?? 0,
      y: pose.position?.y ?? 0,
      z: pose.position?.z ?? 0,
      orientation: pose.orientation ? {
        x: pose.orientation.x ?? 0,
        y: pose.orientation.y ?? 0,
        z: pose.orientation.z ?? 0,
        w: pose.orientation.w ?? 1,
      } : undefined,
      timestamp: msg.header?.stamp ? parseRosTime(msg.header.stamp) : Date.now(),
    };
  } catch (error) {
    console.error('Failed to extract position from Odometry:', error);
    return null;
  }
}

/**
 * Extract position from geometry_msgs/PoseStamped message
 */
export function extractPositionFromPoseStamped(msg: any): VehiclePosition | null {
  try {
    if (!msg.pose) {
      return null;
    }
    
    const pose = msg.pose;
    return {
      x: pose.position?.x ?? 0,
      y: pose.position?.y ?? 0,
      z: pose.position?.z ?? 0,
      orientation: pose.orientation ? {
        x: pose.orientation.x ?? 0,
        y: pose.orientation.y ?? 0,
        z: pose.orientation.z ?? 0,
        w: pose.orientation.w ?? 1,
      } : undefined,
      timestamp: msg.header?.stamp ? parseRosTime(msg.header.stamp) : Date.now(),
    };
  } catch (error) {
    console.error('Failed to extract position from PoseStamped:', error);
    return null;
  }
}

/**
 * Extract GPS position from sensor_msgs/NavSatFix message
 */
export function extractGpsFromNavSatFix(msg: any): GpsPoint | null {
  try {
    if (msg.latitude === undefined || msg.longitude === undefined) {
      return null;
    }
    
    return {
      latitude: msg.latitude,
      longitude: msg.longitude,
      altitude: msg.altitude,
    };
  } catch (error) {
    console.error('Failed to extract GPS from NavSatFix:', error);
    return null;
  }
}

/**
 * Extract path points from nav_msgs/Path message
 */
export function extractPathFromNavPath(msg: any): PathPoint[] {
  try {
    if (!msg.poses || !Array.isArray(msg.poses)) {
      return [];
    }
    
    return msg.poses.map((poseMsg: any) => {
      const pose = poseMsg.pose || poseMsg;
      const position = pose.position || {};
      const timestamp = poseMsg.header?.stamp 
        ? parseRosTime(poseMsg.header.stamp)
        : (msg.header?.stamp ? parseRosTime(msg.header.stamp) : Date.now());
      
      return {
        x: position.x ?? 0,
        y: position.y ?? 0,
        z: position.z ?? 0,
        timestamp,
      };
    });
  } catch (error) {
    console.error('Failed to extract path from Path:', error);
    return [];
  }
}

/**
 * Parse ROS time (seconds.nanoseconds or {secs, nsecs}) to milliseconds
 */
export function parseRosTime(time: any): number {
  if (typeof time === 'number') {
    return Math.floor(time * 1000);
  }
  if (time && typeof time === 'object') {
    const secs = time.secs ?? time.sec ?? 0;
    const nsecs = time.nsecs ?? time.nsec ?? 0;
    return secs * 1000 + Math.floor(nsecs / 1000000);
  }
  return Date.now();
}

/**
 * Convert map coordinates to display coordinates (for Leaflet)
 * If mapOrigin is set, offset by origin; otherwise use direct conversion
 */
export function mapToDisplay(
  mapPoint: MapPoint,
  mapOrigin: MapPoint | null,
  scale: number = 1.0,
  mapOriginGps?: GpsPoint | null
): { lat: number; lng: number } {
  if (mapOrigin && mapOriginGps) {
    const metersPerUnit = scale || 1.0;
    const eastMeters = (mapPoint.x - mapOrigin.x) * metersPerUnit;
    const northMeters = (mapPoint.y - mapOrigin.y) * metersPerUnit;

    const metersPerDegLat = getMetersPerDegreeLatitude(mapOriginGps.latitude);
    const metersPerDegLng = getMetersPerDegreeLongitude(mapOriginGps.latitude);

    const latOffset = northMeters / metersPerDegLat;
    const lngOffset = eastMeters / metersPerDegLng;

    return {
      lat: mapOriginGps.latitude + latOffset,
      lng: mapOriginGps.longitude + lngOffset,
    };
  }

  return {
    lat: mapPoint.y,
    lng: mapPoint.x,
  };
}

/**
 * Convert display coordinates (from Leaflet) to map coordinates
 */
export function displayToMap(
  lat: number,
  lng: number,
  mapOrigin: MapPoint | null,
  scale: number = 1.0,
  mapOriginGps?: GpsPoint | null
): MapPoint {
  if (mapOrigin && mapOriginGps) {
    const metersPerUnit = scale || 1.0;
    const metersPerDegLat = getMetersPerDegreeLatitude(mapOriginGps.latitude);
    const metersPerDegLng = getMetersPerDegreeLongitude(mapOriginGps.latitude);

    const latDiff = lat - mapOriginGps.latitude;
    const lngDiff = lng - mapOriginGps.longitude;

    const northMeters = latDiff * metersPerDegLat;
    const eastMeters = lngDiff * metersPerDegLng;

    return {
      x: mapOrigin.x + eastMeters / metersPerUnit,
      y: mapOrigin.y + northMeters / metersPerUnit,
      z: 0,
    };
  }

  return {
    x: lng,
    y: lat,
    z: 0,
  };
}

function getMetersPerDegreeLatitude(latitude: number): number {
  const latRad = (latitude * Math.PI) / 180;
  // Using WGS84 ellipsoid approximations
  return 111132.92 - 559.82 * Math.cos(2 * latRad) + 1.175 * Math.cos(4 * latRad);
}

function getMetersPerDegreeLongitude(latitude: number): number {
  const latRad = (latitude * Math.PI) / 180;
  return 111412.84 * Math.cos(latRad) - 93.5 * Math.cos(3 * latRad) + 0.118 * Math.cos(5 * latRad);
}

/**
 * Calculate distance between two map points (in map units)
 */
export function distanceBetweenPoints(p1: MapPoint, p2: MapPoint): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dz = (p2.z ?? 0) - (p1.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Calculate angle (in radians) from point1 to point2
 */
export function angleBetweenPoints(p1: MapPoint, p2: MapPoint): number {
  return Math.atan2(p2.y - p1.y, p2.x - p1.x);
}

/**
 * Convert quaternion to Euler angles (yaw in radians)
 */
export function quaternionToYaw(orientation: { x: number; y: number; z: number; w: number }): number {
  const { x, y, z, w } = orientation;
  // Yaw (rotation around z-axis)
  const siny_cosp = 2 * (w * z + x * y);
  const cosy_cosp = 1 - 2 * (y * y + z * z);
  return Math.atan2(siny_cosp, cosy_cosp);
}

