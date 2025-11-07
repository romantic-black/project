interface TileSourceConfig {
  id: string;
  name: string;
  url: string;
  attribution?: string;
  minZoom?: number;
  maxZoom?: number;
  subdomains?: string;
  isFallback?: boolean;
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseCustomSources(envValue: string | undefined): TileSourceConfig[] {
  if (!envValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(envValue);
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => ({
          id: item.id ?? item.name,
          name: item.name ?? item.id ?? '自定义底图',
          url: item.url,
          attribution: item.attribution,
          minZoom: item.minZoom,
          maxZoom: item.maxZoom,
          subdomains: item.subdomains,
          isFallback: Boolean(item.isFallback),
        }))
        .filter((item) => Boolean(item.id) && Boolean(item.url));
    }
  } catch (error) {
    console.warn('解析 VITE_MAP_TILE_SOURCES 失败，已忽略自定义底图：', error);
  }

  return [];
}

const defaultSources: TileSourceConfig[] = [
  {
    id: 'osm',
    name: 'OpenStreetMap',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    subdomains: 'abc',
  },
];

const providerSourceUrl = import.meta.env.VITE_MAP_TILE_SERVICE_URL;
if (providerSourceUrl) {
  const normalizedUrl = providerSourceUrl.includes('{z}')
    ? providerSourceUrl
    : providerSourceUrl.endsWith('/')
    ? `${providerSourceUrl}{z}/{x}/{y}.png`
    : `${providerSourceUrl}/{z}/{x}/{y}.png`;
  defaultSources.unshift({
    id: 'provider-tiles',
    name: '综合导航瓦片',
    url: normalizedUrl,
    attribution: import.meta.env.VITE_MAP_TILE_ATTRIBUTION,
    isFallback: true,
  });
}

const customSources = parseCustomSources(import.meta.env.VITE_MAP_TILE_SOURCES);

const sources: TileSourceConfig[] = [...defaultSources, ...customSources];

const defaultSourceIdFromEnv = import.meta.env.VITE_MAP_DEFAULT_TILE_SOURCE;
const defaultSourceId = sources.some((source) => source.id === defaultSourceIdFromEnv)
  ? defaultSourceIdFromEnv
  : sources[0]?.id ?? 'osm';

const metersPerUnit = parseNumber(import.meta.env.VITE_MAP_METERS_PER_UNIT, 1);

export type { TileSourceConfig };
export const tileSources = sources;
export const defaultTileSource = defaultSourceId;
export const mapMetersPerUnit = metersPerUnit;

