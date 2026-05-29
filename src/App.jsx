import { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line, Legend, ReferenceLine } from "recharts";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY;
const WEEKLY_TARGET = 12;
const REFRESH_INTERVAL = 60000;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const ACCENT = "#F97316";
const GREEN = "#86efac";
const RED = "#fca5a5";
const COLORS = ["#F97316","#FB923C","#FDBA74","#FED7AA","#FCA5A5","#F87171","#EF4444","#DC2626","#B91C1C","#7F1D1D","#A16207","#CA8A04"];
const MEDAL = ["🥇","🥈","🥉"];

const LIGHT = {
  bg: "#F8F8F8", surface: "#FFFFFF", border: "#E5E5E5",
  border2: "#EFEFEF", text: "#111111", textSub: "#666666",
  textMuted: "#AAAAAA", chartBg: "#F0F0F0",
};
const DARK = {
  bg: "#0A0A0A", surface: "#111111", border: "#222222",
  border2: "#1A1A1A", text: "#F5F5F5", textSub: "#666666",
  textMuted: "#444444", chartBg: "#2A2A2A",
};

function getMondayOfWeek(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split("T")[0];
}

function formatWeek(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function useAnimatedCounter(target, duration = 800) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (target === 0) { setCount(0); return; }
    let start = null;
    const step = (timestamp) => {
      if (!start) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      setCount(Math.floor(progress * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target]);
  return count;
}

function TurnstileWidget({ onVerify, onExpire }) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  useEffect(() => {
    function renderWidget() {
      if (containerRef.current && window.turnstile && widgetIdRef.current === null) {
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: "dark",
          callback: (token) => onVerify(token),
          "expired-callback": () => { onExpire(); widgetIdRef.current = null; },
        });
      }
    }
    if (window.turnstile) { renderWidget(); }
    else {
      const interval = setInterval(() => {
        if (window.turnstile) { clearInterval(interval); renderWidget(); }
      }, 100);
      return () => clearInterval(interval);
    }
    return () => {
      if (widgetIdRef.current !== null && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, []);
  return <div ref={containerRef} />;
}

function LeaderboardRow({ rep, index, prevTotal, theme }) {
  const T = theme === "light" ? LIGHT : DARK;
  const animatedTotal = useAnimatedCounter(rep.total);
  const change = rep.total - (prevTotal ?? rep.total);
  const pct = rep.maxTotal > 0 ? (rep.total / rep.maxTotal) * 100 : 0;
  const hasStreak = rep.streak >= 3;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 16,
      background: index === 0 ? `${ACCENT}10` : T.surface,
      border: index === 0 ? `1px solid ${ACCENT}30` : `1px solid ${T.border}`,
      borderRadius: 10, padding: "14px 18px",
      position: "relative", overflow: "hidden", transition: "all 0.3s ease",
    }}>
      <div style={{
        position: "absolute", left: 0, top: 0, bottom: 0,
        width: `${pct}%`, background: index === 0 ? `${ACCENT}08` : `${T.text}04`,
        transition: "width 0.8s ease",
      }}/>
      <div style={{
        fontSize: index < 3 ? 20 : 14, minWidth: 32, textAlign: "center",
        color: index < 3 ? "inherit" : T.textMuted, fontWeight: 700, fontFamily: "'DM Mono', monospace",
      }}>
        {index < 3 ? MEDAL[index] : `#${index + 1}`}
      </div>
      <div style={{ flex: 1, fontWeight: 500, fontSize: 15, color: T.text, display: "flex", alignItems: "center", gap: 8 }}>
        {rep.name}
        {hasStreak && (
          <span title={`${rep.streak} week streak!`} style={{ fontSize: 14 }}>
            🔥 <span style={{ fontSize: 11, color: "#fb923c", fontFamily: "'DM Mono', monospace" }}>{rep.streak}w</span>
          </span>
        )}
      </div>
      {change !== 0 && (
        <div style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: change > 0 ? GREEN : RED, display: "flex", alignItems: "center", gap: 2 }}>
          {change > 0 ? "▲" : "▼"} {Math.abs(change)}
        </div>
      )}
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 18, color: index === 0 ? ACCENT : T.text, fontWeight: 500 }}>{animatedTotal}</div>
      <div style={{ fontSize: 11, color: T.textMuted, minWidth: 30, textAlign: "right" }}>pts</div>
    </div>
  );
}

