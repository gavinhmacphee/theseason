import React, { useState, useEffect, useCallback, useRef } from "react";
import html2canvas from "html2canvas";

// ============================================
// TEAM SEASON — Soccer Journal
// Role-based: Parent / Player
// ============================================

// --- CONFIG ---
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "YOUR_SUPABASE_URL";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "YOUR_SUPABASE_ANON_KEY";

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
      in_(col, vals) {
        queryParams.push(`${col}=in.(${vals.join(",")})`);
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
  async rpc(functionName, params = {}) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${functionName}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${supabase.auth.token || SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    return { data, error: res.ok ? null : data };
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

// --- UUID GENERATOR ---
function generateId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      });
}

// --- SLUG GENERATOR ---
function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// --- SPORT (Soccer only) ---
const SPORTS = [{ name: "Soccer", emoji: "⚽" }];

// --- IMAGE RESIZE HELPER ---
function resizeImage(file, maxSize) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let w = img.width, h = img.height;
        if (w > h) {
          if (w > maxSize) { h = h * maxSize / w; w = maxSize; }
        } else {
          if (h > maxSize) { w = w * maxSize / h; h = maxSize; }
        }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// --- DEMO DATA ---
function demoData() {
  const today = new Date();
  const d = (daysAgo) => {
    const dt = new Date(today);
    dt.setDate(dt.getDate() - daysAgo);
    return dt.toISOString().split("T")[0];
  };

  return {
    role: "parent",
    team: { id: "demo-team", name: "Montaña FC", sport: "Soccer", emoji: "⚽", logo: null, orgType: "club", color: "#1B4332" },
    season: { name: "Spring 2026", id: "s_demo" },
    players: [{ name: "Marco", id: "p_demo", is_my_child: true, headshot: null }],
    entries: [
      {
        id: "e_demo_1", entry_type: "game",
        text: "Two assists and the go-ahead goal. He read that through ball perfectly and didn't even hesitate.",
        entry_date: d(2), opponent: "Lightning FC",
        score_home: 3, score_away: 1, result: "win",
        venue: "Memorial Field",
        photoData: "/images/demo/game-action.jpg", photoPreview: "/images/demo/game-action.jpg",
        created_at: new Date().toISOString(),
      },
      {
        id: "e_demo_2", entry_type: "practice",
        text: "Cone work is finally clicking. Coach pulled him aside after and said his first touch has gotten way sharper.",
        entry_date: d(5), opponent: null,
        score_home: null, score_away: null, result: null,
        venue: "Training Complex",
        photoData: "/images/demo/practice-cones.jpg", photoPreview: "/images/demo/practice-cones.jpg",
        created_at: new Date().toISOString(),
      },
      {
        id: "e_demo_3", entry_type: "game",
        text: "Left it all on the field. Went ninety minutes in the heat and never asked to come off.",
        entry_date: d(9), opponent: "Rapids",
        score_home: 1, score_away: 2, result: "loss",
        venue: "Riverside Park",
        photoData: "/images/demo/water-break.jpg", photoPreview: "/images/demo/water-break.jpg",
        created_at: new Date().toISOString(),
      },
      {
        id: "e_demo_4", entry_type: "tournament",
        text: "Semifinal shutout. The whole bench was on their feet when the final whistle blew.",
        entry_date: d(14), opponent: null,
        score_home: 2, score_away: 0, result: "win",
        venue: "City Cup",
        photoData: "/images/demo/game-action.jpg", photoPreview: "/images/demo/game-action.jpg",
        created_at: new Date().toISOString(),
      },
      {
        id: "e_demo_5", entry_type: "moment",
        text: "Walking back from the field with a bag of balls and that look. This kid lives for it.",
        entry_date: d(18), opponent: null,
        score_home: null, score_away: null, result: null,
        venue: null,
        photoData: "/images/demo/walking-off.jpg", photoPreview: "/images/demo/walking-off.jpg",
        created_at: new Date().toISOString(),
      },
      {
        id: "e_demo_6", entry_type: "game",
        text: "Dominated possession but couldn't find the finish. Hit the crossbar twice in the last ten minutes.",
        entry_date: d(23), opponent: "United",
        score_home: 1, score_away: 1, result: "draw",
        venue: "Home Field",
        photoData: "/images/demo/water-break.jpg", photoPreview: "/images/demo/water-break.jpg",
        created_at: new Date().toISOString(),
      },
    ],
  };
}

// --- PAGINATION ALGORITHM (for print book) ---
function paginateEntries(entries) {
  const PAGE_BUDGET = 1850; // px — 7.125" safe area minus bleed/margins/page-number at ~260 PPI
  const DIVIDER = 50;

  function estimateHeight(entry) {
    let h = 60; // type badge + date row
    if ((entry.entry_type === "game" || entry.entry_type === "tournament") &&
        entry.score_home !== null && entry.score_away !== null) {
      h += 80; // score block
    }
    if (entry.opponent) h += 35;
    if (entry.photoPreview || entry.photoData) h += 800;
    if (entry.text) h += Math.ceil(entry.text.length / 42) * 48;
    if (entry.venue) h += 35;
    return h;
  }

  const sorted = [...entries].sort((a, b) => new Date(a.entry_date) - new Date(b.entry_date));
  const pages = [];
  let currentPage = [];
  let currentHeight = 0;

  for (const entry of sorted) {
    const h = estimateHeight(entry);
    const hasPhoto = !!(entry.photoPreview || entry.photoData);

    // Photo entries get their own page or pair with at most one short text entry
    if (hasPhoto) {
      // Flush current page if it has content
      if (currentPage.length > 0) {
        pages.push(currentPage);
        currentPage = [];
        currentHeight = 0;
      }
      pages.push([entry]);
      continue;
    }

    const needed = currentHeight > 0 ? h + DIVIDER : h;
    if (currentHeight + needed > PAGE_BUDGET && currentPage.length > 0) {
      pages.push(currentPage);
      currentPage = [entry];
      currentHeight = h;
    } else {
      currentPage.push(entry);
      currentHeight += needed;
    }
  }

  if (currentPage.length > 0) {
    pages.push(currentPage);
  }

  return pages;
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
  moment: "#9B5DE5",
};

// --- COLOR HELPERS ---
function lightenColor(hex, amount = 0.2) {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, ((num >> 16) & 0xFF) + Math.round(255 * amount));
  const g = Math.min(255, ((num >> 8) & 0xFF) + Math.round(255 * amount));
  const b = Math.min(255, (num & 0xFF) + Math.round(255 * amount));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function gradientFromColor(hex) {
  return `linear-gradient(160deg, ${hex} 0%, ${lightenColor(hex, 0.08)} 50%, ${lightenColor(hex, 0.18)} 100%)`;
}

const COLOR_PRESETS = [
  { hex: "#1B4332", label: "Forest" },
  { hex: "#1B3A5C", label: "Navy" },
  { hex: "#1D4ED8", label: "Royal" },
  { hex: "#B91C1C", label: "Red" },
  { hex: "#6B1D2A", label: "Maroon" },
  { hex: "#5B21B6", label: "Purple" },
  { hex: "#C2410C", label: "Orange" },
  { hex: "#171717", label: "Black" },
];

const fonts = {
  display: "'Crimson Pro', Georgia, serif",
  headline: "'Instrument Serif', Georgia, serif",
  body: "'DM Sans', -apple-system, sans-serif",
  mono: "'JetBrains Mono', monospace",
};

// --- GLOBAL STYLES ---
const GlobalStyle = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600&family=DM+Sans:wght@300;400;500;600;700&family=Instrument+Serif:ital@1&family=JetBrains+Mono:wght@400;500&display=swap');

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

    @keyframes spin {
      to { transform: rotate(360deg); }
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
function AppShell({ children, title, titleIcon, subtitle, subtitleIcon, onBack, actions, accentColor }) {
  const shellPrimary = accentColor || theme.primary;
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
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {titleIcon}
              <h1 style={{
                fontFamily: fonts.display, fontSize: 22, fontWeight: 700,
                color: shellPrimary, lineHeight: 1.2,
              }}>{title}</h1>
            </div>
            {subtitle && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                {subtitleIcon}
                <p style={{ fontSize: 13, color: theme.textMuted }}>{subtitle}</p>
              </div>
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
function AuthScreen({ onAuth, onDemo, onSkipAuth }) {
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
          Team Season
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
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20, alignItems: "center" }}>
          <button onClick={onSkipAuth}
            className="btn" style={{
              background: "rgba(255,255,255,0.25)",
              color: "white", backdropFilter: "blur(10px)",
              width: 220,
            }}>
            Start Your Season →
          </button>
          <button onClick={onDemo}
            className="btn" style={{
              background: "rgba(255,255,255,0.1)",
              color: "rgba(255,255,255,0.7)", backdropFilter: "blur(10px)",
              fontSize: 13, padding: "8px 20px",
            }}>
            Try Demo Mode
          </button>
        </div>
      )}
    </div>
  );
}

// --- ONBOARDING: ROLE SELECTION ---
function OnboardingScreen({ onComplete }) {
  const options = [
    { role: "parent", emoji: "📸", title: "My child's season", desc: "Capture your kid's games, practices, and milestones" },
    { role: "player", emoji: "⚽", title: "My own season", desc: "Document your own games and development" },
    { role: "admin", emoji: "🏟️", title: "I run a club", desc: "Manage teams, rosters, and content across your organization" },
  ];

  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: 24,
    }}>
      <div className="slide-up" style={{ textAlign: "center", maxWidth: 400, width: "100%" }}>
        <h1 style={{ fontFamily: fonts.display, fontSize: 28, fontWeight: 700, color: theme.primary, marginBottom: 8 }}>
          What are you tracking?
        </h1>
        <p style={{ fontSize: 15, color: theme.textMuted, marginBottom: 32 }}>
          One tap and you're in
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {options.map((o) => (
            <button key={o.role} onClick={() => onComplete(o.role)}
              className="card" style={{
                cursor: "pointer", textAlign: "left",
                display: "flex", alignItems: "center", gap: 16,
                border: `2px solid ${theme.border}`,
                transition: "all 0.2s",
              }}>
              <span style={{ fontSize: 32 }}>{o.emoji}</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 16 }}>{o.title}</div>
                <div style={{ fontSize: 13, color: theme.textMuted, marginTop: 2 }}>{o.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- TEAM SETUP ---
function TeamSetupScreen({ role, onComplete }) {
  const [teamName, setTeamName] = useState("");
  const [childName, setChildName] = useState("");
  const [logo, setLogo] = useState(null);
  const [childHeadshot, setChildHeadshot] = useState(null);
  const [orgType, setOrgType] = useState("club");
  const [brandColor, setBrandColor] = useState("#1B4332");
  const [customHex, setCustomHex] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const logoRef = useRef(null);
  const headshotRef = useRef(null);

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const data = await resizeImage(file, 200);
    setLogo(data);
  };

  const handleHeadshotUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const data = await resizeImage(file, 200);
    setChildHeadshot(data);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onComplete({
      team: { id: generateId(), name: teamName || "My Soccer Team", sport: "Soccer", emoji: "⚽", logo, orgType, color: brandColor },
      season: { id: generateId(), name: `Soccer ${new Date().getFullYear()}` },
      myPlayer: role === "parent" ? { name: childName, headshot: childHeadshot } : null,
    });
  };

  return (
    <div style={{ minHeight: "100vh", padding: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <form onSubmit={handleSubmit} className="slide-up" style={{ maxWidth: 400, width: "100%" }}>
        <h1 style={{ fontFamily: fonts.display, fontSize: 28, fontWeight: 700, color: theme.primary, marginBottom: 6 }}>
          {role === "parent" ? "Set up your child's season" : "Set up your season"}
        </h1>
        <p style={{ fontSize: 14, color: theme.textMuted, marginBottom: 28 }}>
          Quick setup — you can edit everything later
        </p>

        {/* Child headshot + name (parent mode) */}
        {role === "parent" && (
          <>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 20 }}>
              <input ref={headshotRef} type="file" accept="image/*" onChange={handleHeadshotUpload} style={{ display: "none" }} />
              <button type="button" onClick={() => headshotRef.current?.click()}
                style={{
                  width: 72, height: 72, borderRadius: "50%",
                  border: `2px dashed ${theme.border}`, background: theme.borderLight,
                  cursor: "pointer", overflow: "hidden", position: "relative",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                {childHeadshot ? (
                  <img src={childHeadshot} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span style={{ fontSize: 24, color: theme.textLight }}>📷</span>
                )}
              </button>
              {childHeadshot ? (
                <button type="button" onClick={() => setChildHeadshot(null)}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: theme.textMuted, marginTop: 6 }}>
                  Remove photo
                </button>
              ) : (
                <span style={{ fontSize: 12, color: theme.textLight, marginTop: 6 }}>Child's photo (optional)</span>
              )}
            </div>

            <div style={{ marginBottom: 16 }}>
              <label className="label">Child's Name</label>
              <input className="input" value={childName} onChange={(e) => setChildName(e.target.value)}
                placeholder="Alex" required />
            </div>
          </>
        )}

        {/* Club logo */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 20 }}>
          <input ref={logoRef} type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: "none" }} />
          <button type="button" onClick={() => logoRef.current?.click()}
            style={{
              width: 80, height: 80, borderRadius: "50%",
              border: `2px dashed ${theme.border}`, background: theme.borderLight,
              cursor: "pointer", overflow: "hidden", position: "relative",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
            {logo ? (
              <img src={logo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <span style={{ fontSize: 12, color: theme.textLight, textAlign: "center", lineHeight: 1.3 }}>Club<br/>Logo</span>
            )}
          </button>
          {logo ? (
            <button type="button" onClick={() => setLogo(null)}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: theme.textMuted, marginTop: 6 }}>
              Remove logo
            </button>
          ) : (
            <span style={{ fontSize: 12, color: theme.textLight, marginTop: 6 }}>Team logo (optional)</span>
          )}
        </div>

        {/* Team name */}
        <div style={{ marginBottom: 20 }}>
          <label className="label">Team Name</label>
          <input className="input" value={teamName} onChange={(e) => setTeamName(e.target.value)}
            placeholder="Thunder U12, Varsity, etc." />
        </div>

        {/* Organization type */}
        <div style={{ marginBottom: 20 }}>
          <label className="label">Organization</label>
          <div style={{ display: "flex", gap: 8 }}>
            {[
              { id: "club", label: "Club" },
              { id: "school", label: "High School" },
              { id: "other", label: "Other" },
            ].map((o) => (
              <button key={o.id} type="button" onClick={() => setOrgType(o.id)}
                style={{
                  flex: 1, padding: "9px 8px", borderRadius: 8, cursor: "pointer",
                  border: `1.5px solid ${orgType === o.id ? brandColor : theme.border}`,
                  background: orgType === o.id ? `${brandColor}10` : "white",
                  color: orgType === o.id ? brandColor : theme.textMuted,
                  fontSize: 13, fontWeight: orgType === o.id ? 600 : 400,
                  transition: "all 0.15s",
                }}>
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Brand color */}
        <div style={{ marginBottom: 24 }}>
          <label className="label">Team Color</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {COLOR_PRESETS.map((c) => (
              <button key={c.hex} type="button" title={c.label}
                onClick={() => { setBrandColor(c.hex); setShowCustom(false); }}
                style={{
                  width: 36, height: 36, borderRadius: "50%", border: "none", cursor: "pointer",
                  background: c.hex, position: "relative", flexShrink: 0,
                  outline: brandColor === c.hex && !showCustom ? `2px solid ${c.hex}` : "2px solid transparent",
                  outlineOffset: 3,
                  transition: "outline 0.15s",
                }} />
            ))}
            <button type="button"
              onClick={() => setShowCustom(!showCustom)}
              style={{
                width: 36, height: 36, borderRadius: "50%", cursor: "pointer", flexShrink: 0,
                border: `2px dashed ${theme.border}`,
                background: showCustom ? brandColor : theme.borderLight,
                color: showCustom ? "white" : theme.textLight,
                fontSize: 16, fontWeight: 400, lineHeight: 1,
                display: "flex", alignItems: "center", justifyContent: "center",
                outline: showCustom ? `2px solid ${brandColor}` : "2px solid transparent",
                outlineOffset: 3,
                transition: "all 0.15s",
              }}>
              +
            </button>
          </div>
          {showCustom && (
            <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
              <input
                className="input"
                value={customHex}
                onChange={(e) => {
                  const v = e.target.value;
                  setCustomHex(v);
                  if (/^#[0-9A-Fa-f]{6}$/.test(v)) setBrandColor(v);
                }}
                placeholder="#1B4332"
                maxLength={7}
                style={{ width: 110, fontFamily: fonts.mono, fontSize: 13, padding: "8px 10px" }}
              />
              <div style={{
                width: 32, height: 32, borderRadius: 6, flexShrink: 0,
                background: brandColor, border: `1px solid ${theme.border}`,
              }} />
            </div>
          )}
        </div>

        <button className="btn btn-primary" type="submit"
          style={{ width: "100%", padding: "14px 24px", fontSize: 16, background: brandColor }}>
          Start Journaling →
        </button>
      </form>
    </div>
  );
}

// --- ENTRY COMPOSER ---
function EntryComposer({ season, onSave, onClose, brandColor, orgName }) {
  const composerPrimary = brandColor || theme.primary;
  const [entryType, setEntryType] = useState("game");
  const [text, setText] = useState("");
  const [opponent, setOpponent] = useState("");
  const [venue, setVenue] = useState("");
  const [scoreHome, setScoreHome] = useState("");
  const [scoreAway, setScoreAway] = useState("");
  const [showGameData, setShowGameData] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [consentShared, setConsentShared] = useState(!!orgName);
  const fileRef = useRef(null);

  const entryTypes = [
    { id: "game", label: "Game", emoji: "🏟️" },
    { id: "practice", label: "Practice", emoji: "🔄" },
    { id: "tournament", label: "Tournament", emoji: "🏆" },
    { id: "moment", label: "Moment", emoji: "⭐" },
  ];

  const handlePhoto = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
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
      consent_shared: orgName ? consentShared : false,
    });
  };

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
                flex: 1, padding: "10px 8px", borderRadius: 10, border: `1.5px solid ${entryType === t.id ? composerPrimary : theme.border}`,
                background: entryType === t.id ? `${composerPrimary}10` : "white",
                cursor: "pointer", textAlign: "center", transition: "all 0.15s",
              }}>
              <div style={{ fontSize: 18 }}>{t.emoji}</div>
              <div style={{
                fontSize: 11, fontWeight: 600, marginTop: 2,
                color: entryType === t.id ? composerPrimary : theme.textMuted,
              }}>{t.label}</div>
            </button>
          ))}
        </div>

        {/* The Line */}
        <div style={{ marginBottom: 16 }}>
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
                width: "100%", height: 180, objectFit: "cover", objectPosition: "top", borderRadius: 12,
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
                fontSize: 13, fontWeight: 600, color: composerPrimary,
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

        {/* Consent toggle - only shown when parent is org-connected */}
        {orgName && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 0", marginBottom: 12, borderTop: `1px solid ${theme.borderLight}`,
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>
                Share with {orgName}
              </div>
              <div style={{ fontSize: 11, color: theme.textMuted }}>
                Your club can feature this entry
              </div>
            </div>
            <button onClick={() => setConsentShared(!consentShared)}
              style={{
                width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
                background: consentShared ? composerPrimary : theme.border,
                position: "relative", transition: "background 0.2s",
              }}>
              <div style={{
                width: 20, height: 20, borderRadius: "50%", background: "white",
                position: "absolute", top: 2,
                left: consentShared ? 22 : 2,
                transition: "left 0.2s",
                boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
              }} />
            </button>
          </div>
        )}

        {/* Save */}
        <button className="btn btn-primary" onClick={handleSave}
          disabled={!text.trim()}
          style={{
            width: "100%", padding: "14px 24px", fontSize: 16,
            opacity: text.trim() ? 1 : 0.5,
            background: composerPrimary,
          }}>
          Save Entry ✓
        </button>
      </div>
    </div>
  );
}

