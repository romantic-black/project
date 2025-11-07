import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer as LeafletMapContainer, TileLayer, Marker, Polyline, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useMapStore } from '../stores/map';
import { mapToDisplay } from '../utils/coordinates';
import { tileSources, defaultTileSource, type TileSourceConfig } from '../config/map';

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
  const mapOriginGps = useMapStore((state) => state.mapOriginGps);

  useEffect(() => {
    if (vehiclePosition && mapOrigin && map) {
      const display = mapToDisplay(
        { x: vehiclePosition.x, y: vehiclePosition.y, z: vehiclePosition.z },
        mapOrigin,
        mapScale,
        mapOriginGps
      );
      map.setView([display.lat, display.lng], map.getZoom(), { animate: true });
    }
  }, [vehiclePosition, mapOrigin, mapScale, map, mapOriginGps]);

  return null;
}

type TileSourceStatus = 'idle' | 'loading' | 'success' | 'error';

function buildProbeUrl(source: TileSourceConfig): string {
  const subdomain = source.subdomains?.[0] ?? 'a';
  return source.url
    .replace('{s}', subdomain)
    .replace('{z}', '0')
    .replace('{x}', '0')
    .replace('{y}', '0');
}

function probeTileSource(source: TileSourceConfig, timeoutMs = 4000): Promise<boolean> {
  return new Promise((resolve) => {
    const testUrl = buildProbeUrl(source);
    const tester = new Image();
    const timer = window.setTimeout(() => {
      tester.src = '';
      resolve(false);
    }, timeoutMs);

    const cleanup = (result: boolean) => {
      window.clearTimeout(timer);
      tester.onload = null;
      tester.onerror = null;
      resolve(result);
    };

    tester.onload = () => cleanup(true);
    tester.onerror = () => cleanup(false);

    tester.crossOrigin = 'anonymous';
    tester.referrerPolicy = 'no-referrer';
    tester.src = testUrl;
  });
}

