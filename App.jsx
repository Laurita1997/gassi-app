import React, { useState, useEffect, useRef } from "react";
import { PawPrint, MapPin, Clock, Users, X, Check, Navigation, ChevronRight } from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Real cloud database. The publishable key is safe in frontend code by design.
const supabase = createClient(
  "https://tizwkxphvnrndnjcfwls.supabase.co",
  "sb_publishable_v9td0Bsq7wwc0asb9uqGEQ_5weuDvks"
);

// Profile stays local to this device — it's just "who am I on this phone".
const localProfile = {
  get() {
    try {
      const raw = localStorage.getItem("gassi:profile");
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  },
  set(value) {
    try {
      localStorage.setItem("gassi:profile", JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  },
};

const COLORS = {
  bg: "#16241C",
  surface: "#1F3327",
  surfaceLight: "#28402F",
  cream: "#F2EDE1",
  creamDim: "#C9C2AF",
  amber: "#E8A33D",
  amberDim: "#B67F2B",
  sky: "#7FA8B7",
  muted: "#6B8577",
  line: "#33513E",
};

// Shrink a photo before upload: 256px, JPEG. Keeps rows small and loading fast.
async function compressImage(file, max = 256) {
  const dataUrl = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = dataUrl;
  });
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.7);
}

// A small round avatar, falling back to a paw when there's no photo.
function Avatar({ src, size = 40, ring = "#7FA8B7", onClick }) {
  if (src) {
    return (
      <img
        src={src}
        alt=""
        onClick={onClick}
        style={{
          width: size,
          height: size,
          borderRadius: "9999px",
          objectFit: "cover",
          flexShrink: 0,
          border: `2px solid ${ring}`,
          cursor: onClick ? "pointer" : "default",
        }}
      />
    );
  }
  return (
    <div
      onClick={onClick}
      style={{
        width: size,
        height: size,
        borderRadius: "9999px",
        background: ring,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <PawPrint size={size * 0.45} color="#16241C" />
    </div>
  );
}

// Full-screen photo viewer, so you can actually see who you'd be meeting.
function PhotoViewer({ photos, caption, onClose }) {
  const shown = photos.filter(Boolean);
  if (!shown.length) return null;
  return (
    <div
      className="fade-in"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.9)",
        zIndex: 4000,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        gap: 14,
      }}
    >
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
        {shown.map((p, i) => (
          <img
            key={i}
            src={p}
            alt=""
            style={{
              maxWidth: shown.length > 1 ? "45%" : "88%",
              maxHeight: "60vh",
              borderRadius: 16,
              objectFit: "contain",
            }}
          />
        ))}
      </div>
      {caption && (
        <p style={{ color: "#F2EDE1", fontSize: 15, fontWeight: 600, fontFamily: "'Work Sans', sans-serif" }}>
          {caption}
        </p>
      )}
      <p style={{ color: "#6B8577", fontSize: 12, fontFamily: "'Work Sans', sans-serif" }}>
        Tap anywhere to close
      </p>
    </div>
  );
}