// --- TIMELINE ENTRY CARD ---
function EntryCard({ entry, players, onShare, brandColor }) {
  const typeColors = {
    game: entry.result === "win" ? theme.win : entry.result === "loss" ? theme.loss : theme.draw,
    practice: theme.practice,
    tournament: theme.tournament,
    moment: theme.moment,
  };

  const typeEmojis = { game: "🏟️", practice: "🔄", tournament: "🏆", moment: "⭐" };
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
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: theme.textLight, fontFamily: fonts.mono }}>
            {new Date(entry.entry_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
          {onShare && (
            <button
              onClick={() => onShare(entry)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 14,
                color: theme.textLight,
                padding: "2px 4px",
                lineHeight: 1,
                transition: "color 0.15s",
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = brandColor || theme.primary}
              onMouseLeave={(e) => e.currentTarget.style.color = theme.textLight}
              title="Share"
            >
              ↗
            </button>
          )}
        </div>
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
      {(entry.photoPreview || entry.photoData) && (
        <img src={entry.photoPreview || entry.photoData} alt="" style={{
          width: "100%", height: 180, objectFit: "cover", objectPosition: "top", borderRadius: 10, marginBottom: 10,
        }} />
      )}

      {/* The Line */}
      <p style={{
        fontFamily: fonts.display, fontSize: 17, lineHeight: 1.5,
        color: theme.text, fontStyle: "italic",
      }}>
        &ldquo;{entry.text}&rdquo;
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
function SeasonStats({ entries, brandColor }) {
  const games = entries.filter((e) => e.entry_type === "game" || e.entry_type === "tournament");
  const wins = games.filter((e) => e.result === "win").length;
  const losses = games.filter((e) => e.result === "loss").length;
  const draws = games.filter((e) => e.result === "draw").length;
  const practices = entries.filter((e) => e.entry_type === "practice").length;
  const photos = entries.filter((e) => e.photoPreview || e.photoData || e.photo_path).length;

  return (
    <div style={{
      display: "flex", gap: 6, marginBottom: 16, overflowX: "auto",
      padding: "2px 0",
    }}>
      {[
        { label: "Entries", value: entries.length, color: brandColor || theme.primary },
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

// --- BOOK PREVIEW (Paginated) ---
function BookPreview({ entries, team, season, players, onClose, onOrder }) {
  const bookPrimary = team?.color || theme.primary;
  const [currentPage, setCurrentPage] = useState(0);
  const [touchStart, setTouchStart] = useState(null);

  const sortedEntries = [...entries].sort((a, b) => new Date(a.entry_date) - new Date(b.entry_date));
  const entryPages = paginateEntries(entries);
  const totalPages = 2 + entryPages.length + 1; // title + summary + entries + closing

  const games = sortedEntries.filter((e) => e.entry_type === "game" || e.entry_type === "tournament");
  const wins = games.filter((e) => e.result === "win").length;
  const losses = games.filter((e) => e.result === "loss").length;
  const draws = games.filter((e) => e.result === "draw").length;
  const practices = sortedEntries.filter((e) => e.entry_type === "practice").length;
  const tournaments = sortedEntries.filter((e) => e.entry_type === "tournament").length;

  const goNext = () => setCurrentPage((p) => Math.min(p + 1, totalPages - 1));
  const goPrev = () => setCurrentPage((p) => Math.max(p - 1, 0));

  const handleTouchStart = (e) => setTouchStart(e.touches[0].clientX);
  const handleTouchEnd = (e) => {
    if (touchStart === null) return;
    const diff = touchStart - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) goNext();
      else goPrev();
    }
    setTouchStart(null);
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "ArrowRight" || e.key === " ") goNext();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const handleProofPDF = () => {
    const bookData = {
      team: { ...team, color: team.color || theme.primary },
      season,
      players,
      entries: sortedEntries.map((e) => ({
        ...e,
        photoData: e.photoData || e.photoPreview || null,
      })),
    };
    const w = window.open("/book-template/interior.html", "_blank");
    if (w) {
      w.addEventListener("load", () => {
        w.__BOOK_DATA__ = bookData;
        w.dispatchEvent(new Event("bookDataReady"));
      });
    }
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  };

  const formatDateRange = () => {
    if (sortedEntries.length === 0) return "";
    const first = new Date(sortedEntries[0].entry_date + "T12:00:00");
    const last = new Date(sortedEntries[sortedEntries.length - 1].entry_date + "T12:00:00");
    const opts = { month: "long", day: "numeric", year: "numeric" };
    return `${first.toLocaleDateString("en-US", opts)} – ${last.toLocaleDateString("en-US", opts)}`;
  };

  // --- Page content renderers ---
  const renderTitlePage = () => (
    <div style={{
      width: "100%", height: "100%", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", textAlign: "center",
      padding: 48, background: "#FFFDF8",
    }}>
      <div style={{ width: 40, height: 2, background: bookPrimary, marginBottom: 28 }} />
      <h1 style={{
        fontFamily: fonts.headline, fontSize: 36, fontWeight: 400,
        color: theme.text, lineHeight: 1.15, marginBottom: 12,
      }}>{team.name}</h1>
      {players[0]?.name && (
        <p style={{ fontFamily: fonts.body, fontSize: 14, color: theme.textMuted, marginBottom: 6 }}>
          {players[0].name}
        </p>
      )}
      <p style={{
        fontFamily: fonts.mono, fontSize: 10, color: theme.textLight,
        letterSpacing: 2, textTransform: "uppercase",
      }}>{season.name}</p>
      <div style={{ width: 40, height: 2, background: bookPrimary, marginTop: 28 }} />
    </div>
  );

  const renderSummaryPage = () => (
    <div style={{
      width: "100%", height: "100%", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", textAlign: "center",
      padding: 40, background: "#FFFDF8",
    }}>
      <p style={{
        fontFamily: fonts.mono, fontSize: 8, color: theme.textLight,
        letterSpacing: 3, textTransform: "uppercase", marginBottom: 24,
      }}>Season Summary</p>
      <p style={{
        fontFamily: fonts.mono, fontSize: 48, fontWeight: 700,
        color: theme.text, letterSpacing: 3, marginBottom: 4,
      }}>{wins}-{losses}-{draws}</p>
      <p style={{
        fontFamily: fonts.mono, fontSize: 9, color: theme.textLight,
        letterSpacing: 2, textTransform: "uppercase", marginBottom: 28,
      }}>Win – Loss – Draw</p>
      <div style={{ width: 30, height: 1.5, background: `${bookPrimary}20`, marginBottom: 28 }} />
      <div style={{ display: "flex", gap: 32, marginBottom: 28 }}>
        {[
          { v: games.length, l: "Games" },
          { v: practices, l: "Practices" },
          ...(tournaments > 0 ? [{ v: tournaments, l: "Tournaments" }] : []),
          { v: sortedEntries.length, l: "Entries" },
        ].map((s) => (
          <div key={s.l} style={{ textAlign: "center" }}>
            <div style={{ fontFamily: fonts.mono, fontSize: 20, fontWeight: 600, color: theme.text }}>{s.v}</div>
            <div style={{ fontFamily: fonts.body, fontSize: 8, color: theme.textLight, textTransform: "uppercase", letterSpacing: 1, marginTop: 2 }}>{s.l}</div>
          </div>
        ))}
      </div>
      <p style={{ fontFamily: fonts.body, fontSize: 10, color: theme.textMuted }}>{formatDateRange()}</p>
    </div>
  );

  const renderEntryPage = (pageEntries) => {
    const hasAnyPhoto = pageEntries.some((e) => e.photoPreview || e.photoData);
    const isTextOnly = pageEntries.length === 1 && !hasAnyPhoto;

    return (
      <div style={{
        width: "100%", height: "100%", padding: isTextOnly ? 56 : 32, background: "#FFFDF8",
        display: "flex", flexDirection: "column",
        justifyContent: isTextOnly ? "center" : "flex-start",
      }}>
        {pageEntries.map((entry, i) => {
          const hasScore = entry.score_home !== null && entry.score_away !== null;
          const resultColors = { win: theme.win, loss: theme.loss, draw: theme.draw };
          const resultLabels = { win: "W", loss: "L", draw: "D" };
          const photo = entry.photoPreview || entry.photoData;

          return (
            <div key={entry.id} style={{
              ...(i > 0 ? { paddingTop: 18, marginTop: 18, borderTop: `1px solid ${bookPrimary}0F` } : {}),
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                <span style={{
                  fontFamily: fonts.mono, fontSize: 7, fontWeight: 500,
                  color: theme.textLight, textTransform: "uppercase", letterSpacing: 2,
                }}>{entry.entry_type}</span>
                <span style={{ fontFamily: fonts.mono, fontSize: 8, color: theme.textLight }}>
                  {formatDate(entry.entry_date)}
                </span>
              </div>

              {hasScore && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{
                    fontFamily: fonts.mono, fontSize: isTextOnly ? 32 : 26, fontWeight: 700,
                    color: theme.text, letterSpacing: 1,
                  }}>{entry.score_home} – {entry.score_away}</span>
                  {entry.result && (
                    <span style={{
                      fontFamily: fonts.mono, fontSize: 8, fontWeight: 600,
                      padding: "2px 6px", borderRadius: 2,
                      background: resultColors[entry.result], color: "white",
                      letterSpacing: 1,
                    }}>{resultLabels[entry.result]}</span>
                  )}
                </div>
              )}

              {entry.opponent && (
                <p style={{ fontFamily: fonts.body, fontSize: 10, color: theme.textMuted, marginBottom: 8 }}>
                  vs {entry.opponent}
                </p>
              )}

              {photo && (
                <img src={photo} alt="" style={{
                  width: "100%", maxHeight: 280, objectFit: "cover", objectPosition: "top",
                  borderRadius: 3, marginBottom: 10, display: "block",
                }} />
              )}

              {entry.text && (
                <p style={{
                  fontFamily: fonts.display, fontSize: isTextOnly ? 15 : 12, lineHeight: 1.6,
                  color: "#2A2A2A", fontStyle: "italic",
                }}>
                  &ldquo;{entry.text}&rdquo;
                </p>
              )}

              {entry.venue && (
                <p style={{ fontFamily: fonts.body, fontSize: 8, color: theme.textLight, marginTop: 6 }}>
                  {entry.venue}
                </p>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderClosingPage = () => {
    const playerName = players[0]?.name || "yours";
    return (
      <div style={{
        width: "100%", height: "100%", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", textAlign: "center",
        padding: 60, background: "#FFFDF8",
      }}>
        <p style={{
          fontFamily: fonts.headline, fontStyle: "italic", fontSize: 18,
          lineHeight: 1.5, color: theme.textMuted, marginBottom: 36,
        }}>
          Every season tells a story.<br />This was {playerName}'s.
        </p>
        <div style={{ width: 30, height: 1.5, background: bookPrimary, marginBottom: 16 }} />
        <p style={{
          fontFamily: fonts.mono, fontSize: 8, color: theme.textLight,
          letterSpacing: 3, textTransform: "uppercase",
        }}>Team Season</p>
      </div>
    );
  };

  const renderCurrentPage = () => {
    if (currentPage === 0) return renderTitlePage();
    if (currentPage === 1) return renderSummaryPage();
    if (currentPage < 2 + entryPages.length) return renderEntryPage(entryPages[currentPage - 2]);
    return renderClosingPage();
  };

  const RENDER_SIZE = 700;
  const CONTAINER_SIZE = 340;
  const scale = CONTAINER_SIZE / RENDER_SIZE;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      zIndex: 100, padding: 16,
    }}>
      {/* Header */}
      <div style={{
        width: "100%", maxWidth: 380, display: "flex", justifyContent: "space-between",
        alignItems: "center", marginBottom: 16,
      }}>
        <button onClick={onClose} style={{
          background: "rgba(255,255,255,0.1)", border: "none", borderRadius: "50%",
          width: 36, height: 36, color: "white", fontSize: 18, cursor: "pointer",
        }}>×</button>
        <span style={{
          fontFamily: fonts.mono, fontSize: 12, color: "rgba(255,255,255,0.5)",
        }}>{currentPage + 1} / {totalPages}</span>
      </div>

      {/* Page viewer */}
      <div
        style={{
          width: CONTAINER_SIZE, height: CONTAINER_SIZE,
          overflow: "hidden", borderRadius: 4,
          boxShadow: "0 16px 64px rgba(0,0,0,0.5)",
          marginBottom: 16, position: "relative",
          background: "#FFFDF8",
        }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div style={{
          width: RENDER_SIZE, height: RENDER_SIZE,
          transform: `scale(${scale})`, transformOrigin: "top left",
        }}>
          {renderCurrentPage()}
        </div>
      </div>

      {/* Navigation */}
      <div style={{
        display: "flex", alignItems: "center", gap: 16, marginBottom: 20,
      }}>
        <button onClick={goPrev} disabled={currentPage === 0} style={{
          background: "none", border: "none", color: currentPage === 0 ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.7)",
          fontSize: 24, cursor: currentPage === 0 ? "default" : "pointer", padding: "4px 8px",
        }}>‹</button>

        <div style={{ display: "flex", gap: 4 }}>
          {Array.from({ length: Math.min(totalPages, 12) }, (_, i) => {
            const pageIdx = totalPages <= 12 ? i : Math.round(i * (totalPages - 1) / 11);
            return (
              <div key={i} style={{
                width: 6, height: 6, borderRadius: "50%",
                background: pageIdx === currentPage ? "white" : "rgba(255,255,255,0.25)",
                cursor: "pointer", transition: "background 0.15s",
              }} onClick={() => setCurrentPage(pageIdx)} />
            );
          })}
        </div>

        <button onClick={goNext} disabled={currentPage === totalPages - 1} style={{
          background: "none", border: "none",
          color: currentPage === totalPages - 1 ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.7)",
          fontSize: 24, cursor: currentPage === totalPages - 1 ? "default" : "pointer", padding: "4px 8px",
        }}>›</button>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={handleProofPDF} className="btn" style={{
          background: "rgba(255,255,255,0.12)", color: "white",
          fontSize: 13, padding: "10px 20px",
        }}>
          Proof PDF
        </button>
        <button onClick={onOrder} className="btn" style={{
          background: theme.accent, color: "white",
          fontSize: 13, padding: "10px 20px",
        }}>
          Order Book $34.99
        </button>
      </div>
    </div>
  );
}

// --- ORDER FLOW ---
function OrderFlow({ entries, team, season, players, onClose }) {
  const orderPrimary = team?.color || theme.primary;
  const entryPages = paginateEntries(entries);
  const totalBookPages = 2 + entryPages.length + 1;
  const sortedEntries = [...entries].sort((a, b) => new Date(a.entry_date) - new Date(b.entry_date));

  const [step, setStep] = useState(() => {
    const saved = localStorage.getItem("teamSeasonOrder");
    if (saved) {
      try {
        const order = JSON.parse(saved);
        if (order.status && order.status !== "idle") return "status";
      } catch (e) {}
    }
    return "summary";
  });

  const [shipping, setShipping] = useState(() => {
    const saved = localStorage.getItem("teamSeasonOrder");
    if (saved) {
      try { return JSON.parse(saved).shipping || {}; } catch (e) {}
    }
    return { name: "", email: "", street: "", city: "", state: "", zip: "" };
  });

  const [orderStatus, setOrderStatus] = useState(() => {
    const saved = localStorage.getItem("teamSeasonOrder");
    if (saved) {
      try { return JSON.parse(saved).status || "idle"; } catch (e) {}
    }
    return "idle";
  });

  const [errors, setErrors] = useState({});

  // Persist order state
  useEffect(() => {
    localStorage.setItem("teamSeasonOrder", JSON.stringify({ shipping, status: orderStatus }));
  }, [shipping, orderStatus]);

  const validateShipping = () => {
    const errs = {};
    if (!shipping.name.trim()) errs.name = "Name is required";
    if (!shipping.email.trim() || !/\S+@\S+\.\S+/.test(shipping.email)) errs.email = "Valid email is required";
    if (!shipping.street.trim()) errs.street = "Street address is required";
    if (!shipping.city.trim()) errs.city = "City is required";
    if (!shipping.state.trim() || shipping.state.trim().length !== 2) errs.state = "Two-letter state code";
    if (!shipping.zip.trim() || !/^\d{5}(-\d{4})?$/.test(shipping.zip.trim())) errs.zip = "Valid ZIP code";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleContinueToShipping = () => setStep("shipping");
  const handleContinueToReview = () => {
    if (validateShipping()) setStep("review");
  };

  const handlePlaceOrder = async () => {
    setOrderStatus("processing");
    setStep("status");

    try {
      // Serialize book data (strip File objects, keep base64 photoData)
      const bookData = {
        team,
        season,
        players,
        entries: entries.map(({ photo, ...rest }) => rest),
      };

      // Store book data in Blob
      const storeRes = await fetch('/api/store-book-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookData }),
      });

      if (!storeRes.ok) {
        const err = await storeRes.json();
        if (err.error === 'Backend not configured') {
          setOrderStatus("coming_soon");
          return;
        }
        throw new Error('Failed to store book data');
      }

      const { url: bookDataUrl } = await storeRes.json();

      // Save order state before Stripe redirect
      localStorage.setItem("teamSeasonOrder", JSON.stringify({
        shipping,
        status: "processing",
        bookDataUrl,
      }));

      // Create Stripe checkout session
      const checkoutRes = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookDataUrl, shipping }),
      });

      if (!checkoutRes.ok) {
        const err = await checkoutRes.json();
        if (err.error === 'Backend not configured') {
          setOrderStatus("coming_soon");
          return;
        }
        throw new Error(err.error || 'Checkout failed');
      }

      const { url } = await checkoutRes.json();
      window.location.href = url;
    } catch (err) {
      console.error('Order error:', err);
      setOrderStatus("error");
    }
  };

  const statusSteps = [
    { key: "ordered", label: "Ordered" },
    { key: "printing", label: "Printing" },
    { key: "shipped", label: "Shipped" },
    { key: "delivered", label: "Delivered" },
  ];

  const shippingField = (key, label, placeholder, opts = {}) => (
    <div style={{ marginBottom: 12 }}>
      <label className="label">{label}</label>
      <input
        className="input"
        value={shipping[key]}
        onChange={(e) => setShipping({ ...shipping, [key]: e.target.value })}
        placeholder={placeholder}
        {...opts}
        style={{ ...(errors[key] ? { borderColor: theme.loss } : {}) }}
      />
      {errors[key] && <span style={{ fontSize: 11, color: theme.loss, marginTop: 2, display: "block" }}>{errors[key]}</span>}
    </div>
  );

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 100, padding: 16,
    }}>
      <div className="slide-up" style={{
        background: "white", borderRadius: 16, width: "100%", maxWidth: 400,
        maxHeight: "90vh", overflow: "auto", padding: 24,
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontFamily: fonts.display, fontSize: 20, fontWeight: 700 }}>
            {step === "summary" && "Order Your Book"}
            {step === "shipping" && "Shipping"}
            {step === "review" && "Review Order"}
            {step === "status" && "Order Status"}
          </h2>
          <button onClick={onClose} style={{
            background: "none", border: "none", fontSize: 22, cursor: "pointer", color: theme.textMuted,
          }}>×</button>
        </div>

        {/* Step: Summary */}
        {step === "summary" && (
          <>
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 14, color: theme.textMuted }}>Pages</span>
                <span style={{ fontFamily: fonts.mono, fontSize: 14, fontWeight: 600 }}>{totalBookPages}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 14, color: theme.textMuted }}>Entries</span>
                <span style={{ fontFamily: fonts.mono, fontSize: 14, fontWeight: 600 }}>{sortedEntries.length}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 14, color: theme.textMuted }}>Format</span>
                <span style={{ fontSize: 14, fontWeight: 500 }}>7×7" Softcover</span>
              </div>
              <div style={{ height: 1, background: theme.border, margin: "12px 0" }} />
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 16, fontWeight: 600 }}>Total</span>
                <span style={{ fontFamily: fonts.mono, fontSize: 16, fontWeight: 700, color: orderPrimary }}>$34.99 + shipping</span>
              </div>
            </div>
            <button className="btn btn-primary" onClick={handleContinueToShipping} style={{ width: "100%", padding: "14px 24px", fontSize: 15, background: orderPrimary }}>
              Continue
            </button>
          </>
        )}

        {/* Step: Shipping */}
        {step === "shipping" && (
          <>
            {shippingField("name", "Full Name", "Alex Johnson")}
            {shippingField("email", "Email", "alex@email.com", { type: "email" })}
            {shippingField("street", "Street Address", "123 Main St")}
            {shippingField("city", "City", "Springfield")}
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}>
                {shippingField("state", "State", "CA", { maxLength: 2 })}
              </div>
              <div style={{ flex: 1 }}>
                {shippingField("zip", "ZIP Code", "90210")}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button className="btn btn-ghost" onClick={() => setStep("summary")} style={{ flex: 1 }}>Back</button>
              <button className="btn btn-primary" onClick={handleContinueToReview} style={{ flex: 2, background: orderPrimary }}>Review Order</button>
            </div>
          </>
        )}

        {/* Step: Review */}
        {step === "review" && (
          <>
            <div className="card" style={{ marginBottom: 12 }}>
              <p className="label">Ship To</p>
              <p style={{ fontSize: 14 }}>{shipping.name}</p>
              <p style={{ fontSize: 13, color: theme.textMuted }}>{shipping.street}</p>
              <p style={{ fontSize: 13, color: theme.textMuted }}>{shipping.city}, {shipping.state} {shipping.zip}</p>
              <p style={{ fontSize: 13, color: theme.textMuted }}>{shipping.email}</p>
            </div>
            <div className="card" style={{ marginBottom: 16 }}>
              <p className="label">Book</p>
              <p style={{ fontSize: 14 }}>{team.name} — {season.name}</p>
              <p style={{ fontSize: 13, color: theme.textMuted }}>{totalBookPages} pages, {sortedEntries.length} entries</p>
              <div style={{ height: 1, background: theme.border, margin: "10px 0" }} />
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 600 }}>Total</span>
                <span style={{ fontFamily: fonts.mono, fontWeight: 700, color: orderPrimary }}>$34.99 + shipping</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setStep("shipping")} style={{ flex: 1 }}>Back</button>
              <button className="btn btn-primary" onClick={handlePlaceOrder} style={{ flex: 2, background: orderPrimary }}>Place Order</button>
            </div>
          </>
        )}

        {/* Step: Status */}
        {step === "status" && (
          <>
            {orderStatus === "processing" ? (
              <div style={{ textAlign: "center", padding: "24px 0" }}>
                <div style={{ fontSize: 14, color: theme.textMuted, marginBottom: 8 }}>Setting up your order...</div>
                <div style={{ width: 32, height: 32, border: `3px solid ${theme.borderLight}`, borderTopColor: orderPrimary, borderRadius: "50%", margin: "0 auto", animation: "spin 0.8s linear infinite" }} />
              </div>
            ) : orderStatus === "error" ? (
              <div style={{ textAlign: "center", padding: "24px 0" }}>
                <p style={{ fontFamily: fonts.display, fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
                  Something went wrong
                </p>
                <p style={{ fontSize: 14, color: theme.textMuted, marginBottom: 20, lineHeight: 1.5 }}>
                  Your payment was not charged. Please try again.
                </p>
                <button className="btn btn-ghost" onClick={() => { setStep("review"); setOrderStatus("idle"); }} style={{ width: "100%" }}>
                  Try Again
                </button>
              </div>
            ) : orderStatus === "coming_soon" ? (
              <div style={{ textAlign: "center", padding: "24px 0" }}>
                <p style={{ fontFamily: fonts.display, fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
                  Coming Soon
                </p>
                <p style={{ fontSize: 14, color: theme.textMuted, marginBottom: 20, lineHeight: 1.5 }}>
                  Online ordering is almost ready. For now, use the <strong>Proof PDF</strong> button in the book preview to download a print-quality version of your book.
                </p>
                <button className="btn btn-ghost" onClick={() => { setStep("summary"); setOrderStatus("idle"); }} style={{ width: "100%" }}>
                  Got it
                </button>
              </div>
            ) : (
              <>
                <div style={{ padding: "16px 0" }}>
                  {statusSteps.map((s, i) => {
                    const active = statusSteps.findIndex((ss) => ss.key === orderStatus) >= i;
                    return (
                      <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: i < statusSteps.length - 1 ? 20 : 0 }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: "50%",
                          background: active ? orderPrimary : theme.borderLight,
                          color: active ? "white" : theme.textLight,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 12, fontWeight: 600, flexShrink: 0,
                        }}>
                          {active ? "✓" : i + 1}
                        </div>
                        <span style={{
                          fontSize: 14, fontWeight: active ? 600 : 400,
                          color: active ? theme.text : theme.textMuted,
                        }}>{s.label}</span>
                      </div>
                    );
                  })}
                </div>
                <button className="btn btn-ghost" onClick={onClose} style={{ width: "100%", marginTop: 16 }}>
                  Close
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// --- HEADLINE GENERATOR ---
function generateHeadline(entry) {
  const seed = (entry.id || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const pick = (arr) => arr[seed % arr.length];

  const text = (entry.text || "").toLowerCase();
  const type = entry.entry_type;
  const result = entry.result;
  const scoreHome = entry.score_home;
  const scoreAway = entry.score_away;
  const hasScore = scoreHome !== null && scoreAway !== null;
  const diff = hasScore ? scoreHome - scoreAway : 0;

  if (text.includes("first goal") || text.includes("first time") || text.includes("first one")) {
    return pick(["The first one", "A first to remember"]);
  }

  if (type === "practice") {
    return pick(["The work continues", "Building something", "On the training ground"]);
  }

  if (type === "tournament") {
    return pick(["Tournament day", "When it counts", "Under the lights"]);
  }

  if (type === "moment") {
    return pick(["The moment", "One for the books"]);
  }

  if (result === "win") {
    if (hasScore && diff >= 3) return pick(["Dominant", "Statement game", "Total control"]);
    if (hasScore && scoreAway === 0) return pick(["Clean sheet", "Shutout", "Nothing gets through"]);
    return pick(["Victory", "Got the job done", "The W"]);
  }

  if (result === "loss") {
    return pick(["Tough one", "We go again", "Not our day"]);
  }

  if (result === "draw") {
    return pick(["Battled to a draw", "Couldn't be separated", "Even match"]);
  }

  return pick(["Game day", "The moment", "Another chapter"]);
}

// --- SHARE CARD RENDER ---
const ShareCardRender = React.forwardRef(function ShareCardRender({ entry, team, season, aspect, preview, headline: headlineProp }, ref) {
  const isStory = aspect === "story";
  const width = 1080;
  const height = isStory ? 1920 : 1080;

  const headline = headlineProp || generateHeadline(entry);
  const entryText = entry.text || "";
  const hasPhoto = !!(entry.photoPreview || entry.photoData);
  const hasScore = entry.score_home !== null && entry.score_away !== null;

  const teamColor = team?.color || theme.primary;

  const lineFontSize = entryText.length > 200 ? 36 : entryText.length > 100 ? 42 : 52;

  const dateStr = new Date(entry.entry_date).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

  return (
    <div
      ref={ref}
      style={{
        width,
        height,
        ...(preview ? {} : { position: "absolute", left: -9999, top: -9999 }),
        overflow: "hidden",
        fontFamily: fonts.body,
        background: hasPhoto ? "#000" : gradientFromColor(teamColor),
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Photo area - uses background-image for html2canvas compatibility */}
      {hasPhoto ? (
        <div style={{
          flex: isStory ? "1 1 55%" : "1 1 50%",
          position: "relative",
          overflow: "hidden",
          backgroundImage: `url(${entry.photoPreview || entry.photoData})`,
          backgroundSize: "cover",
          backgroundPosition: "top center",
          backgroundRepeat: "no-repeat",
        }}>
          <div style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "60%",
            background: "linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.6) 40%, transparent 100%)",
          }} />
        </div>
      ) : (
        <div style={{ flex: isStory ? "1 1 30%" : "1 1 25%" }} />
      )}

      {/* Content area */}
      <div style={{
        flex: hasPhoto ? (isStory ? "1 1 45%" : "1 1 50%") : (isStory ? "1 1 70%" : "1 1 75%"),
        background: hasPhoto ? "#000" : "transparent",
        padding: isStory ? "48px 64px 60px" : "40px 64px 48px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
      }}>
        {/* Team strip */}
        <div style={{
          fontSize: 28,
          fontWeight: 600,
          color: "rgba(255,255,255,0.6)",
          letterSpacing: 2,
          textTransform: "uppercase",
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}>
          {team.logo ? (
            <img src={team.logo} alt="" style={{
              width: 64, height: 64, borderRadius: "50%", objectFit: "cover",
              border: "2px solid rgba(255,255,255,0.2)",
            }} />
          ) : (
            <span style={{ fontSize: 36 }}>{team.emoji}</span>
          )}
          <span>{team.name}</span>
        </div>

        {/* Headline */}
        <h1 style={{
          fontFamily: fonts.headline,
          fontStyle: "italic",
          fontSize: isStory ? 96 : 80,
          fontWeight: 400,
          color: "#FFFFFF",
          lineHeight: 1.0,
          marginBottom: 20,
          letterSpacing: -1,
        }}>
          {headline}
        </h1>

        {/* Accent divider */}
        <div style={{
          width: 80,
          height: 4,
          background: teamColor,
          marginBottom: 24,
          borderRadius: 2,
        }} />

        {/* The line */}
        <p style={{
          fontFamily: fonts.display,
          fontStyle: "italic",
          fontSize: lineFontSize,
          lineHeight: 1.4,
          color: "rgba(255,255,255,0.85)",
          marginBottom: 32,
          maxHeight: isStory ? 280 : 200,
          overflow: "hidden",
        }}>
          &ldquo;{entryText}&rdquo;
        </p>

        {/* Score badge */}
        {hasScore && (
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
            background: "rgba(255,255,255,0.08)",
            borderRadius: 16,
            padding: "20px 28px",
            marginBottom: 32,
            border: "1px solid rgba(255,255,255,0.1)",
          }}>
            <span style={{
              fontFamily: fonts.mono,
              fontSize: 56,
              fontWeight: 700,
              color: "#FFFFFF",
              letterSpacing: 2,
            }}>
              {entry.score_home} – {entry.score_away}
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {entry.opponent && (
                <span style={{ fontSize: 24, color: "rgba(255,255,255,0.7)", fontWeight: 500 }}>
                  vs {entry.opponent}
                </span>
              )}
              {entry.venue && (
                <span style={{ fontSize: 20, color: "rgba(255,255,255,0.4)" }}>
                  {entry.venue}
                </span>
              )}
              <span style={{ fontSize: 20, color: "rgba(255,255,255,0.4)" }}>
                {dateStr}
              </span>
            </div>
          </div>
        )}

        {/* No-score date */}
        {!hasScore && (
          <div style={{
            fontSize: 22,
            color: "rgba(255,255,255,0.35)",
            marginBottom: 32,
          }}>
            {entry.opponent && <span>vs {entry.opponent} · </span>}
            {dateStr}
          </div>
        )}

        {/* Watermark */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingTop: 20,
          borderTop: "1px solid rgba(255,255,255,0.1)",
        }}>
          <span style={{
            fontFamily: fonts.body,
            fontSize: 22,
            fontWeight: 700,
            color: "rgba(255,255,255,0.25)",
            letterSpacing: 4,
            textTransform: "uppercase",
          }}>
            Team Season
          </span>
          <span style={{
            fontFamily: fonts.body,
            fontSize: 20,
            color: "rgba(255,255,255,0.2)",
          }}>
            teamseason.app
          </span>
        </div>
      </div>
    </div>
  );
});

// --- SHARE PROMPT (post-save toast) ---
function SharePrompt({ entry, onShare, onDismiss, brandColor }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 6000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div style={{
      position: "fixed",
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 150,
      display: "flex",
      justifyContent: "center",
      padding: "0 16px 24px",
      animation: "slideUp 0.35s ease-out both",
    }}>
      <div style={{
        background: brandColor || theme.primary,
        color: "white",
        borderRadius: 14,
        padding: "14px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        width: "100%",
        maxWidth: 440,
        boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>✓</span>
          <span style={{ fontSize: 14, fontWeight: 500 }}>Share this moment?</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onShare}
            style={{
              background: "rgba(255,255,255,0.2)",
              color: "white",
              border: "none",
              borderRadius: 8,
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Share
          </button>
          <button
            onClick={onDismiss}
            style={{
              background: "none",
              color: "rgba(255,255,255,0.5)",
              border: "none",
              fontSize: 18,
              cursor: "pointer",
              padding: "4px 8px",
            }}
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}

// --- SHARE CARD MODAL ---
function ShareCardModal({ entry, team, season, onClose }) {
  const sharePrimary = team?.color || theme.primary;
  const cardRef = useRef(null);
  const [aspect, setAspect] = useState("story");
  const [exporting, setExporting] = useState(false);
  const [headline, setHeadline] = useState(generateHeadline(entry));

  const previewScale = aspect === "story"
    ? Math.min(340 / 1080, (window.innerHeight * 0.55) / 1920)
    : Math.min(340 / 1080, (window.innerHeight * 0.55) / 1080);

  const previewWidth = 1080 * previewScale;
  const previewHeight = (aspect === "story" ? 1920 : 1080) * previewScale;

  const [savedUrl, setSavedUrl] = useState(null);

  const handleExport = async () => {
    if (!cardRef.current || exporting) return;
    setExporting(true);

    try {
      await document.fonts.ready;
      await new Promise((r) => setTimeout(r, 300));

      const canvas = await html2canvas(cardRef.current, {
        width: 1080,
        height: aspect === "story" ? 1920 : 1080,
        scale: 1,
        useCORS: true,
        allowTaint: true,
        backgroundColor: null,
        logging: false,
      });

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) {
        setExporting(false);
        return;
      }

      const file = new File([blob], `team-season-${entry.id}.png`, { type: "image/png" });

      // Try Web Share API first (best mobile experience)
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: "Team Season" });
          setExporting(false);
          return;
        } catch (err) {
          if (err.name === "AbortError") { setExporting(false); return; }
        }
      }

      // Try download link (works on desktop, some Android)
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `team-season-${entry.id}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Also show long-press fallback image for iOS Safari
      setSavedUrl(url);
      setExporting(false);
    } catch (err) {
      console.error("Export failed:", err);
      setExporting(false);
    }
  };

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.85)",
      zIndex: 200,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: 16,
    }}>
      {/* Close button */}
      <button
        onClick={onClose}
        style={{
          position: "absolute",
          top: 16,
          right: 16,
          background: "rgba(255,255,255,0.1)",
          border: "none",
          borderRadius: "50%",
          width: 40,
          height: 40,
          color: "white",
          fontSize: 20,
          cursor: "pointer",
          zIndex: 201,
        }}
      >
        ×
      </button>

      {/* Aspect toggle */}
      <div style={{
        display: "flex",
        gap: 4,
        background: "rgba(255,255,255,0.1)",
        borderRadius: 10,
        padding: 4,
        marginBottom: 20,
      }}>
        {[
          { id: "story", label: "Story 9:16" },
          { id: "square", label: "Square 1:1" },
        ].map((opt) => (
          <button
            key={opt.id}
            onClick={() => setAspect(opt.id)}
            style={{
              padding: "8px 18px",
              borderRadius: 8,
              border: "none",
              background: aspect === opt.id ? "rgba(255,255,255,0.2)" : "transparent",
              color: aspect === opt.id ? "white" : "rgba(255,255,255,0.5)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Editable headline */}
      <div style={{ marginBottom: 16, width: "100%", maxWidth: 340 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>
          Caption
        </label>
        <input
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          maxLength={40}
          style={{
            width: "100%",
            padding: "8px 12px",
            background: "rgba(255,255,255,0.1)",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 8,
            color: "white",
            fontSize: 15,
            fontFamily: fonts.headline,
            fontStyle: "italic",
            outline: "none",
          }}
        />
      </div>

      {/* Scaled preview */}
      <div style={{
        width: previewWidth,
        height: previewHeight,
        overflow: "hidden",
        borderRadius: 12,
        boxShadow: "0 12px 48px rgba(0,0,0,0.4)",
        marginBottom: 24,
      }}>
        <div style={{
          width: 1080,
          height: aspect === "story" ? 1920 : 1080,
          transform: `scale(${previewScale})`,
          transformOrigin: "top left",
        }}>
          <ShareCardRender
            entry={entry}
            team={team}
            season={season}
            aspect={aspect}
            headline={headline}
            preview
          />
        </div>
      </div>

      {/* Share button */}
      <button
        onClick={handleExport}
        disabled={exporting}
        className="btn btn-primary"
        style={{
          padding: "14px 40px",
          fontSize: 16,
          opacity: exporting ? 0.6 : 1,
          minWidth: 160,
          background: sharePrimary,
        }}
      >
        {exporting ? "Exporting..." : navigator.canShare ? "Share" : "Download PNG"}
      </button>

      {/* Long-press save fallback for iOS */}
      {savedUrl && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.95)",
          zIndex: 210,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
        }}>
          <p style={{
            color: "rgba(255,255,255,0.7)",
            fontSize: 15,
            textAlign: "center",
            marginBottom: 16,
            maxWidth: 280,
          }}>
            Long-press the image below and tap <strong style={{ color: "white" }}>Save Image</strong>
          </p>
          <img
            src={savedUrl}
            alt="Share card"
            style={{
              maxWidth: "90%",
              maxHeight: "70vh",
              borderRadius: 8,
            }}
          />
          <button
            onClick={() => { URL.revokeObjectURL(savedUrl); setSavedUrl(null); }}
            style={{
              marginTop: 20,
              background: "rgba(255,255,255,0.15)",
              border: "none",
              borderRadius: 10,
              padding: "12px 32px",
              color: "white",
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Done
          </button>
        </div>
      )}

      {/* Hidden full-size card for capture */}
      <ShareCardRender
        ref={cardRef}
        entry={entry}
        team={team}
        season={season}
        aspect={aspect}
        headline={headline}
      />
    </div>
  );
}

// --- LANDING PAGE ---
function LandingPage({ onDemo, onStart }) {
  const sectionLabel = {
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: 500,
    color: theme.textLight,
    letterSpacing: 4,
    textTransform: "uppercase",
    marginBottom: 16,
  };

  const sectionCopy = {
    fontFamily: fonts.body,
    fontSize: 16,
    color: theme.textMuted,
    lineHeight: 1.6,
    maxWidth: 420,
    marginBottom: 0,
  };

  const phoneMockup = {
    width: 260,
    background: "#111",
    borderRadius: 28,
    padding: "8px",
    boxShadow: "0 24px 48px rgba(0,0,0,0.15), 0 4px 12px rgba(0,0,0,0.08)",
    flexShrink: 0,
  };

  return (
    <div style={{ background: theme.bg, minHeight: "100vh" }}>
      {/* ====== HERO ====== */}
      <div style={{
        background: `linear-gradient(160deg, ${theme.primary} 0%, #2D6A4F 50%, #40916C 100%)`,
        padding: "80px 24px 72px",
        textAlign: "center",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Center circle decoration */}
        <svg
          viewBox="0 0 400 400"
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 360,
            height: 360,
            opacity: 0.06,
          }}
        >
          <circle cx="200" cy="200" r="180" fill="none" stroke="white" strokeWidth="2" />
          <circle cx="200" cy="200" r="6" fill="white" />
        </svg>

        <p style={{
          fontFamily: fonts.mono,
          fontSize: 10,
          fontWeight: 500,
          color: "rgba(255,255,255,0.35)",
          letterSpacing: 4,
          textTransform: "uppercase",
          marginBottom: 20,
          position: "relative",
        }}>
          For parents who pay attention
        </p>

        <h1 style={{
          fontFamily: fonts.display,
          fontSize: 48,
          fontWeight: 700,
          color: "white",
          lineHeight: 1.05,
          marginBottom: 16,
          position: "relative",
          maxWidth: 560,
          margin: "0 auto 16px",
        }}>
          They leave it all on the field. You remember it forever.
        </h1>

        <p style={{
          fontFamily: fonts.headline,
          fontStyle: "italic",
          fontSize: 20,
          color: "rgba(255,255,255,0.55)",
          marginBottom: 44,
          position: "relative",
        }}>
          Log moments. Share success. Remember forever.
        </p>

        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", position: "relative" }}>
          <button onClick={onStart} className="btn" style={{
            background: theme.accent,
            color: "white",
            padding: "14px 28px",
            fontSize: 15,
          }}>
            Start Your Season - Free
          </button>
          <button onClick={onDemo} className="btn" style={{
            background: "rgba(255,255,255,0.1)",
            color: "white",
            padding: "14px 28px",
            fontSize: 15,
            border: "1px solid rgba(255,255,255,0.18)",
            backdropFilter: "blur(8px)",
          }}>
            Try the Demo
          </button>
        </div>
      </div>

      {/* ====== WHAT IT IS ====== */}
      <div style={{
        maxWidth: 600,
        margin: "0 auto",
        padding: "56px 24px 16px",
        textAlign: "center",
      }}>
        <p style={{
          fontFamily: fonts.headline,
          fontStyle: "italic",
          fontSize: 22,
          color: theme.text,
          lineHeight: 1.5,
        }}>
          Team Season is a digital journal for your kid's sports season. Log the games, the practices, the moments that matter. Share highlights on social. Then turn the whole thing into a printed book.
        </p>
      </div>

      {/* ====== WHO IT'S FOR ====== */}
      <div style={{
        maxWidth: 640,
        margin: "0 auto",
        padding: "24px 24px 56px",
        textAlign: "center",
      }}>
        <p style={{
          fontFamily: fonts.body,
          fontSize: 15,
          color: theme.textMuted,
          lineHeight: 1.6,
        }}>
          Built for the parent in the folding chair, the one who remembers the assist nobody else saw, the coach who wants to give each kid something real at the end of the year.
        </p>
      </div>

      {/* ====== LOG SECTION ====== */}
      <div style={{
        maxWidth: 700,
        margin: "0 auto",
        padding: "32px 24px 64px",
      }}>
        <div style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 48,
          flexWrap: "wrap",
          justifyContent: "center",
        }}>
          {/* Copy */}
          <div style={{ flex: "1 1 260px", minWidth: 240, paddingTop: 24 }}>
            <p style={sectionLabel}>Log</p>
            <h2 style={{
              fontFamily: fonts.display,
              fontSize: 28,
              fontWeight: 600,
              color: theme.text,
              lineHeight: 1.15,
              marginBottom: 16,
            }}>
              Write the line while it's fresh
            </h2>
            <p style={sectionCopy}>
              After every game, practice, or moment worth remembering. Add the score, a photo, what you noticed. It takes 30 seconds and you'll be glad you did.
            </p>
            <div style={{
              marginTop: 20,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}>
              {["Games, practices, and free moments", "Scores, stats, and photos", "Your words - the stuff you'd forget"].map((item) => (
                <div key={item} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    width: 4,
                    height: 4,
                    borderRadius: "50%",
                    background: theme.primary,
                    flexShrink: 0,
                  }} />
                  <span style={{
                    fontFamily: fonts.body,
                    fontSize: 14,
                    color: theme.textMuted,
                  }}>{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Phone mockup */}
          <div style={phoneMockup}>
            {/* Notch bar */}
            <div style={{
              height: 28,
              background: "#111",
              borderRadius: "20px 20px 0 0",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}>
              <div style={{
                width: 80,
                height: 6,
                background: "#333",
                borderRadius: 3,
              }} />
            </div>
            {/* Screen */}
            <div style={{
              background: theme.bg,
              borderRadius: "0 0 20px 20px",
              padding: "16px 14px 20px",
              minHeight: 260,
            }}>
              {/* Game entry card */}
              <div style={{
                background: "white",
                borderRadius: 10,
                borderLeft: `3px solid ${theme.win}`,
                marginBottom: 10,
                overflow: "hidden",
              }}>
                {/* Photo */}
                <img src="/images/phone-photo.jpg" alt="" style={{
                  width: "100%",
                  height: 80,
                  objectFit: "cover",
                  objectPosition: "center 30%",
                  display: "block",
                }} />
                <div style={{ padding: "10px 14px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <span style={{
                      fontFamily: fonts.mono,
                      fontSize: 8,
                      fontWeight: 600,
                      color: theme.win,
                      background: `${theme.win}12`,
                      padding: "2px 6px",
                      borderRadius: 3,
                      letterSpacing: 1,
                      textTransform: "uppercase",
                    }}>Game</span>
                    <span style={{ fontSize: 8, color: theme.textLight }}>Feb 8</span>
                  </div>
                  <p style={{
                    fontFamily: fonts.body,
                    fontSize: 11,
                    fontWeight: 600,
                    color: theme.text,
                    marginBottom: 4,
                  }}>
                    vs Lightning FC
                  </p>
                  <p style={{
                    fontFamily: fonts.mono,
                    fontSize: 13,
                    fontWeight: 700,
                    color: theme.win,
                    marginBottom: 6,
                  }}>
                    3 - 1 W
                  </p>
                  <p style={{
                    fontFamily: fonts.display,
                    fontStyle: "italic",
                    fontSize: 10,
                    color: theme.textMuted,
                    lineHeight: 1.4,
                  }}>
                    "He read that through ball perfectly and didn't even hesitate."
                  </p>
                </div>
              </div>

              {/* Practice entry card */}
              <div style={{
                background: "white",
                borderRadius: 10,
                borderLeft: `3px solid ${theme.practice}`,
                padding: "12px 14px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <span style={{
                    fontFamily: fonts.mono,
                    fontSize: 8,
                    fontWeight: 600,
                    color: theme.practice,
                    background: `${theme.practice}12`,
                    padding: "2px 6px",
                    borderRadius: 3,
                    letterSpacing: 1,
                    textTransform: "uppercase",
                  }}>Practice</span>
                  <span style={{ fontSize: 8, color: theme.textLight }}>Feb 6</span>
                </div>
                <p style={{
                  fontFamily: fonts.display,
                  fontStyle: "italic",
                  fontSize: 10,
                  color: theme.textMuted,
                  lineHeight: 1.4,
                }}>
                  "Finally nailed the outside-foot pass. Coach noticed."
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ====== SHARE SECTION ====== */}
      <div style={{
        maxWidth: 700,
        margin: "0 auto",
        padding: "32px 24px 64px",
      }}>
        <div style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 48,
          flexWrap: "wrap-reverse",
          justifyContent: "center",
        }}>
          {/* Share card mockup */}
          <div style={{
            width: 280,
            height: 280,
            background: `linear-gradient(160deg, rgba(27,67,50,0.7) 0%, rgba(45,106,79,0.6) 60%, rgba(64,145,108,0.55) 100%), url('/images/share-bg.jpg') center/cover`,
            borderRadius: 12,
            padding: "24px 22px 20px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            boxShadow: "0 24px 48px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.06)",
            flexShrink: 0,
            position: "relative",
            overflow: "hidden",
          }}>
            {/* Team strip */}
            <div style={{
              fontSize: 9,
              fontWeight: 600,
              color: "rgba(255,255,255,0.5)",
              letterSpacing: 2,
              textTransform: "uppercase",
              marginBottom: 8,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}>
              <span style={{ fontSize: 11 }}>{"\u26BD"}</span>
              <span>Montana FC</span>
            </div>

            {/* Headline */}
            <p style={{
              fontFamily: fonts.headline,
              fontStyle: "italic",
              fontSize: 28,
              color: "white",
              lineHeight: 1.0,
              marginBottom: 10,
            }}>
              Two assists and the go-ahead goal
            </p>

            {/* Accent bar */}
            <div style={{
              width: 32,
              height: 3,
              background: theme.accent,
              borderRadius: 2,
              marginBottom: 10,
            }} />

            {/* Quote */}
            <p style={{
              fontFamily: fonts.display,
              fontStyle: "italic",
              fontSize: 10,
              color: "rgba(255,255,255,0.7)",
              lineHeight: 1.4,
              marginBottom: 12,
            }}>
              "He read that through ball perfectly and didn't even hesitate."
            </p>

            {/* Score badge */}
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "rgba(255,255,255,0.08)",
              borderRadius: 8,
              padding: "8px 12px",
              marginBottom: 14,
              border: "1px solid rgba(255,255,255,0.08)",
            }}>
              <span style={{
                fontFamily: fonts.mono,
                fontSize: 18,
                fontWeight: 700,
                color: "white",
                letterSpacing: 1,
              }}>
                3 - 1
              </span>
              <span style={{
                fontSize: 9,
                color: "rgba(255,255,255,0.5)",
              }}>
                vs Lightning FC
              </span>
            </div>

            {/* Watermark */}
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              paddingTop: 8,
              borderTop: "1px solid rgba(255,255,255,0.08)",
            }}>
              <span style={{
                fontFamily: fonts.body,
                fontSize: 7,
                fontWeight: 700,
                color: "rgba(255,255,255,0.2)",
                letterSpacing: 3,
                textTransform: "uppercase",
              }}>
                Team Season
              </span>
              <span style={{
                fontFamily: fonts.body,
                fontSize: 7,
                color: "rgba(255,255,255,0.15)",
              }}>
                teamseason.app
              </span>
            </div>
          </div>

          {/* Copy */}
          <div style={{ flex: "1 1 260px", minWidth: 240, paddingTop: 24 }}>
            <p style={sectionLabel}>Share</p>
            <h2 style={{
              fontFamily: fonts.display,
              fontSize: 28,
              fontWeight: 600,
              color: theme.text,
              lineHeight: 1.15,
              marginBottom: 16,
            }}>
              Turn a moment into a post
            </h2>
            <p style={sectionCopy}>
              Any entry becomes a share card - sized for Instagram Stories or your feed. Your words, their photo, your team's colors. One tap.
            </p>
            <div style={{
              marginTop: 20,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}>
              {["Instagram Stories and feed sizes", "Auto-styled with your team colors", "Edit the caption before you share"].map((item) => (
                <div key={item} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    width: 4,
                    height: 4,
                    borderRadius: "50%",
                    background: theme.primary,
                    flexShrink: 0,
                  }} />
                  <span style={{
                    fontFamily: fonts.body,
                    fontSize: 14,
                    color: theme.textMuted,
                  }}>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ====== REMEMBER / PRINT SECTION ====== */}
      <div style={{
        maxWidth: 700,
        margin: "0 auto",
        padding: "32px 24px 64px",
      }}>
        <div style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 48,
          flexWrap: "wrap",
          justifyContent: "center",
        }}>
          {/* Copy */}
          <div style={{ flex: "1 1 260px", minWidth: 240, paddingTop: 24 }}>
            <p style={sectionLabel}>Remember</p>
            <h2 style={{
              fontFamily: fonts.display,
              fontSize: 28,
              fontWeight: 600,
              color: theme.text,
              lineHeight: 1.15,
              marginBottom: 16,
            }}>
              A real book for the shelf
            </h2>
            <p style={sectionCopy}>
              At the end of the season, turn the whole journal into a 7x7" printed softcover. Every entry, every score, every photo - bound and in their hands. The kind of thing they keep.
            </p>
            <p style={{
              fontFamily: fonts.body,
              fontSize: 14,
              color: theme.text,
              fontWeight: 600,
              marginTop: 16,
            }}>
              $34.99 per book
            </p>
            <p style={{
              fontFamily: fonts.body,
              fontSize: 13,
              color: theme.textMuted,
              marginTop: 4,
            }}>
              Designed automatically from your journal. You just order it.
            </p>
          </div>

          {/* Book photo */}
          <img src="/images/book-mockup.jpg" alt="Printed season book" style={{
            width: 260,
            borderRadius: 6,
            boxShadow: "0 16px 40px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.06)",
            flexShrink: 0,
          }} />
        </div>
      </div>

      {/* ====== HOW IT WORKS ====== */}
      <div style={{
        borderTop: `1px solid ${theme.border}`,
        borderBottom: `1px solid ${theme.border}`,
        padding: "56px 24px",
      }}>
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
          <p style={{
            ...sectionLabel,
            textAlign: "center",
            marginBottom: 40,
          }}>How it works</p>
          <div style={{
            display: "flex",
            gap: 32,
            flexWrap: "wrap",
            justifyContent: "center",
          }}>
            {[
              { num: "1", title: "Create your team", desc: "Add your team name, pick your colors. Takes 30 seconds." },
              { num: "2", title: "Log the season", desc: "After games and practices, write a quick entry. Add scores, photos, your own words." },
              { num: "3", title: "Share or print", desc: "Turn entries into social cards, or order a printed book at the end of the year." },
            ].map((step) => (
              <div key={step.num} style={{
                flex: "1 1 180px",
                minWidth: 160,
                maxWidth: 220,
              }}>
                <div style={{
                  fontFamily: fonts.mono,
                  fontSize: 11,
                  fontWeight: 600,
                  color: theme.primary,
                  marginBottom: 10,
                }}>{step.num}</div>
                <h3 style={{
                  fontFamily: fonts.body,
                  fontSize: 16,
                  fontWeight: 600,
                  color: theme.text,
                  marginBottom: 8,
                }}>{step.title}</h3>
                <p style={{
                  fontFamily: fonts.body,
                  fontSize: 14,
                  color: theme.textMuted,
                  lineHeight: 1.5,
                }}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ====== PRICING ====== */}
      <div style={{
        maxWidth: 700,
        margin: "0 auto",
        padding: "56px 24px",
        textAlign: "center",
      }}>
        <p style={{ ...sectionLabel, marginBottom: 12 }}>Pricing</p>
        <h2 style={{
          fontFamily: fonts.display,
          fontSize: 28,
          fontWeight: 600,
          color: theme.text,
          marginBottom: 8,
        }}>
          Free to use. Pay when you print.
        </h2>
        <p style={{
          fontFamily: fonts.body,
          fontSize: 15,
          color: theme.textMuted,
          lineHeight: 1.6,
          maxWidth: 460,
          margin: "0 auto 32px",
        }}>
          Logging, sharing, and building your journal costs nothing. When you're ready to turn it into a book, it's $34.99 per copy - shipped to your door.
        </p>
        <div style={{
          display: "flex",
          gap: 16,
          justifyContent: "center",
          flexWrap: "wrap",
          maxWidth: 520,
          margin: "0 auto",
        }}>
          {/* Free tier */}
          <div style={{
            flex: "1 1 220px",
            maxWidth: 250,
            background: "white",
            border: `1px solid ${theme.border}`,
            borderRadius: 10,
            padding: "24px 20px",
            textAlign: "left",
          }}>
            <p style={{
              fontFamily: fonts.mono,
              fontSize: 10,
              fontWeight: 600,
              color: theme.textLight,
              letterSpacing: 2,
              textTransform: "uppercase",
              marginBottom: 8,
            }}>Journal</p>
            <p style={{
              fontFamily: fonts.display,
              fontSize: 32,
              fontWeight: 600,
              color: theme.text,
              marginBottom: 16,
            }}>Free</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {["Unlimited entries", "Photos and scores", "Share cards", "Team colors and branding", "Export and backup"].map((f) => (
                <span key={f} style={{
                  fontFamily: fonts.body,
                  fontSize: 13,
                  color: theme.textMuted,
                }}>{f}</span>
              ))}
            </div>
          </div>
          {/* Book tier */}
          <div style={{
            flex: "1 1 220px",
            maxWidth: 250,
            background: "white",
            border: `1px solid ${theme.primary}`,
            borderRadius: 10,
            padding: "24px 20px",
            textAlign: "left",
          }}>
            <p style={{
              fontFamily: fonts.mono,
              fontSize: 10,
              fontWeight: 600,
              color: theme.primary,
              letterSpacing: 2,
              textTransform: "uppercase",
              marginBottom: 8,
            }}>Printed Book</p>
            <p style={{
              fontFamily: fonts.display,
              fontSize: 32,
              fontWeight: 600,
              color: theme.text,
              marginBottom: 16,
            }}>$34.99</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {["7x7\" softcover", "Auto-designed from your journal", "Every entry, photo, and score", "Shipped to your door", "Order anytime"].map((f) => (
                <span key={f} style={{
                  fontFamily: fonts.body,
                  fontSize: 13,
                  color: theme.textMuted,
                }}>{f}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ====== PARENT QUOTE ====== */}
      <div style={{
        maxWidth: 540,
        margin: "0 auto",
        padding: "32px 24px 56px",
        textAlign: "center",
      }}>
        <div style={{
          width: 32,
          height: 3,
          background: theme.accent,
          borderRadius: 2,
          margin: "0 auto 24px",
        }} />
        <p style={{
          fontFamily: fonts.headline,
          fontStyle: "italic",
          fontSize: 20,
          color: theme.text,
          lineHeight: 1.5,
          marginBottom: 16,
        }}>
          "I started writing things down after games because I kept forgetting the details. By the end of the season I had this whole story I didn't know I was writing."
        </p>
        <p style={{
          fontFamily: fonts.body,
          fontSize: 13,
          color: theme.textMuted,
        }}>
          - Soccer parent, U12
        </p>
      </div>

      {/* ====== BOTTOM CTA ====== */}
      <div style={{
        background: `linear-gradient(160deg, ${theme.primary} 0%, #2D6A4F 50%, #40916C 100%)`,
        padding: "56px 24px",
        textAlign: "center",
        position: "relative",
        overflow: "hidden",
      }}>
        <svg
          viewBox="0 0 400 400"
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 300,
            height: 300,
            opacity: 0.04,
          }}
        >
          <circle cx="200" cy="200" r="180" fill="none" stroke="white" strokeWidth="2" />
          <circle cx="200" cy="200" r="6" fill="white" />
        </svg>
        <h2 style={{
          fontFamily: fonts.display,
          fontSize: 28,
          fontWeight: 600,
          color: "white",
          marginBottom: 12,
          position: "relative",
        }}>
          The season's already happening.
        </h2>
        <p style={{
          fontFamily: fonts.headline,
          fontStyle: "italic",
          fontSize: 18,
          color: "rgba(255,255,255,0.6)",
          marginBottom: 32,
          position: "relative",
        }}>
          Start writing it down.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", position: "relative" }}>
          <button onClick={onStart} className="btn" style={{
            background: theme.accent,
            color: "white",
            padding: "14px 28px",
            fontSize: 15,
          }}>
            Start Your Season - Free
          </button>
          <button onClick={onDemo} className="btn" style={{
            background: "rgba(255,255,255,0.1)",
            color: "white",
            padding: "14px 28px",
            fontSize: 15,
            border: "1px solid rgba(255,255,255,0.18)",
            backdropFilter: "blur(8px)",
          }}>
            Try the Demo
          </button>
        </div>
      </div>

      {/* ====== FOOTER ====== */}
      <div style={{
        padding: "24px",
        textAlign: "center",
        borderTop: `1px solid ${theme.border}`,
      }}>
        <p style={{
          fontFamily: fonts.mono,
          fontSize: 11,
          color: theme.textLight,
          letterSpacing: 1,
        }}>
          teamseason.app
        </p>
      </div>
    </div>
  );
}

