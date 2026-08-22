"use client";

import { ChangeEvent, DragEvent, KeyboardEvent, MouseEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import PwaManager from "./PwaManager";

type TravelMode = "transit" | "driving" | "taxi" | "walking" | "riding";
type PlaceType = "hotel" | "sight" | "food" | "shopping" | "railway" | "airport" | "other";
type OptimizeBy = "time" | "distance";
type DrawerState = "collapsed" | "half" | "expanded";

type PlaceLink = {
  id: string;
  name: string;
  url: string;
};

type Place = {
  id: string;
  poiId: string;
  name: string;
  address: string;
  type: PlaceType;
  location: [number, number];
  durationMinutes: number;
  fixedTime: string;
  notes: string;
  website: string;
  links: PlaceLink[];
  checkInDate: string;
  checkOutDate: string;
  roomType: string;
  price: number | null;
  bookingStatus: string;
  mealTime: string;
  perCapita: number | null;
  reservationStatus: string;
  ticketPrice: number | null;
  plannedSpend: number | null;
};

type TripDay = {
  date: string;
  startHotel: Place | null;
  endHotel: Place | null;
  stops: Place[];
  legs: TravelMode[];
  returnToHotel: boolean;
  optimizeBy: OptimizeBy;
  allowedModes: TravelMode[];
};

type Trip = {
  schemaVersion: 4;
  id: string;
  name: string;
  city: string;
  startDate: string;
  endDate: string;
  amap: { key: string; securityJsCode: string };
  days: TripDay[];
  updatedAt: string;
};

type PoiResult = {
  id: string;
  name: string;
  address: string;
  location: [number, number];
  type: PlaceType;
  website: string;
  typecode: string;
};

type RouteMetric = {
  minutes: number;
  distanceKm: number;
  cost: number | null;
  costMax: number | null;
  live: boolean;
  transitSummary: string;
  departureMinutes: number | null;
  arrivalMinutes: number | null;
};

type PlaceEditor = {
  kind: "new" | "stop" | "hotel";
  place: Place;
};

declare global {
  interface Window {
    AMap?: any;
    _AMapSecurityConfig?: { securityJsCode: string };
  }
}

const STORAGE_KEY = "li-qu-na-er-trips-v1";
const ACTIVE_KEY = "li-qu-na-er-active-trip-v1";
const ACTIVE_DAY_KEY = "li-qu-na-er-active-day-v1";
const PANEL_COLLAPSED_KEY = "li-qu-na-er-panel-collapsed-v1";
const DRAWER_STATE_KEY = "li-qu-na-er-mobile-drawer-v1";

const modeLabels: Record<TravelMode, string> = {
  transit: "公共交通",
  driving: "自驾",
  taxi: "打车",
  walking: "步行",
  riding: "骑行",
};

const modeIcons: Record<TravelMode, string> = {
  transit: "🚌",
  driving: "🚗",
  taxi: "🚕",
  walking: "🚶",
  riding: "🚲",
};

const routeLineStyles: Record<TravelMode, { color: string; dashed: boolean }> = {
  transit: { color: "#E3AD24", dashed: false },
  driving: { color: "#EE7A32", dashed: false },
  taxi: { color: "#3478F6", dashed: false },
  walking: { color: "#35A66F", dashed: true },
  riding: { color: "#159B87", dashed: false },
};

const typeLabels: Record<PlaceType, string> = {
  hotel: "酒店",
  sight: "景点",
  food: "餐厅",
  shopping: "购物",
  railway: "高铁/火车站",
  airport: "机场",
  other: "其他",
};

const typeIcons: Record<PlaceType, string> = {
  hotel: "🛏️",
  sight: "📍",
  food: "🍜",
  shopping: "🛍️",
  railway: "🚄",
  airport: "✈️",
  other: "✨",
};

const allModes = Object.keys(modeLabels) as TravelMode[];

function uid(prefix = "item") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function dateRange(start: string, end: string) {
  const result: string[] = [];
  const from = new Date(`${start}T00:00:00`);
  const to = new Date(`${end}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return result;
  for (const d = new Date(from); d <= to && result.length < 30; d.setDate(d.getDate() + 1)) {
    result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  return result;
}

function makePlace(
  name: string,
  address: string,
  location: [number, number],
  type: PlaceType,
  durationMinutes = 90,
  fixedTime = "",
): Place {
  return {
    id: uid("place"),
    poiId: "",
    name,
    address,
    type,
    location,
    durationMinutes,
    fixedTime,
    notes: "",
    website: "",
    links: [],
    checkInDate: "",
    checkOutDate: "",
    roomType: "",
    price: null,
    bookingStatus: "待预订",
    mealTime: "",
    perCapita: null,
    reservationStatus: "未预约",
    ticketPrice: null,
    plannedSpend: null,
  };
}

function makeDay(date: string, startHotel: Place | null = null, endHotel: Place | null = startHotel): TripDay {
  return {
    date,
    startHotel,
    endHotel,
    stops: [],
    legs: ["transit"],
    returnToHotel: true,
    optimizeBy: "time",
    allowedModes: ["transit", "walking", "taxi"],
  };
}

function normalizePlace(raw: Partial<Place>): Place {
  const base = makePlace(raw.name || "未命名地点", raw.address || "", raw.location || [120.1551, 30.2741], raw.type || "other");
  const links = Array.isArray(raw.links)
    ? raw.links.map((link) => ({ id: link.id || uid("link"), name: String(link.name || ""), url: String(link.url || "") }))
    : [];
  if (!links.length && raw.website?.trim()) links.push({ id: uid("link"), name: "相关网页", url: raw.website.trim() });
  return { ...base, ...raw, links, price: raw.price ?? null, perCapita: raw.perCapita ?? null, ticketPrice: raw.ticketPrice ?? null, plannedSpend: raw.plannedSpend ?? null };
}

function migrateTrip(raw: any): Trip {
  const startDate = raw.startDate || localToday();
  const sourceDays = Array.isArray(raw.days) ? raw.days : [];
  const migratedDays: TripDay[] = sourceDays.map((item: any) => {
    const stops = (Array.isArray(item.stops) ? item.stops : []).map(normalizePlace);
    return {
      date: item.date,
      startHotel: item.startHotel ? normalizePlace(item.startHotel) : item.hotel ? normalizePlace(item.hotel) : null,
      endHotel: item.endHotel ? normalizePlace(item.endHotel) : item.hotel ? normalizePlace(item.hotel) : null,
      stops,
      legs: normalizeLegs(stops, item.legs || []),
      returnToHotel: item.returnToHotel ?? true,
      optimizeBy: item.optimizeBy === "distance" ? "distance" : "time",
      allowedModes: Array.isArray(item.allowedModes) && item.allowedModes.length ? item.allowedModes : ["transit", "walking", "taxi"],
    };
  });
  return {
    schemaVersion: 4,
    id: raw.id || uid("trip"),
    name: raw.name || "我的旅程",
    city: raw.city || "",
    startDate,
    endDate: raw.endDate || startDate,
    amap: { key: raw.amap?.key || "", securityJsCode: raw.amap?.securityJsCode || "" },
    days: migratedDays.length ? migratedDays : [makeDay(startDate)],
    updatedAt: raw.updatedAt || new Date().toISOString(),
  };
}

function createDemoTrip(): Trip {
  const hotel = makePlace("湖边旅居酒店", "杭州市上城区湖滨路", [120.1619, 30.2523], "hotel", 0);
  hotel.checkInDate = "2026-09-18";
  hotel.checkOutDate = "2026-09-19";
  hotel.roomType = "湖景大床房";
  hotel.price = 568;
  const day1 = makeDay("2026-09-18", hotel);
  day1.stops = [
    makePlace("断桥残雪", "北山街与白堤交叉口", [120.1581, 30.2593], "sight", 60),
    makePlace("曲院风荷", "北山街89号", [120.1372, 30.2546], "sight", 90),
    makePlace("龙井茶园", "龙井路88号", [120.1174, 30.2247], "sight", 120),
    makePlace("湖滨晚餐", "湖滨银泰附近", [120.1644, 30.252], "food", 90, "18:30"),
  ];
  day1.legs = ["walking", "transit", "taxi", "taxi", "walking"];
  day1.stops[3].mealTime = "18:30";
  day1.stops[3].perCapita = 120;
  const day2 = makeDay("2026-09-19", hotel);
  day2.stops = [
    makePlace("灵隐寺", "法云弄1号", [120.1014, 30.2408], "sight", 150, "09:30"),
    makePlace("北山街", "西湖区北山街", [120.1454, 30.2583], "sight", 75),
    makePlace("南宋御街", "中山中路", [120.1698, 30.2405], "shopping", 120),
  ];
  day2.legs = ["taxi", "transit", "transit", "taxi"];
  return {
    schemaVersion: 4,
    id: uid("trip"),
    name: "杭州 · 两日慢游",
    city: "杭州",
    startDate: day1.date,
    endDate: day2.date,
    amap: { key: "", securityJsCode: "" },
    days: [day1, day2],
    updatedAt: new Date().toISOString(),
  };
}

function createBlankTrip(): Trip {
  const today = localToday();
  return { schemaVersion: 4, id: uid("trip"), name: "我的新旅程", city: "", startDate: today, endDate: today, amap: { key: "", securityJsCode: "" }, days: [makeDay(today)], updatedAt: new Date().toISOString() };
}

function minutesOf(time: string) {
  if (!time) return null;
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function formatClock(value: number) {
  const normalized = ((Math.round(value) % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

function durationLabel(value: number) {
  if (value < 60) return `${value} 分钟`;
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return minutes ? `${hours} 小时 ${minutes} 分` : `${hours} 小时`;
}

function haversine(a: [number, number], b: [number, number]) {
  const rad = (v: number) => (v * Math.PI) / 180;
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const lat1 = rad(a[1]);
  const lat2 = rad(b[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function fallbackMetric(a: [number, number], b: [number, number], mode: TravelMode): RouteMetric {
  const distanceKm = haversine(a, b) * (mode === "walking" ? 1.15 : 1.28);
  const speeds: Record<TravelMode, number> = { walking: 4.5, riding: 13, driving: 27, taxi: 27, transit: 18 };
  const minutes = Math.max(5, Math.round((distanceKm / speeds[mode]) * 60 + (mode === "transit" ? 8 : 2)));
  return { minutes, distanceKm, cost: mode === "walking" || mode === "riding" ? 0 : null, costMax: mode === "walking" || mode === "riding" ? 0 : null, live: false, transitSummary: mode === "transit" ? "步行约 — 分钟 · 共 — 站" : "", departureMinutes: null, arrivalMinutes: null };
}

function normalizeLegs(stops: Place[], legs: TravelMode[]): TravelMode[] {
  return Array.from({ length: stops.length + 1 }, (_, index): TravelMode => legs[index] || "transit");
}

function bestMode(a: [number, number], b: [number, number], day: TripDay): TravelMode {
  const modes: TravelMode[] = day.allowedModes.length ? day.allowedModes : ["transit"];
  if (day.optimizeBy === "time") {
    return [...modes].sort((x, y) => fallbackMetric(a, b, x).minutes - fallbackMetric(a, b, y).minutes)[0];
  }
  const km = haversine(a, b);
  if (km <= 1.2 && modes.includes("walking")) return "walking";
  if (km <= 4 && modes.includes("riding")) return "riding";
  if (modes.includes("transit")) return "transit";
  return modes[0];
}

function optimizeDay(day: TripDay): Pick<TripDay, "stops" | "legs"> {
  if (!day.startHotel || day.stops.length < 2) return { stops: day.stops, legs: normalizeLegs(day.stops, day.legs) };
  const remaining = [...day.stops];
  const ordered: Place[] = [];
  let current = day.startHotel.location;
  let cursor = 8 * 60 + 30;
  while (remaining.length) {
    const fixedStops = remaining.filter((stop) => stop.fixedTime).sort((a, b) => (minutesOf(a.fixedTime) || 0) - (minutesOf(b.fixedTime) || 0));
    const nextFixed = fixedStops[0];
    const flexible = remaining.filter((stop) => !stop.fixedTime);
    let selected: Place;
    if (!nextFixed) {
      selected = [...remaining].sort((a, b) => {
        const metricA = fallbackMetric(current, a.location, bestMode(current, a.location, day));
        const metricB = fallbackMetric(current, b.location, bestMode(current, b.location, day));
        return day.optimizeBy === "time" ? metricA.minutes - metricB.minutes : metricA.distanceKm - metricB.distanceKm;
      })[0];
    } else {
      const fixedAt = minutesOf(nextFixed.fixedTime) || cursor;
      const candidates = flexible.filter((stop) => {
        const first = fallbackMetric(current, stop.location, bestMode(current, stop.location, day)).minutes;
        const second = fallbackMetric(stop.location, nextFixed.location, bestMode(stop.location, nextFixed.location, day)).minutes;
        return cursor + first + stop.durationMinutes + second <= fixedAt;
      });
      selected = candidates.length
        ? candidates.sort((a, b) => haversine(current, a.location) - haversine(current, b.location))[0]
        : nextFixed;
    }
    const mode = bestMode(current, selected.location, day);
    cursor += fallbackMetric(current, selected.location, mode).minutes;
    const fixedAt = minutesOf(selected.fixedTime);
    if (fixedAt !== null && cursor < fixedAt) cursor = fixedAt;
    cursor += selected.durationMinutes;
    current = selected.location;
    ordered.push(selected);
    remaining.splice(remaining.findIndex((stop) => stop.id === selected.id), 1);
  }
  const routeEnd = day.endHotel || day.startHotel;
  const points = [day.startHotel, ...ordered, routeEnd];
  const legs = points.slice(0, -1).map((point, index) => bestMode(point.location, points[index + 1].location, day));
  return { stops: ordered, legs };
}

function scheduleFor(day: TripDay, metrics: RouteMetric[]) {
  let cursor = 8 * 60 + 30;
  return day.stops.map((stop, index) => {
    const travel = metrics[index]?.minutes ?? 20;
    const naturalArrival = cursor + travel;
    const fixed = minutesOf(stop.fixedTime);
    const late = fixed !== null && naturalArrival > fixed ? naturalArrival - fixed : 0;
    const arrival = fixed !== null && naturalArrival < fixed ? fixed : naturalArrival;
    cursor = arrival + stop.durationMinutes;
    return { arrival, departure: cursor, travel, late };
  });
}

function dateLabel(date: string) {
  const d = new Date(`${date}T00:00:00`);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function weekday(date: string) {
  return "日一二三四五六"[new Date(`${date}T00:00:00`).getDay()];
}

function inferPoiType(poi: any): PlaceType {
  const text = `${poi.name || ""}|${poi.type || ""}|${poi.typecode || ""}`;
  if (/机场|航站楼|候机楼|飞机场/.test(text) || /^1501/.test(String(poi.typecode || ""))) return "airport";
  if (/高铁站|火车站|铁路车站|客运火车站|动车站/.test(text) || /^1502/.test(String(poi.typecode || ""))) return "railway";
  if (/餐饮|餐厅|饭店|小吃/.test(text)) return "food";
  if (/住宿|酒店|宾馆|民宿/.test(text)) return "hotel";
  if (/购物|商场|商业街/.test(text)) return "shopping";
  return "sight";
}

function flattenRoutePath(route: any) {
  if (Array.isArray(route?.path) && route.path.length) return route.path;
  return (route?.steps || route?.rides || []).flatMap((step: any) => step?.path || []);
}

function transitSegmentPath(segment: any) {
  const transit = segment?.transit || {};
  if (Array.isArray(transit.path) && transit.path.length) return transit.path;
  if (Array.isArray(segment?.path) && segment.path.length) return segment.path;
  const linePath = (transit.lines || []).flatMap((line: any) => line?.path || []);
  if (linePath.length) return linePath;
  return (segment?.walking?.steps || []).flatMap((step: any) => step?.path || []);
}

function normalizeMapColor(value: unknown, fallback: string) {
  const color = String(value || "").trim();
  if (/^#[0-9a-f]{3,8}$/i.test(color) || /^rgba?\(/i.test(color)) return color;
  if (/^[0-9a-f]{6}$/i.test(color)) return `#${color}`;
  return fallback;
}

function subwaySegmentColor(segment: any) {
  const transit = segment?.transit || {};
  const line = transit?.lines?.[0] || transit?.line || {};
  return normalizeMapColor(line.color || line.line_color || transit.color || segment.color, "#2457a6");
}

function escapeMapLabel(value: unknown) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] || character);
}

