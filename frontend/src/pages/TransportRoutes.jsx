import React, { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  MapPin, Factory, Plus, Trash2, Route as RouteIcon, Save, Search, Loader2, ListChecks, Map as MapIcon, Satellite,
} from "lucide-react";

// Marker icon setup — react-leaflet's default markers 404 without this shim.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// Small numbered pin — draws the visit order (1,2,3,…) over each stop.
const numberedIcon = (n, color = "#E65100") =>
  L.divIcon({
    className: "",
    html: `<div style="background:${color};color:white;width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.35);border:2px solid white"><span style="transform:rotate(45deg);font-weight:800;font-size:12px;font-family:system-ui">${n}</span></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 26],
  });

const factoryIcon = L.divIcon({
  className: "",
  html: `<div style="background:#111827;color:white;width:32px;height:32px;border-radius:6px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.4);border:2px solid #fbbf24"><span style="font-weight:900;font-size:10px;letter-spacing:.5px">JK</span></div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

// Decode a Google-style encoded polyline (OSRM's default).
function decodePolyline(str, precision = 5) {
  if (!str) return [];
  let index = 0, lat = 0, lng = 0;
  const coordinates = [];
  const factor = Math.pow(10, precision);
  while (index < str.length) {
    let result = 0, shift = 0, b;
    do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    result = 0; shift = 0;
    do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    coordinates.push([lat / factor, lng / factor]);
  }
  return coordinates;
}

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points || points.length === 0) return;
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
  }, [points, map]);
  return null;
}

const emptyStop = { customer: "", material: "", destination: "", lat: null, lng: null };

