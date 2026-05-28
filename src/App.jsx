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

// Animated counter hook
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

// Turnstile widget
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

// Animated leaderboard row
function LeaderboardRow({ rep, index, prevTotal }) {
  const animatedTotal = useAnimatedCounter(rep.total);
  const change = rep.total - (prevTotal ?? rep.total);
  const pct = rep.maxTotal > 0 ? (rep.total / rep.maxTotal) * 100 : 0;
  const hasStreak = rep.streak >= 3;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 16,
      background: index === 0 ? `${ACCENT}10` : "#111",
      border: index === 0 ? `1px solid ${ACCENT}30` : "1px solid #1e1e1e",
      borderRadius: 10, padding: "14px 18px",
      position: "relative", overflow: "hidden",
      transition: "all 0.3s ease",
    }}>
      <div style={{
        position: "absolute", left: 0, top: 0, bottom: 0,
        width: `${pct}%`, background: index === 0 ? `${ACCENT}08` : "#ffffff04",
        transition: "width 0.8s ease",
      }}/>
      <div style={{
        fontSize: index < 3 ? 20 : 14, minWidth: 32, textAlign: "center",
        color: index < 3 ? "inherit" : "#444", fontWeight: 700, fontFamily: "'DM Mono', monospace",
      }}>
        {index < 3 ? MEDAL[index] : `#${index + 1}`}
      </div>
      <div style={{ flex: 1, fontWeight: 500, fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>
        {rep.name}
        {hasStreak && (
          <span title={`${rep.streak} week streak!`} style={{ fontSize: 14 }}>
            🔥 <span style={{ fontSize: 11, color: "#fb923c", fontFamily: "'DM Mono', monospace" }}>{rep.streak}w</span>
          </span>
        )}
      </div>
      {change !== 0 && (
        <div style={{
          fontSize: 11, fontFamily: "'DM Mono', monospace",
          color: change > 0 ? GREEN : RED,
          display: "flex", alignItems: "center", gap: 2,
        }}>
          {change > 0 ? "▲" : "▼"} {Math.abs(change)}
        </div>
      )}
      <div style={{
        fontFamily: "'DM Mono', monospace", fontSize: 18,
        color: index === 0 ? ACCENT : "#F5F5F5", fontWeight: 500,
      }}>{animatedTotal}</div>
      <div style={{ fontSize: 11, color: "#444", minWidth: 30, textAlign: "right" }}>pts</div>
    </div>
  );
}