function transitBrief(route: any) {
  const segments = route?.segments || [];
  let walkingSeconds = segments.filter((segment: any) => String(segment.transit_mode || "").toUpperCase() === "WALK").reduce((sum: number, segment: any) => {
    const transit = segment.transit || {};
    const seconds = [segment.time, transit.time, transit.duration].map(Number).find((value) => Number.isFinite(value) && value > 0) || 0;
    return sum + seconds;
  }, 0);
  if (!walkingSeconds && Number(route?.walking_distance) > 0) walkingSeconds = Math.round((Number(route.walking_distance) / 80) * 60);
  const stations = segments.filter((segment: any) => ["BUS", "SUBWAY", "METRO_RAIL"].includes(String(segment.transit_mode || "").toUpperCase())).reduce((sum: number, segment: any) => {
    const transit = segment.transit || {};
    const line = transit.lines?.[0] || transit.line || {};
    const via = Math.max(0, ...[
      transit.via_num,
      segment.via_num,
      Array.isArray(transit.via_stops) ? transit.via_stops.length : undefined,
      line.via_num,
      Array.isArray(line.via_stops) ? line.via_stops.length : undefined,
    ].map(Number).filter(Number.isFinite));
    return sum + via + 1;
  }, 0);
  return `步行约 ${Math.max(0, Math.ceil(walkingSeconds / 60))} 分钟 · 共 ${stations} 站`;
}