export default function TransportRoutes() {
  const [factory, setFactory] = useState({ lat: 30.8978257, lng: 75.8528076, label: "JK Products Factory" });
  const [stops, setStops] = useState([]);
  const [draft, setDraft] = useState({ ...emptyStop });
  const [suggests, setSuggests] = useState([]);
  const [geocoding, setGeocoding] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [result, setResult] = useState(null); // {order, total_distance_km, total_duration_min, geometry, engine}
  const [routes, setRoutes] = useState([]);
  const [saving, setSaving] = useState(false);
  const [routeName, setRouteName] = useState("");
  const [mapStyle, setMapStyle] = useState("map"); // "map" | "satellite"
  const geocodeTimer = useRef(null);

  const loadFactory = async () => {
    try {
      const f = await api.get("/transport/factory");
      if (f?.data) setFactory(f.data);
    } catch (_) {}
  };
  const loadRoutes = async () => {
    try {
      const r = await api.get("/transport/routes");
      setRoutes(r.data || []);
    } catch (_) {}
  };
  useEffect(() => { loadFactory(); loadRoutes(); }, []);

  // Debounced address suggest as the operator types the destination.
  useEffect(() => {
    if (geocodeTimer.current) clearTimeout(geocodeTimer.current);
    const q = (draft.destination || "").trim();
    if (q.length < 3) { setSuggests([]); return; }
    geocodeTimer.current = setTimeout(async () => {
      try {
        setGeocoding(true);
        const r = await api.post("/transport/geocode", { q });
        setSuggests(r.data?.results || []);
      } catch (e) {
        setSuggests([]);
      } finally {
        setGeocoding(false);
      }
    }, 500);
    return () => geocodeTimer.current && clearTimeout(geocodeTimer.current);
  }, [draft.destination]);

  const pickSuggest = (s) => {
    setDraft((d) => ({ ...d, destination: s.display_name, lat: s.lat, lng: s.lng }));
    setSuggests([]);
  };

  const addStop = () => {
    if (!draft.customer.trim() || !draft.material.trim() || !draft.destination.trim()) {
      toast.error("Customer, material and destination are all required.");
      return;
    }
    if (draft.lat == null || draft.lng == null) {
      toast.error("Pick an address from the suggestions so we can place a pin.");
      return;
    }
    setStops((prev) => [...prev, { ...draft }]);
    setDraft({ ...emptyStop });
    setSuggests([]);
    setResult(null);
  };

  const removeStop = (i) => {
    setStops((prev) => prev.filter((_, j) => j !== i));
    setResult(null);
  };

  const optimize = async () => {
    if (stops.length === 0) {
      toast.error("Add at least one destination first.");
      return;
    }
    try {
      setOptimizing(true);
      const r = await api.post("/transport/optimize", { stops });
      setResult(r.data);
      toast.success(
        r.data.engine === "osrm"
          ? `Best route: ${r.data.total_distance_km} km · ~${Math.round(r.data.total_duration_min || 0)} min`
          : `Ordered by nearest-first (approx): ${r.data.total_distance_km} km`
      );
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not calculate route");
    } finally {
      setOptimizing(false);
    }
  };

  const saveRoute = async () => {
    if (!routeName.trim()) { toast.error("Give this route a name to save it."); return; }
    if (stops.length === 0) { toast.error("Add stops first."); return; }
    try {
      setSaving(true);
      const payload = {
        name: routeName.trim(),
        stops,
        optimized_order: result?.order || null,
        total_distance_km: result?.total_distance_km ?? null,
        total_duration_min: result?.total_duration_min ?? null,
        geometry: result?.geometry || null,
      };
      await api.post("/transport/routes", payload);
      toast.success("Route saved.");
      setRouteName("");
      loadRoutes();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const loadSaved = (r) => {
    setStops(r.stops || []);
    setResult({
      order: r.optimized_order || null,
      total_distance_km: r.total_distance_km,
      total_duration_min: r.total_duration_min,
      geometry: r.geometry || "",
      engine: r.geometry ? "osrm" : "haversine",
    });
    setRouteName(r.name);
    toast.success(`Loaded "${r.name}"`);
  };

  const deleteSaved = async (r) => {
    if (!window.confirm(`Delete route "${r.name}"?`)) return;
    try {
      await api.delete(`/transport/routes/${r.id}`);
      toast.success("Deleted");
      loadRoutes();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Delete failed");
    }
  };

  // Order the stops per the optimizer's result (falls back to input order).
  const orderedStops = useMemo(() => {
    if (!result?.order || result.order.length !== stops.length) return stops;
    return result.order.map((i) => stops[i]);
  }, [stops, result]);

  const geometry = useMemo(() => decodePolyline(result?.geometry || ""), [result?.geometry]);

  const mapPoints = useMemo(() => [factory, ...stops], [factory, stops]);

  return (
    <div className="space-y-4" data-testid="transport-routes-page">
      {/* Form panel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-sm p-4">
          <div className="text-[10px] uppercase tracking-[0.15em] text-[#E65100] font-bold mb-1">
            Add a destination
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-bold uppercase">Customer</Label>
              <Input
                value={draft.customer}
                onChange={(e) => setDraft((d) => ({ ...d, customer: e.target.value }))}
                placeholder="e.g. Sharma Auto Parts"
                className="h-10 rounded-sm mt-1"
                data-testid="tr-customer"
              />
            </div>
            <div>
              <Label className="text-xs font-bold uppercase">Material</Label>
              <Input
                value={draft.material}
                onChange={(e) => setDraft((d) => ({ ...d, material: e.target.value }))}
                placeholder="e.g. Center Stand with Kit"
                className="h-10 rounded-sm mt-1"
                data-testid="tr-material"
              />
            </div>
          </div>
          <div className="mt-3 relative">
            <Label className="text-xs font-bold uppercase">Destination</Label>
            <div className="relative mt-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <Input
                value={draft.destination}
                onChange={(e) => setDraft((d) => ({ ...d, destination: e.target.value, lat: null, lng: null }))}
                placeholder="Type an address, city or landmark…"
                className="h-10 rounded-sm pl-9"
                data-testid="tr-destination"
              />
              {geocoding && (
                <Loader2 className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin" />
              )}
            </div>
            {suggests.length > 0 && (
              <div className="absolute z-[500] left-0 right-0 mt-1 bg-white border border-slate-200 rounded-sm shadow-lg max-h-60 overflow-auto">
                {suggests.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => pickSuggest(s)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-orange-50 flex items-start gap-2 border-b last:border-b-0 border-slate-100"
                    data-testid={`tr-suggest-${i}`}
                  >
                    <MapPin className="w-4 h-4 text-[#E65100] shrink-0 mt-0.5" />
                    <span className="text-slate-700">{s.display_name}</span>
                  </button>
                ))}
              </div>
            )}
            {draft.lat != null && (
              <div className="text-[11px] text-emerald-700 mt-1 font-mono-num">
                Pinned at {Number(draft.lat).toFixed(4)}, {Number(draft.lng).toFixed(4)}
              </div>
            )}
          </div>
          <div className="mt-3 flex justify-end">
            <Button
              onClick={addStop}
              className="h-10 rounded-sm bg-[#E65100] hover:bg-[#c94500] text-white"
              data-testid="tr-add-stop"
            >
              <Plus className="w-4 h-4 mr-1.5" /> Add stop
            </Button>
          </div>
        </div>

        {/* Stops list + actions */}
        <div className="bg-white border border-slate-200 rounded-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] uppercase tracking-[0.15em] text-[#E65100] font-bold">
              Route stops ({stops.length})
            </div>
            {result && (
              <div className="text-[11px] font-bold text-slate-700">
                Total: <span className="text-[#E65100] font-mono-num">{result.total_distance_km} km</span>
                {result.total_duration_min ? (
                  <> · <span className="font-mono-num">~{Math.round(result.total_duration_min)} min</span></>
                ) : null}
                <span className="ml-1 text-slate-400 text-[10px]">({result.engine})</span>
              </div>
            )}
          </div>
          {stops.length === 0 ? (
            <div className="text-sm text-slate-400 text-center py-8 border border-dashed border-slate-200 rounded-sm">
              No stops yet — add one on the left.
            </div>
          ) : (
            <div className="space-y-1.5 max-h-72 overflow-auto pr-1">
              {orderedStops.map((s, i) => (
                <div
                  key={`${s.customer}-${i}`}
                  className="flex items-start gap-2 border border-slate-200 rounded-sm px-2.5 py-2 bg-slate-50"
                  data-testid={`tr-stop-row-${i}`}
                >
                  <span className="mt-0.5 shrink-0 w-6 h-6 rounded-full bg-[#E65100] text-white text-[11px] font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-slate-900 truncate">{s.customer}</div>
                    <div className="text-[11px] text-slate-600 truncate">{s.material}</div>
                    <div className="text-[11px] text-slate-500 truncate">{s.destination}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeStop(stops.indexOf(s))}
                    className="text-slate-400 hover:text-red-600 shrink-0 mt-1"
                    aria-label="Remove"
                    data-testid={`tr-remove-${i}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              onClick={optimize}
              disabled={optimizing || stops.length === 0}
              className="h-10 rounded-sm bg-slate-900 hover:bg-slate-800 text-white"
              data-testid="tr-optimize"
            >
              {optimizing ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <RouteIcon className="w-4 h-4 mr-1.5" />}
              Calculate best route
            </Button>
            <div className="flex-1 min-w-[180px]">
              <Input
                value={routeName}
                onChange={(e) => setRouteName(e.target.value)}
                placeholder="Name this route (to save)"
                className="h-10 rounded-sm"
                data-testid="tr-route-name"
              />
            </div>
            <Button
              onClick={saveRoute}
              disabled={saving || stops.length === 0 || !routeName.trim()}
              variant="outline"
              className="h-10 rounded-sm border-slate-300"
              data-testid="tr-save"
            >
              {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
              Save route
            </Button>
          </div>
        </div>
      </div>

      {/* Map */}
      <div className="bg-white border border-slate-200 rounded-sm overflow-hidden">
        <div className="px-4 py-2 border-b border-slate-200 flex items-center gap-2 flex-wrap">
          <Factory className="w-4 h-4 text-slate-700" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Map · Factory + destinations
          </span>
          <span className="text-[10px] text-slate-400 font-mono-num">
            {factory.lat.toFixed(4)}, {factory.lng.toFixed(4)}
          </span>
          <div className="ml-auto inline-flex rounded-sm border border-slate-200 overflow-hidden" role="tablist">
            <button
              type="button"
              onClick={() => setMapStyle("map")}
              className={`px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider inline-flex items-center gap-1 ${mapStyle === "map" ? "bg-[#E65100] text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
              data-testid="tr-map-style-map"
            >
              <MapIcon className="w-3.5 h-3.5" /> Map
            </button>
            <button
              type="button"
              onClick={() => setMapStyle("satellite")}
              className={`px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider inline-flex items-center gap-1 border-l border-slate-200 ${mapStyle === "satellite" ? "bg-[#E65100] text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
              data-testid="tr-map-style-satellite"
            >
              <Satellite className="w-3.5 h-3.5" /> Satellite
            </button>
          </div>
        </div>
        <div style={{ height: 460 }} data-testid="tr-map">
          <MapContainer
            center={[factory.lat, factory.lng]}
            zoom={10}
            style={{ height: "100%", width: "100%" }}
            scrollWheelZoom
          >
            {mapStyle === "map" ? (
              <TileLayer
                key="osm-standard"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                maxZoom={19}
              />
            ) : (
              <>
                <TileLayer
                  key="esri-imagery"
                  attribution="Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community"
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                  maxZoom={19}
                />
                <TileLayer
                  key="esri-ref"
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
                  maxZoom={19}
                />
              </>
            )}
            <Marker position={[factory.lat, factory.lng]} icon={factoryIcon}>
              <Popup><b>Factory</b><br />{factory.label}</Popup>
            </Marker>
            {orderedStops.map((s, i) => (
              <Marker
                key={`${s.lat}-${s.lng}-${i}`}
                position={[s.lat, s.lng]}
                icon={numberedIcon(i + 1)}
              >
                <Popup>
                  <b>#{i + 1} · {s.customer}</b><br />
                  {s.material}<br />
                  <span style={{ color: "#64748b" }}>{s.destination}</span>
                </Popup>
              </Marker>
            ))}
            {geometry.length > 1 && (
              <Polyline positions={geometry} pathOptions={{ color: "#E65100", weight: 5, opacity: 0.85 }} />
            )}
            {geometry.length === 0 && orderedStops.length > 0 && (
              // Fallback visual — draw straight lines factory → stops in order.
              <Polyline
                positions={[[factory.lat, factory.lng], ...orderedStops.map((s) => [s.lat, s.lng])]}
                pathOptions={{ color: "#E65100", weight: 3, opacity: 0.6, dashArray: "6 6" }}
              />
            )}
            <FitBounds points={mapPoints} />
          </MapContainer>
        </div>
      </div>

      {/* Saved routes */}
      <div className="bg-white border border-slate-200 rounded-sm p-4">
        <div className="flex items-center gap-2 mb-2">
          <ListChecks className="w-4 h-4 text-slate-700" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Saved routes ({routes.length})
          </span>
        </div>
        {routes.length === 0 ? (
          <div className="text-sm text-slate-400 py-4">Nothing saved yet.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {routes.map((r) => (
              <div key={r.id} className="border border-slate-200 rounded-sm px-3 py-2 flex items-start gap-2" data-testid={`tr-saved-${r.id}`}>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-slate-900 truncate">{r.name}</div>
                  <div className="text-[11px] text-slate-500">
                    {(r.stops || []).length} stops
                    {r.total_distance_km != null && <> · {r.total_distance_km} km</>}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{(r.created_at || "").slice(0, 16).replace("T", " ")}</div>
                </div>
                <div className="flex flex-col gap-1">
                  <Button size="sm" variant="outline" className="h-7 rounded-sm text-[11px] px-2"
                          onClick={() => loadSaved(r)} data-testid={`tr-load-${r.id}`}>
                    Load
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 rounded-sm text-[11px] px-2 text-red-600 border-red-200 hover:bg-red-50"
                          onClick={() => deleteSaved(r)} data-testid={`tr-delete-${r.id}`}>
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
