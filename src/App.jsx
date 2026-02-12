import { useState, useEffect, useCallback, useRef } from "react";

// ============================================
// SPORTS JOURNAL MVP
// Role-based: Coach / Parent / Player
// Scope: Team or Individual Player
// ============================================

// --- CONFIG (Replace with your Supabase credentials) ---
const SUPABASE_URL = "YOUR_SUPABASE_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

// --- SUPABASE LITE CLIENT ---
const supabase = {
  auth: {
    token: null,
    user: null,
    async signUp(email, password, metadata = {}) {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({ email, password, data: metadata }),
      });
      const data = await res.json();
      if (data.access_token) {
        this.token = data.access_token;
        this.user = data.user;
        localStorage.setItem("sb_token", data.access_token);
        localStorage.setItem("sb_user", JSON.stringify(data.user));
      }
      return data;
    },
    async signIn(email, password) {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (data.access_token) {
        this.token = data.access_token;
        this.user = data.user;
        localStorage.setItem("sb_token", data.access_token);
        localStorage.setItem("sb_user", JSON.stringify(data.user));
      }
      return data;
    },
    signOut() {
      this.token = null;
      this.user = null;
      localStorage.removeItem("sb_token");
      localStorage.removeItem("sb_user");
    },
    restore() {
      this.token = localStorage.getItem("sb_token");
      const u = localStorage.getItem("sb_user");
      if (u) this.user = JSON.parse(u);
      return !!this.token;
    },
  },
  from(table) {
    let url = `${SUPABASE_URL}/rest/v1/${table}`;
    let method = "GET";
    let body = null;
    let headers = {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${supabase.auth.token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    };
    let queryParams = [];

    const builder = {
      select(cols = "*") {
        queryParams.push(`select=${cols}`);
        return builder;
      },
      insert(data) {
        method = "POST";
        body = JSON.stringify(data);
        return builder;
      },
      update(data) {
        method = "PATCH";
        body = JSON.stringify(data);
        return builder;
      },
      delete() {
        method = "DELETE";
        return builder;
      },
      eq(col, val) {
        queryParams.push(`${col}=eq.${val}`);
        return builder;
      },
      order(col, { ascending = true } = {}) {
        queryParams.push(`order=${col}.${ascending ? "asc" : "desc"}`);
        return builder;
      },
      limit(n) {
        queryParams.push(`limit=${n}`);
        return builder;
      },
      async then(resolve) {
        const q = queryParams.length ? "?" + queryParams.join("&") : "";
        try {
          const res = await fetch(url + q, { method, headers, body });
          const data = res.ok ? await res.json() : [];
          resolve({ data, error: res.ok ? null : data });
        } catch (e) {
          resolve({ data: [], error: e });
        }
      },
    };
    return builder;
  },
  storage: {
    from(bucket) {
      return {
        async upload(path, file) {
          const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
            method: "POST",
            headers: {
              apikey: SUPABASE_ANON_KEY,
              Authorization: `Bearer ${supabase.auth.token}`,
            },
            body: file,
          });
          return { error: res.ok ? null : await res.json() };
        },
        getPublicUrl(path) {
          return { data: { publicUrl: `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}` } };
        },
      };
    },
  },
};

// --- DEMO MODE ---
const DEMO = SUPABASE_URL === "YOUR_SUPABASE_URL";

function demoData() {
  return {
    profile: { role: null, display_name: "Coach Demo" },
    teams: [],
    seasons: [],
    players: [],
    entries: [],
  };
}

// --- SPORT OPTIONS ---
const SPORTS = [
  { name: "Soccer", emoji: "⚽" },
  { name: "Baseball", emoji: "⚾" },
  { name: "Basketball", emoji: "🏀" },
  { name: "Football", emoji: "🏈" },
  { name: "Hockey", emoji: "🏒" },
  { name: "Lacrosse", emoji: "🥍" },
  { name: "Volleyball", emoji: "🏐" },
  { name: "Swimming", emoji: "🏊" },
  { name: "Track & Field", emoji: "🏃" },
  { name: "Tennis", emoji: "🎾" },
  { name: "Other", emoji: "🏅" },
];

const POSITIONS_BY_SPORT = {
  Soccer: ["GK", "CB", "LB", "RB", "CDM", "CM", "CAM", "LW", "RW", "ST"],
  Baseball: ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"],
  Basketball: ["PG", "SG", "SF", "PF", "C"],
  Football: ["QB", "RB", "WR", "TE", "OL", "DL", "LB", "CB", "S", "K"],
  Hockey: ["G", "LD", "RD", "LW", "C", "RW"],
  Lacrosse: ["G", "D", "M", "A"],
  Volleyball: ["S", "OH", "MB", "OPP", "L", "DS"],
};

const CONTRIBUTIONS_BY_SPORT = {
  Soccer: ["goal", "assist", "save", "mvp", "highlight"],
  Baseball: ["hit", "run", "rbi", "strikeout", "save", "mvp", "highlight"],
  Basketball: ["points", "rebound", "assist", "steal", "block", "mvp", "highlight"],
  Football: ["touchdown", "pass", "sack", "interception", "mvp", "highlight"],
  Hockey: ["goal", "assist", "save", "mvp", "highlight"],
  default: ["goal", "assist", "save", "mvp", "highlight"],
};

// --- PROMPTS ---
const GAME_PROMPTS = [
  "What moment from today's game will you remember in 10 years?",
  "What did you see today that made you proud?",
  "Describe the energy of the team in one line.",
  "What happened today that no stat sheet will ever capture?",
  "If you could replay one moment from today, what would it be?",
  "What would the team say was the highlight?",
  "What was the turning point?",
  "Who stepped up when it mattered?",
  "What was the mood on the ride home?",
  "What surprised you today?",
];