// A map you tap to place your own pin, instead of broadcasting exact GPS.
function PinPicker({ initial, onConfirm, onCancel }) {
  const nodeRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [picked, setPicked] = useState(initial || null);

  useEffect(() => {
    if (!nodeRef.current || mapRef.current) return;
    const start = initial && initial.lat != null ? [initial.lat, initial.lng] : [48.2082, 16.3738];
    const map = L.map(nodeRef.current, { zoomControl: true }).setView(start, 16);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 150);

    const icon = L.divIcon({
      className: "",
      html: `<div style="width:22px;height:22px;border-radius:9999px;background:#E8A33D;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.4)"></div>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });

    if (initial && initial.lat != null) {
      markerRef.current = L.marker(start, { icon, draggable: true }).addTo(map);
      markerRef.current.on("dragend", (e) => {
        const p = e.target.getLatLng();
        setPicked({ lat: p.lat, lng: p.lng });
      });
    }

    map.on("click", (e) => {
      const p = { lat: e.latlng.lat, lng: e.latlng.lng };
      setPicked(p);
      if (markerRef.current) {
        markerRef.current.setLatLng(e.latlng);
      } else {
        markerRef.current = L.marker(e.latlng, { icon, draggable: true }).addTo(map);
        markerRef.current.on("dragend", (ev) => {
          const q = ev.target.getLatLng();
          setPicked({ lat: q.lat, lng: q.lng });
        });
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div
      className="fade-in"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 3200,
        padding: 18,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 380,
          background: "#1F3327",
          border: "1px solid #33513E",
          borderRadius: 20,
          padding: 18,
        }}
      >
        <p className="fredoka" style={{ fontSize: 17, marginBottom: 4, color: "#F2EDE1" }}>
          Where should your pin go?
        </p>
        <p style={{ fontSize: 11.5, color: "#C9C2AF", marginBottom: 12, lineHeight: 1.5 }}>
          Tap the map to place it, drag to adjust. Pick a corner or a park entrance rather than your
          front door.
        </p>

        <div
          ref={nodeRef}
          style={{ height: 300, borderRadius: 14, overflow: "hidden", background: "#1B2A20" }}
        />

        <p className="mono" style={{ fontSize: 10, color: "#6B8577", margin: "10px 0 14px", textAlign: "center" }}>
          {picked ? `${picked.lat.toFixed(4)}, ${picked.lng.toFixed(4)}` : "No pin placed yet"}
        </p>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onCancel}
            className="btn-press"
            style={{
              flex: 1,
              background: "transparent",
              border: "1px solid #33513E",
              color: "#C9C2AF",
              borderRadius: 12,
              padding: "11px 0",
              cursor: "pointer",
              fontFamily: "'Work Sans', sans-serif",
              fontSize: 14,
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => picked && onConfirm(picked)}
            disabled={!picked}
            className="btn-press"
            style={{
              flex: 1,
              background: picked ? "#E8A33D" : "#33513E",
              border: "none",
              color: picked ? "#16241C" : "#6B8577",
              borderRadius: 12,
              padding: "11px 0",
              fontWeight: 600,
              cursor: picked ? "pointer" : "default",
              fontFamily: "'Work Sans', sans-serif",
              fontSize: 14,
            }}
          >
            Start walk here
          </button>
        </div>
      </div>
    </div>
  );
}

// A real OpenStreetMap view. Free, no API key, no billing account needed.
function WalkMap({ me, others }) {
  const nodeRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);

  useEffect(() => {
    if (!nodeRef.current || mapRef.current) return;
    const start = me && me.lat != null ? [me.lat, me.lng] : [48.2082, 16.3738]; // Vienna fallback
    const map = L.map(nodeRef.current, {
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: true,
      touchZoom: true,
      doubleClickZoom: true,
    }).setView(start, 16);
    // Standard OpenStreetMap tiles — genuinely free, no API key, no watermark.
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    // Leaflet needs a nudge when it starts inside an animating container.
    setTimeout(() => map.invalidateSize(), 200);
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Redraw markers whenever positions change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const dot = (color, size) =>
      L.divIcon({
        className: "",
        html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${color};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.4)"></div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });

    const points = [];

    if (me && me.lat != null) {
      const m = L.marker([me.lat, me.lng], { icon: dot("#E8A33D", 20), zIndexOffset: 1000 })
        .addTo(map)
        .bindTooltip("You", { permanent: true, direction: "top", offset: [0, -14] });
      markersRef.current.push(m);
      points.push([me.lat, me.lng]);
    }

    others.forEach((o) => {
      if (o.lat == null) return;
      const label = `${o.owner} · ${o.dog}`;
      const m = L.marker([o.lat, o.lng], { icon: dot("#2F7FA8", 18) })
        .addTo(map)
        .bindTooltip(label, { permanent: true, direction: "top", offset: [0, -13] });
      markersRef.current.push(m);
      points.push([o.lat, o.lng]);
    });

    if (points.length > 1) {
      map.fitBounds(points, { padding: [50, 50], maxZoom: 17 });
    } else if (points.length === 1) {
      map.setView(points[0], 16);
    }
  }, [me, others]);

  const recenter = () => {
    const map = mapRef.current;
    if (!map) return;
    const pts = [];
    if (me && me.lat != null) pts.push([me.lat, me.lng]);
    others.forEach((o) => o.lat != null && pts.push([o.lat, o.lng]));
    if (pts.length > 1) map.fitBounds(pts, { padding: [50, 50], maxZoom: 17 });
    else if (pts.length === 1) map.setView(pts[0], 17);
  };

  return (
    <div style={{ position: "relative" }}>
      <div
        ref={nodeRef}
        style={{
          height: 260,
          borderRadius: 16,
          overflow: "hidden",
          background: "#1B2A20",
        }}
      />
      <button
        onClick={recenter}
        className="btn-press"
        style={{
          position: "absolute",
          right: 10,
          bottom: 26,
          zIndex: 400,
          background: "#16241C",
          border: "1px solid #33513E",
          color: "#F2EDE1",
          borderRadius: 10,
          padding: "7px 11px",
          fontSize: 11.5,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: "'Work Sans', sans-serif",
        }}
      >
        Recenter
      </button>
    </div>
  );
}

// Straight-line distance between two points, in km (haversine).
function distanceKm(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

function fmtDistance(km) {
  if (km == null) return null;
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

function fmtClock(totalSeconds) {  const m = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

function Pulse({ color = COLORS.amber, size = 10 }) {
  return (
    <span style={{ position: "relative", display: "inline-flex", width: size, height: size }}>
      <span
        className="ripple"
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "9999px",
          background: color,
          opacity: 0.55,
        }}
      />
      <span
        style={{
          position: "relative",
          width: size,
          height: size,
          borderRadius: "9999px",
          background: color,
        }}
      />
    </span>
  );
}

const DEFAULT_PROFILE = { owner: "", dog: "", breed: "", age: "", agreed: false, photo: null, dogPhoto: null };
const DEMO_USER = { id: "sofia", owner: "Sofia", dog: "Nino", breed: "Mini Poodle", age: "31", note: "Chill pace, coffee stop halfway" };
const MIN_AGE = 18;
const NOTE_SUGGESTIONS = [
  "Quick 10-15 min walk",
  "Long walk, no rush",
  "Coffee stop on the way",
  "Just around the block",
];
// Walks auto-expire after 1 hour, so location sharing never runs on unnoticed.
const MAX_WALK_MS = 60 * 60 * 1000;
const REPORT_REASONS = [
  "Inappropriate behaviour",
  "Harassment or threats",
  "Fake profile",
  "Unsafe with dogs",
  "Something else",
];

export default function Gassi() {
  const [loaded, setLoaded] = useState(false);
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [editingProfile, setEditingProfile] = useState(false);
  const [draftProfile, setDraftProfile] = useState(DEFAULT_PROFILE);
  const [deviceId, setDeviceId] = useState(null);
  const [useDemoPhone, setUseDemoPhone] = useState(false);
  const [activeWalks, setActiveWalks] = useState({}); // { userId: {owner, dog, breed, note, startedAt} }
  const [requestsMap, setRequestsMap] = useState({}); // { "targetId_requesterId": {id, status, requesterOwner, requesterDog} }
  const [justDropped, setJustDropped] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const pollRef = useRef(null);

  // Each phone gets its own permanent id, so two real devices are two real users.
  // The demo toggle just adds a second identity on this same phone for solo testing.
  // The demo identity gets its own distinct id rather than a suffix on yours, so the two
  // never get confused with each other in request keys.
  const viewer = deviceId ? (useDemoPhone ? "demo-" + deviceId : deviceId) : null;

  const isOut = Boolean(viewer && activeWalks[viewer]);
  const walkStart = viewer && activeWalks[viewer] ? activeWalks[viewer].startedAt : null;
  const [elapsed, setElapsed] = useState(0);

  const myProfileFor = (id) => (id && id.startsWith("demo-") ? DEMO_USER : profile);

  useEffect(() => {
    let id = localStorage.getItem("gassi:deviceId");
    if (!id) {
      id = "u_" + Math.random().toString(36).slice(2, 10);
      localStorage.setItem("gassi:deviceId", id);
    }
    setDeviceId(id);

    const saved = localProfile.get();
    if (saved) setProfile(saved);
    setBlocked(loadBlocked());

    (async () => {
      await refreshShared();
      setLoaded(true);
    })();
    pollRef.current = setInterval(refreshShared, 3000);
    return () => clearInterval(pollRef.current);
  }, []);

  // Pull the live state of the world from the database.
  // Walks auto-expire after 1 hour. Location sharing shouldn't run on if someone forgets.


  const refreshShared = async () => {
    try {
      const { data: walks, error: wErr } = await supabase.from("walks").select("*");
      if (wErr) throw wErr;
      const walkMap = {};
      const stale = [];
      (walks || []).forEach((w) => {
        const startedAt = new Date(w.started_at).getTime();
        if (Date.now() - startedAt > MAX_WALK_MS) {
          stale.push(w.id);
          return;
        }
        walkMap[w.id] = {
          owner: w.owner,
          dog: w.dog,
          breed: w.breed,
          note: w.note,
          lat: w.lat,
          lng: w.lng,
          live: w.live,
          photo: w.photo,
          dogPhoto: w.dog_photo,
          startedAt,
        };
      });
      setActiveWalks(walkMap);

      // Tidy up anything that timed out, so it stops showing for everyone.
      if (stale.length) {
        supabase
          .from("walks")
          .delete()
          .in("id", stale)
          .then(() => {})
          .catch(() => {});
      }

      const { data: reqs, error: rErr } = await supabase.from("requests").select("*");
      if (rErr) throw rErr;
      const reqMap = {};
      (reqs || []).forEach((r) => {
        const target = walkMap[r.target_id];
        const createdAt = new Date(r.created_at).getTime();
        // A request only counts for the walk it was made during. If the target isn't out,
        // or their current walk started after the request, it's from a previous outing.
        if (!target || createdAt < target.startedAt) return;
        reqMap[`${r.target_id}|${r.requester_id}`] = {
          id: r.id,
          status: r.status,
          requesterOwner: r.requester_owner,
          requesterDog: r.requester_dog,
        };
      });
      setRequestsMap(reqMap);
      setSaveError(false);
    } catch (e) {
      setSaveError(true);
    }
  };

  // If my own walk hits the limit, end it properly rather than just hiding it.
  useEffect(() => {
    if (!isOut || !walkStart) return;
    const remaining = MAX_WALK_MS - (Date.now() - walkStart);
    if (remaining <= 0) {
      endWalk();
      return;
    }
    const t = setTimeout(() => endWalk(), remaining);
    return () => clearTimeout(t);
  }, [isOut, walkStart]);

  // Tick the timer from the stored start time
  useEffect(() => {
    let t;
    if (isOut && walkStart) {
      const tick = () => setElapsed(Math.floor((Date.now() - walkStart) / 1000));
      tick();
      t = setInterval(tick, 1000);
    } else {
      setElapsed(0);
    }
    return () => clearInterval(t);
  }, [isOut, walkStart]);

  const [locationMode, setLocationMode] = useState("pin"); // "pin" or "live"
  const [coords, setCoords] = useState(null);
  const [geoError, setGeoError] = useState(null);
  const [reportingId, setReportingId] = useState(null);
  const [pickingPin, setPickingPin] = useState(false);
  const [viewingPhotos, setViewingPhotos] = useState(null);
  const [walkNote, setWalkNote] = useState("");
  const [pickerStart, setPickerStart] = useState(null);
  const [reportReason, setReportReason] = useState(REPORT_REASONS[0]);
  const [reportNote, setReportNote] = useState("");
  const [reportDone, setReportDone] = useState(false);
  const [blocked, setBlocked] = useState([]);
  const watchRef = useRef(null);

  // Blocked users are stored on this device — they vanish from your feed immediately.
  const loadBlocked = () => {
    try {
      const raw = localStorage.getItem("gassi:blocked");
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  };

  const blockUser = (id) => {
    const next = Array.from(new Set([...blocked, id]));
    setBlocked(next);
    try {
      localStorage.setItem("gassi:blocked", JSON.stringify(next));
    } catch (e) {
      // non-fatal
    }
  };

  const submitReport = async () => {
    if (!reportingId || !viewer) return;
    const target = activeWalks[reportingId];
    try {
      await supabase.from("reports").insert({
        reporter_id: viewer,
        reported_id: reportingId,
        reported_owner: target ? target.owner : null,
        reason: reportReason,
        note: reportNote || null,
      });
    } catch (e) {
      // Even if the report fails to send, still block locally so the user is protected now.
      setSaveError(true);
    }
    blockUser(reportingId);
    setReportDone(true);
  };

  const closeReport = () => {
    setReportingId(null);
    setReportNote("");
    setReportReason(REPORT_REASONS[0]);
    setReportDone(false);
  };

  // Ask the browser for location. Used for both a one-off pin and continuous live tracking.
  const requestLocation = (mode) =>
    new Promise((resolve) => {
      if (!navigator.geolocation) {
        setGeoError("unsupported");
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setCoords(c);
          setGeoError(null);
          resolve(c);
        },
        () => {
          setGeoError("denied");
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });

  // While in live mode during a walk, keep pushing position updates to the database.
  useEffect(() => {
    if (!isOut || locationMode !== "live" || !viewer) return;
    if (!navigator.geolocation) return;
    watchRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCoords(c);
        try {
          await supabase.from("walks").update({ lat: c.lat, lng: c.lng }).eq("id", viewer);
        } catch (e) {
          // transient failure, next update will retry
        }
      },
      () => setGeoError("denied"),
      { enableHighAccuracy: true }
    );
    return () => {
      if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
    };
  }, [isOut, locationMode, viewer]);

  // In pin mode we open the picker first; in live mode GPS has to track you anyway.
  const beginWalk = async () => {
    if (!profileComplete) {
      setDraftProfile(profile);
      setEditingProfile(true);
      return;
    }
    if (locationMode === "pin") {
      // Get a rough starting position just to centre the map, then let them choose.
      const c = await requestLocation("pin");
      setPickerStart(c);
      setPickingPin(true);
      return;
    }
    startWalk(null);
  };

  const startWalk = async (chosenCoords) => {
    if (!viewer) return;
    const me = myProfileFor(viewer);
    setJustDropped(true);
    setTimeout(() => setJustDropped(false), 1400);
    const c = chosenCoords || (locationMode === "live" ? await requestLocation("live") : null);
    if (c) setCoords(c);
    try {
      // A new walk is a clean slate: clear any requests left over from previous walks,
      // so yesterday's "accepted" doesn't make it look like someone is already joining.
      await supabase.from("requests").delete().eq("target_id", viewer);
      await supabase.from("requests").delete().eq("requester_id", viewer);

      const { error } = await supabase.from("walks").upsert({
        id: viewer,
        owner: me.owner,
        dog: me.dog,
        breed: me.breed,
        note: walkNote.trim() || "Out for a walk",
        started_at: new Date().toISOString(),
        lat: c ? c.lat : null,
        lng: c ? c.lng : null,
        live: locationMode === "live",
        photo: me.photo || null,
        dog_photo: me.dogPhoto || null,
      });
      if (error) throw error;
      await refreshShared();
    } catch (e) {
      setSaveError(true);
    }
  };

  const endWalk = async () => {
    if (!viewer) return;
    try {
      // Clear the walk AND any requests tied to it, so nothing lingers as stale state.
      await supabase.from("walks").delete().eq("id", viewer);
      await supabase.from("requests").delete().eq("target_id", viewer);
      await supabase.from("requests").delete().eq("requester_id", viewer);
      await refreshShared();
    } catch (e) {
      setSaveError(true);
    }
  };

  const saveProfile = async () => {
    if (Number(draftProfile.age) < MIN_AGE || !draftProfile.agreed) return;
    if (!draftProfile.owner || !draftProfile.dog) return;
    setProfile(draftProfile);
    setEditingProfile(false);
    if (!localProfile.set(draftProfile)) setSaveError(true);
  };

  const sendRequest = async (targetId) => {
    if (!viewer) return;
    const me = myProfileFor(viewer);
    try {
      const { error } = await supabase.from("requests").insert({
        target_id: targetId,
        requester_id: viewer,
        requester_owner: me.owner,
        requester_dog: me.dog,
        status: "sent",
      });
      if (error) throw error;
      await refreshShared();
    } catch (e) {
      setSaveError(true);
    }
  };

  const respondToRequest = async (key, accept) => {
    const req = requestsMap[key];
    if (!req) return;
    try {
      const { error } = await supabase
        .from("requests")
        .update({ status: accept ? "accepted" : "declined" })
        .eq("id", req.id);
      if (error) throw error;
      await refreshShared();
    } catch (e) {
      setSaveError(true);
    }
  };

  // People walking with me right now. Both sides must still be out for this to count.
  const companions = viewer
    ? Object.keys(requestsMap)
        .filter((k) => {
          const r = requestsMap[k];
          if (r.status !== "accepted") return false;
          const iAmTarget = k.startsWith(`${viewer}|`);
          const iAmRequester = k.endsWith(`|${viewer}`);
          if (!iAmTarget && !iAmRequester) return false;

          // Work out who the other person is, and only show them if they're still out.
          const otherId = iAmTarget
            ? k.slice(`${viewer}|`.length)
            : k.slice(0, k.length - `|${viewer}`.length);
          return Boolean(activeWalks[viewer]) && Boolean(activeWalks[otherId]);
        })
        .map((k) => {
          const iAmTarget = k.startsWith(`${viewer}|`);
          const otherId = iAmTarget
            ? k.slice(`${viewer}|`.length)
            : k.slice(0, k.length - `|${viewer}`.length);
          const other = activeWalks[otherId];
          return {
            key: k,
            name: other ? other.owner : "Someone",
            dog: other ? other.dog : "their dog",
            // If they asked to join me, they're joining me. If I asked them, I'm joining them.
            theyJoinedMe: iAmTarget,
          };
        })
    : [];

  // Requests sent TO me that are still pending
  const incomingKeys = viewer
    ? Object.keys(requestsMap).filter(
        (k) => k.startsWith(`${viewer}|`) && requestsMap[k].status === "sent"
      )
    : [];
  const nearbyIds = Object.keys(activeWalks).filter(
    (id) => id !== viewer && !blocked.includes(id)
  );

  // Someone must set a name, an age of at least MIN_AGE, and accept the rules before joining in.
  const profileComplete =
    Boolean(profile.owner && profile.dog && profile.agreed) && Number(profile.age) >= MIN_AGE;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: COLORS.bg,
        color: COLORS.cream,
        fontFamily: "'Work Sans', sans-serif",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Work+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

        .fredoka { font-family: 'Fredoka', sans-serif; }
        .mono { font-family: 'JetBrains Mono', monospace; }

        .ripple {
          animation: rippleAnim 1.8s ease-out infinite;
        }
        @keyframes rippleAnim {
          0% { transform: scale(1); opacity: 0.55; }
          100% { transform: scale(3.2); opacity: 0; }
        }
        .drop-in {
          animation: dropIn 0.5s cubic-bezier(.34,1.56,.64,1);
        }
        @keyframes dropIn {
          0% { transform: translateY(-14px) scale(0.6); opacity: 0; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
        .fade-in { animation: fadeIn 0.35s ease-out; }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .btn-press:active { transform: scale(0.97); }
        .leaflet-container {
          background: #1B2A20;
          font-family: 'Work Sans', sans-serif;
        }
        /* Keep Leaflet's internal layers from stacking above our dialogs. */
        .leaflet-pane,
        .leaflet-top,
        .leaflet-bottom,
        .leaflet-control {
          z-index: 1 !important;
        }
        .leaflet-control-attribution {
          background: rgba(255,255,255,0.8) !important;
          font-size: 9px !important;
        }
        .leaflet-tooltip {
          background: #16241C;
          border: 1px solid #33513E;
          color: #F2EDE1;
          font-size: 11px;
          font-weight: 600;
          padding: 3px 7px;
          border-radius: 7px;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        }
        .leaflet-tooltip-top:before {
          border-top-color: #33513E;
        }
        .leaflet-control-zoom a {
          background: #16241C !important;
          color: #F2EDE1 !important;
          border-color: #33513E !important;
        }

        @media (prefers-reduced-motion: reduce) {
          .ripple, .drop-in, .fade-in { animation: none !important; }
        }
        button:focus-visible, a:focus-visible {
          outline: 2px solid ${COLORS.amber};
          outline-offset: 2px;
        }
      `}</style>

      <div style={{ width: "100%", maxWidth: 430, paddingBottom: 40 }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "28px 20px 16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                background: COLORS.amber,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <PawPrint size={20} color={COLORS.bg} strokeWidth={2.5} />
            </div>
            <span className="fredoka" style={{ fontSize: 22, fontWeight: 600, letterSpacing: 0.2 }}>
              Gassi
            </span>
          </div>
          <button
            onClick={() => {
              setDraftProfile(profile);
              setEditingProfile(true);
            }}
            className="mono btn-press"
            style={{
              fontSize: 11,
              color: COLORS.creamDim,
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "transparent",
              border: "none",
              cursor: "pointer",
            }}
          >
            <MapPin size={13} color={COLORS.sky} />
            {profile.owner ? `${profile.owner} · ${profile.dog}` : "Set up profile"}
          </button>
        </div>

        {saveError && (
          <div style={{ padding: "0 20px 10px" }}>
            <p style={{ fontSize: 11.5, color: COLORS.muted }}>
              Can't reach the server right now — check your connection.
            </p>
          </div>
        )}

        {editingProfile && (
          <div
            className="fade-in"
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.55)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 3000,
              padding: 24,
            }}
          >
            <div
              style={{
                width: "100%",
                maxWidth: 360,
                background: COLORS.surface,
                border: `1px solid ${COLORS.line}`,
                borderRadius: 20,
                padding: 22,
              }}
            >
              <p className="fredoka" style={{ fontSize: 17, marginBottom: 16 }}>
                Your profile
              </p>
              {[
                { key: "owner", label: "Your name" },
                { key: "dog", label: "Dog's name" },
                { key: "breed", label: "Breed" },
                { key: "age", label: `Your age (${MIN_AGE}+ only)`, numeric: true },
              ].map((f) => (
                <div key={f.key} style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, color: COLORS.creamDim, display: "block", marginBottom: 4 }}>
                    {f.label}
                  </label>
                  <input
                    value={draftProfile[f.key] || ""}
                    inputMode={f.numeric ? "numeric" : "text"}
                    onChange={(e) => setDraftProfile((d) => ({ ...d, [f.key]: e.target.value }))}
                    style={{
                      width: "100%",
                      background: COLORS.bg,
                      border: `1px solid ${COLORS.line}`,
                      borderRadius: 10,
                      padding: "10px 12px",
                      color: COLORS.cream,
                      fontSize: 14,
                      fontFamily: "'Work Sans', sans-serif",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              ))}

              {/* Photos so people know who they're meeting */}
              <p style={{ fontSize: 11, color: COLORS.creamDim, marginBottom: 8 }}>Photos</p>
              <div style={{ display: "flex", gap: 14, marginBottom: 16 }}>
                {[
                  { key: "photo", label: "You" },
                  { key: "dogPhoto", label: "Your dog" },
                ].map((f) => (
                  <label
                    key={f.key}
                    style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer" }}
                  >
                    <Avatar src={draftProfile[f.key]} size={58} ring={COLORS.line} />
                    <span style={{ fontSize: 10.5, color: COLORS.sky, textDecoration: "underline" }}>
                      {draftProfile[f.key] ? "Change" : "Add"} {f.label.toLowerCase()}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={async (e) => {
                        const file = e.target.files && e.target.files[0];
                        if (!file) return;
                        try {
                          const small = await compressImage(file);
                          setDraftProfile((d) => ({ ...d, [f.key]: small }));
                        } catch (err) {
                          setSaveError(true);
                        }
                      }}
                    />
                  </label>
                ))}
              </div>

              {draftProfile.age && Number(draftProfile.age) < MIN_AGE && (
                <p style={{ fontSize: 11.5, color: COLORS.amber, marginBottom: 10 }}>
                  Gassi is for {MIN_AGE} and over.
                </p>
              )}

              <button
                onClick={() => setDraftProfile((d) => ({ ...d, agreed: !d.agreed }))}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  textAlign: "left",
                  cursor: "pointer",
                  marginBottom: 14,
                }}
              >
                <span
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 6,
                    flexShrink: 0,
                    marginTop: 1,
                    border: `1px solid ${draftProfile.agreed ? COLORS.amber : COLORS.line}`,
                    background: draftProfile.agreed ? COLORS.amber : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {draftProfile.agreed && <Check size={13} color={COLORS.bg} />}
                </span>
                <span style={{ fontSize: 11.5, color: COLORS.creamDim, lineHeight: 1.5 }}>
                  I'm {MIN_AGE} or older, I'll meet people respectfully, and I understand others can see my
                  approximate location while I'm out.
                </span>
              </button>

              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  onClick={() => setEditingProfile(false)}
                  className="btn-press"
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: `1px solid ${COLORS.line}`,
                    color: COLORS.creamDim,
                    borderRadius: 12,
                    padding: "10px 0",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={saveProfile}
                  className="btn-press"
                  style={{
                    flex: 1,
                    background: COLORS.amber,
                    border: "none",
                    color: COLORS.bg,
                    borderRadius: 12,
                    padding: "10px 0",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Demo phone switcher — simulates two real phones talking through shared storage */}
        <div style={{ padding: "0 20px 14px" }}>
          <div
            style={{
              display: "flex",
              gap: 6,
              background: COLORS.surface,
              border: `1px solid ${COLORS.line}`,
              borderRadius: 12,
              padding: 4,
            }}
          >
            {[false, true].map((demo) => (
              <button
                key={String(demo)}
                onClick={() => setUseDemoPhone(demo)}
                className="btn-press"
                style={{
                  flex: 1,
                  border: "none",
                  borderRadius: 9,
                  padding: "8px 0",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  background: useDemoPhone === demo ? COLORS.amber : "transparent",
                  color: useDemoPhone === demo ? COLORS.bg : COLORS.creamDim,
                }}
              >
                {demo ? "Demo phone (Sofia)" : profile.owner ? `You (${profile.owner})` : "You"}
              </button>
            ))}
          </div>
          <p style={{ fontSize: 10.5, color: COLORS.muted, marginTop: 6, textAlign: "center" }}>
            Other real phones show up automatically. The demo phone is for testing alone.
          </p>
        </div>

        {/* Your dog card - pulls from saved profile */}
        <div style={{ padding: "0 20px 16px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: COLORS.surface,
              border: `1px solid ${COLORS.line}`,
              borderRadius: 14,
              padding: "10px 14px",
            }}
          >
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: "9999px",
                background: COLORS.sky,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                overflow: "hidden",
              }}
            >
              {myProfileFor(viewer).photo ? (
                <img
                  src={myProfileFor(viewer).photo}
                  alt=""
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <PawPrint size={14} color={COLORS.bg} />
              )}
            </div>
            <p style={{ fontSize: 12.5, color: COLORS.creamDim }}>
              {profileComplete || myProfileFor(viewer).owner ? (
                <>
                  <span style={{ color: COLORS.cream, fontWeight: 600 }}>{myProfileFor(viewer).owner}</span>{" "}
                  walks <span style={{ color: COLORS.cream, fontWeight: 600 }}>{myProfileFor(viewer).dog}</span>
                  {myProfileFor(viewer).breed ? `, ${myProfileFor(viewer).breed}` : ""}
                </>
              ) : (
                "Tap the top right to add your name, your dog, and your age."
              )}
            </p>
          </div>
        </div>

        {/* Hero status card */}
        <div style={{ padding: "0 20px" }}>
          {!isOut ? (
            <div
              style={{
                background: COLORS.surface,
                border: `1px solid ${COLORS.line}`,
                borderRadius: 24,
                padding: 28,
                textAlign: "center",
              }}
            >
              <p className="fredoka" style={{ fontSize: 19, marginBottom: 4 }}>
                {profileComplete ? `${myProfileFor(viewer).dog} is home` : "Set up your profile"}
              </p>
              <p style={{ fontSize: 13, color: COLORS.creamDim, marginBottom: 18 }}>
                Share where you are so nearby dog owners can ask to join.
              </p>

              {/* What kind of walk is this? Helps people decide whether to join. */}
              <label style={{ fontSize: 11, color: COLORS.creamDim, display: "block", marginBottom: 6 }}>
                What's the plan?
              </label>
              <input
                value={walkNote}
                onChange={(e) => setWalkNote(e.target.value.slice(0, 80))}
                placeholder="e.g. quick 15 min around the park"
                style={{
                  width: "100%",
                  background: COLORS.bg,
                  border: `1px solid ${COLORS.line}`,
                  borderRadius: 10,
                  padding: "11px 12px",
                  color: COLORS.cream,
                  fontSize: 13.5,
                  fontFamily: "'Work Sans', sans-serif",
                  boxSizing: "border-box",
                  marginBottom: 8,
                }}
              />
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18 }}>
                {NOTE_SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setWalkNote(s)}
                    className="btn-press"
                    style={{
                      background: walkNote === s ? COLORS.surfaceLight : "transparent",
                      border: `1px solid ${walkNote === s ? COLORS.amberDim : COLORS.line}`,
                      color: walkNote === s ? COLORS.amber : COLORS.creamDim,
                      borderRadius: 20,
                      padding: "6px 11px",
                      fontSize: 11.5,
                      cursor: "pointer",
                      fontFamily: "'Work Sans', sans-serif",
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>

              {/* Location mode: one-time pin vs continuous live tracking */}
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  background: COLORS.bg,
                  border: `1px solid ${COLORS.line}`,
                  borderRadius: 12,
                  padding: 4,
                  marginBottom: 8,
                }}
              >
                {[
                  { key: "pin", label: "Drop a pin" },
                  { key: "live", label: "Live location" },
                ].map((m) => (
                  <button
                    key={m.key}
                    onClick={() => setLocationMode(m.key)}
                    className="btn-press"
                    style={{
                      flex: 1,
                      border: "none",
                      borderRadius: 9,
                      padding: "9px 0",
                      fontSize: 12.5,
                      fontWeight: 600,
                      cursor: "pointer",
                      background: locationMode === m.key ? COLORS.sky : "transparent",
                      color: locationMode === m.key ? COLORS.bg : COLORS.creamDim,
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <p style={{ fontSize: 11, color: COLORS.muted, marginBottom: 18, lineHeight: 1.5 }}>
                {locationMode === "pin"
                  ? "You choose exactly where the pin goes. It stays there and won't follow you."
                  : "Your real position updates as you walk, until you end the walk."}
              </p>

              <button
                onClick={beginWalk}
                className="btn-press"
                style={{
                  width: "100%",
                  background: COLORS.amber,
                  color: COLORS.bg,
                  border: "none",
                  borderRadius: 16,
                  padding: "16px 0",
                  fontSize: 16,
                  fontWeight: 600,
                  fontFamily: "'Fredoka', sans-serif",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  cursor: "pointer",
                  transition: "transform 0.15s ease",
                }}
              >
                <Navigation size={18} />
                Gassi jetzt — going out now
              </button>
            </div>
          ) : (
            <div
              className="fade-in"
              style={{
                background: COLORS.surface,
                border: `1px solid ${COLORS.amberDim}`,
                borderRadius: 24,
                padding: 24,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <Pulse />
                <span
                  className="mono"
                  style={{ fontSize: 11, color: COLORS.amber, letterSpacing: 1, textTransform: "uppercase" }}
                >
                  {locationMode === "live" ? "Live location" : "Pinned"} · out with {myProfileFor(viewer).dog}
                </span>
              </div>

              <div className={justDropped ? "drop-in" : ""} style={{ marginBottom: 10 }}>
                <WalkMap
                  me={coords}
                  others={nearbyIds.map((id) => activeWalks[id]).filter((w) => w && w.lat != null)}
                />
              </div>
              <p
                className="mono"
                style={{ fontSize: 10, color: COLORS.muted, marginBottom: 18, textAlign: "center" }}
              >
                {geoError === "denied"
                  ? "Location off — you're visible without a position"
                  : coords
                  ? `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`
                  : "Getting position…"}
              </p>

              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 18 }}>
                <div>
                  <p style={{ fontSize: 11, color: COLORS.creamDim, marginBottom: 2 }}>Time out</p>
                  <p className="mono" style={{ fontSize: 20, fontWeight: 500 }}>
                    {fmtClock(elapsed)}
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontSize: 11, color: COLORS.creamDim, marginBottom: 2 }}>Ends automatically in</p>
                  <p
                    className="mono"
                    style={{
                      fontSize: 14,
                      fontWeight: 500,
                      color: MAX_WALK_MS / 1000 - elapsed < 300 ? COLORS.amber : COLORS.cream,
                    }}
                  >
                    {fmtClock(Math.max(0, MAX_WALK_MS / 1000 - elapsed))}
                  </p>
                </div>
              </div>

              <p style={{ fontSize: 11, color: COLORS.muted, marginBottom: 14, lineHeight: 1.5 }}>
                Others see: "{walkNote.trim() || "Out for a walk"}"
                <br />
                Your walk stops sharing after an hour, even if you forget to end it.
              </p>

              <button
                onClick={endWalk}
                className="btn-press"
                style={{
                  width: "100%",
                  background: "transparent",
                  border: `1px solid ${COLORS.line}`,
                  color: COLORS.creamDim,
                  borderRadius: 14,
                  padding: "12px 0",
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                End walk
              </button>
            </div>
          )}
        </div>

        {/* Walking together — visible to BOTH sides once a request is accepted */}
        {companions.length > 0 && (
          <div className="fade-in" style={{ padding: "16px 20px 0" }}>
            <div
              style={{
                background: COLORS.surfaceLight,
                border: `1px solid ${COLORS.amber}`,
                borderRadius: 18,
                padding: 16,
              }}
            >
              <p
                className="mono"
                style={{
                  fontSize: 10.5,
                  color: COLORS.amber,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  marginBottom: 10,
                }}
              >
                Walking together
              </p>
              {companions.map((c) => (
                <div key={c.key} style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "9999px",
                      background: COLORS.amber,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <PawPrint size={15} color={COLORS.bg} />
                  </div>
                  <p style={{ fontSize: 13.5 }}>
                    <span style={{ fontWeight: 600 }}>{c.name}</span> and {c.dog}{" "}
                    {c.theyJoinedMe ? "are joining you" : "— you're joining them"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Incoming requests - real ones, pulled from shared storage */}
        {isOut && incomingKeys.length > 0 && (
          <div className="fade-in" style={{ padding: "16px 20px 0", display: "flex", flexDirection: "column", gap: 10 }}>
            {incomingKeys.map((key) => {
              const req = requestsMap[key];
              return (
                <div
                  key={key}
                  style={{
                    background: COLORS.surfaceLight,
                    border: `1px solid ${COLORS.sky}`,
                    borderRadius: 18,
                    padding: 16,
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  {(() => {
                    const requesterId = key.slice(`${viewer}|`.length);
                    const rw = activeWalks[requesterId];
                    return (
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        <Avatar
                          src={rw && rw.photo}
                          size={40}
                          ring={COLORS.sky}
                          onClick={() =>
                            rw &&
                            setViewingPhotos({
                              photos: [rw.photo, rw.dogPhoto],
                              caption: `${req.requesterOwner} · ${req.requesterDog}`,
                            })
                          }
                        />
                        {rw && rw.dogPhoto && (
                          <div style={{ marginLeft: -14 }}>
                            <Avatar
                              src={rw.dogPhoto}
                              size={32}
                              ring={COLORS.amber}
                              onClick={() =>
                                setViewingPhotos({
                                  photos: [rw.photo, rw.dogPhoto],
                                  caption: `${req.requesterOwner} · ${req.requesterDog}`,
                                })
                              }
                            />
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13.5, fontWeight: 500 }}>
                      {req.requesterOwner} wants to join with {req.requesterDog}
                    </p>
                    <p style={{ fontSize: 11.5, color: COLORS.creamDim }}>Request sent just now</p>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={() => respondToRequest(key, false)}
                      className="btn-press"
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "9999px",
                        border: `1px solid ${COLORS.line}`,
                        background: "transparent",
                        color: COLORS.creamDim,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                      }}
                    >
                      <X size={15} />
                    </button>
                    <button
                      onClick={() => respondToRequest(key, true)}
                      className="btn-press"
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "9999px",
                        border: "none",
                        background: COLORS.amber,
                        color: COLORS.bg,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                      }}
                    >
                      <Check size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Nearby feed */}
        <div style={{ padding: "26px 20px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <Users size={15} color={COLORS.sky} />
            <span className="fredoka" style={{ fontSize: 16, fontWeight: 600 }}>
              Out right now nearby
            </span>
          </div>

          {nearbyIds.length === 0 ? (
            <div
              style={{
                background: COLORS.surface,
                border: `1px dashed ${COLORS.line}`,
                borderRadius: 16,
                padding: 20,
                textAlign: "center",
              }}
            >
              <p style={{ fontSize: 12.5, color: COLORS.creamDim }}>
                No one else is out right now. Send the link to a friend, or switch to the demo phone above to try
                it yourself.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {nearbyIds.map((id) => {
                const w = activeWalks[id];
                const reqKey = `${id}|${viewer}`;
                const status = requestsMap[reqKey]?.status;
                const mins = Math.max(1, Math.floor((Date.now() - w.startedAt) / 60000));
                const outLabel = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
                return (
                  <div
                    key={id}
                    style={{
                      background: COLORS.surface,
                      border: `1px solid ${COLORS.line}`,
                      borderRadius: 18,
                      padding: 16,
                    }}
                  >
                    <div style={{ display: "flex", gap: 10 }}>
                      <div style={{ marginTop: 3 }}>
                        <Pulse size={9} color={COLORS.amber} />
                      </div>
                      <div style={{ display: "flex", gap: 10, flex: 1 }}>
                        <div style={{ display: "flex", gap: -6 }}>
                          <Avatar
                            src={w.photo}
                            size={44}
                            ring={COLORS.sky}
                            onClick={() =>
                              setViewingPhotos({
                                photos: [w.photo, w.dogPhoto],
                                caption: `${w.owner} · ${w.dog}`,
                              })
                            }
                          />
                          {w.dogPhoto && (
                            <div style={{ marginLeft: -12 }}>
                              <Avatar
                                src={w.dogPhoto}
                                size={36}
                                ring={COLORS.amber}
                                onClick={() =>
                                  setViewingPhotos({
                                    photos: [w.photo, w.dogPhoto],
                                    caption: `${w.owner} · ${w.dog}`,
                                  })
                                }
                              />
                            </div>
                          )}
                        </div>
                        <div>
                          <p style={{ fontSize: 14.5, fontWeight: 600 }}>
                            {w.owner} · <span style={{ fontWeight: 400, color: COLORS.creamDim }}>{w.dog}</span>
                          </p>
                          <p style={{ fontSize: 12, color: COLORS.creamDim, marginTop: 2 }}>{w.breed}</p>
                          <p className="mono" style={{ fontSize: 10.5, color: COLORS.muted, marginTop: 6 }}>
                            out {outLabel}
                            {(() => {
                              const d = fmtDistance(distanceKm(coords, w));
                              return d ? ` · ${d} away` : "";
                            })()}
                            {w.live ? " · live" : ""}
                          </p>
                        </div>
                      </div>
                    </div>

                    <p style={{ fontSize: 12, color: COLORS.creamDim, margin: "10px 0 12px", fontStyle: "italic" }}>
                      "{w.note}"
                    </p>

                    {status === "accepted" ? (
                      <div
                        style={{
                          fontSize: 12.5,
                          color: COLORS.amber,
                          fontWeight: 600,
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <Check size={14} /> {w.owner} accepted — pin shared
                      </div>
                    ) : status === "declined" ? (
                      <div style={{ fontSize: 12.5, color: COLORS.muted }}>Not this time</div>
                    ) : status === "sent" ? (
                      <div
                        style={{ fontSize: 12.5, color: COLORS.sky, display: "flex", alignItems: "center", gap: 6 }}
                      >
                        <Clock size={13} /> Request sent…
                      </div>
                    ) : (
                      <button
                        onClick={() => sendRequest(id)}
                        className="btn-press"
                        style={{
                          background: "transparent",
                          border: `1px solid ${COLORS.amberDim}`,
                          color: COLORS.amber,
                          borderRadius: 12,
                          padding: "8px 14px",
                          fontSize: 12.5,
                          fontWeight: 500,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 5,
                        }}
                      >
                        Coming now, join you <ChevronRight size={13} />
                      </button>
                    )}

                    <button
                      onClick={() => setReportingId(id)}
                      style={{
                        marginTop: 12,
                        background: "transparent",
                        border: "none",
                        padding: 0,
                        fontSize: 11,
                        color: COLORS.muted,
                        textDecoration: "underline",
                        cursor: "pointer",
                      }}
                    >
                      Report or block
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {viewingPhotos && (
          <PhotoViewer
            photos={viewingPhotos.photos}
            caption={viewingPhotos.caption}
            onClose={() => setViewingPhotos(null)}
          />
        )}

        {pickingPin && (
          <PinPicker
            initial={pickerStart}
            onCancel={() => setPickingPin(false)}
            onConfirm={(c) => {
              setPickingPin(false);
              startWalk(c);
            }}
          />
        )}

        {/* Report / block sheet */}
        {reportingId && (
          <div
            className="fade-in"
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 3100,
              padding: 24,
            }}
          >
            <div
              style={{
                width: "100%",
                maxWidth: 360,
                background: COLORS.surface,
                border: `1px solid ${COLORS.line}`,
                borderRadius: 20,
                padding: 22,
              }}
            >
              {reportDone ? (
                <>
                  <p className="fredoka" style={{ fontSize: 17, marginBottom: 8 }}>
                    Report sent
                  </p>
                  <p style={{ fontSize: 12.5, color: COLORS.creamDim, lineHeight: 1.6, marginBottom: 18 }}>
                    They've been blocked and won't appear in your feed again. If you feel unsafe right now,
                    contact local emergency services — this app can't do that for you.
                  </p>
                  <button
                    onClick={closeReport}
                    className="btn-press"
                    style={{
                      width: "100%",
                      background: COLORS.amber,
                      border: "none",
                      color: COLORS.bg,
                      borderRadius: 12,
                      padding: "11px 0",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Done
                  </button>
                </>
              ) : (
                <>
                  <p className="fredoka" style={{ fontSize: 17, marginBottom: 4 }}>
                    Report {activeWalks[reportingId] ? activeWalks[reportingId].owner : "this person"}
                  </p>
                  <p style={{ fontSize: 11.5, color: COLORS.creamDim, marginBottom: 16 }}>
                    They'll be blocked from your feed either way.
                  </p>

                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
                    {REPORT_REASONS.map((r) => (
                      <button
                        key={r}
                        onClick={() => setReportReason(r)}
                        style={{
                          textAlign: "left",
                          background: reportReason === r ? COLORS.surfaceLight : "transparent",
                          border: `1px solid ${reportReason === r ? COLORS.amberDim : COLORS.line}`,
                          color: reportReason === r ? COLORS.cream : COLORS.creamDim,
                          borderRadius: 10,
                          padding: "10px 12px",
                          fontSize: 13,
                          cursor: "pointer",
                        }}
                      >
                        {r}
                      </button>
                    ))}
                  </div>

                  <textarea
                    value={reportNote}
                    onChange={(e) => setReportNote(e.target.value)}
                    placeholder="Anything else we should know? (optional)"
                    rows={3}
                    style={{
                      width: "100%",
                      background: COLORS.bg,
                      border: `1px solid ${COLORS.line}`,
                      borderRadius: 10,
                      padding: "10px 12px",
                      color: COLORS.cream,
                      fontSize: 13,
                      fontFamily: "'Work Sans', sans-serif",
                      boxSizing: "border-box",
                      resize: "none",
                      marginBottom: 14,
                    }}
                  />

                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={closeReport}
                      className="btn-press"
                      style={{
                        flex: 1,
                        background: "transparent",
                        border: `1px solid ${COLORS.line}`,
                        color: COLORS.creamDim,
                        borderRadius: 12,
                        padding: "11px 0",
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={submitReport}
                      className="btn-press"
                      style={{
                        flex: 1,
                        background: COLORS.amber,
                        border: "none",
                        color: COLORS.bg,
                        borderRadius: 12,
                        padding: "11px 0",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Report & block
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