export default function MapContainer({ onMapClick, height = '600px' }: MapContainerProps) {
  const {
    vehiclePosition,
    gpsPosition,
    waypoints,
    pathPoints,
    obstacles,
    mapOrigin,
    mapOriginGps,
    mapScale,
  } = useMapStore();
  const setMapOrigin = useMapStore((state) => state.setMapOrigin);
  const alignMapWithGps = useMapStore((state) => state.alignMapWithGps);

  const [activeSourceId, setActiveSourceId] = useState<string>(defaultTileSource);
  const [sourceStatuses, setSourceStatuses] = useState<Record<string, TileSourceStatus>>(() => {
    return tileSources.reduce<Record<string, TileSourceStatus>>((acc, source) => {
      acc[source.id] = source.id === defaultTileSource ? 'loading' : 'idle';
      return acc;
    }, {});
  });
  const activeSourceRef = useRef(activeSourceId);
  activeSourceRef.current = activeSourceId;

  const mapRef = useRef<L.Map | null>(null);

  // Initialize map origin to default if not set
  useEffect(() => {
    if (!mapOrigin && vehiclePosition) {
      setMapOrigin({ x: vehiclePosition.x, y: vehiclePosition.y, z: vehiclePosition.z });
    }
  }, [vehiclePosition, mapOrigin, setMapOrigin]);

  // Align map coordinates with GPS when both are available
  useEffect(() => {
    if (vehiclePosition && gpsPosition) {
      if (!mapOrigin || !mapOriginGps) {
        alignMapWithGps(
          { x: vehiclePosition.x, y: vehiclePosition.y, z: vehiclePosition.z },
          gpsPosition
        );
      }
    }
  }, [vehiclePosition, gpsPosition, mapOrigin, mapOriginGps, alignMapWithGps]);

  // Probe tile sources in sequence to determine initial availability
  useEffect(() => {
    let isCancelled = false;

    async function evaluateSources() {
      for (const source of tileSources) {
        if (isCancelled) {
          return;
        }

        setSourceStatuses((prev) => ({ ...prev, [source.id]: 'loading' }));
        const ok = await probeTileSource(source);

        if (isCancelled) {
          return;
        }

        setSourceStatuses((prev) => ({ ...prev, [source.id]: ok ? 'success' : 'error' }));

        if (ok) {
          setActiveSourceId(source.id);
          break;
        }
      }
    }

    evaluateSources();

    return () => {
      isCancelled = true;
    };
  }, []);

  // If active source fails, attempt fallback
  useEffect(() => {
    const currentStatus = sourceStatuses[activeSourceId];
    if (currentStatus === 'error') {
      const fallback = tileSources.find((source) => source.id !== activeSourceId && sourceStatuses[source.id] !== 'error');
      if (fallback) {
        setActiveSourceId(fallback.id);
      }
    }
  }, [activeSourceId, sourceStatuses]);

  const activeSource = useMemo(() => tileSources.find((source) => source.id === activeSourceId) ?? tileSources[0], [activeSourceId]);

  useEffect(() => {
    setSourceStatuses((prev) => ({ ...prev, [activeSourceId]: prev[activeSourceId] === 'success' ? 'success' : 'loading' }));
  }, [activeSourceId]);

  const handleTileLoad = useCallback(() => {
    const currentId = activeSourceRef.current;
    setSourceStatuses((prev) => ({ ...prev, [currentId]: 'success' }));
  }, []);

  const handleTileError = useCallback(() => {
    const currentId = activeSourceRef.current;
    setSourceStatuses((prev) => ({ ...prev, [currentId]: 'error' }));
  }, []);

  // Convert vehicle position to display coordinates
  const vehicleDisplay = vehiclePosition && mapOrigin
    ? mapToDisplay(
        { x: vehiclePosition.x, y: vehiclePosition.y, z: vehiclePosition.z },
        mapOrigin,
        mapScale,
        mapOriginGps
      )
    : gpsPosition
    ? { lat: gpsPosition.latitude, lng: gpsPosition.longitude }
    : null;

  // Convert path points to display coordinates
  const pathDisplayPoints = pathPoints
    .map((point) => mapToDisplay(point, mapOrigin, mapScale, mapOriginGps))
    .map((p) => [p.lat, p.lng] as [number, number]);

  // Default center (use vehicle position or fallback)
  const defaultCenter: [number, number] = vehicleDisplay
    ? [vehicleDisplay.lat, vehicleDisplay.lng]
    : gpsPosition
    ? [gpsPosition.latitude, gpsPosition.longitude]
    : mapOrigin
    ? [mapOrigin.y, mapOrigin.x]
    : [0, 0];

  // Default zoom level
  const defaultZoom = 15;

  const tileStatus = sourceStatuses[activeSourceId] ?? 'idle';

  // Handle map click using event handler
  const handleMapClick = (e: L.LeafletMouseEvent) => {
    if (onMapClick) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    }
  };

  return (
    <div style={{ height, width: '100%', position: 'relative' }}>
      <div
        className="absolute left-3 top-3 z-[1000] bg-white bg-opacity-80 text-gray-800 text-sm px-3 py-2 rounded shadow"
        style={{ minWidth: '160px', pointerEvents: 'none' }}
      >
        <div>底图：{activeSource?.name ?? '未知'}</div>
        <div>
          状态：
          {tileStatus === 'loading' && '加载中...'}
          {tileStatus === 'success' && '正常'}
          {tileStatus === 'error' && '加载失败，已尝试切换'}
        </div>
      </div>
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
          key={activeSource?.id}
          attribution={activeSource?.attribution}
          url={activeSource?.url ?? 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'}
          minZoom={activeSource?.minZoom}
          maxZoom={activeSource?.maxZoom}
          eventHandlers={{
            load: handleTileLoad,
            tileerror: handleTileError,
          }}
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
          const display = mapToDisplay(waypoint.position, mapOrigin, mapScale, mapOriginGps);
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
          const display = mapToDisplay(obstacle.position, mapOrigin, mapScale, mapOriginGps);
          
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
              .map((p) => mapToDisplay(p, mapOrigin, mapScale, mapOriginGps))
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