const PRACTICE_PROMPTS = [
  "What clicked for the first time today?",
  "Who put in extra work when nobody was watching?",
  "What drill will they still be talking about?",
  "What was the energy like at practice today?",
  "What small moment made today's practice special?",
  "Who showed the most improvement today?",
  "What would you want to remember about today's session?",
  "What was the best thing you heard on the field today?",
];

function getPrompt(type) {
  const prompts = type === "practice" ? PRACTICE_PROMPTS : GAME_PROMPTS;
  return prompts[Math.floor(Math.random() * prompts.length)];
}

// --- STYLES ---
const theme = {
  bg: "#FAFAF7",
  card: "#FFFFFF",
  primary: "#1B4332",
  primaryLight: "#2D6A4F",
  accent: "#E07A5F",
  accentLight: "#F2CC8F",
  text: "#1A1A1A",
  textMuted: "#6B7280",
  textLight: "#9CA3AF",
  border: "#E8E8E4",
  borderLight: "#F0F0EC",
  win: "#2D6A4F",
  loss: "#C1121F",
  draw: "#6B7280",
  practice: "#457B9D",
  tournament: "#E07A5F",
  event: "#9B5DE5",
};

const fonts = {
  display: "'Crimson Pro', Georgia, serif",
  body: "'DM Sans', -apple-system, sans-serif",
  mono: "'JetBrains Mono', monospace",
};

// --- GLOBAL STYLES ---
const GlobalStyle = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@400;500;600;700&family=DM+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
    
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: ${fonts.body};
      background: ${theme.bg};
      color: ${theme.text};
      -webkit-font-smoothing: antialiased;
    }
    
    input, textarea, select, button {
      font-family: ${fonts.body};
    }
    
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    
    @keyframes slideUp {
      from { opacity: 0; transform: translateY(24px); }
      to { opacity: 1; transform: translateY(0); }
    }
    
    @keyframes pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.05); }
    }
    
    .fade-in { animation: fadeIn 0.4s ease-out both; }
    .slide-up { animation: slideUp 0.5s ease-out both; }
    
    .btn {
      padding: 12px 24px;
      border: none;
      border-radius: 10px;
      font-weight: 600;
      font-size: 15px;
      cursor: pointer;
      transition: all 0.2s;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    
    .btn-primary {
      background: ${theme.primary};
      color: white;
    }
    .btn-primary:hover { background: ${theme.primaryLight}; transform: translateY(-1px); }
    
    .btn-accent {
      background: ${theme.accent};
      color: white;
    }
    .btn-accent:hover { opacity: 0.9; transform: translateY(-1px); }
    
    .btn-ghost {
      background: transparent;
      color: ${theme.textMuted};
      border: 1px solid ${theme.border};
    }
    .btn-ghost:hover { background: ${theme.borderLight}; }
    
    .btn-sm { padding: 8px 16px; font-size: 13px; }
    
    .input {
      width: 100%;
      padding: 12px 16px;
      border: 1.5px solid ${theme.border};
      border-radius: 10px;
      font-size: 15px;
      background: ${theme.card};
      transition: border-color 0.2s;
      outline: none;
    }
    .input:focus { border-color: ${theme.primary}; }
    
    .label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: ${theme.textMuted};
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
    }
    
    .card {
      background: ${theme.card};
      border-radius: 14px;
      border: 1px solid ${theme.border};
      padding: 20px;
    }
    
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
  `}</style>
);

// --- LAYOUT ---
function AppShell({ children, title, subtitle, onBack, actions }) {
  return (
    <div style={{ maxWidth: 480, margin: "0 auto", minHeight: "100vh", padding: "0 16px 100px" }}>
      <header style={{
        padding: "16px 0",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: `1px solid ${theme.borderLight}`,
        marginBottom: 20,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {onBack && (
            <button onClick={onBack} style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: 20, color: theme.textMuted, padding: 4,
            }}>←</button>
          )}
          <div>
            <h1 style={{
              fontFamily: fonts.display, fontSize: 22, fontWeight: 700,
              color: theme.primary, lineHeight: 1.2,
            }}>{title}</h1>
            {subtitle && (
              <p style={{ fontSize: 13, color: theme.textMuted, marginTop: 2 }}>{subtitle}</p>
            )}
          </div>
        </div>
        {actions && <div style={{ display: "flex", gap: 8 }}>{actions}</div>}
      </header>
      {children}
    </div>
  );
}

// --- AUTH SCREEN ---
function AuthScreen({ onAuth }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = isSignUp
        ? await supabase.auth.signUp(email, password)
        : await supabase.auth.signIn(email, password);
      if (result.error) throw new Error(result.error_description || result.msg || "Auth failed");
      onAuth(result.user);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: 24,
      background: `linear-gradient(160deg, ${theme.primary} 0%, #2D6A4F 50%, #40916C 100%)`,
    }}>
      <div className="slide-up" style={{ textAlign: "center", marginBottom: 40 }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🏆</div>
        <h1 style={{
          fontFamily: fonts.display, fontSize: 38, fontWeight: 700,
          color: "white", lineHeight: 1.1, marginBottom: 8,
        }}>
          The Season
        </h1>
        <p style={{
          fontFamily: fonts.display, fontSize: 17, color: "rgba(255,255,255,0.8)",
          fontStyle: "italic", maxWidth: 300,
        }}>
          Long after the scores are forgotten,<br />the moments remain.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="fade-in" style={{
        background: "white", borderRadius: 18, padding: 28,
        width: "100%", maxWidth: 360,
        boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
      }}>
        <h2 style={{ fontFamily: fonts.display, fontSize: 22, marginBottom: 20, textAlign: "center" }}>
          {isSignUp ? "Create Account" : "Welcome Back"}
        </h2>

        {error && (
          <div style={{
            background: "#FEE2E2", color: "#991B1B", padding: "10px 14px",
            borderRadius: 8, fontSize: 13, marginBottom: 16,
          }}>{error}</div>
        )}

        <div style={{ marginBottom: 14 }}>
          <label className="label">Email</label>
          <input className="input" type="email" value={email}
            onChange={(e) => setEmail(e.target.value)} required />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label className="label">Password</label>
          <input className="input" type="password" value={password}
            onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        </div>

        <button className="btn btn-primary" type="submit"
          disabled={loading}
          style={{ width: "100%", padding: "14px 24px", fontSize: 16 }}>
          {loading ? "..." : isSignUp ? "Get Started" : "Sign In"}
        </button>

        <p style={{ textAlign: "center", marginTop: 16, fontSize: 14, color: theme.textMuted }}>
          {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
          <span onClick={() => setIsSignUp(!isSignUp)}
            style={{ color: theme.primary, fontWeight: 600, cursor: "pointer" }}>
            {isSignUp ? "Sign in" : "Sign up"}
          </span>
        </p>
      </form>

      {DEMO && (
        <button onClick={() => onAuth({ id: "demo", email: "demo@demo.com" })}
          className="btn" style={{
            marginTop: 20, background: "rgba(255,255,255,0.15)",
            color: "white", backdropFilter: "blur(10px)",
          }}>
          Try Demo Mode →
        </button>
      )}
    </div>
  );
}

