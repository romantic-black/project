import { useEffect, useRef } from 'react';
import { MapContainer as LeafletMapContainer, TileLayer, Marker, Polyline, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useMapStore } from '../stores/map';
import { mapToDisplay } from '../utils/coordinates';

// Fix for default marker icon in React-Leaflet
// Note: CSS is imported in index.css

// Default marker icon setup
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Vehicle icon (custom)
const vehicleIcon = L.divIcon({
  className: 'vehicle-marker',
  html: '<div style="width: 20px; height: 20px; background: #3B82F6; border: 2px solid white; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

// Waypoint icon
const waypointIcon = L.divIcon({
  className: 'waypoint-marker',
  html: '<div style="width: 16px; height: 16px; background: #10B981; border: 2px solid white; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

interface MapContainerProps {
  onMapClick?: (lat: number, lng: number) => void;
  height?: string;
}

// Component to update map view when vehicle position changes
function MapViewUpdater() {
  const map = useMap();
  const vehiclePosition = useMapStore((state) => state.vehiclePosition);
  const mapOrigin = useMapStore((state) => state.mapOrigin);
  const mapScale = useMapStore((state) => state.mapScale);

  useEffect(() => {
    if (vehiclePosition && mapOrigin && map) {
      const display = mapToDisplay(
        { x: vehiclePosition.x, y: vehiclePosition.y, z: vehiclePosition.z },
        mapOrigin,
        mapScale
      );
      map.setView([display.lat, display.lng], map.getZoom(), { animate: true });
    }
  }, [vehiclePosition, mapOrigin, mapScale, map]);

  return null;
}

export default function MapContainer({ onMapClick, height = '600px' }: MapContainerProps) {
  const {
    vehiclePosition,
    waypoints,
    pathPoints,
    obstacles,
    mapOrigin,
    mapScale,
  } = useMapStore();

  const mapRef = useRef<L.Map | null>(null);

  // Initialize map origin to default if not set
  useEffect(() => {
    if (!mapOrigin && vehiclePosition) {
      useMapStore.getState().setMapOrigin({ x: vehiclePosition.x, y: vehiclePosition.y, z: vehiclePosition.z });
    }
  }, [vehiclePosition, mapOrigin]);

  // Convert vehicle position to display coordinates
  const vehicleDisplay = vehiclePosition && mapOrigin
    ? mapToDisplay(
        { x: vehiclePosition.x, y: vehiclePosition.y, z: vehiclePosition.z },
        mapOrigin,
        mapScale
      )
    : null;

  // Convert path points to display coordinates
  const pathDisplayPoints = pathPoints
    .map((point) => mapToDisplay(point, mapOrigin, mapScale))
    .map((p) => [p.lat, p.lng] as [number, number]);

  // Default center (use vehicle position or fallback)
  const defaultCenter: [number, number] = vehicleDisplay
    ? [vehicleDisplay.lat, vehicleDisplay.lng]
    : mapOrigin
    ? [mapOrigin.y, mapOrigin.x]
    : [0, 0];

  // Default zoom level
  const defaultZoom = 15;

  // Handle map click using event handler
  const handleMapClick = (e: L.LeafletMouseEvent) => {
    if (onMapClick) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    }
  };

  return (
    <div style={{ height, width: '100%', position: 'relative' }}>
      <LeafletMapContainer
        center={defaultCenter}
        zoom={defaultZoom}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
        whenCreated={(map) => {
          mapRef.current = map;
          map.on('click', handleMapClick);
        }}
      >
        {/* Offline tile layer - using OpenStreetMap as placeholder */}
        {/* In production, you may want to use offline tiles or ROS map server */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          // For offline maps, you would use a local tile server or pre-downloaded tiles
        />

        {/* Map view updater */}
        <MapViewUpdater />

        {/* Vehicle position marker */}
        {vehicleDisplay && vehiclePosition && (
          <Marker
            position={[vehicleDisplay.lat, vehicleDisplay.lng]}
            icon={vehicleIcon}
          >
            <div>
              <strong>Vehicle Position</strong>
              <br />
              Map: ({vehiclePosition.x.toFixed(2)}, {vehiclePosition.y.toFixed(2)})
            </div>
          </Marker>
        )}

        {/* Waypoints */}
        {waypoints.map((waypoint) => {
          const display = mapToDisplay(waypoint.position, mapOrigin, mapScale);
          return (
            <Marker
              key={waypoint.id}
              position={[display.lat, display.lng]}
              icon={waypointIcon}
            >
              <div>
                <strong>Waypoint</strong>
                <br />
                Map: ({waypoint.position.x.toFixed(2)}, {waypoint.position.y.toFixed(2)})
              </div>
            </Marker>
          );
        })}

        {/* Path/trajectory polyline */}
        {pathDisplayPoints.length > 1 && (
          <Polyline
            positions={pathDisplayPoints}
            color="#3B82F6"
            weight={3}
            opacity={0.7}
          />
        )}

        {/* Obstacles */}
        {obstacles.map((obstacle) => {
          const display = mapToDisplay(obstacle.position, mapOrigin, mapScale);
          
          if (obstacle.radius) {
            // Circular obstacle
            return (
              <Circle
                key={obstacle.id}
                center={[display.lat, display.lng]}
                radius={obstacle.radius * mapScale}
                color="#EF4444"
                fillColor="#EF4444"
                fillOpacity={0.3}
                weight={2}
              />
            );
          } else if (obstacle.polygon && obstacle.polygon.length > 0) {
            // Polygonal obstacle
            const polygonPoints = obstacle.polygon
              .map((p) => mapToDisplay(p, mapOrigin, mapScale))
              .map((p) => [p.lat, p.lng] as [number, number]);
            
            return (
              <Polyline
                key={obstacle.id}
                positions={[...polygonPoints, polygonPoints[0]]} // Close the polygon
                color="#EF4444"
                fillColor="#EF4444"
                fillOpacity={0.3}
                weight={2}
              />
            );
          }
          return null;
        })}
      </LeafletMapContainer>
    </div>
  );
}

