/** Great-circle distance in metres. */
export function distance(a, b) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function formatDistance(m) {
  if (m < 950) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

const GEO_OPTS = { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 };

/** Resolves {lat, lng, accuracy}. Rejects with {code, message}. */
export function locate() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject({ code: 0, message: 'no-geolocation' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      err => reject({ code: err.code, message: err.message }),
      GEO_OPTS
    );
  });
}

/**
 * Is she close enough to count?
 * GPS accuracy is folded into the allowance — a phone reporting ±80 m indoors
 * shouldn't lock her out of a stop she is standing in.
 */
export function withinRadius(here, stop) {
  const d = distance(here, stop);
  const allowance = stop.radius + Math.min(here.accuracy || 0, 150);
  return { ok: d <= allowance, distance: d };
}

/**
 * Google and Mapbox both have degraded routing data inside South Korea, so
 * navigation hands off to the apps Koreans actually use.
 */
export function naverUrl(stop, nameEn) {
  const n = encodeURIComponent(stop.name.ko || nameEn);
  return `nmap://place?lat=${stop.lat}&lng=${stop.lng}&name=${n}&appname=mamainseoul`;
}

export function kakaoUrl(stop) {
  return `kakaomap://look?p=${stop.lat},${stop.lng}`;
}

/** Plain web fallback, for a laptop or when the app isn't installed. */
export function webMapUrl(stop) {
  return `https://map.kakao.com/link/map/${encodeURIComponent(stop.name.ko || stop.name.en)},${stop.lat},${stop.lng}`;
}
