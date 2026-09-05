import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  MapPin, Factory, Plus, Trash2, Route as RouteIcon, Save, Loader2, ListChecks,
  Map as MapIcon, Satellite, Pencil, Check, X, Crosshair, Truck, Navigation, Copy, ExternalLink,
} from "lucide-react";

// Marker icon default asset shim (react-leaflet's defaults 404 without this).
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// A labeled marker — shows the transport name inside a pill so operators
// can identify each stop at a glance (no more "1/2/3" ambiguity). The
// caller can pass an optional visit-order badge that renders as a small
// circle on the pill's left edge.
const labelIcon = (name, order = null, color = "#E65100") => {
  const safe = String(name || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const badge = order != null
    ? `<span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;background:white;color:${color};border-radius:50%;font-weight:900;font-size:11px;margin-right:6px;box-shadow:inset 0 0 0 2px ${color}">${order}</span>`
    : "";
  const html = `
    <div style="position:relative;display:inline-flex;align-items:center;">
      <div style="background:${color};color:white;padding:4px 10px 4px 6px;border-radius:14px;box-shadow:0 2px 6px rgba(0,0,0,.35);border:2px solid white;font-family:system-ui;font-weight:700;font-size:11px;letter-spacing:.2px;white-space:nowrap;display:inline-flex;align-items:center;">
        ${badge}<span>${safe}</span>
      </div>
      <div style="position:absolute;left:50%;bottom:-6px;width:0;height:0;transform:translateX(-50%);border-left:6px solid transparent;border-right:6px solid transparent;border-top:6px solid ${color};"></div>
    </div>`;
  // Width is fluid; anchor at bottom-centre so the pointer tail lands on the coordinate.
  return L.divIcon({
    className: "tr-label-marker",
    html,
    // Rough width guess so Leaflet gives the icon enough room — actual pill is auto-width.
    iconSize: [Math.max(60, Math.min(200, 20 + safe.length * 7)), 30],
    iconAnchor: [Math.max(30, Math.min(100, 10 + safe.length * 3.5)), 30],
  });
};

const dotIcon = (color = "#0369a1") =>
  L.divIcon({
    className: "",
    html: `<div style="background:${color};width:14px;height:14px;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.35);border:2px solid white"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });

// A cluster pill for groups of transports at the same coordinate. Shows a
// count badge + the label "N transports". Click to expand names in popup.
const clusterIcon = (count, color = "#0369a1") => {
  const html = `
    <div style="position:relative;display:inline-flex;align-items:center;">
      <div style="background:${color};color:white;padding:4px 10px 4px 6px;border-radius:14px;box-shadow:0 2px 6px rgba(0,0,0,.35);border:2px solid white;font-family:system-ui;font-weight:700;font-size:11px;letter-spacing:.2px;white-space:nowrap;display:inline-flex;align-items:center;">
        <span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;background:white;color:${color};border-radius:50%;font-weight:900;font-size:11px;margin-right:6px;box-shadow:inset 0 0 0 2px ${color}">${count}</span>
        <span>transports here</span>
      </div>
      <div style="position:absolute;left:50%;bottom:-6px;width:0;height:0;transform:translateX(-50%);border-left:6px solid transparent;border-right:6px solid transparent;border-top:6px solid ${color};"></div>
    </div>`;
  return L.divIcon({
    className: "tr-cluster-marker",
    html,
    iconSize: [150, 30],
    iconAnchor: [75, 30],
  });
};

// A cluster pill for selected transports at the same coordinate (uses the
// route colour). Shows count + list preview (up to 2 names) as a hint.
const selectedClusterIcon = (items, orders, color = "#E65100") => {
  const count = items.length;
  const preview = items.slice(0, 2).map((t) => t.name).join(", ")
    + (items.length > 2 ? ` +${items.length - 2}` : "");
  const safe = preview.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const orderStr = orders.join("/");
  const html = `
    <div style="position:relative;display:inline-flex;align-items:center;">
      <div style="background:${color};color:white;padding:4px 10px 4px 6px;border-radius:14px;box-shadow:0 2px 6px rgba(0,0,0,.35);border:2px solid white;font-family:system-ui;font-weight:700;font-size:11px;letter-spacing:.2px;white-space:nowrap;display:inline-flex;align-items:center;max-width:240px;">
        <span style="display:inline-flex;align-items:center;justify-content:center;padding:0 6px;height:20px;background:white;color:${color};border-radius:10px;font-weight:900;font-size:10px;margin-right:6px;box-shadow:inset 0 0 0 2px ${color}">${orderStr}</span>
        <span style="overflow:hidden;text-overflow:ellipsis;">${count} here · ${safe}</span>
      </div>
      <div style="position:absolute;left:50%;bottom:-6px;width:0;height:0;transform:translateX(-50%);border-left:6px solid transparent;border-right:6px solid transparent;border-top:6px solid ${color};"></div>
    </div>`;
  return L.divIcon({
    className: "tr-cluster-selected-marker",
    html,
    iconSize: [Math.max(140, Math.min(260, 40 + safe.length * 7)), 30],
    iconAnchor: [Math.max(70, Math.min(130, 20 + safe.length * 3.5)), 30],
  });
};

const factoryIcon = L.divIcon({
  className: "",
  html: `<div style="background:#111827;color:white;width:34px;height:34px;border-radius:6px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.4);border:2px solid #fbbf24"><span style="font-weight:900;font-size:11px;letter-spacing:.5px">JK</span></div>`,
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

// Decode a Google-style encoded polyline (OSRM's default format).
function decodePolyline(str, precision = 5) {
  if (!str) return [];
  let index = 0, lat = 0, lng = 0;
  const out = [];
  const factor = Math.pow(10, precision);
  while (index < str.length) {
    let result = 0, shift = 0, b;
    do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    result = 0; shift = 0;
    do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    out.push([lat / factor, lng / factor]);
  }
  return out;
}

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points || points.length === 0) return;
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 12);
    } else {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
    }
  }, [points, map]);
  return null;
}

// Click on the map (while "pick mode" is on) to drop a pin — feeds the
// Add-transport form so operators can add a point without typing coordinates.
function ClickToPick({ enabled, onPick }) {
  useMapEvents({
    click(e) {
      if (!enabled) return;
      onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

const emptyDraft = { name: "", lat: "", lng: "" };

// Build a Google Maps directions URL that opens the app on mobile (or the
// web version on desktop) and pre-fills factory → waypoints → last stop.
// We use the officially-documented `?api=1&…` universal URL so Google Maps
// reliably renders the route. Note: without a paid Google Maps API key +
// Place IDs, Google labels waypoints A/B/C — this is a hard limitation of
// the free URL API. The transport names still show inside our own app
// (label pills on the map + saved-route card).
// Docs: https://developers.google.com/maps/documentation/urls/get-started
function buildGoogleMapsUrl(factory, orderedStops) {
  if (!orderedStops || orderedStops.length === 0) return "";
  const pts = orderedStops.map((s) => `${Number(s.lat).toFixed(6)},${Number(s.lng).toFixed(6)}`);
  const origin = `${Number(factory.lat).toFixed(6)},${Number(factory.lng).toFixed(6)}`;
  const destination = pts[pts.length - 1];
  const waypoints = pts.slice(0, -1).join("|");
  const params = new URLSearchParams({
    api: "1",
    origin,
    destination,
    travelmode: "driving",
  });
  if (waypoints) params.set("waypoints", waypoints);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

// Group items whose coordinates share the same rounded key (~11m). Returns
// an array of clusters — each cluster carries the source items so we can
// render a single marker per group and show the underlying names.
function clusterByLocation(items, precision = 4) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const groups = new Map();
  items.forEach((it, idx) => {
    const key = `${Number(it.lat).toFixed(precision)},${Number(it.lng).toFixed(precision)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ...it, _idx: idx });
  });
  return Array.from(groups.entries()).map(([key, arr]) => ({
    key,
    lat: arr[0].lat,
    lng: arr[0].lng,
    items: arr,
  }));
}