// --- ORG SETUP SCREEN ---
function OrgSetupScreen({ onComplete }) {
  const [orgName, setOrgName] = useState("");
  const [orgType, setOrgType] = useState("club");
  const [brandColor, setBrandColor] = useState("#1B4332");
  const [customHex, setCustomHex] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [logo, setLogo] = useState(null);
  const logoRef = useRef(null);

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const data = await resizeImage(file, 200);
    setLogo(data);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const name = orgName.trim() || "My Organization";
    onComplete({
      org: {
        id: generateId(),
        name,
        slug: slugify(name),
        orgType,
        color: brandColor,
        logo,
      },
    });
  };

  return (
    <div style={{ minHeight: "100vh", padding: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <form onSubmit={handleSubmit} className="slide-up" style={{ maxWidth: 400, width: "100%" }}>
        <h1 style={{ fontFamily: fonts.display, fontSize: 28, fontWeight: 700, color: theme.primary, marginBottom: 6 }}>
          Set up your organization
        </h1>
        <p style={{ fontSize: 14, color: theme.textMuted, marginBottom: 28 }}>
          Your club or school's hub for managing teams and content
        </p>

        {/* Logo */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 20 }}>
          <input ref={logoRef} type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: "none" }} />
          <button type="button" onClick={() => logoRef.current?.click()}
            style={{
              width: 80, height: 80, borderRadius: "50%",
              border: `2px dashed ${theme.border}`, background: theme.borderLight,
              cursor: "pointer", overflow: "hidden",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
            {logo ? (
              <img src={logo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <span style={{ fontSize: 12, color: theme.textLight, textAlign: "center", lineHeight: 1.3 }}>Org<br/>Logo</span>
            )}
          </button>
          {logo && (
            <button type="button" onClick={() => setLogo(null)}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: theme.textMuted, marginTop: 6 }}>
              Remove
            </button>
          )}
        </div>

        {/* Org name */}
        <div style={{ marginBottom: 20 }}>
          <label className="label">Organization Name</label>
          <input className="input" value={orgName} onChange={(e) => setOrgName(e.target.value)}
            placeholder="Montaña FC, Lincoln High School, etc." />
        </div>

        {/* Type */}
        <div style={{ marginBottom: 20 }}>
          <label className="label">Type</label>
          <div style={{ display: "flex", gap: 8 }}>
            {[
              { value: "club", label: "Club" },
              { value: "school", label: "High School" },
              { value: "other", label: "Other" },
            ].map((t) => (
              <button key={t.value} type="button" onClick={() => setOrgType(t.value)}
                style={{
                  flex: 1, padding: "10px 8px", borderRadius: 8, cursor: "pointer",
                  border: `2px solid ${orgType === t.value ? theme.primary : theme.border}`,
                  background: orgType === t.value ? `${theme.primary}08` : "white",
                  fontWeight: orgType === t.value ? 600 : 400,
                  fontSize: 14, color: theme.text,
                }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Brand color */}
        <div style={{ marginBottom: 28 }}>
          <label className="label">Brand Color</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {COLOR_PRESETS.map((c) => (
              <button key={c.hex} type="button" onClick={() => { setBrandColor(c.hex); setShowCustom(false); }}
                title={c.label}
                style={{
                  width: 36, height: 36, borderRadius: "50%", border: brandColor === c.hex && !showCustom ? "3px solid #333" : "2px solid #ddd",
                  background: c.hex, cursor: "pointer", padding: 0,
                }} />
            ))}
            <button type="button" onClick={() => setShowCustom(!showCustom)}
              style={{
                width: 36, height: 36, borderRadius: "50%",
                border: showCustom ? "3px solid #333" : "2px solid #ddd",
                background: "conic-gradient(red,yellow,lime,cyan,blue,magenta,red)",
                cursor: "pointer", padding: 0,
              }} />
          </div>
          {showCustom && (
            <input className="input" value={customHex} onChange={(e) => { setCustomHex(e.target.value); if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) setBrandColor(e.target.value); }}
              placeholder="#1B4332" maxLength={7}
              style={{ marginTop: 8, width: 120, fontFamily: fonts.mono, fontSize: 14 }} />
          )}
        </div>

        <button className="btn btn-primary" type="submit"
          style={{ width: "100%", padding: "14px 24px", fontSize: 16, background: brandColor }}>
          Create Organization
        </button>
      </form>
    </div>
  );
}


// --- ADMIN DASHBOARD ---
function AdminDashboard({ org, teams, onAddTeam, onAddPlayer, onSignOut, accentColor }) {
  const [activeTab, setActiveTab] = useState("roster");
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamAge, setNewTeamAge] = useState("");
  const [addPlayerTeamId, setAddPlayerTeamId] = useState(null);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [newPlayerNumber, setNewPlayerNumber] = useState("");
  const [expandedTeam, setExpandedTeam] = useState(null);
  const [copiedToken, setCopiedToken] = useState(null);

  // CSV upload state
  const [uploadTeamId, setUploadTeamId] = useState(null);
  const [uploadPreview, setUploadPreview] = useState([]);
  const csvRef = useRef(null);

  // Feed state
  const [feedEntries, setFeedEntries] = useState([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedFilter, setFeedFilter] = useState("pending");
  const [actioningId, setActioningId] = useState(null);

  const accent = accentColor || theme.primary;

  const fetchFeed = useCallback(async (filter) => {
    if (DEMO || !org?.id) return;
    setFeedLoading(true);
    try {
      const { data } = await supabase.rpc("get_org_feed", {
        p_org_id: org.id,
        p_status: filter || feedFilter,
      });
      if (Array.isArray(data)) {
        setFeedEntries(data);
      }
    } catch (e) {
      console.warn("Feed load failed:", e);
    }
    setFeedLoading(false);
  }, [org?.id, feedFilter]);

  useEffect(() => {
    if (activeTab === "feed") fetchFeed(feedFilter);
  }, [activeTab, feedFilter, fetchFeed]);

  const handleApprove = async (entryId, approved) => {
    setActioningId(entryId);
    try {
      await supabase.rpc("approve_entry", { p_entry_id: entryId, p_approved: approved });
      setFeedEntries((prev) => prev.filter((e) => e.id !== entryId));
    } catch (e) {
      console.warn("Approve failed:", e);
    }
    setActioningId(null);
  };

  const handleAddTeam = () => {
    if (!newTeamName.trim()) return;
    onAddTeam({ name: newTeamName.trim(), ageGroup: newTeamAge.trim() || null });
    setNewTeamName("");
    setNewTeamAge("");
    setShowAddTeam(false);
  };

  const handleAddPlayer = () => {
    if (!newPlayerName.trim() || !addPlayerTeamId) return;
    onAddPlayer(addPlayerTeamId, {
      name: newPlayerName.trim(),
      number: newPlayerNumber ? parseInt(newPlayerNumber) : null,
    });
    setNewPlayerName("");
    setNewPlayerNumber("");
    setAddPlayerTeamId(null);
  };

  const copyJoinLink = (token) => {
    const link = `${window.location.origin}?join=${token}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
    });
  };

  const handleCsvUpload = (e, teamId) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length === 0) return;

      // Detect separator (tab from Excel paste, or comma)
      const sep = lines[0].includes("\t") ? "\t" : ",";
      const rows = lines.map((l) => l.split(sep).map((c) => c.trim().replace(/^["']|["']$/g, "")));

      // Detect header row
      const first = rows[0].map((c) => c.toLowerCase());
      const hasHeader = first.some((c) => ["name", "player", "first", "last"].includes(c));
      const dataRows = hasHeader ? rows.slice(1) : rows;

      // Find name and number columns
      let nameCol = 0;
      let numCol = -1;
      if (hasHeader) {
        nameCol = first.findIndex((c) => ["name", "player", "full name", "player name"].includes(c));
        if (nameCol === -1) nameCol = 0;
        numCol = first.findIndex((c) => ["number", "#", "jersey", "no", "num", "jersey number"].includes(c));
      } else {
        // If second column looks like numbers, use it
        if (rows.length > 1 && dataRows.some((r) => r[1] && /^\d{1,3}$/.test(r[1]))) {
          numCol = 1;
        }
      }

      const players = dataRows
        .filter((r) => r[nameCol] && r[nameCol].trim())
        .map((r) => ({
          name: r[nameCol].trim(),
          number: numCol >= 0 && r[numCol] && /^\d{1,3}$/.test(r[numCol].trim()) ? parseInt(r[numCol].trim()) : null,
        }));

      if (players.length > 0) {
        setUploadTeamId(teamId);
        setUploadPreview(players);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleImportPlayers = () => {
    if (!uploadTeamId || uploadPreview.length === 0) return;
    for (const p of uploadPreview) {
      onAddPlayer(uploadTeamId, { name: p.name, number: p.number });
    }
    setUploadTeamId(null);
    setUploadPreview([]);
  };

  const typeColors = {
    game: theme.win,
    practice: theme.practice,
    tournament: theme.tournament,
    moment: theme.moment,
  };

  const resultLabels = { win: "W", loss: "L", draw: "D" };

  return (
    <div style={{ minHeight: "100vh", background: theme.bg }}>
      {/* Header */}
      <div style={{
        background: accent, padding: "16px 20px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {org.logo && (
            <img src={org.logo} alt="" style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }} />
          )}
          <div>
            <div style={{ fontFamily: fonts.display, fontSize: 20, fontWeight: 700, color: "white" }}>{org.name}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: 1 }}>
              {org.orgType === "school" ? "High School" : org.orgType === "club" ? "Club" : "Organization"}
            </div>
          </div>
        </div>
        <button onClick={onSignOut} style={{
          background: "rgba(255,255,255,0.2)", border: "none", borderRadius: 8,
          padding: "6px 12px", color: "white", fontSize: 13, cursor: "pointer",
        }}>Sign Out</button>
      </div>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: 20 }}>
        {/* Stats bar */}
        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          <div className="card" style={{ flex: 1, textAlign: "center", padding: 14 }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: accent }}>{teams.length}</div>
            <div style={{ fontSize: 12, color: theme.textMuted }}>Teams</div>
          </div>
          <div className="card" style={{ flex: 1, textAlign: "center", padding: 14 }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: accent }}>
              {teams.reduce((sum, t) => sum + (t.players?.length || 0), 0)}
            </div>
            <div style={{ fontSize: 12, color: theme.textMuted }}>Players</div>
          </div>
          <div className="card" style={{ flex: 1, textAlign: "center", padding: 14 }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: accent }}>
              {teams.reduce((sum, t) => sum + (t.players?.filter(p => p.connected)?.length || 0), 0)}
            </div>
            <div style={{ fontSize: 12, color: theme.textMuted }}>Connected</div>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: `2px solid ${theme.borderLight}` }}>
          {[{ id: "roster", label: "Roster" }, { id: "feed", label: "Feed" }].map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1, padding: "12px 0", background: "none", border: "none",
                borderBottom: activeTab === tab.id ? `2px solid ${accent}` : "2px solid transparent",
                marginBottom: -2, cursor: "pointer",
                fontFamily: fonts.display, fontSize: 15, fontWeight: 600,
                color: activeTab === tab.id ? accent : theme.textMuted,
                transition: "all 0.2s",
              }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ROSTER TAB */}
        {activeTab === "roster" && (
          <>
            <button onClick={() => setShowAddTeam(true)}
              style={{
                width: "100%", padding: "12px 16px", marginBottom: 16,
                background: accent, color: "white", border: "none", borderRadius: 10,
                fontFamily: fonts.display, fontSize: 15, fontWeight: 600, cursor: "pointer",
                letterSpacing: 0.5,
              }}>
              + Add Team
            </button>

            {teams.length === 0 ? (
              <div className="card" style={{ textAlign: "center", padding: 32, color: theme.textMuted }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🏟️</div>
                <div style={{ fontSize: 15, marginBottom: 4 }}>No teams yet</div>
                <div style={{ fontSize: 13 }}>Add your first team to start building rosters</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {teams.map((team) => (
                  <div key={team.id} className="card" style={{ padding: 0, overflow: "hidden" }}>
                    <button onClick={() => setExpandedTeam(expandedTeam === team.id ? null : team.id)}
                      style={{
                        width: "100%", padding: "14px 16px", background: "none", border: "none",
                        cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center",
                        borderLeft: `4px solid ${accent}`,
                      }}>
                      <div style={{ textAlign: "left" }}>
                        <div style={{ fontWeight: 600, fontSize: 15 }}>{team.name}</div>
                        <div style={{ fontSize: 12, color: theme.textMuted }}>
                          {team.ageGroup ? `${team.ageGroup} - ` : ""}{team.players?.length || 0} players
                        </div>
                      </div>
                      <span style={{ fontSize: 18, color: theme.textMuted, transform: expandedTeam === team.id ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}>
                        ›
                      </span>
                    </button>
                    {expandedTeam === team.id && (
                      <div style={{ borderTop: `1px solid ${theme.borderLight}`, padding: "8px 0" }}>
                        {(team.players || []).map((player) => (
                          <div key={player.id} style={{
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                            padding: "10px 16px", borderBottom: `1px solid ${theme.borderLight}`,
                          }}>
                            <div>
                              <span style={{ fontWeight: 500, fontSize: 14 }}>{player.name}</span>
                              {player.number && <span style={{ fontSize: 12, color: theme.textMuted, marginLeft: 6 }}>#{player.number}</span>}
                              {player.connected && <span style={{ fontSize: 11, color: accent, marginLeft: 8, fontWeight: 600 }}>Connected</span>}
                            </div>
                            <button onClick={() => copyJoinLink(player.joinToken)}
                              style={{
                                background: copiedToken === player.joinToken ? "#059669" : `${accent}15`,
                                border: "none", borderRadius: 6, padding: "5px 10px",
                                fontSize: 12, cursor: "pointer",
                                color: copiedToken === player.joinToken ? "white" : accent,
                                fontWeight: 600, transition: "all 0.2s",
                              }}>
                              {copiedToken === player.joinToken ? "Copied" : "Copy Link"}
                            </button>
                          </div>
                        ))}
                        <div style={{ display: "flex", borderTop: `1px solid ${theme.borderLight}` }}>
                          <button onClick={() => setAddPlayerTeamId(team.id)}
                            style={{
                              flex: 1, padding: "10px 16px", background: "none",
                              border: "none", cursor: "pointer", fontSize: 13,
                              color: accent, fontWeight: 600, textAlign: "left",
                            }}>
                            + Add Player
                          </button>
                          <input ref={csvRef} type="file" accept=".csv,.tsv,.txt,.xlsx" onChange={(e) => handleCsvUpload(e, team.id)} style={{ display: "none" }} />
                          <button onClick={() => csvRef.current?.click()}
                            style={{
                              padding: "10px 16px", background: "none",
                              border: "none", borderLeft: `1px solid ${theme.borderLight}`,
                              cursor: "pointer", fontSize: 13,
                              color: theme.textMuted, fontWeight: 600,
                            }}>
                            Upload CSV
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* FEED TAB */}
        {activeTab === "feed" && (
          <>
            {/* Feed filter */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {[
                { id: "pending", label: "Pending" },
                { id: "approved", label: "Approved" },
                { id: "all", label: "All" },
              ].map((f) => (
                <button key={f.id}
                  onClick={() => setFeedFilter(f.id)}
                  style={{
                    padding: "6px 14px", borderRadius: 20, fontSize: 13, fontWeight: 600,
                    border: feedFilter === f.id ? `1.5px solid ${accent}` : `1.5px solid ${theme.border}`,
                    background: feedFilter === f.id ? `${accent}10` : "white",
                    color: feedFilter === f.id ? accent : theme.textMuted,
                    cursor: "pointer", transition: "all 0.15s",
                  }}>
                  {f.label}
                </button>
              ))}
            </div>

            {feedLoading ? (
              <div style={{ textAlign: "center", padding: 40, color: theme.textMuted, fontSize: 14 }}>
                Loading entries...
              </div>
            ) : feedEntries.length === 0 ? (
              <div className="card" style={{ textAlign: "center", padding: 32, color: theme.textMuted }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                <div style={{ fontSize: 15, marginBottom: 4 }}>
                  {feedFilter === "pending" ? "No entries awaiting review" : "No entries yet"}
                </div>
                <div style={{ fontSize: 13 }}>
                  {feedFilter === "pending"
                    ? "When parents share entries, they'll appear here for approval"
                    : "Share join links with parents to start receiving entries"}
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {feedEntries.map((entry) => {
                  const entryColor = typeColors[entry.entry_type] || theme.textMuted;
                  return (
                    <div key={entry.id} className="card" style={{ padding: 0, overflow: "hidden" }}>
                      <div style={{ borderLeft: `4px solid ${entryColor}`, padding: 16 }}>
                        {/* Entry header */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                          <div>
                            <span style={{
                              fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5,
                              color: entryColor,
                            }}>
                              {entry.entry_type}
                            </span>
                            <span style={{ fontSize: 11, color: theme.textLight, marginLeft: 8 }}>
                              {entry.entry_date}
                            </span>
                            {entry.approved === true && (
                              <span style={{ fontSize: 10, color: "#059669", marginLeft: 8, fontWeight: 700 }}>APPROVED</span>
                            )}
                            {entry.approved === false && (
                              <span style={{ fontSize: 10, color: theme.loss, marginLeft: 8, fontWeight: 700 }}>REJECTED</span>
                            )}
                          </div>
                        </div>

                        {/* Player + team info */}
                        <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 6 }}>
                          {entry.player_name && (
                            <span style={{ fontWeight: 600, color: theme.text }}>
                              {entry.player_name}
                              {entry.player_number ? ` #${entry.player_number}` : ""}
                            </span>
                          )}
                          {entry.team_name && (
                            <span> - {entry.team_name}</span>
                          )}
                          {entry.author_name && (
                            <span> (by {entry.author_name})</span>
                          )}
                        </div>

                        {/* Score */}
                        {entry.score_home != null && entry.score_away != null && (
                          <div style={{ marginBottom: 6 }}>
                            {entry.opponent && (
                              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
                                vs {entry.opponent}
                              </div>
                            )}
                            <div style={{ fontFamily: fonts.mono, fontSize: 18, fontWeight: 700, letterSpacing: 2 }}>
                              {entry.score_home} - {entry.score_away}
                              {entry.result && (
                                <span style={{
                                  fontSize: 12, fontWeight: 700, marginLeft: 8,
                                  color: entry.result === "win" ? theme.win : entry.result === "loss" ? theme.loss : theme.draw,
                                }}>
                                  {resultLabels[entry.result]}
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Text */}
                        <div style={{
                          fontSize: 14, lineHeight: 1.5, color: theme.text,
                          fontStyle: "italic", marginBottom: entry.approved === null ? 12 : 0,
                        }}>
                          "{entry.text}"
                        </div>

                        {/* Approve/Reject buttons - only for pending entries */}
                        {entry.approved === null && (
                          <div style={{ display: "flex", gap: 8, marginTop: 12, borderTop: `1px solid ${theme.borderLight}`, paddingTop: 12 }}>
                            <button
                              onClick={() => handleApprove(entry.id, true)}
                              disabled={actioningId === entry.id}
                              style={{
                                flex: 1, padding: "8px 0", borderRadius: 8, border: "none",
                                background: accent, color: "white", fontSize: 13, fontWeight: 600,
                                cursor: "pointer", opacity: actioningId === entry.id ? 0.5 : 1,
                              }}>
                              Approve
                            </button>
                            <button
                              onClick={() => handleApprove(entry.id, false)}
                              disabled={actioningId === entry.id}
                              style={{
                                flex: 1, padding: "8px 0", borderRadius: 8,
                                border: `1.5px solid ${theme.border}`, background: "white",
                                color: theme.textMuted, fontSize: 13, fontWeight: 600,
                                cursor: "pointer", opacity: actioningId === entry.id ? 0.5 : 1,
                              }}>
                              Skip
                            </button>
                          </div>
                        )}

                        {/* Create Graphic button - for approved entries */}
                        {entry.approved === true && (
                          <div style={{ display: "flex", gap: 8, marginTop: 12, borderTop: `1px solid ${theme.borderLight}`, paddingTop: 12 }}>
                            <button
                              onClick={() => {
                                const params = new URLSearchParams();
                                if (entry.team_name) params.set("team", entry.team_name);
                                if (entry.opponent) params.set("opponent", entry.opponent);
                                if (entry.score_home != null && entry.score_away != null) params.set("score", `${entry.score_home}-${entry.score_away}`);
                                if (entry.result) params.set("result", entry.result);
                                if (entry.player_name) params.set("player", entry.player_name);
                                if (entry.text) params.set("quote", entry.text.slice(0, 200));
                                if (org?.color) params.set("color", org.color.replace("#", ""));
                                window.open(`https://giveandgo.youthsoccermarketing.com/?${params.toString()}`, "_blank");
                              }}
                              style={{
                                flex: 1, padding: "8px 0", borderRadius: 8, border: "none",
                                background: accent, color: "white", fontSize: 13, fontWeight: 600,
                                cursor: "pointer",
                              }}>
                              Create Graphic
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Add team modal */}
      {showAddTeam && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20,
        }}>
          <div className="card" style={{ maxWidth: 360, width: "100%", padding: 24 }}>
            <h3 style={{ fontFamily: fonts.display, fontSize: 20, marginBottom: 16 }}>Add Team</h3>
            <div style={{ marginBottom: 12 }}>
              <label className="label">Team Name</label>
              <input className="input" value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)}
                placeholder="U12 Boys, Varsity, etc." autoFocus />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label className="label">Age Group (optional)</label>
              <input className="input" value={newTeamAge} onChange={(e) => setNewTeamAge(e.target.value)}
                placeholder="U12, U14, JV, etc." />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowAddTeam(false)} className="btn" style={{ flex: 1 }}>Cancel</button>
              <button onClick={handleAddTeam} className="btn btn-primary" style={{ flex: 1, background: accent }}>Add</button>
            </div>
          </div>
        </div>
      )}

      {/* Add player modal */}
      {addPlayerTeamId && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20,
        }}>
          <div className="card" style={{ maxWidth: 360, width: "100%", padding: 24 }}>
            <h3 style={{ fontFamily: fonts.display, fontSize: 20, marginBottom: 16 }}>Add Player</h3>
            <div style={{ marginBottom: 12 }}>
              <label className="label">Player Name</label>
              <input className="input" value={newPlayerName} onChange={(e) => setNewPlayerName(e.target.value)}
                placeholder="Full name" autoFocus />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label className="label">Jersey Number (optional)</label>
              <input className="input" type="number" value={newPlayerNumber} onChange={(e) => setNewPlayerNumber(e.target.value)}
                placeholder="#" />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setAddPlayerTeamId(null)} className="btn" style={{ flex: 1 }}>Cancel</button>
              <button onClick={handleAddPlayer} className="btn btn-primary" style={{ flex: 1, background: accent }}>Add</button>
            </div>
          </div>
        </div>
      )}

      {/* CSV upload preview modal */}
      {uploadTeamId && uploadPreview.length > 0 && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20,
        }}>
          <div className="card" style={{ maxWidth: 400, width: "100%", padding: 24, maxHeight: "80vh", overflow: "auto" }}>
            <h3 style={{ fontFamily: fonts.display, fontSize: 20, marginBottom: 4 }}>Import Roster</h3>
            <p style={{ fontSize: 13, color: theme.textMuted, marginBottom: 16 }}>
              {uploadPreview.length} player{uploadPreview.length !== 1 ? "s" : ""} found
            </p>

            <div style={{ marginBottom: 16 }}>
              {uploadPreview.map((p, i) => (
                <div key={i} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "8px 0", borderBottom: i < uploadPreview.length - 1 ? `1px solid ${theme.borderLight}` : "none",
                }}>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{p.name}</span>
                  {p.number && <span style={{ fontSize: 12, color: theme.textMuted }}>#{p.number}</span>}
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { setUploadTeamId(null); setUploadPreview([]); }} className="btn" style={{ flex: 1 }}>
                Cancel
              </button>
              <button onClick={handleImportPlayers} className="btn btn-primary" style={{ flex: 1, background: accent }}>
                Import All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// --- JOIN SCREEN: Parent invited via join link ---
function JoinScreen({ token, onComplete, onBack }) {
  const [joinInfo, setJoinInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Auth state
  const [isSignUp, setIsSignUp] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { data, error: rpcError } = await supabase.rpc("get_join_info", { p_token: token });
        if (rpcError || data?.error) {
          setError(data?.error || "Could not load invitation");
        } else {
          setJoinInfo(data);
        }
      } catch (e) {
        setError("Could not load invitation");
      }
      setLoading(false);
    })();
  }, [token]);

  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError("");
    try {
      const result = isSignUp
        ? await supabase.auth.signUp(email, password, { role: "parent" })
        : await supabase.auth.signIn(email, password);
      if (result.error) throw new Error(result.error_description || result.msg || "Auth failed");
      onComplete(result.user, joinInfo);
    } catch (err) {
      setAuthError(err.message);
    }
    setAuthLoading(false);
  };

  if (loading) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: theme.bg,
      }}>
        <div style={{ textAlign: "center", color: theme.textMuted, fontFamily: fonts.body }}>
          Loading invitation...
        </div>
      </div>
    );
  }

  if (error || joinInfo?.already_claimed) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", padding: 24,
        background: theme.bg,
      }}>
        <div className="card" style={{ maxWidth: 360, padding: 32, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>
            {joinInfo?.already_claimed ? "✓" : "?"}
          </div>
          <h2 style={{ fontFamily: fonts.display, fontSize: 22, marginBottom: 8 }}>
            {joinInfo?.already_claimed ? "Already Connected" : "Invalid Link"}
          </h2>
          <p style={{ color: theme.textMuted, fontSize: 14, marginBottom: 20, fontFamily: fonts.body }}>
            {joinInfo?.already_claimed
              ? "This invitation has already been claimed by another account."
              : error || "This invitation link is not valid."}
          </p>
          <button className="btn btn-primary" onClick={onBack} style={{ width: "100%" }}>
            Go to Team Season
          </button>
        </div>
      </div>
    );
  }

  const accent = joinInfo.org_color || joinInfo.team_color || theme.primary;
  const orgName = joinInfo.org_name;
  const teamName = joinInfo.team_name;
  const playerName = joinInfo.player_name;
  const playerNumber = joinInfo.player_number;

  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: 24,
      background: gradientFromColor(accent),
    }}>
      {/* Branded header */}
      <div className="slide-up" style={{ textAlign: "center", marginBottom: 32 }}>
        {joinInfo.org_logo && (
          <img src={joinInfo.org_logo} alt="" style={{
            width: 64, height: 64, borderRadius: "50%", objectFit: "cover",
            border: "3px solid rgba(255,255,255,0.3)", marginBottom: 12,
          }} />
        )}
        {orgName && (
          <div style={{
            fontFamily: fonts.body, fontSize: 13, color: "rgba(255,255,255,0.7)",
            textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8, fontWeight: 600,
          }}>
            {orgName}
          </div>
        )}
        <h1 style={{
          fontFamily: fonts.display, fontSize: 32, fontWeight: 700,
          color: "white", lineHeight: 1.2, marginBottom: 6,
        }}>
          Follow {playerName}'s Season
        </h1>
        <p style={{
          fontFamily: fonts.display, fontSize: 16, color: "rgba(255,255,255,0.8)",
          fontStyle: "italic",
        }}>
          {teamName}{playerNumber ? ` - #${playerNumber}` : ""}
        </p>
      </div>

      {/* Auth form */}
      <form onSubmit={handleAuth} className="fade-in" style={{
        background: "white", borderRadius: 18, padding: 28,
        width: "100%", maxWidth: 360,
        boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
      }}>
        <h2 style={{ fontFamily: fonts.display, fontSize: 20, marginBottom: 6, textAlign: "center" }}>
          {isSignUp ? "Create Your Account" : "Welcome Back"}
        </h2>
        <p style={{ textAlign: "center", fontSize: 13, color: theme.textMuted, marginBottom: 20, fontFamily: fonts.body }}>
          {isSignUp
            ? "Sign up to start journaling your child's season"
            : "Sign in to connect to your child's team"}
        </p>

        {authError && (
          <div style={{
            background: "#FEE2E2", color: "#991B1B", padding: "10px 14px",
            borderRadius: 8, fontSize: 13, marginBottom: 16,
          }}>{authError}</div>
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

        <button className="btn btn-primary" type="submit" disabled={authLoading}
          style={{ width: "100%", padding: "14px 24px", fontSize: 16, background: accent }}>
          {authLoading ? "..." : isSignUp ? "Get Started" : "Sign In & Connect"}
        </button>

        <p style={{ textAlign: "center", marginTop: 16, fontSize: 14, color: theme.textMuted }}>
          {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
          <span onClick={() => setIsSignUp(!isSignUp)}
            style={{ color: accent, fontWeight: 600, cursor: "pointer" }}>
            {isSignUp ? "Sign in" : "Sign up"}
          </span>
        </p>
      </form>
    </div>
  );
}


// --- MAIN APP ---
export default function SportsJournalApp() {
  const [authed, setAuthed] = useState(false);
  const [user, setUser] = useState(null);
  const [screen, setScreen] = useState("loading"); // loading, landing, auth, onboarding, setup, home
  const [role, setRole] = useState(null);
  const [isDemo, setIsDemo] = useState(false);

  // Data (parent)
  const [team, setTeam] = useState(null);
  const [season, setSeason] = useState(null);
  const [players, setPlayers] = useState([]);
  const [entries, setEntries] = useState([]);

  // Data (admin)
  const [org, setOrg] = useState(null);
  const [orgTeams, setOrgTeams] = useState([]);

  // Join flow
  const [joinToken, setJoinToken] = useState(null);

  // UI state
  const [showComposer, setShowComposer] = useState(false);
  const [showBook, setShowBook] = useState(false);
  const [showOrder, setShowOrder] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [filter, setFilter] = useState("all");
  const menuRef = useRef(null);
  const joinTokenRef = useRef(null);

  // Share card state
  const [shareEntry, setShareEntry] = useState(null);
  const [showSharePrompt, setShowSharePrompt] = useState(false);

  // Dynamic brand color derived from team or org
  const brandPrimary = team?.color || org?.color || theme.primary;
  const brandPrimaryLight = lightenColor(brandPrimary, 0.08);
  const brandGradient = gradientFromColor(brandPrimary);

  // Init: restore from localStorage, cloud, or show landing
  useEffect(() => {
    // Check for join link FIRST (before localStorage restore)
    // Use ref to survive React StrictMode double-mount (replaceState removes param on first run)
    const urlParams = new URLSearchParams(window.location.search);
    const joinParam = urlParams.get("join") || joinTokenRef.current;
    if (joinParam && !DEMO) {
      joinTokenRef.current = joinParam;
      setJoinToken(joinParam);
      setScreen("join");
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }

    // Migrate legacy localStorage keys
    if (!localStorage.getItem("teamSeason") && localStorage.getItem("theSeason")) {
      localStorage.setItem("teamSeason", localStorage.getItem("theSeason"));
      localStorage.removeItem("theSeason");
    }
    if (!localStorage.getItem("teamSeasonOrder") && localStorage.getItem("theSeasonOrder")) {
      localStorage.setItem("teamSeasonOrder", localStorage.getItem("theSeasonOrder"));
      localStorage.removeItem("theSeasonOrder");
    }

    // Check admin localStorage first
    const adminSaved = localStorage.getItem("teamSeasonAdmin");
    if (adminSaved) {
      try {
        const data = JSON.parse(adminSaved);
        if (data.role === "admin" && data.org) {
          setRole("admin");
          setOrg(data.org);
          setOrgTeams(data.orgTeams || []);
          setScreen("admin");
          if (!DEMO && supabase.auth.restore()) {
            setUser(supabase.auth.user);
            setAuthed(true);
          }
          return;
        }
      } catch (e) { /* continue */ }
    }

    // Check parent localStorage
    const saved = localStorage.getItem("teamSeason");
    if (saved) {
      try {
        const data = JSON.parse(saved);
        setRole(data.role);
        setTeam(data.team);
        setSeason(data.season);
        setPlayers(data.players);
        setEntries(data.entries.map((e) => ({
          ...e,
          photoPreview: e.photoData || null,
        })));
        setScreen("home");
        if (!DEMO && supabase.auth.restore()) {
          setUser(supabase.auth.user);
          setAuthed(true);
        }
        return;
      } catch (e) {
        // Invalid data, continue to auth
      }
    }

    if (DEMO) {
      setScreen("landing");
      return;
    }

    // No localStorage data — try cloud
    if (supabase.auth.restore()) {
      setUser(supabase.auth.user);
      setAuthed(true);
      // Try loading from Supabase
      (async () => {
        try {
          const uid = supabase.auth.user.id;
          const { data: teams } = await supabase.from("teams").select("*").eq("user_id", uid).limit(1);
          if (teams && teams.length > 0) {
            const cloudTeam = teams[0];
            const { data: seasons } = await supabase.from("seasons").select("*").eq("team_id", cloudTeam.id).eq("user_id", uid).limit(1);
            const cloudSeason = seasons?.[0];
            if (cloudSeason) {
              const { data: cloudPlayers } = await supabase.from("players").select("*").eq("team_id", cloudTeam.id);
              const { data: cloudEntries } = await supabase.from("entries").select("*").eq("season_id", cloudSeason.id).order("entry_date", { ascending: false });
              setRole("parent");
              setTeam({ id: cloudTeam.id, name: cloudTeam.name, sport: cloudTeam.sport, emoji: cloudTeam.emoji, color: cloudTeam.color || "#1B4332", logo: null, orgType: "club" });
              setSeason({ id: cloudSeason.id, name: cloudSeason.name, startDate: cloudSeason.start_date, endDate: cloudSeason.end_date });
              setPlayers((cloudPlayers || []).map((p) => ({ id: p.id, name: p.name, number: p.number, position: p.position, is_my_child: p.is_my_child })));
              setEntries((cloudEntries || []).map((e) => ({ ...e, photoPreview: null })));
              setScreen("home");
              return;
            }
          }
        } catch (e) {
          console.warn("Cloud load failed:", e);
        }
        // No cloud data either — go to onboarding
        setScreen("onboarding");
      })();
    } else {
      setScreen("landing");
    }
  }, []);

  // Persist to localStorage (skip demo, skip mid-setup)
  useEffect(() => {
    if (isDemo) return;
    if (screen === "home" && team && season) {
      const data = { role, team, season, players, entries };
      localStorage.setItem("teamSeason", JSON.stringify(data));
    }
    if (screen === "admin" && org) {
      const data = { role: "admin", org, orgTeams };
      localStorage.setItem("teamSeasonAdmin", JSON.stringify(data));
    }
  }, [role, team, season, players, entries, org, orgTeams, screen, isDemo]);

  // Handle Stripe checkout return
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('order') === 'success') {
      const saved = localStorage.getItem("teamSeasonOrder");
      if (saved) {
        try {
          const order = JSON.parse(saved);
          order.status = "ordered";
          localStorage.setItem("teamSeasonOrder", JSON.stringify(order));
        } catch (e) {}
      }
      setShowOrder(true);
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('order') === 'cancelled') {
      const saved = localStorage.getItem("teamSeasonOrder");
      if (saved) {
        try {
          const order = JSON.parse(saved);
          order.status = "idle";
          localStorage.setItem("teamSeasonOrder", JSON.stringify(order));
        } catch (e) {}
      }
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Close overflow menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMenu(false);
      }
    };
    const timer = setTimeout(() => document.addEventListener("click", handleClick), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", handleClick);
    };
  }, [showMenu]);

  const handleAuth = async (authUser) => {
    setUser(authUser);
    setAuthed(true);
    setScreen("loading");

    // Try loading existing data from Supabase before sending to onboarding
    try {
      const uid = authUser.id;

      // Check if user is an org admin
      const { data: memberships } = await supabase.from("org_members").select("org_id,role").eq("user_id", uid);
      const adminMembership = memberships?.find((m) => m.role === "admin");

      if (adminMembership) {
        const { data: orgs } = await supabase.from("organizations").select("*").eq("id", adminMembership.org_id).limit(1);
        if (orgs?.[0]) {
          const cloudOrg = orgs[0];
          const orgObj = { id: cloudOrg.id, name: cloudOrg.name, slug: cloudOrg.slug, orgType: cloudOrg.org_type, color: cloudOrg.color || "#1B4332", logo: cloudOrg.logo_url || null };
          const { data: cloudTeams } = await supabase.from("teams").select("*").eq("org_id", cloudOrg.id);
          const teamsWithPlayers = [];
          for (const ct of (cloudTeams || [])) {
            const { data: cloudPlayers } = await supabase.from("players").select("*").eq("team_id", ct.id);
            const playerIds = (cloudPlayers || []).map((p) => p.id);
            let connMap = {};
            if (playerIds.length > 0) {
              const { data: connections } = await supabase.from("player_connections").select("player_id,join_token,user_id").in_("player_id", playerIds);
              (connections || []).forEach((c) => { connMap[c.player_id] = c; });
            }
            teamsWithPlayers.push({
              id: ct.id, name: ct.name, ageGroup: ct.age_group,
              players: (cloudPlayers || []).map((p) => ({
                id: p.id, name: p.name, number: p.number, position: p.position,
                joinToken: connMap[p.id]?.join_token || null,
                connected: !!connMap[p.id]?.user_id,
              })),
            });
          }
          setRole("admin");
          setOrg(orgObj);
          setOrgTeams(teamsWithPlayers);
          setScreen("admin");
          return;
        }
      }

      // Check if user has a team (parent flow - self-created)
      const { data: teams } = await supabase.from("teams").select("*").eq("user_id", uid).limit(1);
      if (teams?.length > 0) {
        const cloudTeam = teams[0];
        const { data: seasons } = await supabase.from("seasons").select("*").eq("team_id", cloudTeam.id).eq("user_id", uid).limit(1);
        const cloudSeason = seasons?.[0];
        if (cloudSeason) {
          const { data: cloudPlayers } = await supabase.from("players").select("*").eq("team_id", cloudTeam.id);
          const { data: cloudEntries } = await supabase.from("entries").select("*").eq("season_id", cloudSeason.id).order("entry_date", { ascending: false });
          setRole("parent");
          setTeam({ id: cloudTeam.id, name: cloudTeam.name, sport: cloudTeam.sport, emoji: cloudTeam.emoji, color: cloudTeam.color || "#1B4332", logo: null, orgType: "club", orgId: cloudTeam.org_id || null });
          setSeason({ id: cloudSeason.id, name: cloudSeason.name, startDate: cloudSeason.start_date, endDate: cloudSeason.end_date });
          setPlayers((cloudPlayers || []).map((p) => ({ id: p.id, name: p.name, number: p.number, position: p.position, is_my_child: p.is_my_child })));
          setEntries((cloudEntries || []).map((e) => ({ ...e, photoPreview: null })));
          setScreen("home");
          return;
        }
      }

      // Check if user has a season via join flow (team owned by admin, season owned by parent)
      const { data: joinSeasons } = await supabase.from("seasons").select("*, teams(*)").eq("user_id", uid).limit(1);
      if (joinSeasons?.length > 0) {
        const js = joinSeasons[0];
        const jt = js.teams;
        if (jt) {
          const { data: cloudPlayers } = await supabase.from("players").select("*").eq("team_id", jt.id);
          const { data: cloudEntries } = await supabase.from("entries").select("*").eq("season_id", js.id).order("entry_date", { ascending: false });
          setRole("parent");
          setTeam({ id: jt.id, name: jt.name, sport: jt.sport, emoji: jt.emoji, color: jt.color || "#1B4332", logo: null, orgType: "club", orgId: jt.org_id || null });
          setSeason({ id: js.id, name: js.name, startDate: js.start_date, endDate: js.end_date });
          setPlayers((cloudPlayers || []).map((p) => ({ id: p.id, name: p.name, number: p.number, position: p.position, is_my_child: p.is_my_child })));
          setEntries((cloudEntries || []).map((e) => ({ ...e, photoPreview: null })));
          setScreen("home");
          return;
        }
      }
    } catch (e) {
      console.warn("Cloud restore on login failed:", e);
    }

    // No existing data found — new user, go to onboarding
    setScreen("onboarding");
  };

  const handleDemo = () => {
    const data = demoData();
    setRole(data.role);
    setTeam(data.team);
    setSeason(data.season);
    setPlayers(data.players);
    setEntries(data.entries);
    setIsDemo(true);
    setAuthed(true);
    setScreen("home");
  };

  const handleOnboarding = (selectedRole) => {
    setRole(selectedRole);
    setScreen(selectedRole === "admin" ? "org-setup" : "setup");
  };

  // Join flow: parent authenticated from JoinScreen
  const handleJoinAuth = async (authUser, joinInfo) => {
    setUser(authUser);
    setAuthed(true);

    // Claim the connection via RPC
    try {
      const { data } = await supabase.rpc("claim_connection", { p_token: joinToken });
      if (data?.error) {
        console.warn("Claim failed:", data.error);
        // Fall back to regular onboarding
        setJoinToken(null);
        setScreen("onboarding");
        return;
      }

      // Set up parent state from claim response
      const teamData = {
        id: data.team_id,
        name: data.team_name,
        sport: data.team_sport || "Soccer",
        emoji: data.team_emoji || "⚽",
        color: data.team_color || "#1B4332",
        logo: null,
        orgType: "club",
        orgId: data.org_id || null,
        orgName: data.org_name || null,
      };
      const seasonData = {
        id: data.season_id,
        name: data.season_name,
      };
      const playerData = {
        id: data.player_id,
        name: data.player_name,
        number: data.player_number || null,
        is_my_child: true,
      };

      setRole("parent");
      setTeam(teamData);
      setSeason(seasonData);
      setPlayers([playerData]);
      setEntries([]);
      setJoinToken(null);
      setScreen("home");
    } catch (e) {
      console.warn("Join flow error:", e);
      setJoinToken(null);
      setScreen("onboarding");
    }
  };

  const handleSetup = (data) => {
    const teamData = data.team;
    const seasonData = data.season;
    const playersList = data.myPlayer
      ? [{ ...data.myPlayer, id: generateId(), is_my_child: true }]
      : [];

    setTeam(teamData);
    setSeason(seasonData);
    setPlayers(playersList);
    setScreen("home");

    // Sync to cloud (fire and forget)
    if (!DEMO && user) {
      (async () => {
        try {
          await supabase.from("teams").insert({
            id: teamData.id, user_id: user.id,
            name: teamData.name, sport: teamData.sport || "Soccer",
            emoji: teamData.emoji || "⚽", color: teamData.color || "#1B4332",
          });
          await supabase.from("seasons").insert({
            id: seasonData.id, user_id: user.id,
            team_id: teamData.id, name: seasonData.name,
          });
          for (const p of playersList) {
            await supabase.from("players").insert({
              id: p.id, user_id: user.id, team_id: teamData.id,
              name: p.name, is_my_child: p.is_my_child || false,
            });
          }
        } catch (e) {
          console.warn("Cloud sync (setup) failed:", e);
        }
      })();
    }
  };

  // --- Admin handlers ---
  const handleOrgSetup = (data) => {
    const orgData = data.org;
    setOrg(orgData);
    setScreen("admin");

    // Sync org to cloud
    if (!DEMO && user) {
      (async () => {
        try {
          await supabase.from("organizations").insert({
            id: orgData.id, name: orgData.name, slug: orgData.slug,
            org_type: orgData.orgType || "club", color: orgData.color || "#1B4332",
            created_by: user.id,
          });
        } catch (e) {
          console.warn("Cloud sync (org) failed:", e);
        }
      })();
    }
  };

  const handleAddTeam = (teamData) => {
    const newTeam = { id: generateId(), ...teamData, players: [] };
    setOrgTeams((prev) => [...prev, newTeam]);

    // Sync to cloud
    if (!DEMO && user && org) {
      (async () => {
        try {
          await supabase.from("teams").insert({
            id: newTeam.id, user_id: user.id, org_id: org.id,
            name: newTeam.name, sport: "Soccer",
            age_group: newTeam.ageGroup || null,
            color: org.color || "#1B4332",
          });
        } catch (e) {
          console.warn("Cloud sync (team) failed:", e);
        }
      })();
    }
  };

  const handleAddPlayer = (teamId, playerData) => {
    const playerId = generateId();
    const joinToken = generateId().replace(/-/g, "").slice(0, 32);
    const newPlayer = { id: playerId, ...playerData, joinToken, connected: false };

    setOrgTeams((prev) =>
      prev.map((t) =>
        t.id === teamId ? { ...t, players: [...(t.players || []), newPlayer] } : t
      )
    );

    // Sync to cloud
    if (!DEMO && user) {
      (async () => {
        try {
          await supabase.from("players").insert({
            id: playerId, user_id: user.id, team_id: teamId,
            name: newPlayer.name, number: newPlayer.number || null,
          });
          await supabase.from("player_connections").insert({
            player_id: playerId, join_token: joinToken,
            role: "primary",
          });
        } catch (e) {
          console.warn("Cloud sync (player) failed:", e);
        }
      })();
    }
  };

  const handleSaveEntry = async (entryData) => {
    let photoData = null;
    if (entryData.photo) {
      photoData = await resizeImage(entryData.photo, 800);
    }
    const { photo, ...rest } = entryData;
    const newEntry = {
      ...rest,
      id: generateId(),
      entry_date: new Date().toISOString().split("T")[0],
      season_id: season?.id,
      photoData,
      photoPreview: photoData,
      created_at: new Date().toISOString(),
    };
    setEntries((prev) => [newEntry, ...prev]);
    setShowComposer(false);
    setShareEntry(newEntry);
    setShowSharePrompt(true);

    // Sync to cloud (fire and forget)
    if (!DEMO && user && season?.id) {
      (async () => {
        try {
          await supabase.from("entries").insert({
            id: newEntry.id, user_id: user.id, season_id: season.id,
            entry_date: newEntry.entry_date,
            entry_type: newEntry.entry_type || "game",
            text: newEntry.text || "",
            opponent: newEntry.opponent || null,
            venue: newEntry.venue || null,
            score_home: newEntry.score_home != null ? newEntry.score_home : null,
            score_away: newEntry.score_away != null ? newEntry.score_away : null,
            result: newEntry.result || null,
            consent_shared: newEntry.consent_shared || false,
          });
        } catch (e) {
          console.warn("Cloud sync (entry) failed:", e);
        }
      })();
    }
  };

  const handleSignOut = () => {
    supabase.auth.signOut();
    localStorage.removeItem("teamSeason");
    localStorage.removeItem("teamSeasonAdmin");
    setAuthed(false);
    setUser(null);
    setIsDemo(false);
    setScreen("landing");
    setTeam(null);
    setSeason(null);
    setPlayers([]);
    setEntries([]);
    setOrg(null);
    setOrgTeams([]);
    setRole(null);
    setShowMenu(false);
  };

  // Filter entries
  const filteredEntries = filter === "all"
    ? entries
    : entries.filter((e) => e.entry_type === filter);

  // --- RENDER ---
  return (
    <>
      <GlobalStyle />

      {screen === "loading" && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          minHeight: "100dvh", fontFamily: fonts.body, color: theme.textLight,
          flexDirection: "column", gap: 12,
        }}>
          <div style={{ fontSize: 32 }}>&#9917;</div>
          <span style={{ fontSize: 14 }}>Loading your journal...</span>
        </div>
      )}
      {screen === "landing" && <LandingPage onDemo={handleDemo} onStart={() => setScreen("auth")} />}
      {screen === "auth" && <AuthScreen onAuth={handleAuth} onDemo={handleDemo} onSkipAuth={() => setScreen("onboarding")} />}
      {screen === "join" && joinToken && (
        <JoinScreen
          token={joinToken}
          onComplete={handleJoinAuth}
          onBack={() => { setJoinToken(null); setScreen("landing"); }}
        />
      )}
      {screen === "onboarding" && <OnboardingScreen onComplete={handleOnboarding} />}
      {screen === "setup" && <TeamSetupScreen role={role} onComplete={handleSetup} />}
      {screen === "org-setup" && <OrgSetupScreen onComplete={handleOrgSetup} />}
      {screen === "admin" && org && (
        <AdminDashboard
          org={org}
          teams={orgTeams}
          onAddTeam={handleAddTeam}
          onAddPlayer={handleAddPlayer}
          onSignOut={handleSignOut}
          accentColor={brandPrimary}
        />
      )}

      {screen === "home" && team && season && (
        <AppShell
          accentColor={brandPrimary}
          title={team.name}
          titleIcon={team.logo ? (
            <img src={team.logo} alt="" style={{
              width: 28, height: 28, borderRadius: "50%", objectFit: "cover",
            }} />
          ) : null}
          subtitle={role === "parent" && players[0]?.name ? `${players[0].name}'s season` : season.name}
          subtitleIcon={role === "parent" && players[0]?.headshot ? (
            <img src={players[0].headshot} alt="" style={{
              width: 20, height: 20, borderRadius: "50%", objectFit: "cover",
            }} />
          ) : null}
          actions={
            <div ref={menuRef} style={{ display: "flex", gap: 6, position: "relative" }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowBook(true)}>📖</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowMenu(!showMenu)}>⋯</button>
              {showMenu && (
                <div style={{
                  position: "absolute", top: "100%", right: 0, marginTop: 4,
                  background: "white", borderRadius: 10, border: `1px solid ${theme.border}`,
                  boxShadow: "0 4px 16px rgba(0,0,0,0.1)", overflow: "hidden", zIndex: 50,
                  minWidth: 140,
                }}>
                  <button onClick={handleSignOut} style={{
                    display: "block", width: "100%", padding: "10px 16px",
                    background: "none", border: "none", cursor: "pointer",
                    fontSize: 14, color: theme.text, textAlign: "left",
                  }}>
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          }
        >
          {/* Stats */}
          <SeasonStats entries={entries} brandColor={brandPrimary} />

          {/* Quick Actions */}
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            <button className="btn btn-primary" onClick={() => setShowComposer(true)}
              style={{ flex: 1, fontSize: 15, background: brandPrimary }}>
              ✏️ New Entry
            </button>
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
              { id: "moment", label: "Moments" },
            ].map((tab) => (
              <button key={tab.id} onClick={() => setFilter(tab.id)}
                style={{
                  padding: "6px 14px", borderRadius: 8, border: "none",
                  background: filter === tab.id ? `${brandPrimary}10` : "transparent",
                  color: filter === tab.id ? brandPrimary : theme.textMuted,
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
                {role === "parent" && players[0]?.name
                  ? `${players[0].name}'s season story starts here`
                  : "Your season story starts here"}
              </p>
              <p style={{ fontSize: 14 }}>
                Tap "New Entry" after your next game or practice
              </p>
            </div>
          ) : (
            filteredEntries.map((entry) => (
              <EntryCard key={entry.id} entry={entry} players={players} onShare={(e) => setShareEntry(e)} brandColor={brandPrimary} />
            ))
          )}

          {/* Modals */}
          {showComposer && (
            <EntryComposer
              season={season}
              onSave={handleSaveEntry}
              onClose={() => setShowComposer(false)}
              brandColor={brandPrimary}
              orgName={team?.orgName || null}
            />
          )}

          {showBook && (
            <BookPreview
              entries={entries}
              team={team}
              season={season}
              players={players}
              onClose={() => setShowBook(false)}
              onOrder={() => { setShowBook(false); setShowOrder(true); }}
            />
          )}

          {showOrder && (
            <OrderFlow
              entries={entries}
              team={team}
              season={season}
              players={players}
              onClose={() => setShowOrder(false)}
            />
          )}
        </AppShell>
      )}

      {/* Share prompt toast */}
      {showSharePrompt && shareEntry && (
        <SharePrompt
          entry={shareEntry}
          brandColor={brandPrimary}
          onShare={() => {
            setShowSharePrompt(false);
          }}
          onDismiss={() => {
            setShowSharePrompt(false);
            setShareEntry(null);
          }}
        />
      )}

      {/* Share card modal */}
      {shareEntry && !showSharePrompt && (
        <ShareCardModal
          entry={shareEntry}
          team={team}
          season={season}
          onClose={() => setShareEntry(null)}
        />
      )}
    </>
  );
}