export default function SalesTracker() {
  const [tab, setTab] = useState("entry");
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
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const prevLeaderboardRef = useRef([]);

  useEffect(() => { loadAll(); }, []);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      loadAll();
      setLastRefresh(new Date());
    }, REFRESH_INTERVAL);
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

  // Calculate streak for a rep — consecutive weeks with any submission
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

  // Submission status for current week
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

  return (
    <div style={{
      minHeight: "100vh", background: "#0A0A0A", color: "#F5F5F5",
      fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif", paddingBottom: 60,
    }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet"/>
      <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>

      {/* HEADER */}
      <div style={{
        borderBottom: "1px solid #222", padding: "24px 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, background: "#0A0A0A", zIndex: 10,
      }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: "0.2em", color: ACCENT, textTransform: "uppercase", marginBottom: 4 }}>Sales Performance</div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>Commit 2 Generate</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 11, color: "#444", fontFamily: "'DM Mono', monospace" }}>
            Live · refreshes every 60s
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {[["entry","Log Activities"],["status","This Week"],["dashboard","Dashboard"],["leaderboard","League Table"]].map(([key,label]) => (
              <button key={key} onClick={() => setTab(key)} style={{
                padding: "8px 16px", borderRadius: 6,
                border: tab === key ? `1px solid ${ACCENT}` : "1px solid #333",
                background: tab === key ? ACCENT + "18" : "transparent",
                color: tab === key ? ACCENT : "#888",
                cursor: "pointer", fontSize: 13, fontWeight: 500, fontFamily: "inherit", transition: "all 0.15s",
              }}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px" }}>
        {loading && (
          <div style={{ textAlign: "center", color: "#555", padding: 60, fontFamily: "'DM Mono', monospace", fontSize: 13 }}>
            Loading data…
          </div>
        )}

        {/* ENTRY FORM */}
        {!loading && tab === "entry" && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 500, marginBottom: 4 }}>Log your weekly activities</h2>
            <p style={{ color: "#666", fontSize: 14, marginBottom: 32 }}>Enter the number of each activity completed this week.</p>
            <div style={{ display: "grid", gap: 20 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={{ display: "block", fontSize: 11, letterSpacing: "0.15em", color: "#666", textTransform: "uppercase", marginBottom: 8 }}>Your name</label>
                  <select value={selectedRep} onChange={e => setSelectedRep(e.target.value)} style={{
                    width: "100%", padding: "12px 14px", background: "#111", border: "1px solid #2a2a2a",
                    borderRadius: 8, color: selectedRep ? "#F5F5F5" : "#555", fontSize: 14, fontFamily: "inherit",
                    appearance: "none", cursor: "pointer",
                  }}>
                    <option value="">Select your name…</option>
                    {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 11, letterSpacing: "0.15em", color: "#666", textTransform: "uppercase", marginBottom: 8 }}>Week commencing</label>
                  <input type="date" value={weekCommencing} onChange={e => setWeekCommencing(e.target.value)} style={{
                    width: "100%", padding: "12px 14px", background: "#111", border: "1px solid #2a2a2a",
                    borderRadius: 8, color: "#F5F5F5", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box",
                  }}/>
                </div>
              </div>

              <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 12, overflow: "hidden" }}>
                {activityTypes.map((a, i) => (
                  <div key={a.id} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "16px 20px",
                    borderBottom: i < activityTypes.length - 1 ? "1px solid #1a1a1a" : "none",
                  }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 2 }}>{a.name}</div>
                      {a.description && <div style={{ fontSize: 12, color: "#555" }}>{a.description}</div>}
                    </div>
                    <input
                      type="number" min="0" placeholder="0"
                      value={formValues[a.id] ?? ""}
                      onChange={e => setFormValues(v => ({ ...v, [a.id]: e.target.value }))}
                      style={{
                        width: 80, padding: "10px 12px", background: "#0A0A0A",
                        border: formValues[a.id] !== undefined && formValues[a.id] !== "" ? `1px solid ${ACCENT}55` : "1px solid #2a2a2a",
                        borderRadius: 8, color: "#F5F5F5", fontSize: 16, fontFamily: "'DM Mono', monospace",
                        textAlign: "center", outline: "none",
                      }}
                    />
                  </div>
                ))}
              </div>

              {/* TURNSTILE */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ fontSize: 11, letterSpacing: "0.15em", color: "#666", textTransform: "uppercase" }}>Security check</label>
                <div style={{
                  background: "#111", border: "1px solid #1e1e1e", borderRadius: 12,
                  padding: "16px 20px", display: "flex", alignItems: "center", gap: 16,
                }}>
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
            <h2 style={{ fontSize: 18, fontWeight: 500, marginBottom: 4 }}>This week's submission status</h2>
            <p style={{ color: "#666", fontSize: 14, marginBottom: 8 }}>
              Week commencing {formatWeek(getMondayOfWeek())}
            </p>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: "#111", border: "1px solid #1e1e1e", borderRadius: 8,
              padding: "8px 16px", marginBottom: 24,
            }}>
              <div style={{ fontSize: 13, color: "#666" }}>Submitted:</div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 18, color: submittedCount === reps.length ? GREEN : ACCENT }}>
                {submittedCount} / {reps.length}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
              {submissionStatus.map(r => (
                <div key={r.name} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  background: r.submitted ? "#14532d22" : "#111",
                  border: `1px solid ${r.submitted ? "#166534" : "#1e1e1e"}`,
                  borderRadius: 10, padding: "12px 16px",
                  transition: "all 0.2s",
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%",
                    background: r.submitted ? "#166534" : "#1e1e1e",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 14, flexShrink: 0,
                  }}>
                    {r.submitted ? "✓" : "·"}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: r.submitted ? "#F5F5F5" : "#555" }}>{r.name}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* DASHBOARD */}
        {!loading && tab === "dashboard" && (
          <div style={{ display: "grid", gap: 32 }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 500, marginBottom: 4 }}>Activity dashboard</h2>
              <p style={{ color: "#666", fontSize: 14, marginBottom: 0 }}>Team activity totals across the last 8 weeks.</p>
            </div>

            {weeklyRepChart.length > 0 && (
              <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 12, padding: 24 }}>
                <div style={{ fontSize: 11, letterSpacing: "0.15em", color: "#666", textTransform: "uppercase", marginBottom: 4 }}>
                  Week of {latestWeek && formatWeek(latestWeek)}
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                  <div style={{ fontSize: 15, fontWeight: 500 }}>Total activities by rep</div>
                  <div style={{ fontSize: 12, color: "#666", display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 20, height: 2, background: "#F97316", borderStyle: "dashed" }}/>
                    Target: {WEEKLY_TARGET}
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={weeklyRepChart} barSize={28}>
                    <XAxis dataKey="name" tick={{ fill: "#666", fontSize: 12 }} axisLine={false} tickLine={false}/>
                    <YAxis tick={{ fill: "#444", fontSize: 11 }} axisLine={false} tickLine={false}/>
                    <Tooltip contentStyle={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 8, color: "#F5F5F5", fontSize: 13 }} cursor={{ fill: "#ffffff08" }}/>
                    <ReferenceLine y={WEEKLY_TARGET} stroke={ACCENT} strokeDasharray="4 3" strokeWidth={1.5}
                      label={{ value: `Target ${WEEKLY_TARGET}`, position: "insideTopRight", fill: ACCENT, fontSize: 11 }}/>
                    <Bar dataKey="total" radius={[4,4,0,0]}>
                      {weeklyRepChart.map((entry, i) => (
                        <Cell key={i} fill={entry.total >= WEEKLY_TARGET ? "#22c55e" : i === 0 ? ACCENT : "#2a2a2a"}/>
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {activityChart.length > 0 && (
              <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 12, padding: 24 }}>
                <div style={{ fontSize: 11, letterSpacing: "0.15em", color: "#666", textTransform: "uppercase", marginBottom: 4 }}>Trend</div>
                <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 20 }}>Activity types over time</div>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={activityChart}>
                    <XAxis dataKey="week" tick={{ fill: "#666", fontSize: 12 }} axisLine={false} tickLine={false}/>
                    <YAxis tick={{ fill: "#444", fontSize: 11 }} axisLine={false} tickLine={false}/>
                    <Tooltip contentStyle={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 8, color: "#F5F5F5", fontSize: 12 }} cursor={{ stroke: "#333" }}/>
                    <Legend wrapperStyle={{ fontSize: 11, color: "#666", paddingTop: 12 }} formatter={v => v.replace(/_/g, " ")}/>
                    {activityTypes.map((a, i) => (
                      <Line key={a.id} type="monotone" dataKey={a.name.replace(/[^a-zA-Z0-9]/g, "_")}
                        stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} activeDot={{ r: 4 }}/>
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {activityChart.length === 0 && (
              <div style={{ textAlign: "center", color: "#444", padding: 60, fontFamily: "'DM Mono', monospace", fontSize: 13 }}>
                No data yet — submit some activities first.
              </div>
            )}
          </div>
        )}

        {/* LEADERBOARD */}
        {!loading && tab === "leaderboard" && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 500, marginBottom: 4 }}>League table</h2>
            <p style={{ color: "#666", fontSize: 14, marginBottom: 32 }}>
              All-time total activity score · 🔥 = 3+ week streak · ▲▼ = change from last week
            </p>
            <div style={{ display: "grid", gap: 8 }}>
              {leaderboard.map((rep, i) => {
                const prev = prevLeaderboard.find(p => p.name === rep.name);
                return (
                  <LeaderboardRow key={rep.name} rep={rep} index={i} prevTotal={prev?.total}/>
                );
              })}
            </div>
            {leaderboard.every(r => r.total === 0) && (
              <div style={{ textAlign: "center", color: "#444", padding: 60, fontFamily: "'DM Mono', monospace", fontSize: 13 }}>
                No activity data yet — start logging!
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