// --- ONBOARDING: ROLE SELECTION ---
function OnboardingScreen({ onComplete }) {
  const [step, setStep] = useState(1);
  const [role, setRole] = useState(null);
  const [scope, setScope] = useState(null);

  const roles = [
    { id: "coach", emoji: "📋", title: "Coach", desc: "Track your team's season and individual player growth" },
    { id: "parent", emoji: "📸", title: "Parent", desc: "Capture your kid's sports journey across seasons" },
    { id: "player", emoji: "🎽", title: "Player", desc: "Document your own season and development" },
  ];

  const scopes = role === "player"
    ? [{ id: "player", emoji: "🏃", title: "My Journey", desc: "Track your personal season" }]
    : [
        { id: "team", emoji: "👥", title: "Team", desc: "Chronicle the whole team's season" },
        { id: "player", emoji: "🏃", title: "Individual", desc: role === "coach" ? "Track a specific player's development" : "Follow your kid's journey" },
      ];

  if (step === 1) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", padding: 24,
      }}>
        <div className="slide-up" style={{ textAlign: "center", maxWidth: 400, width: "100%" }}>
          <h1 style={{ fontFamily: fonts.display, fontSize: 28, fontWeight: 700, color: theme.primary, marginBottom: 8 }}>
            How will you use this?
          </h1>
          <p style={{ fontSize: 15, color: theme.textMuted, marginBottom: 32 }}>
            Pick your role — you can always change later
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {roles.map((r) => (
              <button key={r.id} onClick={() => { setRole(r.id); setStep(2); }}
                className="card" style={{
                  cursor: "pointer", textAlign: "left",
                  display: "flex", alignItems: "center", gap: 16,
                  border: `2px solid ${role === r.id ? theme.primary : theme.border}`,
                  transition: "all 0.2s",
                }}>
                <span style={{ fontSize: 32 }}>{r.emoji}</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 16 }}>{r.title}</div>
                  <div style={{ fontSize: 13, color: theme.textMuted, marginTop: 2 }}>{r.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (step === 2) {
    // Auto-advance for player role
    if (role === "player") {
      return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="slide-up" style={{ textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎽</div>
            <h2 style={{ fontFamily: fonts.display, fontSize: 24, marginBottom: 24 }}>Ready to chronicle your season</h2>
            <button className="btn btn-primary" style={{ fontSize: 16, padding: "14px 32px" }}
              onClick={() => onComplete(role, "player")}>
              Let's Go →
            </button>
          </div>
        </div>
      );
    }

    return (
      <div style={{
        minHeight: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", padding: 24,
      }}>
        <div className="slide-up" style={{ textAlign: "center", maxWidth: 400, width: "100%" }}>
          <button onClick={() => setStep(1)} style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: 14, color: theme.textMuted, marginBottom: 24,
          }}>← Back</button>

          <h1 style={{ fontFamily: fonts.display, fontSize: 28, fontWeight: 700, color: theme.primary, marginBottom: 8 }}>
            What are you tracking?
          </h1>
          <p style={{ fontSize: 15, color: theme.textMuted, marginBottom: 32 }}>
            You can do both — start with one
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {scopes.map((s) => (
              <button key={s.id} onClick={() => onComplete(role, s.id)}
                className="card" style={{
                  cursor: "pointer", textAlign: "left",
                  display: "flex", alignItems: "center", gap: 16,
                  border: `2px solid ${theme.border}`,
                  transition: "all 0.2s",
                }}>
                <span style={{ fontSize: 32 }}>{s.emoji}</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 16 }}>{s.title}</div>
                  <div style={{ fontSize: 13, color: theme.textMuted, marginTop: 2 }}>{s.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }
}

// --- TEAM SETUP ---
function TeamSetupScreen({ role, scope, onComplete }) {
  const [teamName, setTeamName] = useState("");
  const [sport, setSport] = useState("Soccer");
  const [ageGroup, setAgeGroup] = useState("");
  const [org, setOrg] = useState("");
  const [seasonName, setSeasonName] = useState("");
  const [playerName, setPlayerName] = useState("");

  const sportObj = SPORTS.find((s) => s.name === sport) || SPORTS[0];

  const handleSubmit = (e) => {
    e.preventDefault();
    onComplete({
      team: { name: teamName || `My ${sport} Team`, sport, age_group: ageGroup, organization: org, emoji: sportObj.emoji },
      season: { name: seasonName || `${sport} ${new Date().getFullYear()}` },
      myPlayer: scope === "player" ? { name: playerName } : null,
    });
  };

  return (
    <div style={{ minHeight: "100vh", padding: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <form onSubmit={handleSubmit} className="slide-up" style={{ maxWidth: 400, width: "100%" }}>
        <h1 style={{ fontFamily: fonts.display, fontSize: 28, fontWeight: 700, color: theme.primary, marginBottom: 6 }}>
          Set up your {scope === "team" ? "team" : "player"}
        </h1>
        <p style={{ fontSize: 14, color: theme.textMuted, marginBottom: 28 }}>
          Quick setup — you can edit everything later
        </p>

        {scope === "player" && role !== "player" && (
          <div style={{ marginBottom: 16 }}>
            <label className="label">{role === "parent" ? "Your Child's Name" : "Player Name"}</label>
            <input className="input" value={playerName} onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Alex" required />
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <label className="label">Sport</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {SPORTS.map((s) => (
              <button type="button" key={s.name} onClick={() => setSport(s.name)}
                style={{
                  padding: "8px 14px", borderRadius: 20, border: `1.5px solid ${sport === s.name ? theme.primary : theme.border}`,
                  background: sport === s.name ? `${theme.primary}10` : "white",
                  cursor: "pointer", fontSize: 13, fontWeight: sport === s.name ? 600 : 400,
                  color: sport === s.name ? theme.primary : theme.text,
                  transition: "all 0.15s",
                }}>
                {s.emoji} {s.name}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label className="label">Team Name</label>
          <input className="input" value={teamName} onChange={(e) => setTeamName(e.target.value)}
            placeholder={`Thunder U12, Varsity ${sport}, etc.`} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <label className="label">Age Group</label>
            <input className="input" value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)}
              placeholder="U12, Varsity, etc." />
          </div>
          <div>
            <label className="label">Club / Org</label>
            <input className="input" value={org} onChange={(e) => setOrg(e.target.value)}
              placeholder="IFA, Town Rec, etc." />
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          <label className="label">Season Name</label>
          <input className="input" value={seasonName} onChange={(e) => setSeasonName(e.target.value)}
            placeholder={`Fall ${new Date().getFullYear()}, Spring League, etc.`} />
        </div>

        <button className="btn btn-primary" type="submit" style={{ width: "100%", padding: "14px 24px", fontSize: 16 }}>
          Start Journaling →
        </button>
      </form>
    </div>
  );
}

// --- ROSTER MANAGER ---
function RosterManager({ players, sport, onAdd, onClose }) {
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [position, setPosition] = useState("");

  const positions = POSITIONS_BY_SPORT[sport] || [];

  const handleAdd = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd({ name: name.trim(), number: number ? parseInt(number) : null, position: position || null });
    setName("");
    setNumber("");
    setPosition("");
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 100,
      padding: 16,
    }}>
      <div className="slide-up" style={{
        background: "white", borderRadius: 18, padding: 24,
        width: "100%", maxWidth: 480, maxHeight: "80vh", overflow: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontFamily: fonts.display, fontSize: 22, fontWeight: 700 }}>Roster</h2>
          <button onClick={onClose} style={{
            background: "none", border: "none", fontSize: 24, cursor: "pointer", color: theme.textMuted,
          }}>×</button>
        </div>

        {players.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            {players.map((p, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 0", borderBottom: `1px solid ${theme.borderLight}`,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: "50%",
                  background: `${theme.primary}15`, display: "flex",
                  alignItems: "center", justifyContent: "center",
                  fontWeight: 700, fontSize: 14, color: theme.primary,
                }}>
                  {p.number || p.name[0]}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                  {p.position && <div style={{ fontSize: 12, color: theme.textMuted }}>{p.position}</div>}
                </div>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleAdd}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 60px", gap: 8, marginBottom: 8 }}>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Player name" style={{ padding: "10px 14px" }} />
            <input className="input" value={number} onChange={(e) => setNumber(e.target.value)}
              placeholder="#" type="number" style={{ padding: "10px 14px", textAlign: "center" }} />
          </div>

          {positions.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              {positions.map((pos) => (
                <button type="button" key={pos} onClick={() => setPosition(position === pos ? "" : pos)}
                  style={{
                    padding: "4px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600,
                    border: `1px solid ${position === pos ? theme.primary : theme.border}`,
                    background: position === pos ? `${theme.primary}10` : "white",
                    color: position === pos ? theme.primary : theme.textMuted,
                    cursor: "pointer",
                  }}>
                  {pos}
                </button>
              ))}
            </div>
          )}

          <button className="btn btn-primary btn-sm" type="submit" style={{ width: "100%" }}>
            Add Player
          </button>
        </form>
      </div>
    </div>
  );
}

// --- ENTRY COMPOSER ---
function EntryComposer({ season, players, sport, onSave, onClose }) {
  const [entryType, setEntryType] = useState("game");
  const [text, setText] = useState("");
  const [opponent, setOpponent] = useState("");
  const [venue, setVenue] = useState("");
  const [scoreHome, setScoreHome] = useState("");
  const [scoreAway, setScoreAway] = useState("");
  const [showGameData, setShowGameData] = useState(false);
  const [selectedPlayers, setSelectedPlayers] = useState([]);
  const [showPlayerTags, setShowPlayerTags] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [prompt] = useState(getPrompt("game"));
  const fileRef = useRef(null);

  const entryTypes = [
    { id: "game", label: "Game", emoji: "🏟️" },
    { id: "practice", label: "Practice", emoji: "🔄" },
    { id: "tournament", label: "Tournament", emoji: "🏆" },
    { id: "event", label: "Event", emoji: "⭐" },
  ];

  const handlePhoto = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const togglePlayer = (playerId, contribution) => {
    setSelectedPlayers((prev) => {
      const exists = prev.find((p) => p.playerId === playerId && p.contribution === contribution);
      if (exists) return prev.filter((p) => !(p.playerId === playerId && p.contribution === contribution));
      return [...prev, { playerId, contribution }];
    });
  };

  const computeResult = () => {
    if (scoreHome === "" || scoreAway === "") return null;
    const h = parseInt(scoreHome);
    const a = parseInt(scoreAway);
    if (h > a) return "win";
    if (h < a) return "loss";
    return "draw";
  };

  const handleSave = () => {
    if (!text.trim()) return;
    onSave({
      entry_type: entryType,
      text: text.trim(),
      opponent: opponent || null,
      venue: venue || null,
      score_home: scoreHome !== "" ? parseInt(scoreHome) : null,
      score_away: scoreAway !== "" ? parseInt(scoreAway) : null,
      result: computeResult(),
      photo,
      playerTags: selectedPlayers,
    });
  };

  const contributions = CONTRIBUTIONS_BY_SPORT[sport] || CONTRIBUTIONS_BY_SPORT.default;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 100,
    }}>
      <div className="slide-up" style={{
        background: "white", borderRadius: "18px 18px 0 0", padding: 24,
        width: "100%", maxWidth: 480, maxHeight: "90vh", overflow: "auto",
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
          <h2 style={{ fontFamily: fonts.display, fontSize: 22, fontWeight: 700 }}>New Entry</h2>
          <button onClick={onClose} style={{
            background: "none", border: "none", fontSize: 24, cursor: "pointer", color: theme.textMuted,
          }}>×</button>
        </div>

        {/* Entry Type */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {entryTypes.map((t) => (
            <button key={t.id} onClick={() => setEntryType(t.id)}
              style={{
                flex: 1, padding: "10px 8px", borderRadius: 10, border: `1.5px solid ${entryType === t.id ? theme.primary : theme.border}`,
                background: entryType === t.id ? `${theme.primary}10` : "white",
                cursor: "pointer", textAlign: "center", transition: "all 0.15s",
              }}>
              <div style={{ fontSize: 18 }}>{t.emoji}</div>
              <div style={{
                fontSize: 11, fontWeight: 600, marginTop: 2,
                color: entryType === t.id ? theme.primary : theme.textMuted,
              }}>{t.label}</div>
            </button>
          ))}
        </div>

        {/* The Line - The Soul */}
        <div style={{ marginBottom: 16 }}>
          <p style={{
            fontFamily: fonts.display, fontStyle: "italic",
            fontSize: 14, color: theme.accent, marginBottom: 8, lineHeight: 1.4,
          }}>
            {entryType === "practice" ? getPrompt("practice") : prompt}
          </p>
          <textarea
            className="input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write the moment..."
            maxLength={500}
            rows={3}
            style={{ resize: "none", fontSize: 16, lineHeight: 1.5 }}
          />
          <div style={{ textAlign: "right", fontSize: 11, color: theme.textLight, marginTop: 4 }}>
            {text.length}/500
          </div>
        </div>

        {/* Photo */}
        <div style={{ marginBottom: 16 }}>
          <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} style={{ display: "none" }} />
          {photoPreview ? (
            <div style={{ position: "relative" }}>
              <img src={photoPreview} alt="" style={{
                width: "100%", height: 180, objectFit: "cover", borderRadius: 12,
              }} />
              <button onClick={() => { setPhoto(null); setPhotoPreview(null); }}
                style={{
                  position: "absolute", top: 8, right: 8,
                  background: "rgba(0,0,0,0.6)", color: "white",
                  border: "none", borderRadius: "50%", width: 28, height: 28,
                  cursor: "pointer", fontSize: 14,
                }}>×</button>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()}
              style={{
                width: "100%", padding: 16, borderRadius: 12,
                border: `2px dashed ${theme.border}`, background: theme.borderLight,
                cursor: "pointer", color: theme.textMuted, fontSize: 14,
              }}>
              📷 Add Photo
            </button>
          )}
        </div>

        {/* Optional Game Data Toggle */}
        {(entryType === "game" || entryType === "tournament") && (
          <>
            <button onClick={() => setShowGameData(!showGameData)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: 13, fontWeight: 600, color: theme.primary,
                marginBottom: showGameData ? 12 : 0,
                display: "flex", alignItems: "center", gap: 6,
              }}>
              {showGameData ? "▾" : "▸"} Game Details (optional)
            </button>

            {showGameData && (
              <div className="fade-in" style={{
                background: theme.borderLight, borderRadius: 12, padding: 16, marginBottom: 16,
              }}>
                <div style={{ marginBottom: 12 }}>
                  <label className="label">Opponent</label>
                  <input className="input" value={opponent} onChange={(e) => setOpponent(e.target.value)}
                    placeholder="Team name" style={{ background: "white" }} />
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label className="label">Score</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input className="input" value={scoreHome} onChange={(e) => setScoreHome(e.target.value)}
                      placeholder="Us" type="number" min="0" style={{ textAlign: "center", background: "white", flex: 1 }} />
                    <span style={{ fontWeight: 700, color: theme.textMuted }}>–</span>
                    <input className="input" value={scoreAway} onChange={(e) => setScoreAway(e.target.value)}
                      placeholder="Them" type="number" min="0" style={{ textAlign: "center", background: "white", flex: 1 }} />
                  </div>
                </div>

                <div>
                  <label className="label">Venue</label>
                  <input className="input" value={venue} onChange={(e) => setVenue(e.target.value)}
                    placeholder="Field name or location" style={{ background: "white" }} />
                </div>
              </div>
            )}
          </>
        )}

        {/* Player Tags */}
        {players.length > 0 && (
          <>
            <button onClick={() => setShowPlayerTags(!showPlayerTags)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: 13, fontWeight: 600, color: theme.primary,
                marginBottom: showPlayerTags ? 12 : 16,
                display: "flex", alignItems: "center", gap: 6,
              }}>
              {showPlayerTags ? "▾" : "▸"} Tag Players (optional)
            </button>

            {showPlayerTags && (
              <div className="fade-in" style={{
                background: theme.borderLight, borderRadius: 12, padding: 16, marginBottom: 16,
                maxHeight: 200, overflow: "auto",
              }}>
                {players.map((p) => (
                  <div key={p.id || p.name} style={{ marginBottom: 10 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
                      {p.number ? `#${p.number} ` : ""}{p.name}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {contributions.map((c) => {
                        const active = selectedPlayers.some(
                          (sp) => (sp.playerId === (p.id || p.name)) && sp.contribution === c
                        );
                        return (
                          <button type="button" key={c}
                            onClick={() => togglePlayer(p.id || p.name, c)}
                            style={{
                              padding: "3px 8px", borderRadius: 10, fontSize: 11,
                              border: `1px solid ${active ? theme.accent : theme.border}`,
                              background: active ? `${theme.accent}15` : "white",
                              color: active ? theme.accent : theme.textMuted,
                              cursor: "pointer", fontWeight: active ? 600 : 400,
                            }}>
                            {c}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Save */}
        <button className="btn btn-primary" onClick={handleSave}
          disabled={!text.trim()}
          style={{
            width: "100%", padding: "14px 24px", fontSize: 16,
            opacity: text.trim() ? 1 : 0.5,
          }}>
          Save Entry ✓
        </button>
      </div>
    </div>
  );
}

// --- TIMELINE ENTRY CARD ---
function EntryCard({ entry, players }) {
  const typeColors = {
    game: entry.result === "win" ? theme.win : entry.result === "loss" ? theme.loss : theme.draw,
    practice: theme.practice,
    tournament: theme.tournament,
    event: theme.event,
  };

  const typeEmojis = { game: "🏟️", practice: "🔄", tournament: "🏆", event: "⭐" };
  const resultLabels = { win: "W", loss: "L", draw: "D" };

  const color = typeColors[entry.entry_type] || theme.textMuted;

  const taggedPlayers = (entry.playerTags || []).map((tag) => {
    const player = players.find((p) => (p.id || p.name) === tag.playerId);
    return { ...tag, playerName: player?.name || "Unknown" };
  });

  return (
    <div className="card fade-in" style={{ marginBottom: 12, borderLeft: `4px solid ${color}` }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>{typeEmojis[entry.entry_type]}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color, textTransform: "uppercase" }}>
            {entry.entry_type}
          </span>
          {entry.opponent && (
            <span style={{ fontSize: 13, color: theme.textMuted }}>vs {entry.opponent}</span>
          )}
        </div>
        <span style={{ fontSize: 12, color: theme.textLight, fontFamily: fonts.mono }}>
          {new Date(entry.entry_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </span>
      </div>

      {/* Score */}
      {entry.score_home !== null && entry.score_away !== null && (
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          background: `${color}10`, borderRadius: 8, padding: "6px 12px",
          marginBottom: 10,
        }}>
          <span style={{ fontFamily: fonts.mono, fontWeight: 700, fontSize: 18, color }}>
            {entry.score_home} – {entry.score_away}
          </span>
          {entry.result && (
            <span className="badge" style={{ background: color, color: "white", fontSize: 10 }}>
              {resultLabels[entry.result]}
            </span>
          )}
        </div>
      )}

      {/* Photo */}
      {entry.photoPreview && (
        <img src={entry.photoPreview} alt="" style={{
          width: "100%", height: 180, objectFit: "cover", borderRadius: 10, marginBottom: 10,
        }} />
      )}

      {/* The Line */}
      <p style={{
        fontFamily: fonts.display, fontSize: 17, lineHeight: 1.5,
        color: theme.text, fontStyle: "italic",
      }}>
        "{entry.text}"
      </p>

      {/* Venue */}
      {entry.venue && (
        <p style={{ fontSize: 12, color: theme.textLight, marginTop: 8 }}>📍 {entry.venue}</p>
      )}

      {/* Player tags */}
      {taggedPlayers.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
          {taggedPlayers.map((t, i) => (
            <span key={i} style={{
              fontSize: 11, padding: "3px 8px", borderRadius: 10,
              background: `${theme.accent}12`, color: theme.accent, fontWeight: 500,
            }}>
              {t.playerName} · {t.contribution}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// --- SEASON STATS BAR ---
function SeasonStats({ entries }) {
  const games = entries.filter((e) => e.entry_type === "game" || e.entry_type === "tournament");
  const wins = games.filter((e) => e.result === "win").length;
  const losses = games.filter((e) => e.result === "loss").length;
  const draws = games.filter((e) => e.result === "draw").length;
  const practices = entries.filter((e) => e.entry_type === "practice").length;
  const photos = entries.filter((e) => e.photoPreview || e.photo_path).length;

  return (
    <div style={{
      display: "flex", gap: 6, marginBottom: 16, overflowX: "auto",
      padding: "2px 0",
    }}>
      {[
        { label: "Entries", value: entries.length, color: theme.primary },
        { label: "W-L-D", value: `${wins}-${losses}-${draws}`, color: theme.win },
        { label: "Practices", value: practices, color: theme.practice },
        { label: "Photos", value: photos, color: theme.accent },
      ].map((stat) => (
        <div key={stat.label} style={{
          flex: "1 0 auto", padding: "10px 14px", borderRadius: 10,
          background: `${stat.color}08`, border: `1px solid ${stat.color}20`,
          textAlign: "center", minWidth: 75,
        }}>
          <div style={{ fontFamily: fonts.mono, fontWeight: 700, fontSize: 16, color: stat.color }}>
            {stat.value}
          </div>
          <div style={{ fontSize: 10, fontWeight: 600, color: theme.textMuted, textTransform: "uppercase", marginTop: 2 }}>
            {stat.label}
          </div>
        </div>
      ))}
    </div>
  );
}

// --- BOOK PREVIEW ---
function BookPreview({ entries, team, season, players, onClose }) {
  const sortedEntries = [...entries].sort((a, b) => new Date(a.entry_date) - new Date(b.entry_date));

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
      padding: 16,
    }}>
      <div className="slide-up" style={{
        background: "#FFF9F0", borderRadius: 4, width: 340, maxHeight: "85vh",
        overflow: "auto", boxShadow: "0 20px 80px rgba(0,0,0,0.4)",
        border: "1px solid #E8E0D4",
      }}>
        {/* Cover */}
        <div style={{
          padding: "48px 24px", textAlign: "center",
          background: `linear-gradient(160deg, ${theme.primary}, #2D6A4F)`,
          borderRadius: "4px 4px 0 0",
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>{team.emoji}</div>
          <h1 style={{
            fontFamily: fonts.display, fontSize: 28, fontWeight: 700,
            color: "white", lineHeight: 1.2, marginBottom: 8,
          }}>
            {team.name}
          </h1>
          <p style={{
            fontFamily: fonts.display, fontSize: 16, color: "rgba(255,255,255,0.8)",
          }}>
            {season.name}
          </p>
          <div style={{
            width: 40, height: 2, background: "rgba(255,255,255,0.3)",
            margin: "16px auto",
          }} />
          <p style={{
            fontFamily: fonts.display, fontSize: 13, color: "rgba(255,255,255,0.6)",
            fontStyle: "italic",
          }}>
            {sortedEntries.length} moments captured
          </p>
        </div>

        {/* Entries */}
        <div style={{ padding: "24px 20px" }}>
          {sortedEntries.map((entry, i) => (
            <div key={i} style={{
              marginBottom: 24, paddingBottom: 24,
              borderBottom: i < sortedEntries.length - 1 ? `1px solid #E8E0D4` : "none",
            }}>
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                marginBottom: 8,
              }}>
                <span style={{
                  fontSize: 11, fontWeight: 600, color: theme.textMuted,
                  textTransform: "uppercase", letterSpacing: 0.5,
                }}>
                  {new Date(entry.entry_date).toLocaleDateString("en-US", {
                    weekday: "short", month: "short", day: "numeric",
                  })}
                </span>
                {entry.score_home !== null && (
                  <span style={{ fontFamily: fonts.mono, fontSize: 13, fontWeight: 600 }}>
                    {entry.score_home}–{entry.score_away}
                  </span>
                )}
              </div>

              {entry.opponent && (
                <p style={{ fontSize: 12, color: theme.textMuted, marginBottom: 4 }}>
                  vs {entry.opponent}
                </p>
              )}

              {entry.photoPreview && (
                <img src={entry.photoPreview} alt="" style={{
                  width: "100%", height: 160, objectFit: "cover",
                  borderRadius: 4, marginBottom: 8,
                }} />
              )}

              <p style={{
                fontFamily: fonts.display, fontSize: 15, lineHeight: 1.6,
                color: "#2A2A2A", fontStyle: "italic",
              }}>
                "{entry.text}"
              </p>

              {entry.venue && (
                <p style={{ fontSize: 11, color: theme.textLight, marginTop: 6 }}>
                  📍 {entry.venue}
                </p>
              )}
            </div>
          ))}

          {sortedEntries.length === 0 && (
            <p style={{ textAlign: "center", color: theme.textMuted, fontStyle: "italic", padding: "40px 0" }}>
              Start adding entries to see your book come to life
            </p>
          )}
        </div>

        {/* Close */}
        <div style={{ padding: "0 20px 20px", textAlign: "center" }}>
          <button className="btn btn-ghost" onClick={onClose} style={{ width: "100%" }}>
            Close Preview
          </button>
        </div>
      </div>
    </div>
  );
}

// --- MAIN APP ---
export default function SportsJournalApp() {
  const [authed, setAuthed] = useState(false);
  const [user, setUser] = useState(null);
  const [screen, setScreen] = useState("loading"); // loading, auth, onboarding, setup, home
  const [role, setRole] = useState(null);
  const [scope, setScope] = useState(null);

  // Data
  const [team, setTeam] = useState(null);
  const [season, setSeason] = useState(null);
  const [players, setPlayers] = useState([]);
  const [entries, setEntries] = useState([]);

  // UI state
  const [showComposer, setShowComposer] = useState(false);
  const [showRoster, setShowRoster] = useState(false);
  const [showBook, setShowBook] = useState(false);
  const [filter, setFilter] = useState("all");

  // Init
  useEffect(() => {
    if (DEMO) {
      setScreen("auth");
      return;
    }
    if (supabase.auth.restore()) {
      setUser(supabase.auth.user);
      setAuthed(true);
      // TODO: load profile, check if onboarding complete
      setScreen("onboarding");
    } else {
      setScreen("auth");
    }
  }, []);

  const handleAuth = (user) => {
    setUser(user);
    setAuthed(true);
    setScreen("onboarding");
  };

  const handleOnboarding = (selectedRole, selectedScope) => {
    setRole(selectedRole);
    setScope(selectedScope);
    setScreen("setup");
  };

  const handleSetup = (data) => {
    setTeam(data.team);
    setSeason(data.season);
    if (data.myPlayer) {
      setPlayers([{ ...data.myPlayer, id: "p_" + Date.now(), is_my_child: true }]);
    }
    setScreen("home");
  };

  const handleAddPlayer = (playerData) => {
    setPlayers((prev) => [...prev, { ...playerData, id: "p_" + Date.now() + Math.random() }]);
  };

  const handleSaveEntry = (entryData) => {
    const newEntry = {
      ...entryData,
      id: "e_" + Date.now(),
      entry_date: new Date().toISOString().split("T")[0],
      season_id: season?.id,
      photoPreview: entryData.photo ? URL.createObjectURL(entryData.photo) : null,
      created_at: new Date().toISOString(),
    };
    setEntries((prev) => [newEntry, ...prev]);
    setShowComposer(false);
  };

  const handleSignOut = () => {
    supabase.auth.signOut();
    setAuthed(false);
    setUser(null);
    setScreen("auth");
    setTeam(null);
    setSeason(null);
    setPlayers([]);
    setEntries([]);
    setRole(null);
    setScope(null);
  };

  // Filter entries
  const filteredEntries = filter === "all"
    ? entries
    : entries.filter((e) => e.entry_type === filter);

  // --- RENDER ---
  return (
    <>
      <GlobalStyle />

      {screen === "auth" && <AuthScreen onAuth={handleAuth} />}
      {screen === "onboarding" && <OnboardingScreen onComplete={handleOnboarding} />}
      {screen === "setup" && <TeamSetupScreen role={role} scope={scope} onComplete={handleSetup} />}

      {screen === "home" && team && season && (
        <AppShell
          title={team.name}
          subtitle={`${season.name} · ${role}`}
          actions={
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowBook(true)}>📖</button>
              <button className="btn btn-ghost btn-sm" onClick={handleSignOut}>↗</button>
            </div>
          }
        >
          {/* Stats */}
          <SeasonStats entries={entries} />

          {/* Quick Actions */}
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            <button className="btn btn-primary" onClick={() => setShowComposer(true)}
              style={{ flex: 1, fontSize: 15 }}>
              ✏️ New Entry
            </button>
            {(role === "coach" || scope === "team") && (
              <button className="btn btn-ghost" onClick={() => setShowRoster(true)}>
                👥 Roster {players.length > 0 && `(${players.length})`}
              </button>
            )}
          </div>

          {/* Filter Tabs */}
          <div style={{
            display: "flex", gap: 4, marginBottom: 16,
            borderBottom: `1px solid ${theme.borderLight}`, paddingBottom: 8,
          }}>
            {[
              { id: "all", label: "All" },
              { id: "game", label: "Games" },
              { id: "practice", label: "Practice" },
              { id: "tournament", label: "Tournaments" },
            ].map((tab) => (
              <button key={tab.id} onClick={() => setFilter(tab.id)}
                style={{
                  padding: "6px 14px", borderRadius: 8, border: "none",
                  background: filter === tab.id ? `${theme.primary}10` : "transparent",
                  color: filter === tab.id ? theme.primary : theme.textMuted,
                  fontWeight: filter === tab.id ? 600 : 400, fontSize: 13,
                  cursor: "pointer", transition: "all 0.15s",
                }}>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Timeline */}
          {filteredEntries.length === 0 ? (
            <div style={{
              textAlign: "center", padding: "60px 20px",
              color: theme.textMuted,
            }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>✏️</div>
              <p style={{ fontFamily: fonts.display, fontSize: 18, fontStyle: "italic", marginBottom: 8 }}>
                Your season story starts here
              </p>
              <p style={{ fontSize: 14 }}>
                Tap "New Entry" after your next game or practice
              </p>
            </div>
          ) : (
            filteredEntries.map((entry) => (
              <EntryCard key={entry.id} entry={entry} players={players} />
            ))
          )}

          {/* Modals */}
          {showComposer && (
            <EntryComposer
              season={season}
              players={players}
              sport={team.sport}
              onSave={handleSaveEntry}
              onClose={() => setShowComposer(false)}
            />
          )}

          {showRoster && (
            <RosterManager
              players={players}
              sport={team.sport}
              onAdd={handleAddPlayer}
              onClose={() => setShowRoster(false)}
            />
          )}

          {showBook && (
            <BookPreview
              entries={entries}
              team={team}
              season={season}
              players={players}
              onClose={() => setShowBook(false)}
            />
          )}
        </AppShell>
      )}
    </>
  );
}