// Mini bar chart for a single activity type
function ActivityMiniChart({ activityType, entries, reps, theme, fullWidth }) {
  const T = theme === "light" ? LIGHT : DARK;

  const data = reps.map(r => ({
    name: r.name.split(" ")[0],
    total: entries
      .filter(e => Number(e.rep_id) === Number(r.id) && Number(e.activity_type_id) === Number(activityType.id))
      .reduce((acc, e) => acc + (Number(e.value) || 0), 0),
  })).sort((a, b) => b.total - a.total);

  const leader = data[0];

  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: 12, padding: 20,
      gridColumn: fullWidth ? "1 / -1" : undefined,
    }}>
      <div style={{ fontSize: 11, letterSpacing: "0.15em", color: T.textSub, textTransform: "uppercase", marginBottom: 4 }}>
        {activityType.name}
      </div>
      {leader && leader.total > 0 && (
        <div style={{ fontSize: 12, color: ACCENT, marginBottom: 12, fontWeight: 500 }}>
          🏆 {leader.name} · {leader.total} pts
        </div>
      )}
      <ResponsiveContainer width="100%" height={fullWidth ? 180 : 160}>
        <BarChart data={data} barSize={fullWidth ? 32 : 18} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <XAxis dataKey="name" tick={{ fill: T.textSub, fontSize: fullWidth ? 12 : 10 }} axisLine={false} tickLine={false}/>
          <YAxis tick={{ fill: T.textMuted, fontSize: 10 }} axisLine={false} tickLine={false}/>
          <Tooltip
            contentStyle={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontSize: 12 }}
            cursor={{ fill: theme === "light" ? "#00000008" : "#ffffff08" }}
          />
          <Bar dataKey="total" radius={[4,4,0,0]}>
            {data.map((entry, i) => (
              <Cell key={i} fill={i === 0 ? ACCENT : T.chartBg}/>
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function SalesTracker() {
  const [tab, setTab] = useState("entry");
  const [theme, setTheme] = useState("dark");
  const [reps, setReps] = useState([]);
  const [activityTypes, setActivityTypes] = useState([]);
  const [entries, setEntries] = useState([]);
  const [selectedRep, setSelectedRep] = useState("");
  const [weekCommencing, setWeekCommencing] = useState(getMondayOfWeek());
  const [formValues, setFormValues] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [turnstileToken, setTurnstileToken] = useState(null);
  const prevLeaderboardRef = useRef([]);

  const T = theme === "light" ? LIGHT : DARK;

  useEffect(() => { loadAll(); }, []);

  useEffect(() => {
    const timer = setInterval(() => { loadAll(); }, REFRESH_INTERVAL);
    return () => clearInterval(timer);
  }, []);

  async function loadAll() {
    const [repsRes, typesRes, entriesRes] = await Promise.all([
      supabase.from("reps").select("*").order("name"),
      supabase.from("activity_types").select("*").order("id"),
      supabase.from("weekly_entries").select("*").order("week_commencing", { ascending: false }),
    ]);
    if (repsRes.data) setReps(repsRes.data);
    if (typesRes.data) setActivityTypes(typesRes.data);
    if (entriesRes.data) setEntries(entriesRes.data);
    setLoading(false);
  }

  async function handleSubmit() {
    if (!selectedRep) return setSubmitMsg({ type: "error", text: "Please select your name." });
    if (!turnstileToken) return setSubmitMsg({ type: "error", text: "Please complete the security check." });
    setSubmitting(true);
    setSubmitMsg(null);
    await supabase.from("weekly_entries")
      .delete()
      .eq("rep_id", Number(selectedRep))
      .eq("week_commencing", weekCommencing);
    const rows = activityTypes.map(a => ({
      rep_id: Number(selectedRep),
      activity_type_id: Number(a.id),
      week_commencing: weekCommencing,
      value: Number(formValues[a.id]) || 0,
    }));
    const { error } = await supabase.from("weekly_entries").insert(rows);
    setSubmitting(false);
    if (error) {
      setSubmitMsg({ type: "error", text: "Error saving. Please try again." });
    } else {
      setSubmitMsg({ type: "success", text: "Activities saved successfully! ✓" });
      setFormValues({});
      setTurnstileToken(null);
      loadAll();
    }
  }

  function calcStreak(repId) {
    const weeks = [...new Set(entries
      .filter(e => Number(e.rep_id) === Number(repId))
      .map(e => e.week_commencing)
    )].sort().reverse();
    if (weeks.length === 0) return 0;
    let streak = 1;
    for (let i = 0; i < weeks.length - 1; i++) {
      const curr = new Date(weeks[i]);
      const prev = new Date(weeks[i + 1]);
      const diff = (curr - prev) / (1000 * 60 * 60 * 24);
      if (diff === 7) streak++;
      else break;
    }
    return streak;
  }

  function getLeaderboard() {
    const totals = {};
    reps.forEach(r => { totals[Number(r.id)] = { name: r.name, total: 0, streak: calcStreak(r.id) }; });
    entries.forEach(e => {
      const key = Number(e.rep_id);
      if (totals[key] !== undefined) totals[key].total += Number(e.value) || 0;
    });
    const sorted = Object.values(totals).sort((a, b) => b.total - a.total);
    const maxTotal = sorted[0]?.total || 0;
    return sorted.map(r => ({ ...r, maxTotal }));
  }

  function getActivityBreakdown() {
    const weeks = [...new Set(entries.map(e => e.week_commencing))].sort().slice(-8);
    return weeks.map(w => {
      const row = { week: formatWeek(w) };
      activityTypes.forEach(a => {
        const sum = entries
          .filter(e => e.week_commencing === w && Number(e.activity_type_id) === Number(a.id))
          .reduce((acc, e) => acc + (Number(e.value) || 0), 0);
        row[a.name.replace(/[^a-zA-Z0-9]/g, "_")] = sum;
      });
      return row;
    });
  }

  function getRepTotalsForWeek(week) {
    return reps.map(r => ({
      name: r.name.split(" ")[0],
      total: entries
        .filter(e => Number(e.rep_id) === Number(r.id) && e.week_commencing === week)
        .reduce((acc, e) => acc + (Number(e.value) || 0), 0),
    })).sort((a, b) => b.total - a.total);
  }

  function getSubmissionStatus() {
    const currentWeek = getMondayOfWeek();
    return reps.map(r => {
      const submitted = entries.some(e => Number(e.rep_id) === Number(r.id) && e.week_commencing === currentWeek);
      return { name: r.name, submitted };
    }).sort((a, b) => b.submitted - a.submitted);
  }

  const leaderboard = getLeaderboard();
  const prevLeaderboard = prevLeaderboardRef.current;
  useEffect(() => { prevLeaderboardRef.current = leaderboard; }, [entries]);

  const activityChart = getActivityBreakdown();
  const latestWeek = [...new Set(entries.map(e => e.week_commencing))].sort().slice(-1)[0];
  const weeklyRepChart = latestWeek ? getRepTotalsForWeek(latestWeek) : [];
  const submissionStatus = getSubmissionStatus();
  const submittedCount = submissionStatus.filter(r => r.submitted).length;

  // Split activity types: first 4 in grid, last one full width
  const gridActivities = activityTypes.slice(0, 4);
  const fullWidthActivity = activityTypes[4];

  const TABS = [
    ["entry", "Log Activities"],
    ["status", "This Week"],
    ["dashboard", "Dashboard"],
    ["activity", "By Activity"],
    ["leaderboard", "League Table"],
  ];

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif", paddingBottom: 60, transition: "background 0.2s, color 0.2s" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet"/>
      <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>

      {/* HEADER */}
      <div style={{
        borderBottom: `1px solid ${T.border}`, padding: "20px 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, background: T.bg, zIndex: 10,
      }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: "0.2em", color: ACCENT, textTransform: "uppercase", marginBottom: 4 }}>Sales Performance</div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: T.text }}>Commit 2 Generate</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 11, color: T.textMuted, fontFamily: "'DM Mono', monospace" }}>Live · 60s refresh</div>

          {/* DARK / LIGHT TOGGLE */}
          <button onClick={() => setTheme(t => t === "dark" ? "light" : "dark")} style={{
            padding: "7px 14px", borderRadius: 6,
            border: `1px solid ${T.border}`,
            background: "transparent", color: T.textSub,
            cursor: "pointer", fontSize: 13, fontFamily: "inherit",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
          </button>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {TABS.map(([key, label]) => (
              <button key={key} onClick={() => setTab(key)} style={{
                padding: "8px 14px", borderRadius: 6,
                border: tab === key ? `1px solid ${ACCENT}` : `1px solid ${T.border}`,
                background: tab === key ? ACCENT + "18" : "transparent",
                color: tab === key ? ACCENT : T.textSub,
                cursor: "pointer", fontSize: 13, fontWeight: 500, fontFamily: "inherit", transition: "all 0.15s",
              }}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>
        {loading && (
          <div style={{ textAlign: "center", color: T.textMuted, padding: 60, fontFamily: "'DM Mono', monospace", fontSize: 13 }}>
            Loading data…
          </div>
        )}

        {/* ENTRY FORM */}
        {!loading && tab === "entry" && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 500, marginBottom: 4, color: T.text }}>Log your weekly activities</h2>
            <p style={{ color: T.textSub, fontSize: 14, marginBottom: 32 }}>Enter the number of each activity completed this week.</p>
            <div style={{ display: "grid", gap: 20 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={{ display: "block", fontSize: 11, letterSpacing: "0.15em", color: T.textSub, textTransform: "uppercase", marginBottom: 8 }}>Your name</label>
                  <select value={selectedRep} onChange={e => setSelectedRep(e.target.value)} style={{
                    width: "100%", padding: "12px 14px", background: T.surface, border: `1px solid ${T.border2}`,
                    borderRadius: 8, color: selectedRep ? T.text : T.textSub, fontSize: 14, fontFamily: "inherit", appearance: "none", cursor: "pointer",
                  }}>
                    <option value="">Select your name…</option>
                    {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 11, letterSpacing: "0.15em", color: T.textSub, textTransform: "uppercase", marginBottom: 8 }}>Week commencing</label>
                  <input type="date" value={weekCommencing} onChange={e => setWeekCommencing(e.target.value)} style={{
                    width: "100%", padding: "12px 14px", background: T.surface, border: `1px solid ${T.border2}`,
                    borderRadius: 8, color: T.text, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box",
                  }}/>
                </div>
              </div>

              <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
                {activityTypes.map((a, i) => (
                  <div key={a.id} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px",
                    borderBottom: i < activityTypes.length - 1 ? `1px solid ${T.border2}` : "none",
                  }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 2, color: T.text }}>{a.name}</div>
                      {a.description && <div style={{ fontSize: 12, color: T.textSub }}>{a.description}</div>}
                    </div>
                    <input
                      type="number" min="0" placeholder="0"
                      value={formValues[a.id] ?? ""}
                      onChange={e => setFormValues(v => ({ ...v, [a.id]: e.target.value }))}
                      style={{
                        width: 80, padding: "10px 12px", background: T.bg,
                        border: formValues[a.id] !== undefined && formValues[a.id] !== "" ? `1px solid ${ACCENT}55` : `1px solid ${T.border2}`,
                        borderRadius: 8, color: T.text, fontSize: 16, fontFamily: "'DM Mono', monospace",
                        textAlign: "center", outline: "none",
                      }}
                    />
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ fontSize: 11, letterSpacing: "0.15em", color: T.textSub, textTransform: "uppercase" }}>Security check</label>
                <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: "16px 20px", display: "flex", alignItems: "center", gap: 16 }}>
                  <TurnstileWidget onVerify={(token) => setTurnstileToken(token)} onExpire={() => setTurnstileToken(null)}/>
                  {turnstileToken && <div style={{ fontSize: 12, color: GREEN }}>✓ Verified by Cloudflare Turnstile</div>}
                </div>
              </div>

              {submitMsg && (
                <div style={{
                  padding: "12px 16px", borderRadius: 8, fontSize: 13,
                  background: submitMsg.type === "success" ? "#14532d33" : "#7f1d1d33",
                  border: `1px solid ${submitMsg.type === "success" ? "#166534" : "#991b1b"}`,
                  color: submitMsg.type === "success" ? GREEN : RED,
                }}>{submitMsg.text}</div>
              )}

              <button onClick={handleSubmit} disabled={submitting} style={{
                padding: "14px 28px", background: ACCENT, border: "none", borderRadius: 8,
                color: "#fff", fontSize: 14, fontWeight: 700, fontFamily: "inherit",
                cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.6 : 1,
                letterSpacing: "0.02em", alignSelf: "flex-start",
              }}>
                {submitting ? "Saving…" : "Submit activities"}
              </button>
            </div>
          </div>
        )}

        {/* THIS WEEK STATUS */}
        {!loading && tab === "status" && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 500, marginBottom: 4, color: T.text }}>This week's submission status</h2>
            <p style={{ color: T.textSub, fontSize: 14, marginBottom: 8 }}>Week commencing {formatWeek(getMondayOfWeek())}</p>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8,
              padding: "8px 16px", marginBottom: 24,
            }}>
              <div style={{ fontSize: 13, color: T.textSub }}>Submitted:</div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 18, color: submittedCount === reps.length ? GREEN : ACCENT }}>
                {submittedCount} / {reps.length}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
              {submissionStatus.map(r => (
                <div key={r.name} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  background: r.submitted ? "#14532d22" : T.surface,
                  border: `1px solid ${r.submitted ? "#166534" : T.border}`,
                  borderRadius: 10, padding: "12px 16px", transition: "all 0.2s",
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%",
                    background: r.submitted ? "#166534" : T.border,
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0,
                  }}>
                    {r.submitted ? "✓" : "·"}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: r.submitted ? T.text : T.textSub }}>{r.name}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* DASHBOARD */}
        {!loading && tab === "dashboard" && (
          <div style={{ display: "grid", gap: 32 }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 500, marginBottom: 4, color: T.text }}>Activity dashboard</h2>
              <p style={{ color: T.textSub, fontSize: 14 }}>Team activity totals across the last 8 weeks.</p>
            </div>

            {weeklyRepChart.length > 0 && (
              <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 24 }}>
                <div style={{ fontSize: 11, letterSpacing: "0.15em", color: T.textSub, textTransform: "uppercase", marginBottom: 4 }}>
                  Week of {latestWeek && formatWeek(latestWeek)}
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                  <div style={{ fontSize: 15, fontWeight: 500, color: T.text }}>Total activities by rep</div>
                  <div style={{ fontSize: 12, color: T.textSub, display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 20, height: 2, background: ACCENT }}/>
                    Target: {WEEKLY_TARGET}
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={weeklyRepChart} barSize={28}>
                    <XAxis dataKey="name" tick={{ fill: T.textSub, fontSize: 12 }} axisLine={false} tickLine={false}/>
                    <YAxis tick={{ fill: T.textMuted, fontSize: 11 }} axisLine={false} tickLine={false}/>
                    <Tooltip contentStyle={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontSize: 13 }} cursor={{ fill: theme === "light" ? "#00000008" : "#ffffff08" }}/>
                    <ReferenceLine y={WEEKLY_TARGET} stroke={ACCENT} strokeDasharray="4 3" strokeWidth={1.5}
                      label={{ value: `Target ${WEEKLY_TARGET}`, position: "insideTopRight", fill: ACCENT, fontSize: 11 }}/>
                    <Bar dataKey="total" radius={[4,4,0,0]}>
                      {weeklyRepChart.map((entry, i) => (
                        <Cell key={i} fill={entry.total >= WEEKLY_TARGET ? "#22c55e" : i === 0 ? ACCENT : T.chartBg}/>
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {activityChart.length > 0 && (
              <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 24 }}>
                <div style={{ fontSize: 11, letterSpacing: "0.15em", color: T.textSub, textTransform: "uppercase", marginBottom: 4 }}>Trend</div>
                <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 20, color: T.text }}>Activity types over time</div>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={activityChart}>
                    <XAxis dataKey="week" tick={{ fill: T.textSub, fontSize: 12 }} axisLine={false} tickLine={false}/>
                    <YAxis tick={{ fill: T.textMuted, fontSize: 11 }} axisLine={false} tickLine={false}/>
                    <Tooltip contentStyle={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontSize: 12 }} cursor={{ stroke: T.border }}/>
                    <Legend wrapperStyle={{ fontSize: 11, color: T.textSub, paddingTop: 12 }} formatter={v => v.replace(/_/g, " ")}/>
                    {activityTypes.map((a, i) => (
                      <Line key={a.id} type="monotone" dataKey={a.name.replace(/[^a-zA-Z0-9]/g, "_")}
                        stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} activeDot={{ r: 4 }}/>
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {activityChart.length === 0 && (
              <div style={{ textAlign: "center", color: T.textMuted, padding: 60, fontFamily: "'DM Mono', monospace", fontSize: 13 }}>
                No data yet — submit some activities first.
              </div>
            )}
          </div>
        )}

        {/* BY ACTIVITY TAB */}
        {!loading && tab === "activity" && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 500, marginBottom: 4, color: T.text }}>Activity breakdown</h2>
            <p style={{ color: T.textSub, fontSize: 14, marginBottom: 24 }}>All-time totals per rep, broken down by each activity type.</p>

            {activityTypes.length === 0 ? (
              <div style={{ textAlign: "center", color: T.textMuted, padding: 60, fontFamily: "'DM Mono', monospace", fontSize: 13 }}>
                No activity types found.
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {gridActivities.map(a => (
                  <ActivityMiniChart key={a.id} activityType={a} entries={entries} reps={reps} theme={theme} fullWidth={false}/>
                ))}
                {fullWidthActivity && (
                  <ActivityMiniChart key={fullWidthActivity.id} activityType={fullWidthActivity} entries={entries} reps={reps} theme={theme} fullWidth={true}/>
                )}
              </div>
            )}
          </div>
        )}

        {/* LEADERBOARD */}
        {!loading && tab === "leaderboard" && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 500, marginBottom: 4, color: T.text }}>League table</h2>
            <p style={{ color: T.textSub, fontSize: 14, marginBottom: 32 }}>
              All-time total activity score · 🔥 = 3+ week streak · ▲▼ = change from last week
            </p>
            <div style={{ display: "grid", gap: 8 }}>
              {leaderboard.map((rep, i) => {
                const prev = prevLeaderboard.find(p => p.name === rep.name);
                return <LeaderboardRow key={rep.name} rep={rep} index={i} prevTotal={prev?.total} theme={theme}/>;
              })}
            </div>
            {leaderboard.every(r => r.total === 0) && (
              <div style={{ textAlign: "center", color: T.textMuted, padding: 60, fontFamily: "'DM Mono', monospace", fontSize: 13 }}>
                No activity data yet — start logging!
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
