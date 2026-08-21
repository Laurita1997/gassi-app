import React, { useState, useEffect, useRef } from "react";
import { PawPrint, MapPin, Clock, Users, X, Check, Navigation, ChevronRight } from "lucide-react";
import { createClient } from "@supabase/supabase-js";

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

function fmtClock(totalSeconds) {
  const m = Math.floor(totalSeconds / 60)
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

const DEFAULT_PROFILE = { owner: "Laura", dog: "Katy", breed: "Toy Poodle" };
const DEMO_USER = { id: "sofia", owner: "Sofia", dog: "Nino", breed: "Mini Poodle", note: "Chill pace, coffee stop halfway" };

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
  const viewer = deviceId ? (useDemoPhone ? deviceId + ":demo" : deviceId) : null;

  const isOut = Boolean(viewer && activeWalks[viewer]);
  const walkStart = viewer && activeWalks[viewer] ? activeWalks[viewer].startedAt : null;
  const [elapsed, setElapsed] = useState(0);

  const myProfileFor = (id) => (id && id.endsWith(":demo") ? DEMO_USER : profile);

  useEffect(() => {
    let id = localStorage.getItem("gassi:deviceId");
    if (!id) {
      id = "u_" + Math.random().toString(36).slice(2, 10);
      localStorage.setItem("gassi:deviceId", id);
    }
    setDeviceId(id);

    const saved = localProfile.get();
    if (saved) setProfile(saved);

    (async () => {
      await refreshShared();
      setLoaded(true);
    })();
    pollRef.current = setInterval(refreshShared, 3000);
    return () => clearInterval(pollRef.current);
  }, []);

  // Pull the live state of the world from the database.
  const refreshShared = async () => {
    try {
      const { data: walks, error: wErr } = await supabase.from("walks").select("*");
      if (wErr) throw wErr;
      const walkMap = {};
      (walks || []).forEach((w) => {
        walkMap[w.id] = {
          owner: w.owner,
          dog: w.dog,
          breed: w.breed,
          note: w.note,
          startedAt: new Date(w.started_at).getTime(),
        };
      });
      setActiveWalks(walkMap);

      const { data: reqs, error: rErr } = await supabase.from("requests").select("*");
      if (rErr) throw rErr;
      const reqMap = {};
      (reqs || []).forEach((r) => {
        reqMap[`${r.target_id}_${r.requester_id}`] = {
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

  const startWalk = async () => {
    if (!viewer) return;
    const me = myProfileFor(viewer);
    setJustDropped(true);
    setTimeout(() => setJustDropped(false), 1400);
    try {
      const { error } = await supabase.from("walks").upsert({
        id: viewer,
        owner: me.owner,
        dog: me.dog,
        breed: me.breed,
        note: me.note || "Out for a walk",
        started_at: new Date().toISOString(),
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
      await supabase.from("walks").delete().eq("id", viewer);
      await refreshShared();
    } catch (e) {
      setSaveError(true);
    }
  };

  const saveProfile = async () => {
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

  // Requests sent TO me that are still pending
  const incomingKeys = viewer
    ? Object.keys(requestsMap).filter(
        (k) => k.startsWith(`${viewer}_`) && requestsMap[k].status === "sent"
      )
    : [];
  const nearbyIds = Object.keys(activeWalks).filter((id) => id !== viewer);

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
            {profile.owner} · {profile.dog}
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
              zIndex: 50,
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
              ].map((f) => (
                <div key={f.key} style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, color: COLORS.creamDim, display: "block", marginBottom: 4 }}>
                    {f.label}
                  </label>
                  <input
                    value={draftProfile[f.key]}
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
                {demo ? "Demo phone (Sofia)" : `You (${profile.owner})`}
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
              }}
            >
              <PawPrint size={14} color={COLORS.bg} />
            </div>
            <p style={{ fontSize: 12.5, color: COLORS.creamDim }}>
              <span style={{ color: COLORS.cream, fontWeight: 600 }}>{myProfileFor(viewer).owner}</span> walks{" "}
              <span style={{ color: COLORS.cream, fontWeight: 600 }}>{myProfileFor(viewer).dog}</span>,{" "}
              {myProfileFor(viewer).breed}
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
                {myProfileFor(viewer).dog} is home
              </p>
              <p style={{ fontSize: 13, color: COLORS.creamDim, marginBottom: 22 }}>
                Drop a pin when you head out — nearby dog owners can ask to join.
              </p>
              <button
                onClick={startWalk}
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
                  Live · out with {myProfileFor(viewer).dog}
                </span>
              </div>

              <div
                className={justDropped ? "drop-in" : ""}
                style={{
                  height: 140,
                  borderRadius: 16,
                  background:
                    "radial-gradient(circle at 50% 45%, #33513E 0%, #223629 60%, #1B2A20 100%)",
                  position: "relative",
                  marginBottom: 18,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%,-50%)",
                  }}
                >
                  <Pulse size={16} />
                </div>
                <span
                  className="mono"
                  style={{
                    position: "absolute",
                    bottom: 10,
                    left: 12,
                    fontSize: 10,
                    color: COLORS.muted,
                  }}
                >
                  Karmeliterplatz area
                </span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 18 }}>
                <div>
                  <p style={{ fontSize: 11, color: COLORS.creamDim, marginBottom: 2 }}>Time out</p>
                  <p className="mono" style={{ fontSize: 20, fontWeight: 500 }}>
                    {fmtClock(elapsed)}
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontSize: 11, color: COLORS.creamDim, marginBottom: 2 }}>Visible to</p>
                  <p style={{ fontSize: 14, fontWeight: 500 }}>1.5 km radius</p>
                </div>
              </div>

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
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: "9999px",
                      background: COLORS.sky,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <PawPrint size={18} color={COLORS.bg} />
                  </div>
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
                const reqKey = `${id}_${viewer}`;
                const status = requestsMap[reqKey]?.status;
                const mins = Math.max(1, Math.floor((Date.now() - w.startedAt) / 60000));
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
                      <div>
                        <p style={{ fontSize: 14.5, fontWeight: 600 }}>
                          {w.owner} · <span style={{ fontWeight: 400, color: COLORS.creamDim }}>{w.dog}</span>
                        </p>
                        <p style={{ fontSize: 12, color: COLORS.creamDim, marginTop: 2 }}>{w.breed}</p>
                        <p className="mono" style={{ fontSize: 10.5, color: COLORS.muted, marginTop: 6 }}>
                          out {mins}m
                        </p>
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
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