function parseCostRange(value: unknown): { min: number; max: number } | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const low = Number(record.min ?? record.minimum ?? record.low ?? record.start ?? record.lower);
    const high = Number(record.max ?? record.maximum ?? record.high ?? record.end ?? record.upper);
    if (Number.isFinite(low) || Number.isFinite(high)) {
      const min = Number.isFinite(low) ? low : high;
      const max = Number.isFinite(high) ? high : low;
      return { min: Math.min(min, max), max: Math.max(min, max) };
    }
  }
  const numbers = String(value).match(/\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite) || [];
  if (!numbers.length) return null;
  return { min: Math.min(...numbers), max: Math.max(...numbers) };
}

function hotelsFromDays(days: TripDay[], extra?: Place) {
  const hotels = new Map<string, Place>();
  days.forEach((item) => [item.startHotel, item.endHotel].forEach((hotel) => {
    if (hotel?.type === "hotel") hotels.set(hotel.id, hotel);
  }));
  if (extra?.type === "hotel") hotels.set(extra.id, extra);
  return [...hotels.values()];
}

function applyHotelStays(days: TripDay[], hotels: Place[]) {
  const ordered = [...hotels].sort((a, b) => (a.checkInDate || "").localeCompare(b.checkInDate || ""));
  return days.map((item) => {
    const starting = ordered.filter((hotel) => {
      const checkIn = hotel.checkInDate || item.date;
      const checkOut = hotel.checkOutDate || checkIn;
      return checkIn < item.date && item.date <= checkOut;
    }).at(-1) || null;
    const ending = ordered.filter((hotel) => {
      const checkIn = hotel.checkInDate || item.date;
      const checkOut = hotel.checkOutDate || checkIn;
      return checkIn <= item.date && item.date < checkOut;
    }).at(-1) || null;
    const sameDay = ordered.filter((hotel) => {
      const checkIn = hotel.checkInDate || item.date;
      const checkOut = hotel.checkOutDate || checkIn;
      return checkIn === item.date && checkOut === item.date;
    }).at(-1) || null;
    const startHotel = starting || ending || sameDay;
    const endHotel = sameDay || ending || starting;
    return { ...item, startHotel, endHotel };
  });
}

function placeWebUrl(place: Place, city: string) {
  if (place.poiId) return `https://uri.amap.com/marker?poiid=${encodeURIComponent(place.poiId)}&src=liqunaer&callnative=0`;
  return `https://uri.amap.com/search?keyword=${encodeURIComponent(place.name)}&city=${encodeURIComponent(city)}&view=map&src=liqunaer&callnative=0`;
}

function externalWebUrl(url: string) {
  return /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
}

function resolvedPlaceLinks(place: Place, city: string) {
  const customLinks = place.links.filter((link) => link.name.trim() && link.url.trim());
  if (customLinks.length) return customLinks.map((link) => ({ ...link, name: link.name.trim(), url: externalWebUrl(link.url) }));
  return [{ id: `${place.id}-amap`, name: "查看网页", url: placeWebUrl(place, city) }];
}