export default function TransportRoutes() {
  const [factory, setFactory] = useState({ lat: 30.8978257, lng: 75.8528076, label: "JK Products Factory" });
  const [transports, setTransports] = useState([]);      // master list
  const [selected, setSelected] = useState({});          // {[id]: true}
  const [routes, setRoutes] = useState([]);              // saved multi-stop routes
  const [routeName, setRouteName] = useState("");
  const [draft, setDraft] = useState({ ...emptyDraft });
  const [editingId, setEditingId] = useState(null);
  const [editingDraft, setEditingDraft] = useState({ ...emptyDraft });
  const [pickMode, setPickMode] = useState(false);
  const [busy, setBusy] = useState({ adding: false, optimizing: false, saving: false });
  const [result, setResult] = useState(null);            // {order, total_distance_km, total_duration_min, geometry, engine}
  const [mapStyle, setMapStyle] = useState("map");
  const autoTimer = useRef(null);

  const loadAll = async () => {
    try {
      const [fac, tr, sv] = await Promise.all([
        api.get("/transport/factory"),
        api.get("/transports"),
        api.get("/transport/routes"),
      ]);
      if (fac?.data) setFactory(fac.data);
      setTransports(tr.data || []);
      setRoutes(sv.data || []);
    } catch (e) {
      // Silent — page loads even if one call fails.
    }
  };
  useEffect(() => { loadAll(); }, []);

  const selectedTransports = useMemo(
    () => transports.filter((t) => selected[t.id]),
    [transports, selected]
  );

  // ── Auto-optimize whenever the selection changes (debounced 400ms). ─────
  useEffect(() => {
    if (autoTimer.current) clearTimeout(autoTimer.current);
    if (selectedTransports.length === 0) {
      setResult(null);
      return;
    }
    autoTimer.current = setTimeout(async () => {
      try {
        setBusy((b) => ({ ...b, optimizing: true }));
        const stops = selectedTransports.map((t) => ({
          transport_id: t.id, name: t.name, lat: t.lat, lng: t.lng,
        }));
        const r = await api.post("/transport/optimize", { stops });
        setResult(r.data);
      } catch (e) {
        toast.error(e?.response?.data?.detail || "Could not calculate route");
      } finally {
        setBusy((b) => ({ ...b, optimizing: false }));
      }
    }, 400);
    return () => autoTimer.current && clearTimeout(autoTimer.current);
     
  }, [selectedTransports.map((t) => t.id).join("|")]);

  const isValidLatLng = (lat, lng) => {
    const la = Number(lat), lo = Number(lng);
    return Number.isFinite(la) && Number.isFinite(lo)
      && la >= -90 && la <= 90 && lo >= -180 && lo <= 180;
  };

  const addTransport = async () => {
    const name = draft.name.trim();
    if (!name) { toast.error("Enter a transport name."); return; }
    if (!isValidLatLng(draft.lat, draft.lng)) {
      toast.error("Enter valid coordinates or click on the map.");
      return;
    }
    try {
      setBusy((b) => ({ ...b, adding: true }));
      const r = await api.post("/transports", {
        name, lat: Number(draft.lat), lng: Number(draft.lng),
      });
      setTransports((prev) => [...prev, r.data].sort((a, b) => a.name.localeCompare(b.name)));
      setDraft({ ...emptyDraft });
      setPickMode(false);
      toast.success(`Added "${r.data.name}".`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not add transport");
    } finally {
      setBusy((b) => ({ ...b, adding: false }));
    }
  };

  const startEdit = (t) => {
    setEditingId(t.id);
    setEditingDraft({ name: t.name, lat: String(t.lat), lng: String(t.lng) });
  };
  const cancelEdit = () => { setEditingId(null); setEditingDraft({ ...emptyDraft }); };
  const saveEdit = async () => {
    const nm = editingDraft.name.trim();
    if (!nm) { toast.error("Name cannot be empty."); return; }
    if (!isValidLatLng(editingDraft.lat, editingDraft.lng)) {
      toast.error("Enter valid coordinates.");
      return;
    }
    try {
      const r = await api.patch(`/transports/${editingId}`, {
        name: nm, lat: Number(editingDraft.lat), lng: Number(editingDraft.lng),
      });
      setTransports((prev) => prev.map((t) => (t.id === editingId ? r.data : t))
        .sort((a, b) => a.name.localeCompare(b.name)));
      toast.success("Updated.");
      cancelEdit();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Update failed");
    }
  };

  const deleteTransport = async (t) => {
    if (!window.confirm(`Delete transport "${t.name}"?`)) return;
    try {
      await api.delete(`/transports/${t.id}`);
      setTransports((prev) => prev.filter((x) => x.id !== t.id));
      setSelected((prev) => { const n = { ...prev }; delete n[t.id]; return n; });
      toast.success("Deleted");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Delete failed");
    }
  };

  const toggleSelect = (id, on) => setSelected((prev) => {
    const next = { ...prev };
    if (on) next[id] = true; else delete next[id];
    return next;
  });
  const selectAll = () => setSelected(Object.fromEntries(transports.map((t) => [t.id, true])));
  const clearSelection = () => setSelected({});

  const orderedStops = useMemo(() => {
    if (!result?.order || result.order.length !== selectedTransports.length) return selectedTransports;
    return result.order.map((i) => selectedTransports[i]);
  }, [selectedTransports, result]);

  const geometry = useMemo(() => decodePolyline(result?.geometry || ""), [result?.geometry]);

  const mapPoints = useMemo(() => {
    if (selectedTransports.length > 0) return [factory, ...selectedTransports];
    if (transports.length > 0) return [factory, ...transports];
    return [factory];
  }, [factory, transports, selectedTransports]);

  const saveRoute = async () => {
    if (!routeName.trim()) { toast.error("Give this route a name to save it."); return; }
    if (selectedTransports.length === 0) { toast.error("Select at least one transport."); return; }
    try {
      setBusy((b) => ({ ...b, saving: true }));
      const payload = {
        name: routeName.trim(),
        stops: selectedTransports.map((t) => ({
          transport_id: t.id, name: t.name, lat: t.lat, lng: t.lng,
        })),
        optimized_order: result?.order || null,
        total_distance_km: result?.total_distance_km ?? null,
        total_duration_min: result?.total_duration_min ?? null,
        geometry: result?.geometry || null,
      };
      await api.post("/transport/routes", payload);
      toast.success("Route saved.");
      setRouteName("");
      const sv = await api.get("/transport/routes");
      setRoutes(sv.data || []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally {
      setBusy((b) => ({ ...b, saving: false }));
    }
  };

  const loadSavedRoute = (r) => {
    const ids = (r.stops || []).map((s) => s.transport_id).filter(Boolean);
    if (ids.length === 0) {
      toast.error("This saved route has no linked transports.");
      return;
    }
    setSelected(Object.fromEntries(ids.map((id) => [id, true])));
    setRouteName(r.name);
    toast.success(`Loaded "${r.name}"`);
  };

  const deleteSavedRoute = async (r) => {
    if (!window.confirm(`Delete route "${r.name}"?`)) return;
    try {
      await api.delete(`/transport/routes/${r.id}`);
      setRoutes((prev) => prev.filter((x) => x.id !== r.id));
      toast.success("Deleted");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Delete failed");
    }
  };

  return (
    <div className="space-y-4" data-testid="transport-routes-page">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Add transport panel */}
        <div className="bg-white border border-slate-200 rounded-sm p-4">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[10px] uppercase tracking-[0.15em] text-[#E65100] font-bold">
              Add a transport
            </div>
            <button
              type="button"
              onClick={() => setPickMode((v) => !v)}
              className={`inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-sm border ${pickMode ? "bg-[#E65100] text-white border-[#E65100]" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"}`}
              data-testid="tr-pick-mode"
              title="Click anywhere on the map to drop a pin"
            >
              <Crosshair className="w-3.5 h-3.5" /> {pickMode ? "Picking… click map" : "Pick on map"}
            </button>
          </div>
          <div>
            <Label className="text-xs font-bold uppercase">Transport name</Label>
            <Input
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="e.g. Sharma Transport"
              className="h-10 rounded-sm mt-1"
              data-testid="tr-name"
            />
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div>
              <Label className="text-xs font-bold uppercase">Latitude</Label>
              <Input
                value={draft.lat}
                onChange={(e) => setDraft((d) => ({ ...d, lat: e.target.value }))}
                placeholder="e.g. 30.8978"
                className="h-10 rounded-sm mt-1 font-mono-num"
                data-testid="tr-lat"
              />
            </div>
            <div>
              <Label className="text-xs font-bold uppercase">Longitude</Label>
              <Input
                value={draft.lng}
                onChange={(e) => setDraft((d) => ({ ...d, lng: e.target.value }))}
                placeholder="e.g. 75.8528"
                className="h-10 rounded-sm mt-1 font-mono-num"
                data-testid="tr-lng"
              />
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <Button
              onClick={addTransport}
              disabled={busy.adding}
              className="h-10 rounded-sm bg-[#E65100] hover:bg-[#c94500] text-white"
              data-testid="tr-add"
            >
              {busy.adding ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Plus className="w-4 h-4 mr-1.5" />}
              Add transport
            </Button>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            Tip: turn on <b>Pick on map</b> then click any point to fill in the coordinates automatically.
          </p>
        </div>

        {/* Select transports panel */}
        <div className="bg-white border border-slate-200 rounded-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] uppercase tracking-[0.15em] text-[#E65100] font-bold">
              Select transports for this route
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button" onClick={selectAll}
                className="text-[11px] font-bold uppercase tracking-wider text-slate-700 hover:text-[#E65100]"
                data-testid="tr-select-all"
              >
                Select all
              </button>
              <span className="text-slate-300">·</span>
              <button
                type="button" onClick={clearSelection}
                className="text-[11px] font-bold uppercase tracking-wider text-slate-700 hover:text-[#E65100]"
                data-testid="tr-clear"
              >
                Clear
              </button>
            </div>
          </div>
          {transports.length === 0 ? (
            <div className="text-sm text-slate-400 text-center py-8 border border-dashed border-slate-200 rounded-sm">
              No transports yet — add one on the left.
            </div>
          ) : (
            <div className="space-y-1.5 max-h-80 overflow-auto pr-1" data-testid="tr-list">
              {transports.map((t) => {
                const isEditing = editingId === t.id;
                return (
                  <div
                    key={t.id}
                    className="flex items-start gap-2 border border-slate-200 rounded-sm px-2.5 py-2 bg-slate-50"
                    data-testid={`tr-row-${t.id}`}
                  >
                    <Checkbox
                      checked={!!selected[t.id]}
                      onCheckedChange={(v) => toggleSelect(t.id, !!v)}
                      className="mt-1 data-[state=checked]:bg-[#E65100] data-[state=checked]:border-[#E65100]"
                      data-testid={`tr-check-${t.id}`}
                    />
                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                          <Input
                            value={editingDraft.name}
                            onChange={(e) => setEditingDraft((d) => ({ ...d, name: e.target.value }))}
                            className="h-8 rounded-sm text-sm"
                          />
                          <Input
                            value={editingDraft.lat}
                            onChange={(e) => setEditingDraft((d) => ({ ...d, lat: e.target.value }))}
                            className="h-8 rounded-sm text-sm font-mono-num"
                          />
                          <Input
                            value={editingDraft.lng}
                            onChange={(e) => setEditingDraft((d) => ({ ...d, lng: e.target.value }))}
                            className="h-8 rounded-sm text-sm font-mono-num"
                          />
                        </div>
                      ) : (
                        <>
                          <div className="text-sm font-bold text-slate-900 truncate">{t.name}</div>
                          <div className="text-[11px] text-slate-500 font-mono-num">
                            {Number(t.lat).toFixed(4)}, {Number(t.lng).toFixed(4)}
                          </div>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {isEditing ? (
                        <>
                          <button type="button" onClick={saveEdit} className="text-emerald-600 hover:text-emerald-700 p-1" aria-label="Save">
                            <Check className="w-4 h-4" />
                          </button>
                          <button type="button" onClick={cancelEdit} className="text-slate-400 hover:text-slate-600 p-1" aria-label="Cancel">
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button type="button" onClick={() => startEdit(t)} className="text-slate-400 hover:text-slate-700 p-1" aria-label="Edit" data-testid={`tr-edit-${t.id}`}>
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button type="button" onClick={() => deleteTransport(t)} className="text-slate-400 hover:text-red-600 p-1" aria-label="Delete" data-testid={`tr-del-${t.id}`}>
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Route summary + save */}
          <div className="mt-3 border-t border-slate-100 pt-3 flex flex-wrap items-center gap-2">
            <div className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5" data-testid="tr-summary">
              <Truck className="w-4 h-4 text-slate-500" />
              {selectedTransports.length === 0 ? (
                <span className="text-slate-400">Pick transports to auto-generate the shortest route</span>
              ) : busy.optimizing ? (
                <span className="inline-flex items-center gap-1"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Optimising route…</span>
              ) : result ? (
                <>
                  <span>{selectedTransports.length} stop{selectedTransports.length > 1 ? "s" : ""}</span>
                  <span className="text-slate-300">·</span>
                  <span className="text-[#E65100] font-mono-num">{result.total_distance_km} km</span>
                  {result.total_duration_min ? (
                    <>
                      <span className="text-slate-300">·</span>
                      <span className="font-mono-num">~{Math.round(result.total_duration_min)} min</span>
                    </>
                  ) : null}
                  <span className="text-slate-400 text-[10px]">({result.engine})</span>
                </>
              ) : null}
            </div>
            <div className="flex-1 min-w-[160px]">
              <Input
                value={routeName}
                onChange={(e) => setRouteName(e.target.value)}
                placeholder="Name this route (to save)"
                className="h-9 rounded-sm"
                data-testid="tr-route-name"
              />
            </div>
            <Button
              onClick={saveRoute}
              disabled={busy.saving || selectedTransports.length === 0 || !routeName.trim()}
              variant="outline"
              className="h-9 rounded-sm border-slate-300"
              data-testid="tr-save"
            >
              {busy.saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
              Save route
            </Button>
          </div>

          {/* Google Maps deep link for the current selection */}
          {orderedStops.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
              <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500">
                Navigate on phone:
              </span>
              <a
                href={buildGoogleMapsUrl(factory, orderedStops)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-sm bg-[#1a73e8] hover:bg-[#155ab5] text-white text-[11px] font-bold uppercase tracking-wider"
                data-testid="tr-open-gmaps"
              >
                <Navigation className="w-3.5 h-3.5" /> Open in Google Maps
                <ExternalLink className="w-3 h-3 opacity-70" />
              </a>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(buildGoogleMapsUrl(factory, orderedStops));
                    toast.success("Link copied — paste it in WhatsApp or SMS.");
                  } catch (e) {
                    toast.error("Copy failed. Long-press the Open button to copy the link.");
                  }
                }}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-sm border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-[11px] font-bold uppercase tracking-wider"
                data-testid="tr-copy-gmaps"
              >
                <Copy className="w-3.5 h-3.5" /> Copy link
              </button>
              <span className="text-[10px] text-slate-400">
                Opens the Google Maps app on mobile, web on desktop.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Map */}
      <div className="bg-white border border-slate-200 rounded-sm overflow-hidden">
        <div className="px-4 py-2 border-b border-slate-200 flex items-center gap-2 flex-wrap">
          <Factory className="w-4 h-4 text-slate-700" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Map · Factory + transports
          </span>
          <span className="text-[10px] text-slate-400 font-mono-num">
            {factory.lat.toFixed(4)}, {factory.lng.toFixed(4)}
          </span>
          <div className="ml-auto inline-flex rounded-sm border border-slate-200 overflow-hidden">
            <button
              type="button" onClick={() => setMapStyle("map")}
              className={`px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider inline-flex items-center gap-1 ${mapStyle === "map" ? "bg-[#E65100] text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
              data-testid="tr-map-style-map"
            >
              <MapIcon className="w-3.5 h-3.5" /> Map
            </button>
            <button
              type="button" onClick={() => setMapStyle("satellite")}
              className={`px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider inline-flex items-center gap-1 border-l border-slate-200 ${mapStyle === "satellite" ? "bg-[#E65100] text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
              data-testid="tr-map-style-satellite"
            >
              <Satellite className="w-3.5 h-3.5" /> Satellite
            </button>
          </div>
        </div>
        <div style={{ height: 480 }} data-testid="tr-map">
          <MapContainer
            center={[factory.lat, factory.lng]}
            zoom={10}
            style={{ height: "100%", width: "100%", cursor: pickMode ? "crosshair" : "" }}
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
                  attribution="Tiles &copy; Esri"
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
            <ClickToPick
              enabled={pickMode}
              onPick={({ lat, lng }) => {
                setDraft((d) => ({ ...d, lat: lat.toFixed(6), lng: lng.toFixed(6) }));
                setPickMode(false);
                toast.success("Coordinates captured — give it a name and Add.");
              }}
            />

            <Marker position={[factory.lat, factory.lng]} icon={factoryIcon}>
              <Popup><b>Factory</b><br />{factory.label}</Popup>
            </Marker>

            {/* Unselected transports: group co-located ones into a cluster pill
                that says "N transports here" so overlap collapses into a single
                marker rather than a pile of pills. */}
            {clusterByLocation(transports.filter((t) => !selected[t.id])).map((grp) => (
              grp.items.length === 1 ? (
                <Marker key={`dot-${grp.items[0].id}`} position={[grp.lat, grp.lng]} icon={dotIcon()}>
                  <Popup>
                    <b>{grp.items[0].name}</b><br />
                    <span style={{ fontFamily: "monospace" }}>
                      {Number(grp.items[0].lat).toFixed(4)}, {Number(grp.items[0].lng).toFixed(4)}
                    </span>
                  </Popup>
                </Marker>
              ) : (
                <Marker key={`cluster-${grp.key}`} position={[grp.lat, grp.lng]} icon={clusterIcon(grp.items.length)}>
                  <Popup>
                    <b>{grp.items.length} transports at this spot</b>
                    <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                      {grp.items.map((t) => (<li key={t.id}>{t.name}</li>))}
                    </ul>
                  </Popup>
                </Marker>
              )
            ))}

            {/* Selected transports: same cluster-if-overlapping approach, but
                labels use the route colour and carry the visit-order badge(s). */}
            {(() => {
              // Attach visit order to each stop so cluster labels can display it.
              const withOrder = orderedStops.map((t, i) => ({ ...t, _order: i + 1 }));
              return clusterByLocation(withOrder).map((grp) => {
                if (grp.items.length === 1) {
                  const t = grp.items[0];
                  return (
                    <Marker
                      key={`pin-${t.id || t.transport_id || t._order}`}
                      position={[grp.lat, grp.lng]}
                      icon={labelIcon(t.name || `Stop ${t._order}`, t._order)}
                      zIndexOffset={1000 + t._order}
                    >
                      <Popup>
                        <b>#{t._order} · {t.name}</b><br />
                        <span style={{ fontFamily: "monospace" }}>
                          {Number(t.lat).toFixed(4)}, {Number(t.lng).toFixed(4)}
                        </span>
                      </Popup>
                    </Marker>
                  );
                }
                const orders = grp.items.map((x) => x._order);
                return (
                  <Marker
                    key={`sel-cluster-${grp.key}`}
                    position={[grp.lat, grp.lng]}
                    icon={selectedClusterIcon(grp.items, orders)}
                    zIndexOffset={2000}
                  >
                    <Popup>
                      <b>{grp.items.length} transports at this spot</b>
                      <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                        {grp.items.map((t) => (
                          <li key={t.id}>#{t._order} · {t.name}</li>
                        ))}
                      </ul>
                    </Popup>
                  </Marker>
                );
              });
            })()}

            {geometry.length > 1 && (
              <Polyline positions={geometry} pathOptions={{ color: "#E65100", weight: 5, opacity: 0.9 }} />
            )}
            {geometry.length === 0 && orderedStops.length > 0 && (
              <Polyline
                positions={[[factory.lat, factory.lng], ...orderedStops.map((t) => [t.lat, t.lng])]}
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
            {routes.map((r) => {
              // Recompute the stops in the saved-optimised order so the
              // Google Maps link uses the same sequence as the map polyline.
              const rStops = r.stops || [];
              const ord = Array.isArray(r.optimized_order) && r.optimized_order.length === rStops.length
                ? r.optimized_order.map((i) => rStops[i])
                : rStops;
              const gUrl = buildGoogleMapsUrl(factory, ord);
              return (
              <div key={r.id} className="border border-slate-200 rounded-sm px-3 py-2 flex items-start gap-2" data-testid={`tr-saved-${r.id}`}>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-slate-900 truncate">{r.name}</div>
                  <div className="text-[11px] text-slate-500">
                    {(r.stops || []).length} stops
                    {r.total_distance_km != null && <> · {r.total_distance_km} km</>}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{(r.created_at || "").slice(0, 16).replace("T", " ")}</div>
                  {gUrl && (
                    <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                      <a
                        href={gUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 h-6 px-2 rounded-sm bg-[#1a73e8] hover:bg-[#155ab5] text-white text-[10px] font-bold uppercase tracking-wider"
                        data-testid={`tr-gmaps-${r.id}`}
                      >
                        <Navigation className="w-3 h-3" /> Google Maps
                      </a>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(gUrl);
                            toast.success("Link copied.");
                          } catch (e) {
                            toast.error("Copy failed");
                          }
                        }}
                        className="inline-flex items-center gap-1 h-6 px-2 rounded-sm border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-[10px] font-bold uppercase tracking-wider"
                        data-testid={`tr-gmaps-copy-${r.id}`}
                        title="Copy Google Maps link"
                      >
                        <Copy className="w-3 h-3" /> Copy
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <Button size="sm" variant="outline" className="h-7 rounded-sm text-[11px] px-2"
                          onClick={() => loadSavedRoute(r)} data-testid={`tr-load-${r.id}`}>
                    Load
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 rounded-sm text-[11px] px-2 text-red-600 border-red-200 hover:bg-red-50"
                          onClick={() => deleteSavedRoute(r)} data-testid={`tr-delete-${r.id}`}>
                    Delete
                  </Button>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