function PlaceLinkButtons({ place, city }: { place: Place; city: string }) {
  return <div className="place-links" aria-label={`${place.name}的相关链接`}>
    {resolvedPlaceLinks(place, city).map((link) => <a key={link.id} className="place-link-chip" href={link.url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>{link.name}<span>↗</span></a>)}
  </div>;
}

function cardDetail(place: Place) {
  if (place.type === "hotel") return [place.roomType, place.price !== null ? `¥${place.price}/晚` : "", place.bookingStatus].filter(Boolean).join(" · ");
  if (place.type === "food") return [place.mealTime ? `${place.mealTime} 用餐` : "", place.perCapita !== null ? `人均 ¥${place.perCapita}` : "", place.reservationStatus].filter(Boolean).join(" · ");
  if (place.type === "sight") return [place.ticketPrice !== null ? `门票 ¥${place.ticketPrice}` : "", durationLabel(place.durationMinutes)].filter(Boolean).join(" · ");
  if (place.type === "railway" || place.type === "airport") return [place.fixedTime ? `固定 ${place.fixedTime} 到达` : "", durationLabel(place.durationMinutes)].filter(Boolean).join(" · ");
  return [place.plannedSpend !== null ? `预计 ¥${place.plannedSpend}` : "", durationLabel(place.durationMinutes)].filter(Boolean).join(" · ");
}

function routeBrief(metric: RouteMetric | undefined, mode: TravelMode) {
  if (mode === "transit") return metric?.transitSummary || "步行约 — 分钟 · 共 — 站";
  return `约 ${metric?.minutes || 20} 分 · ${metric ? metric.distanceKm.toFixed(1) : "—"} km`;
}

function routePeriod(metric: RouteMetric | undefined) {
  if (metric?.departureMinutes === null || metric?.departureMinutes === undefined || metric.arrivalMinutes === null || metric.arrivalMinutes === undefined) return "预计时段待查询";
  return `${formatClock(metric.departureMinutes)}–${formatClock(metric.arrivalMinutes)}`;
}

function routeCost(metric: RouteMetric | undefined, mode: TravelMode) {
  if (metric?.cost === null || metric?.cost === undefined) return "暂无估价";
  if (metric.costMax !== null && metric.costMax > metric.cost) return `¥${metric.cost.toFixed(0)}–${metric.costMax.toFixed(0)}`;
  return mode === "taxi" ? `约 ¥${metric.cost.toFixed(0)}` : `¥${metric.cost.toFixed(0)}`;
}

export default function Home() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [activeId, setActiveId] = useState("");
  const [selectedDay, setSelectedDay] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showTripEditor, setShowTripEditor] = useState(false);
  const [placeEditor, setPlaceEditor] = useState<PlaceEditor | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PoiResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeResult, setActiveResult] = useState(-1);
  const [toast, setToast] = useState("");
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [drawerState, setDrawerState] = useState<DrawerState>("half");
  const [mapStatus, setMapStatus] = useState<"demo" | "loading" | "ready" | "error">("demo");
  const [routeMetrics, setRouteMetrics] = useState<RouteMetric[]>([]);
  const [routeNotice, setRouteNotice] = useState("");
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const routeServicesRef = useRef<any[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const searchSequenceRef = useRef(0);
  const pointerSortRef = useRef<{ pointerId: number; index: number } | null>(null);

  const trip = trips.find((item) => item.id === activeId) || trips[0];
  const day = trip?.days[selectedDay];

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const parsed = stored ? JSON.parse(stored) : [];
      const initial = Array.isArray(parsed) && parsed.length ? parsed.map(migrateTrip) : [createDemoTrip()];
      const initialActiveId = localStorage.getItem(ACTIVE_KEY) || initial[0].id;
      const initialTrip = initial.find((item: Trip) => item.id === initialActiveId) || initial[0];
      const storedDay = Number(localStorage.getItem(ACTIVE_DAY_KEY) || 0);
      setTrips(initial);
      setActiveId(initialTrip.id);
      setSelectedDay(Math.max(0, Math.min(Number.isFinite(storedDay) ? storedDay : 0, initialTrip.days.length - 1)));
      setPanelCollapsed(localStorage.getItem(PANEL_COLLAPSED_KEY) === "true");
      const storedDrawer = localStorage.getItem(DRAWER_STATE_KEY);
      if (storedDrawer === "collapsed" || storedDrawer === "half" || storedDrawer === "expanded") setDrawerState(storedDrawer);
    } catch {
      const initial = [createDemoTrip()];
      setTrips(initial);
      setActiveId(initial[0].id);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || !trips.length) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trips));
    localStorage.setItem(ACTIVE_KEY, activeId);
    localStorage.setItem(ACTIVE_DAY_KEY, String(selectedDay));
    localStorage.setItem(PANEL_COLLAPSED_KEY, String(panelCollapsed));
    localStorage.setItem(DRAWER_STATE_KEY, drawerState);
  }, [trips, activeId, selectedDay, panelCollapsed, drawerState, hydrated]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const map = mapInstanceRef.current;
      if (!map) return;
      map.resize?.();
      const mobile = window.matchMedia("(max-width: 900px)").matches;
      const bottomPadding = mobile && drawerState === "half" ? Math.round(window.innerHeight * 0.42) + 18 : 82;
      map.setFitView?.(undefined, false, [70, 60, bottomPadding, 60], 15);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [panelCollapsed, drawerState]);

  const updateTrip = (updater: (current: Trip) => Trip) => {
    setTrips((items) => items.map((item) => item.id === activeId ? { ...updater(item), updatedAt: new Date().toISOString() } : item));
  };

  const updateDay = (updater: (current: TripDay) => TripDay) => {
    updateTrip((current) => ({ ...current, days: current.days.map((item, index) => index === selectedDay ? updater(item) : item) }));
  };

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };

  useEffect(() => {
    if (!trip?.amap.key || !trip.amap.securityJsCode || !mapRef.current) {
      setMapStatus("demo");
      return;
    }
    let cancelled = false;
    setMapStatus("loading");
    window._AMapSecurityConfig = { securityJsCode: trip.amap.securityJsCode };
    const initialize = () => {
      if (cancelled || !window.AMap || !mapRef.current) return;
      try {
        if (!mapInstanceRef.current) mapInstanceRef.current = new window.AMap.Map(mapRef.current, { zoom: 12, mapStyle: "amap://styles/whitesmoke", viewMode: "2D" });
        setMapStatus("ready");
      } catch {
        setMapStatus("error");
      }
    };
    if (window.AMap) initialize();
    else {
      document.querySelector<HTMLScriptElement>("script[data-amap-planner]")?.remove();
      const script = document.createElement("script");
      script.dataset.amapPlanner = "true";
      script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(trip.amap.key)}&plugin=AMap.PlaceSearch,AMap.Driving,AMap.Walking,AMap.Transfer,AMap.Riding`;
      script.async = true;
      script.onload = initialize;
      script.onerror = () => setMapStatus("error");
      document.head.appendChild(script);
    }
    return () => { cancelled = true; };
  }, [trip?.amap.key, trip?.amap.securityJsCode]);

  const fallbackMetrics = useMemo(() => {
    if (!day?.startHotel || !day.stops.length) return [];
    const points = [day.startHotel, ...day.stops, ...(day.returnToHotel && day.endHotel ? [day.endHotel] : [])];
    return points.slice(0, -1).map((point, index) => fallbackMetric(point.location, points[index + 1].location, day.legs[index] || "transit"));
  }, [day]);

  useEffect(() => {
    const AMap = window.AMap;
    const map = mapInstanceRef.current;
    if (!AMap || !map || !day || mapStatus !== "ready") {
      setRouteMetrics([]);
      setRouteNotice("");
      return;
    }
    setRouteNotice("正在获取高德实时路线…");
    routeServicesRef.current.forEach((service) => service.clear?.());
    routeServicesRef.current = [];
    map.clearMap();
    let cancelled = false;
    const sameHotel = Boolean(day.startHotel && day.endHotel && day.startHotel.id === day.endHotel.id);
    const markerPoints: { place: Place; label: string }[] = [];
    if (day.startHotel) markerPoints.push({ place: day.startHotel, label: sameHotel ? "住" : "起" });
    day.stops.forEach((place, index) => markerPoints.push({ place, label: String(index + 1) }));
    if (day.endHotel && !sameHotel) markerPoints.push({ place: day.endHotel, label: "住" });
    markerPoints.forEach(({ place, label }) => {
      const marker = new AMap.Marker({ position: place.location, title: place.name, label: { content: `<span class="map-marker-label">${label}</span>`, direction: "top" } });
      map.add(marker);
    });
    if (markerPoints.length) map.setFitView(undefined, false, [60, 60, 60, 60], 15);
    if (!day.startHotel || !day.stops.length) return () => { cancelled = true; };
    const routePoints = [day.startHotel, ...day.stops, ...(day.returnToHotel && day.endHotel ? [day.endHotel] : [])];
    const metrics: RouteMetric[] = [];
    let routeFailureCount = 0;
    let domainBlocked = false;
    const drawPolyline = (path: any[], strokeColor: string, dashed = false) => {
      if (!Array.isArray(path) || path.length < 2) return false;
      map.add(new AMap.Polyline({
        path,
        strokeColor,
        strokeWeight: 7,
        strokeOpacity: 0.92,
        strokeStyle: dashed ? "dashed" : "solid",
        strokeDasharray: dashed ? [9, 7] : undefined,
        isOutline: true,
        outlineColor: "#ffffff",
        borderWeight: 2,
        lineJoin: "round",
        lineCap: "round",
        zIndex: dashed ? 52 : 50,
      }));
      return true;
    };
    const drawTransitRoute = (route: any) => {
      let rideSegmentCount = 0;
      let drawnSegments = 0;
      let drawnRideSegments = 0;
      (route?.segments || []).forEach((segment: any) => {
        const mode = String(segment.transit_mode || "").toUpperCase();
        const transit = segment.transit || {};
        const path = transitSegmentPath(segment);
        if (mode === "WALK") {
          if (drawPolyline(path, routeLineStyles.walking.color, routeLineStyles.walking.dashed)) drawnSegments += 1;
          return;
        }
        const isSubway = mode === "SUBWAY" || mode === "METRO_RAIL";
        const isRide = mode === "BUS" || isSubway;
        if (drawPolyline(path, isSubway ? subwaySegmentColor(segment) : routeLineStyles.transit.color)) {
          drawnSegments += 1;
          if (isRide) drawnRideSegments += 1;
        }
        if (!isRide) return;
        if (rideSegmentCount > 0) {
          const station = transit.on_station || segment.on_station || transit.lines?.[0]?.departure_stop;
          if (station?.location) {
            const stationName = escapeMapLabel(station.name || "换乘站");
            map.add(new AMap.Marker({
              position: station.location,
              title: station.name || "换乘站",
              content: `<span class="transfer-marker-label">换 · ${stationName}</span>`,
              offset: AMap.Pixel ? new AMap.Pixel(-28, -14) : undefined,
              zIndex: 120,
            }));
          }
        }
        rideSegmentCount += 1;
      });
      if (!drawnSegments || !drawnRideSegments) drawPolyline(flattenRoutePath(route), routeLineStyles.transit.color);
    };
    const finishRoutes = () => {
      if (cancelled) return;
      setRouteMetrics([...metrics]);
      if (domainBlocked) setRouteNotice("路线未授权：请检查高德 Key 的域名白名单");
      else if (routeFailureCount) setRouteNotice("部分路线暂不可用，当前显示本地预估");
      else setRouteNotice("已采用高德实时路线");
      map.setFitView(undefined, false, [70, 70, 70, 70], 15);
    };
    const queryLeg = (index: number, departureMinutes: number) => {
      if (cancelled) return;
      if (index >= routePoints.length - 1) return finishRoutes();
      const from = routePoints[index];
      const to = routePoints[index + 1];
      const mode = day.legs[index] || "transit";
      const options: any = { hideMarkers: true, showTraffic: false, autoFitView: false };
      let service: any;
      if (mode === "walking") service = new AMap.Walking(options);
      else if (mode === "riding") service = new AMap.Riding(options);
      else if (mode === "driving" || mode === "taxi") service = new AMap.Driving({ ...options, extensions: "all", policy: day.optimizeBy === "time" ? (AMap.DrivingPolicy?.LEAST_TIME ?? 0) : (AMap.DrivingPolicy?.LEAST_DISTANCE ?? 2) });
      else service = new AMap.Transfer({ ...options, city: trip.city, extensions: "all", nightflag: true, policy: AMap.TransferPolicy?.LEAST_TIME });
      routeServicesRef.current.push(service);
      if (mode === "transit" && typeof service.leaveAt === "function") {
        try { service.leaveAt(formatClock(departureMinutes), day.date); } catch { /* Some regional services ignore scheduled departure time. */ }
      }
      const handleResult = (status: string, result: any) => {
        if (cancelled) return;
        const route = result?.routes?.[0] || result?.plans?.[0];
        if (status !== "complete" || !route) {
          routeFailureCount += 1;
          const errorText = [result?.info, result?.message, result?.status, typeof result === "string" ? result : ""].filter(Boolean).join(" ");
          if (/INVALID_USER_DOMAIN/i.test(errorText)) domainBlocked = true;
        }
        const fallback = fallbackMetric(from.location, to.location, mode);
        const seconds = Number(route?.time || 0);
        const meters = Number(route?.distance || 0);
        const rawCost = mode === "taxi"
          ? result?.taxi_cost ?? result?.taxiCost ?? route?.taxi_cost
          : mode === "transit" ? route?.cost : mode === "walking" || mode === "riding" ? 0 : null;
        const costRange = parseCostRange(rawCost);
        const minutes = status === "complete" && route && seconds ? Math.max(1, Math.round(seconds / 60)) : fallback.minutes;
        const arrivalMinutes = departureMinutes + minutes;
        if (status === "complete" && route) {
          if (mode === "transit") drawTransitRoute(route);
          else drawPolyline(flattenRoutePath(route), routeLineStyles[mode].color, routeLineStyles[mode].dashed);
        }
        metrics[index] = status === "complete" && route
          ? { minutes, distanceKm: meters ? meters / 1000 : fallback.distanceKm, cost: costRange?.min ?? null, costMax: costRange?.max ?? null, live: true, transitSummary: mode === "transit" ? transitBrief(route) : "", departureMinutes, arrivalMinutes }
          : { ...fallback, departureMinutes, arrivalMinutes };
        const destinationStop = day.stops[index];
        let nextDeparture = arrivalMinutes;
        if (destinationStop) {
          const fixedArrival = minutesOf(destinationStop.fixedTime);
          nextDeparture = Math.max(arrivalMinutes, fixedArrival ?? arrivalMinutes) + destinationStop.durationMinutes;
        }
        queryLeg(index + 1, nextDeparture);
      };
      try {
        service.search(from.location, to.location, handleResult);
      } catch {
        handleResult("error", null);
      }
    };
    queryLeg(0, 8 * 60 + 30);
    return () => { cancelled = true; };
  }, [day, mapStatus, trip?.city]);

  const effectiveMetrics = routeMetrics.length === fallbackMetrics.length ? routeMetrics : fallbackMetrics;
  const schedule = useMemo(() => day ? scheduleFor(day, effectiveMetrics) : [], [day, effectiveMetrics]);
  const returnTime = day?.stops.length && day.returnToHotel && day.endHotel ? (schedule.at(-1)?.departure || 510) + (effectiveMetrics[day.stops.length]?.minutes || 20) : null;
  const totalTravel = effectiveMetrics.reduce((sum, value) => sum + value.minutes, 0);
  const totalDistance = effectiveMetrics.reduce((sum, value) => sum + value.distanceKm, 0);
  const pricedMetrics = effectiveMetrics.filter((_, index) => day && (day.legs[index] === "taxi" || day.legs[index] === "transit"));
  const knownCosts = pricedMetrics.filter((metric) => metric.cost !== null);
  const hasUnknownCost = pricedMetrics.some((metric) => metric.cost === null);
  const totalCost = knownCosts.reduce((sum, metric) => sum + (metric.cost || 0), 0);
  const totalCostMax = knownCosts.reduce((sum, metric) => sum + (metric.costMax ?? metric.cost ?? 0), 0);
  const hasTaxiEstimate = effectiveMetrics.some((metric, index) => day?.legs[index] === "taxi" && metric.cost !== null);
  const knownCostText = totalCostMax > totalCost ? `¥${totalCost.toFixed(0)}–${totalCostMax.toFixed(0)}` : `${hasTaxiEstimate ? "约 " : ""}¥${totalCost.toFixed(0)}`;
  const costSummary = hasUnknownCost ? (knownCosts.length ? `${knownCostText} + 待估` : "暂无估价") : knownCostText;
  const differentHotels = Boolean(day?.startHotel && day.endHotel && day.startHotel.id !== day.endHotel.id);
  const endHotelAction = differentHotels ? "前往当晚酒店" : "返回酒店";

  const saveTripDates = () => {
    if (!trip) return;
    const dates = dateRange(trip.startDate, trip.endDate);
    if (!dates.length) return notify("请检查旅行日期");
    updateTrip((current) => {
      const days = dates.map((date) => current.days.find((item) => item.date === date) || makeDay(date));
      return { ...current, days: applyHotelStays(days, hotelsFromDays(current.days)) };
    });
    setSelectedDay(0);
    setShowTripEditor(false);
    notify("旅程信息已更新");
  };

  const newTrip = () => {
    const created = createBlankTrip();
    setTrips((items) => [...items, created]);
    setActiveId(created.id);
    setSelectedDay(0);
    setShowTripEditor(true);
  };

  const deleteTrip = () => {
    if (!trip || trips.length === 1 || !window.confirm(`确定删除“${trip.name}”吗？此操作无法撤销。`)) return;
    const next = trips.filter((item) => item.id !== trip.id);
    setTrips(next);
    setActiveId(next[0].id);
    setSelectedDay(0);
  };

  const exportTrip = () => {
    if (!trip || !window.confirm("导出的行程文件包含高德地图 Key 与安全密钥，请仅分享给可信的人。继续导出吗？")) return;
    const blob = new Blob([JSON.stringify(trip, null, 2)], { type: "application/json;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${trip.name.replace(/[\\/:*?\"<>|]/g, "-")}.liqunaer.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    notify("行程文件已导出");
  };

  const importTrip = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text());
      if (![1, 2, 3, 4].includes(raw.schemaVersion) || !raw.name || !Array.isArray(raw.days) || !raw.amap) throw new Error("invalid");
      const imported = migrateTrip({ ...raw, id: uid("trip"), updatedAt: new Date().toISOString() });
      setTrips((items) => [...items, imported]);
      setActiveId(imported.id);
      setSelectedDay(0);
      notify(`已导入“${imported.name}”`);
      if (imported.amap.key) window.setTimeout(() => window.location.reload(), 700);
    } catch {
      notify("无法导入：文件格式不正确");
    }
  };

  const runSearch = (query = searchQuery) => {
    const keyword = query.trim();
    if (keyword.length < 2) return;
    if (!window.AMap || mapStatus !== "ready") {
      setSearchResults([]);
      setSearchOpen(true);
      return;
    }
    const sequence = ++searchSequenceRef.current;
    setSearching(true);
    const service = new window.AMap.PlaceSearch({ city: trip.city, citylimit: true, pageSize: 8, extensions: "all" });
    service.search(keyword, (status: string, result: any) => {
      if (sequence !== searchSequenceRef.current) return;
      setSearching(false);
      setActiveResult(-1);
      setSearchOpen(true);
      if (status !== "complete") return setSearchResults([]);
      setSearchResults((result?.poiList?.pois || []).filter((poi: any) => poi.location).map((poi: any) => ({
        id: poi.id || uid("poi"),
        name: poi.name,
        address: [poi.pname, poi.cityname, poi.adname, poi.address].filter(Boolean).join(" · "),
        location: [Number(poi.location.lng), Number(poi.location.lat)],
        type: inferPoiType(poi),
        website: poi.website || "",
        typecode: String(poi.typecode || ""),
      })));
    });
  };

  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    const timer = window.setTimeout(() => runSearch(searchQuery), 320);
    return () => window.clearTimeout(timer);
  }, [searchQuery, mapStatus, trip?.city]);

  useEffect(() => {
    const closeOnOutside = (event: globalThis.MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(event.target as Node)) setSearchOpen(false);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") setSearchOpen(false); };
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const selectPoiResult = (poi: PoiResult) => {
    const hub = poi.type === "railway" || poi.type === "airport";
    const duration = poi.type === "hotel" ? 0 : poi.type === "airport" ? 60 : poi.type === "railway" ? 30 : 90;
    const place = makePlace(poi.name, poi.address, poi.location, poi.type, duration);
    place.poiId = poi.id;
    if (poi.website.trim()) place.links = [{ id: uid("link"), name: "相关网页", url: poi.website.trim() }];
    place.checkInDate = day.date;
    place.checkOutDate = trip.endDate;
    if (hub) {
      updateDay((current) => {
        const stops = [...current.stops, place];
        return { ...current, stops, legs: normalizeLegs(stops, current.legs) };
      });
      setSearchOpen(false);
      setSearchQuery("");
      notify(`已自动识别为${typeLabels[poi.type]}并加入路线`);
      return;
    }
    setPlaceEditor({ kind: "new", place });
    setSearchOpen(false);
  };

  const handleSearchKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") return setSearchOpen(false);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSearchOpen(true);
      setActiveResult((value) => Math.min(searchResults.length - 1, value + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveResult((value) => Math.max(0, value - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (activeResult >= 0 && searchResults[activeResult]) selectPoiResult(searchResults[activeResult]);
      else runSearch();
    }
  };

  const savePlace = () => {
    if (!placeEditor) return;
    const place = normalizePlace(placeEditor.place);
    if (!place.name.trim() || !place.address.trim()) return notify("请填写地点名称和地址");
    if (place.links.some((link) => Boolean(link.name.trim()) !== Boolean(link.url.trim()))) return notify("请同时填写链接名称和网址，或删除空缺内容");
    place.links = place.links.map((link) => ({ ...link, name: link.name.trim(), url: link.url.trim() })).filter((link) => link.name && link.url);
    place.website = "";
    if (place.type === "hotel" && place.checkInDate && place.checkOutDate && place.checkInDate > place.checkOutDate) return notify("退房日期不能早于入住日期");
    updateTrip((current) => {
      let days = current.days;
      if (placeEditor.kind === "stop" && place.type !== "hotel") {
        return {
          ...current,
          days: days.map((item, index) => index === selectedDay ? { ...item, stops: item.stops.map((stop) => stop.id === place.id ? place : stop) } : item),
        };
      }
      if (placeEditor.kind === "stop") days = days.map((item) => {
        const stops = item.stops.filter((stop) => stop.id !== place.id);
        return { ...item, stops, legs: normalizeLegs(stops, item.legs) };
      });
      const hotels = hotelsFromDays(days).filter((hotel) => hotel.id !== place.id);
      if (place.type === "hotel") {
        days = applyHotelStays(days, [...hotels, place]);
      } else {
        days = applyHotelStays(days, hotels);
        days = days.map((item, index) => index === selectedDay ? { ...item, stops: [...item.stops, place], legs: normalizeLegs([...item.stops, place], item.legs) } : item);
      }
      return { ...current, days };
    });
    setPlaceEditor(null);
    notify(placeEditor.kind === "new" ? "地点卡片已加入行程" : "地点信息已保存");
  };

  const openStopEditor = (stop: Place) => setPlaceEditor({ kind: "stop", place: { ...stop } });
  const openHotelEditor = (hotel: Place) => setPlaceEditor({ kind: "hotel", place: { ...hotel } });

  const addPlaceLink = () => setPlaceEditor((current) => current ? { ...current, place: { ...current.place, links: [...current.place.links, { id: uid("link"), name: "", url: "" }] } } : null);
  const updatePlaceLink = (id: string, patch: Partial<PlaceLink>) => setPlaceEditor((current) => current ? { ...current, place: { ...current.place, links: current.place.links.map((link) => link.id === id ? { ...link, ...patch } : link) } } : null);
  const removePlaceLink = (id: string) => setPlaceEditor((current) => current ? { ...current, place: { ...current.place, links: current.place.links.filter((link) => link.id !== id) } } : null);

  const moveStop = (from: number, to: number) => {
    if (!day || from === to || to < 0 || to >= day.stops.length) return;
    updateDay((current) => {
      const stops = [...current.stops];
      const [moved] = stops.splice(from, 1);
      stops.splice(to, 0, moved);
      return { ...current, stops, legs: Array(stops.length + 1).fill("transit") };
    });
  };

  const startPointerSort = (event: ReactPointerEvent<HTMLButtonElement>, index: number) => {
    if (event.pointerType === "mouse") return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointerSortRef.current = { pointerId: event.pointerId, index };
    setDraggedIndex(index);
  };

  const updatePointerSort = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = pointerSortRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    event.preventDefault();
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-stop-index]");
    const targetIndex = Number(target?.dataset.stopIndex);
    if (Number.isInteger(targetIndex) && targetIndex !== current.index) {
      moveStop(current.index, targetIndex);
      current.index = targetIndex;
      setDraggedIndex(targetIndex);
    }
    const scrollArea = document.querySelector<HTMLElement>(".itinerary-content");
    if (!scrollArea) return;
    const bounds = scrollArea.getBoundingClientRect();
    if (event.clientY < bounds.top + 70) scrollArea.scrollBy({ top: -18 });
    else if (event.clientY > bounds.bottom - 70) scrollArea.scrollBy({ top: 18 });
  };

  const finishPointerSort = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (pointerSortRef.current?.pointerId !== event.pointerId) return;
    event.preventDefault();
    pointerSortRef.current = null;
    setDraggedIndex(null);
    try { event.currentTarget.releasePointerCapture?.(event.pointerId); } catch { /* Pointer capture may already be released. */ }
  };

  const cycleDrawerState = () => setDrawerState((current) => current === "collapsed" ? "half" : current === "half" ? "expanded" : "collapsed");

  const changeLeg = (index: number, mode: TravelMode) => updateDay((current) => ({ ...current, legs: current.legs.map((item, i) => i === index ? mode : item) }));

  const removeStop = (id: string) => {
    updateDay((current) => {
      const stops = current.stops.filter((stop) => stop.id !== id);
      return { ...current, stops, legs: normalizeLegs(stops, current.legs) };
    });
  };

  const toggleAllowedMode = (mode: TravelMode) => {
    updateDay((current) => {
      const exists = current.allowedModes.includes(mode);
      if (exists && current.allowedModes.length === 1) {
        notify("至少保留一种自动规划交通方式");
        return current;
      }
      return { ...current, allowedModes: exists ? current.allowedModes.filter((item) => item !== mode) : [...current.allowedModes, mode] };
    });
  };

  const editCardClick = (event: MouseEvent<HTMLElement>, stop: Place) => {
    if ((event.target as HTMLElement).closest("button,a,input,select")) return;
    openStopEditor(stop);
  };

  if (!hydrated || !trip || !day) return <main className="loading-screen"><div className="loading-mark">李</div><p>正在翻开你的旅行手账…</p></main>;

  return (
    <main className="app-shell">
      <PwaManager />
      <header className="topbar">
        <button className="brand" onClick={() => setShowTripEditor(true)} aria-label="编辑当前旅程">
          <span className="brand-stamp">李</span><span><b>李去哪儿</b><small>把期待，排进每一天</small></span>
        </button>
        <div className="trip-switcher">
          <select value={trip.id} onChange={(event) => { setActiveId(event.target.value); setSelectedDay(0); }} aria-label="切换旅程">
            {trips.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <button className="icon-button" onClick={newTrip} title="新建旅程">＋</button>
        </div>
        <nav className="top-actions" aria-label="行程操作">
          <input ref={fileRef} type="file" accept=".json,.liqunaer.json,application/json" hidden onChange={importTrip} />
          <button onClick={() => fileRef.current?.click()}>↥ <span>导入</span></button>
          <button onClick={exportTrip}>↧ <span>导出</span></button>
          <button onClick={() => setShowSettings(true)}>⚙ <span>地图设置</span></button>
        </nav>
      </header>

      <section className="hero-strip">
        <div><p className="eyebrow">下一站 · {trip.city || "等你决定"}</p><h1>{trip.name}</h1><p>{dateLabel(trip.startDate)} — {dateLabel(trip.endDate)} · {trip.days.length} 天旅程</p></div>
        <button className="ghost-button" onClick={() => setShowTripEditor(true)}>编辑旅程信息</button>
      </section>

      <section className={`planner-layout ${panelCollapsed ? "panel-collapsed" : ""} drawer-${drawerState}`}>
        <aside className="itinerary-panel">
          <div className="drawer-toolbar">
            <button className="drawer-grip" onClick={cycleDrawerState} aria-label="切换行程抽屉高度"><span /></button>
            <div className="drawer-heading"><b>今日行程</b><small>{day.stops.length} 个地点 · {dateLabel(day.date)}</small></div>
            <button className="drawer-add-trip" onClick={newTrip}>＋ 新建旅程</button>
            <button className="mobile-drawer-toggle" onClick={cycleDrawerState} aria-expanded={drawerState !== "collapsed"}>{drawerState === "collapsed" ? "展开" : drawerState === "half" ? "全屏" : "收起"}</button>
            <button className="desktop-panel-toggle" onClick={() => setPanelCollapsed((current) => !current)} aria-expanded={!panelCollapsed} aria-label={panelCollapsed ? "展开行程面板" : "收起行程面板"}>{panelCollapsed ? "›" : "‹"}</button>
          </div>
          <div className="itinerary-content">
          <div className="day-tabs" role="tablist" aria-label="选择日期">
            {trip.days.map((item, index) => <button key={item.date} className={index === selectedDay ? "active" : ""} onClick={() => { setSelectedDay(index); setRouteMetrics([]); }}><span>DAY {index + 1}</span><b>{dateLabel(item.date)}</b><small>周{weekday(item.date)}</small></button>)}
          </div>

          <div className="route-planner-box">
            <div className="route-planner-head"><div><span className={`status-dot ${routeNotice.startsWith("路线未授权") ? "warning" : ""}`} /><b>智能路线规划</b><small className={routeNotice.startsWith("路线未授权") ? "route-notice-warning" : ""}>{mapStatus === "ready" ? (routeNotice || "正在连接高德路线服务…") : "当前采用本地预估"}</small></div><button onClick={() => {
              if (!day.startHotel) return notify("请先添加并设置当天出发酒店");
              if (day.returnToHotel && !day.endHotel) return notify("请先设置当晚酒店，或关闭最终酒店路段");
              const result = optimizeDay(day);
              updateDay((current) => ({ ...current, ...result }));
              notify(`已按${day.optimizeBy === "time" ? "时间" : "路程"}优先重新规划`);
            }}>✦ 开始规划</button></div>
            <div className="planning-row">
              <span>规划目标</span>
              <div className="segmented"><button className={day.optimizeBy === "time" ? "active" : ""} onClick={() => updateDay((current) => ({ ...current, optimizeBy: "time" }))}>时间优先</button><button className={day.optimizeBy === "distance" ? "active" : ""} onClick={() => updateDay((current) => ({ ...current, optimizeBy: "distance" }))}>路程优先</button></div>
              <label className="return-toggle"><input type="checkbox" checked={day.returnToHotel} onChange={(event) => updateDay((current) => ({ ...current, returnToHotel: event.target.checked }))} /><span />{endHotelAction}</label>
            </div>
            <div className="planning-row mode-picker"><span>自动规划可用</span><div>{allModes.map((mode) => <button key={mode} className={`mode-option mode-${mode} ${day.allowedModes.includes(mode) ? "active" : ""}`} onClick={() => toggleAllowedMode(mode)}>{modeIcons[mode]} {modeLabels[mode]}</button>)}</div></div>
          </div>

          <div className="timeline">
            <div className={`hotel-card start ${day.startHotel ? "clickable" : ""}`} onClick={() => day.startHotel && openHotelEditor(day.startHotel)}>
              <span className="timeline-icon">{typeIcons.hotel}</span>
              <div><small>08:30 · 出发酒店</small><b>{day.startHotel?.name || "还没有设置出发酒店"}</b><p>{day.startHotel ? cardDetail(day.startHotel) || day.startHotel.address : "添加酒店后，会按入住与退房日期自动安排"}</p></div>
              {day.startHotel && <PlaceLinkButtons place={day.startHotel} city={trip.city} />}
            </div>

            {day.stops.map((stop, index) => {
              const timing = schedule[index];
              const metric = effectiveMetrics[index];
              const legMode = day.legs[index] || "transit";
              return <div key={stop.id}>
                <div className={`leg-row mode-${legMode}`}><span>{modeIcons[legMode]}</span><select value={legMode} onChange={(event) => changeLeg(index, event.target.value as TravelMode)} aria-label={`前往${stop.name}的交通方式`}>{allModes.map((mode) => <option key={mode} value={mode}>{modeLabels[mode]}</option>)}</select><i /><small>{routeBrief(metric, legMode)}</small>{legMode === "transit" && <em className="leg-period">{routePeriod(metric)}</em>}{(legMode === "transit" || legMode === "taxi") && <em className="leg-cost">{routeCost(metric, legMode)}</em>}</div>
                <article data-stop-index={index} className={`stop-card ${timing?.late ? "conflict" : ""} ${draggedIndex === index ? "sorting" : ""}`} draggable onClick={(event) => editCardClick(event, stop)} onDragStart={(event: DragEvent) => { event.dataTransfer.effectAllowed = "move"; setDraggedIndex(index); }} onDragEnd={() => setDraggedIndex(null)} onDragOver={(event: DragEvent) => event.preventDefault()} onDrop={() => { if (draggedIndex !== null) moveStop(draggedIndex, index); setDraggedIndex(null); }}>
                  <button className="drag-handle" aria-label={`拖动${stop.name}调整顺序`} onPointerDown={(event) => startPointerSort(event, index)} onPointerMove={updatePointerSort} onPointerUp={finishPointerSort} onPointerCancel={finishPointerSort}>⠿</button><span className="stop-number">{index + 1}</span>
                  <div className="stop-main">
                    <div className="stop-title"><span>{typeIcons[stop.type]}</span><b>{stop.name}</b></div>
                    <p>{stop.address}</p><div className="card-detail-line">{cardDetail(stop) || "点击卡片完善地点信息与备注"}</div>
                    {stop.notes && <div className="card-notes">“{stop.notes}”</div>}
                    <small className="arrival-line">预计 {formatClock(timing?.arrival || 0)} 到达 · {formatClock(timing?.departure || 0)} 离开</small>
                    {Boolean(timing?.late) && <div className="conflict-note">预计迟到 {timing.late} 分钟，请调整前序地点或交通方式</div>}
                  </div>
                  <div className="card-actions">
                    <PlaceLinkButtons place={stop} city={trip.city} />
                    <button className="delete-stop" onClick={() => removeStop(stop.id)} aria-label={`删除${stop.name}`} title="删除地点">×</button>
                    <div className="move-buttons" aria-label="调整地点顺序"><button onClick={() => moveStop(index, index - 1)} disabled={index === 0} aria-label={`上移${stop.name}`} title="上移">↑</button><button onClick={() => moveStop(index, index + 1)} disabled={index === day.stops.length - 1} aria-label={`下移${stop.name}`} title="下移">↓</button></div>
                  </div>
                </article>
              </div>;
            })}

            {day.returnToHotel && day.endHotel && day.stops.length > 0 && <div className={`leg-row return-leg mode-${day.legs[day.stops.length] || "transit"}`}><span>{modeIcons[day.legs[day.stops.length] || "transit"]}</span><select value={day.legs[day.stops.length] || "transit"} onChange={(event) => changeLeg(day.stops.length, event.target.value as TravelMode)} aria-label={`${endHotelAction}的交通方式`}>{allModes.map((mode) => <option key={mode} value={mode}>{modeLabels[mode]}</option>)}</select><i /><small>{routeBrief(effectiveMetrics[day.stops.length], day.legs[day.stops.length] || "transit")}</small>{(day.legs[day.stops.length] || "transit") === "transit" && <em className="leg-period">{routePeriod(effectiveMetrics[day.stops.length])}</em>}{(["transit", "taxi"] as TravelMode[]).includes(day.legs[day.stops.length] || "transit") && <em className="leg-cost">{routeCost(effectiveMetrics[day.stops.length], day.legs[day.stops.length] || "transit")}</em>}</div>}
            <div className={`hotel-card finish ${day.returnToHotel && day.endHotel ? "clickable" : ""}`} onClick={() => day.returnToHotel && day.endHotel && openHotelEditor(day.endHotel)}><span className="timeline-icon">{day.returnToHotel ? "🌙" : "🏁"}</span><div><small>{day.returnToHotel ? (returnTime ? formatClock(returnTime) : "—") : (schedule.at(-1) ? formatClock(schedule.at(-1)!.departure) : "—")} · {day.returnToHotel ? "当晚酒店" : "行程结束"}</small><b>{day.returnToHotel ? day.endHotel?.name || "还没有设置当晚酒店" : day.stops.at(-1)?.name || "今天的终点"}</b><p>{day.returnToHotel ? (differentHotels ? "今天换一家住处，路线已计入前往酒店的时间" : "结束充实的一天，好好休息") : "本次规划不计算前往当晚酒店的路线"}</p></div>{day.returnToHotel && day.endHotel && <PlaceLinkButtons place={day.endHotel} city={trip.city} />}</div>
          </div>
          </div>
        </aside>

        <section className="map-panel">
          <div ref={mapRef} className="map-canvas" aria-label="高德地图路线区域" />
          {mapStatus !== "ready" && <div className="map-fallback"><div className="paper-map-grid" /><div className="demo-route"><span className="pin p1">住</span><i /><span className="pin p2">1</span><i /><span className="pin p3">2</span><i /><span className="pin p4">3</span></div><div className="map-message"><b>{mapStatus === "error" ? "地图加载失败" : "连接高德地图，开始规划"}</b><p>填写 Web端 Key 与安全密钥后，可搜索真实地点并显示逐段路线。</p><button onClick={() => setShowSettings(true)}>设置地图密钥</button></div></div>}

          <div className="search-box" ref={searchBoxRef}>
            <div className={`search-input ${searchOpen ? "open" : ""}`}><span>⌕</span><input value={searchQuery} onFocus={() => searchQuery.trim().length >= 2 && setSearchOpen(true)} onChange={(event) => { setSearchQuery(event.target.value); setSearchOpen(true); }} onKeyDown={handleSearchKey} placeholder={`在${trip.city || "目的地"}输入地点名称或地址`} aria-autocomplete="list" aria-expanded={searchOpen} /><span className="search-state">{searching ? "搜索中…" : searchQuery.trim().length === 1 ? "再输入1个字" : ""}</span>{searchOpen && <button className="close-results" onClick={() => setSearchOpen(false)} aria-label="关闭搜索结果">×</button>}</div>
            {searchOpen && searchQuery.trim().length >= 2 && <div className="search-results" role="listbox">
              {mapStatus !== "ready" ? <div className="search-empty"><span>🗺️</span><div><b>请先连接高德地图</b><small>设置 Web端 Key 后即可显示地址联想</small></div><button onClick={() => setShowSettings(true)}>去设置</button></div> : searching ? <div className="search-empty"><span>⌛</span><div><b>正在查找相关地点</b><small>结果会自动出现在这里</small></div></div> : searchResults.length ? searchResults.map((poi, index) => <button className={`search-result-row ${index === activeResult ? "active" : ""}`} key={poi.id} onMouseEnter={() => setActiveResult(index)} onClick={() => selectPoiResult(poi)} role="option" aria-selected={index === activeResult}><span>{typeIcons[poi.type]}</span><div><b>{poi.name}</b><small>{poi.address}</small></div><em>{poi.type === "railway" || poi.type === "airport" ? "直接加入 →" : "添加地址 →"}</em></button>) : <div className="search-empty"><span>⌕</span><div><b>没有找到相关地点</b><small>试试更完整的名称或地址</small></div></div>}
            </div>}
          </div>

          <div className="map-summary"><div><small>今日地点</small><b>{day.stops.length}</b></div><i /><div><small>交通耗时</small><b>{Math.floor(totalTravel / 60)}h {totalTravel % 60}m</b></div><i /><div><small>总路程</small><b>{totalDistance.toFixed(1)} km</b></div><i /><div><small>公共交通/打车</small><b>{costSummary}</b></div></div>
          <div className="route-legend" aria-label="地图路线颜色说明"><span><i className="route-swatch taxi" />打车</span><span><i className="route-swatch driving" />自驾</span><span><i className="route-swatch walking" />步行</span><span><i className="route-swatch riding" />骑行</span><span><i className="route-swatch transit" />公交</span><span><i className="route-swatch subway" />地铁线路色</span></div>
        </section>
      </section>

      {placeEditor && <div className="modal-backdrop" onMouseDown={() => setPlaceEditor(null)}><section className="modal place-editor-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="place-editor-title"><button className="modal-close" onClick={() => setPlaceEditor(null)}>×</button><p className="eyebrow">{placeEditor.kind === "new" ? "完善地点卡片" : "编辑地点卡片"}</p><h2 id="place-editor-title">{placeEditor.place.name}</h2><p className="modal-lead">先确认地点类型，再补充对这次旅行真正有用的信息。</p>
        <div className="place-type-picker">{(Object.keys(typeLabels) as PlaceType[]).map((type) => <button key={type} className={placeEditor.place.type === type ? "active" : ""} onClick={() => setPlaceEditor((current) => current ? { ...current, place: { ...current.place, type } } : null)}><span>{typeIcons[type]}</span>{typeLabels[type]}</button>)}</div>
        <div className="editor-grid"><label>地点名称<input value={placeEditor.place.name} onChange={(event) => setPlaceEditor({ ...placeEditor, place: { ...placeEditor.place, name: event.target.value } })} /></label><label>地址<input value={placeEditor.place.address} onChange={(event) => setPlaceEditor({ ...placeEditor, place: { ...placeEditor.place, address: event.target.value } })} /></label></div>
        {placeEditor.place.type === "hotel" && <><div className="date-pair"><label>入住日期<input type="date" value={placeEditor.place.checkInDate || day.date} onChange={(event) => setPlaceEditor({ ...placeEditor, place: { ...placeEditor.place, checkInDate: event.target.value } })} /></label><label>退房日期<input type="date" value={placeEditor.place.checkOutDate || trip.endDate} onChange={(event) => setPlaceEditor({ ...placeEditor, place: { ...placeEditor.place, checkOutDate: event.target.value } })} /></label></div><div className="editor-grid"><label>房型<input value={placeEditor.place.roomType} onChange={(event) => setPlaceEditor({ ...placeEditor, place: { ...placeEditor.place, roomType: event.target.value } })} placeholder="例如：双床房" /></label><label>每晚价格<input type="number" min="0" value={placeEditor.place.price ?? ""} onChange={(event) => setPlaceEditor({ ...placeEditor, place: { ...placeEditor.place, price: event.target.value ? Number(event.target.value) : null } })} placeholder="元" /></label><label>预订状态<select value={placeEditor.place.bookingStatus} onChange={(event) => setPlaceEditor({ ...placeEditor, place: { ...placeEditor.place, bookingStatus: event.target.value } })}><option>待预订</option><option>已预订</option><option>已确认</option></select></label></div></>}
        {placeEditor.place.type === "food" && <div className="editor-grid"><label>用餐时间<input type="time" value={placeEditor.place.mealTime} onChange={(event) => setPlaceEditor({ ...placeEditor, place: { ...placeEditor.place, mealTime: event.target.value, fixedTime: event.target.value } })} /></label><label>人均价格<input type="number" min="0" value={placeEditor.place.perCapita ?? ""} onChange={(event) => setPlaceEditor({ ...placeEditor, place: { ...placeEditor.place, perCapita: event.target.value ? Number(event.target.value) : null } })} placeholder="元" /></label><label>预约状态<select value={placeEditor.place.reservationStatus} onChange={(event) => setPlaceEditor({ ...placeEditor, place: { ...placeEditor.place, reservationStatus: event.target.value } })}><option>未预约</option><option>待确认</option><option>已预约</option></select></label></div>}
        {placeEditor.place.type === "sight" && <div className="editor-grid"><label>固定到达<input type="time" value={placeEditor.place.fixedTime} onChange={(event) => setPlaceEditor({ ...placeEditor, place: { ...placeEditor.place, fixedTime: event.target.value } })} /></label><label>预计停留<select value={placeEditor.place.durationMinutes} onChange={(event) => setPlaceEditor({ ...placeEditor, place: { ...placeEditor.place, durationMinutes: Number(event.target.value) } })}>{[30,45,60,75,90,120,150,180,240].map((value) => <option key={value} value={value}>{durationLabel(value)}</option>)}</select></label><label>门票价格<input type="number" min="0" value={placeEditor.place.ticketPrice ?? ""} onChange={(event) => setPlaceEditor({ ...placeEditor, place: { ...placeEditor.place, ticketPrice: event.target.value ? Number(event.target.value) : null } })} placeholder="元" /></label></div>}
        {(placeEditor.place.type === "railway" || placeEditor.place.type === "airport") && <div className="editor-grid"><label>固定到达<input type="time" value={placeEditor.place.fixedTime} onChange={(event) => setPlaceEditor({ ...placeEditor, place: { ...placeEditor.place, fixedTime: event.target.value } })} /></label><label>预计停留<select value={placeEditor.place.durationMinutes} onChange={(event) => setPlaceEditor({ ...placeEditor, place: { ...placeEditor.place, durationMinutes: Number(event.target.value) } })}>{[15,30,45,60,75,90,120,150,180].map((value) => <option key={value} value={value}>{durationLabel(value)}</option>)}</select></label></div>}
        {(placeEditor.place.type === "shopping" || placeEditor.place.type === "other") && <div className="editor-grid"><label>固定到达<input type="time" value={placeEditor.place.fixedTime} onChange={(event) => setPlaceEditor({ ...placeEditor, place: { ...placeEditor.place, fixedTime: event.target.value } })} /></label><label>预计停留<select value={placeEditor.place.durationMinutes} onChange={(event) => setPlaceEditor({ ...placeEditor, place: { ...placeEditor.place, durationMinutes: Number(event.target.value) } })}>{[30,45,60,75,90,120,150,180,240].map((value) => <option key={value} value={value}>{durationLabel(value)}</option>)}</select></label><label>预计花费<input type="number" min="0" value={placeEditor.place.plannedSpend ?? ""} onChange={(event) => setPlaceEditor({ ...placeEditor, place: { ...placeEditor.place, plannedSpend: event.target.value ? Number(event.target.value) : null } })} placeholder="元" /></label></div>}
        {placeEditor.place.type === "food" && <label>预计停留<select value={placeEditor.place.durationMinutes} onChange={(event) => setPlaceEditor({ ...placeEditor, place: { ...placeEditor.place, durationMinutes: Number(event.target.value) } })}>{[30,45,60,75,90,120,150,180,240].map((value) => <option key={value} value={value}>{durationLabel(value)}</option>)}</select></label>}
        <section className="link-editor"><div className="link-editor-head"><div><b>相关链接</b><small>可添加购票、预约、菜单等按钮；留空时默认打开高德地图</small></div><button onClick={addPlaceLink}>＋ 添加链接</button></div>{placeEditor.place.links.length ? <div className="link-editor-list">{placeEditor.place.links.map((link) => <div className="link-editor-row" key={link.id}><label>按钮名称<input value={link.name} onChange={(event) => updatePlaceLink(link.id, { name: event.target.value })} placeholder="例如：景区购票" /></label><label>网址<input value={link.url} onChange={(event) => updatePlaceLink(link.id, { url: event.target.value })} placeholder="https://..." /></label><button className="remove-link" onClick={() => removePlaceLink(link.id)} aria-label={`删除${link.name || "此链接"}`}>×</button></div>)}</div> : <div className="link-editor-empty">尚未添加自定义链接，卡片将打开该地点的高德地图页面。</div>}</section><label>备注<textarea value={placeEditor.place.notes} onChange={(event) => setPlaceEditor({ ...placeEditor, place: { ...placeEditor.place, notes: event.target.value } })} placeholder="预约号、必点菜、入口位置、同行提醒……" rows={3} /></label>
        <div className="modal-actions"><a className="preview-link" href={resolvedPlaceLinks(placeEditor.place, trip.city)[0].url} target="_blank" rel="noreferrer">预览首个链接 ↗</a><button className="primary-button" onClick={savePlace}>保存地点卡片</button></div></section></div>}

      {showSettings && <div className="modal-backdrop" onMouseDown={() => setShowSettings(false)}><section className="modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="settings-title"><button className="modal-close" onClick={() => setShowSettings(false)}>×</button><p className="eyebrow">地图连接</p><h2 id="settings-title">连接高德地图</h2><p className="modal-lead">密钥仅保存在当前浏览器与导出的行程文件中。导出文件会包含明文密钥，请仅分享给可信的人。</p><label>Web端（JS API）Key<input value={trip.amap.key} onChange={(event) => updateTrip((current) => ({ ...current, amap: { ...current.amap, key: event.target.value.trim() } }))} placeholder="请输入 Key" autoComplete="off" /></label><label>安全密钥 securityJsCode<input type="password" value={trip.amap.securityJsCode} onChange={(event) => updateTrip((current) => ({ ...current, amap: { ...current.amap, securityJsCode: event.target.value.trim() } }))} placeholder="请输入安全密钥" autoComplete="off" /></label><div className="security-note">🔒 当前仅显示与保存在本机；连接地图时高德服务仍会在浏览器中使用这些值。</div><div className="modal-actions"><button className="text-button" onClick={() => updateTrip((current) => ({ ...current, amap: { key: "", securityJsCode: "" } }))}>清除密钥</button><button className="primary-button" onClick={() => { setShowSettings(false); notify("地图配置已保存，正在重新连接"); window.setTimeout(() => window.location.reload(), 500); }}>保存并连接</button></div></section></div>}

      {showTripEditor && <div className="modal-backdrop" onMouseDown={() => setShowTripEditor(false)}><section className="modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="trip-title"><button className="modal-close" onClick={() => setShowTripEditor(false)}>×</button><p className="eyebrow">旅行档案</p><h2 id="trip-title">这次，要去哪儿？</h2><label>旅程名称<input value={trip.name} onChange={(event) => updateTrip((current) => ({ ...current, name: event.target.value }))} /></label><label>目的城市<input value={trip.city} onChange={(event) => updateTrip((current) => ({ ...current, city: event.target.value }))} placeholder="例如：成都" /></label><div className="date-pair"><label>出发日期<input type="date" value={trip.startDate} onChange={(event) => updateTrip((current) => ({ ...current, startDate: event.target.value }))} /></label><label>结束日期<input type="date" value={trip.endDate} onChange={(event) => updateTrip((current) => ({ ...current, endDate: event.target.value }))} /></label></div><div className="modal-actions"><button className="text-button danger" onClick={deleteTrip} disabled={trips.length === 1}>删除旅程</button><button className="primary-button" onClick={saveTripDates}>保存旅程</button></div></section></div>}

      {toast && <div className="toast" role="status">✓ {toast}</div>}
    </main>
  );
}
