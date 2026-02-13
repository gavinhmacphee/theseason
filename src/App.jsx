import React, { useState, useEffect, useCallback, useRef } from "react";
import html2canvas from "html2canvas";

// ============================================
// TEAM SEASON — Soccer Journal
// Role-based: Parent / Player
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
    team: { name: "Thunder SC", sport: "Soccer", emoji: "⚽", logo: null },
    season: { name: "Soccer 2026", id: "s_demo" },
    players: [{ name: "Alex", id: "p_demo", is_my_child: true, headshot: null }],
    entries: [
      {
        id: "e_demo_1", entry_type: "game",
        text: "Hat trick day. Alex couldn't stop smiling after the third one went in off the post.",
        entry_date: d(2), opponent: "Lightning FC",
        score_home: 3, score_away: 1, result: "win",
        venue: "Memorial Field", photoData: null, photoPreview: null,
        created_at: new Date().toISOString(),
      },
      {
        id: "e_demo_2", entry_type: "practice",
        text: "First time nailing the outside-of-the-foot pass. Coach made the whole team stop and watch the replay.",
        entry_date: d(5), opponent: null,
        score_home: null, score_away: null, result: null,
        venue: null, photoData: null, photoPreview: null,
        created_at: new Date().toISOString(),
      },
      {
        id: "e_demo_3", entry_type: "game",
        text: "Tough one but never stopped running. Tracked back on every single play in the second half.",
        entry_date: d(9), opponent: "Rapids",
        score_home: 1, score_away: 2, result: "loss",
        venue: "Riverside Park", photoData: null, photoPreview: null,
        created_at: new Date().toISOString(),
      },
      {
        id: "e_demo_4", entry_type: "tournament",
        text: "Semifinal shutout. The whole bench was on their feet when the final whistle blew.",
        entry_date: d(14), opponent: null,
        score_home: 2, score_away: 0, result: "win",
        venue: "City Cup", photoData: null, photoPreview: null,
        created_at: new Date().toISOString(),
      },
      {
        id: "e_demo_5", entry_type: "practice",
        text: "Coach ran a new set piece drill. You could see it click halfway through — the spacing just made sense.",
        entry_date: d(18), opponent: null,
        score_home: null, score_away: null, result: null,
        venue: null, photoData: null, photoPreview: null,
        created_at: new Date().toISOString(),
      },
      {
        id: "e_demo_6", entry_type: "game",
        text: "Dominated possession but couldn't find the finish. Hit the crossbar twice in the last ten minutes.",
        entry_date: d(23), opponent: "United",
        score_home: 1, score_away: 1, result: "draw",
        venue: "Home Field", photoData: null, photoPreview: null,
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
function AppShell({ children, title, titleIcon, subtitle, subtitleIcon, onBack, actions }) {
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
                color: theme.primary, lineHeight: 1.2,
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
      team: { name: teamName || "My Soccer Team", sport: "Soccer", emoji: "⚽", logo },
      season: { name: `Soccer ${new Date().getFullYear()}` },
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
        <div style={{ marginBottom: 24 }}>
          <label className="label">Team Name</label>
          <input className="input" value={teamName} onChange={(e) => setTeamName(e.target.value)}
            placeholder="Thunder U12, Varsity, etc." />
        </div>

        <button className="btn btn-primary" type="submit" style={{ width: "100%", padding: "14px 24px", fontSize: 16 }}>
          Start Journaling →
        </button>
      </form>
    </div>
  );
}

// --- ENTRY COMPOSER ---
function EntryComposer({ season, onSave, onClose }) {
  const [entryType, setEntryType] = useState("game");
  const [text, setText] = useState("");
  const [opponent, setOpponent] = useState("");
  const [venue, setVenue] = useState("");
  const [scoreHome, setScoreHome] = useState("");
  const [scoreAway, setScoreAway] = useState("");
  const [showGameData, setShowGameData] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
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
function EntryCard({ entry, players, onShare }) {
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
              onMouseEnter={(e) => e.currentTarget.style.color = theme.primary}
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
          width: "100%", height: 180, objectFit: "cover", borderRadius: 10, marginBottom: 10,
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
function SeasonStats({ entries }) {
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

// --- BOOK PREVIEW (Paginated) ---
function BookPreview({ entries, team, season, players, onClose, onOrder }) {
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
      team: { ...team, color: theme.primary },
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
      <div style={{ width: 40, height: 2, background: theme.primary, marginBottom: 28 }} />
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
      <div style={{ width: 40, height: 2, background: theme.primary, marginTop: 28 }} />
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
      <div style={{ width: 30, height: 1.5, background: `${theme.primary}20`, marginBottom: 28 }} />
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

  const renderEntryPage = (pageEntries) => (
    <div style={{
      width: "100%", height: "100%", padding: 32, background: "#FFFDF8",
      display: "flex", flexDirection: "column",
    }}>
      {pageEntries.map((entry, i) => {
        const hasScore = entry.score_home !== null && entry.score_away !== null;
        const resultColors = { win: theme.win, loss: theme.loss, draw: theme.draw };
        const resultLabels = { win: "W", loss: "L", draw: "D" };
        const photo = entry.photoPreview || entry.photoData;

        return (
          <div key={entry.id} style={{
            ...(i > 0 ? { paddingTop: 18, marginTop: 18, borderTop: `1px solid ${theme.primary}0F` } : {}),
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
                  fontFamily: fonts.mono, fontSize: 26, fontWeight: 700,
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
                width: "100%", maxHeight: 280, objectFit: "cover",
                borderRadius: 3, marginBottom: 10, display: "block",
              }} />
            )}

            {entry.text && (
              <p style={{
                fontFamily: fonts.display, fontSize: 12, lineHeight: 1.6,
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
        <div style={{ width: 30, height: 1.5, background: theme.primary, marginBottom: 16 }} />
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

  const handlePlaceOrder = () => {
    // Backend not connected yet — show coming soon
    setOrderStatus("coming_soon");
    setStep("status");
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
                <span style={{ fontFamily: fonts.mono, fontSize: 16, fontWeight: 700, color: theme.primary }}>$34.99 + shipping</span>
              </div>
            </div>
            <button className="btn btn-primary" onClick={handleContinueToShipping} style={{ width: "100%", padding: "14px 24px", fontSize: 15 }}>
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
              <button className="btn btn-primary" onClick={handleContinueToReview} style={{ flex: 2 }}>Review Order</button>
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
                <span style={{ fontFamily: fonts.mono, fontWeight: 700, color: theme.primary }}>$34.99 + shipping</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setStep("shipping")} style={{ flex: 1 }}>Back</button>
              <button className="btn btn-primary" onClick={handlePlaceOrder} style={{ flex: 2 }}>Place Order</button>
            </div>
          </>
        )}

        {/* Step: Status */}
        {step === "status" && (
          <>
            {orderStatus === "coming_soon" ? (
              <div style={{ textAlign: "center", padding: "24px 0" }}>
                <div style={{ fontSize: 40, marginBottom: 16 }}>🚧</div>
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
                          background: active ? theme.primary : theme.borderLight,
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

  const teamColor = theme.primary;

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
        background: hasPhoto ? "#000" : `linear-gradient(160deg, ${theme.primary} 0%, #2D6A4F 60%, #40916C 100%)`,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Photo area */}
      {hasPhoto ? (
        <div style={{
          flex: isStory ? "1 1 55%" : "1 1 50%",
          position: "relative",
          overflow: "hidden",
        }}>
          <img
            src={entry.photoPreview || entry.photoData}
            alt=""
            crossOrigin="anonymous"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
          />
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
function SharePrompt({ entry, onShare, onDismiss }) {
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
        background: theme.primary,
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
  const cardRef = useRef(null);
  const [aspect, setAspect] = useState("story");
  const [exporting, setExporting] = useState(false);
  const [headline, setHeadline] = useState(generateHeadline(entry));

  const previewScale = aspect === "story"
    ? Math.min(340 / 1080, (window.innerHeight * 0.55) / 1920)
    : Math.min(340 / 1080, (window.innerHeight * 0.55) / 1080);

  const previewWidth = 1080 * previewScale;
  const previewHeight = (aspect === "story" ? 1920 : 1080) * previewScale;

  const handleExport = async () => {
    if (!cardRef.current || exporting) return;
    setExporting(true);

    try {
      await document.fonts.ready;
      await new Promise((r) => setTimeout(r, 200));

      const canvas = await html2canvas(cardRef.current, {
        width: 1080,
        height: aspect === "story" ? 1920 : 1080,
        scale: 1,
        useCORS: true,
        allowTaint: true,
        backgroundColor: null,
      });

      canvas.toBlob(async (blob) => {
        if (!blob) {
          setExporting(false);
          return;
        }

        const file = new File([blob], `team-season-${entry.id}.png`, { type: "image/png" });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: "Team Season",
            });
          } catch (err) {
            if (err.name !== "AbortError") console.warn(err);
          }
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `team-season-${entry.id}.png`;
          a.click();
          URL.revokeObjectURL(url);
        }

        setExporting(false);
      }, "image/png");
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
        }}
      >
        {exporting ? "Exporting..." : navigator.canShare ? "Share" : "Download PNG"}
      </button>

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
    marginBottom: 32,
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

        <h1 style={{
          fontFamily: fonts.display,
          fontSize: 52,
          fontWeight: 700,
          color: "white",
          lineHeight: 1.0,
          marginBottom: 12,
          position: "relative",
        }}>
          Team Season
        </h1>
        <p style={{
          fontFamily: fonts.headline,
          fontStyle: "italic",
          fontSize: 21,
          color: "rgba(255,255,255,0.65)",
          marginBottom: 44,
          position: "relative",
        }}>
          Every season tells a story
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", position: "relative" }}>
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
          <button onClick={onStart} className="btn" style={{
            background: theme.accent,
            color: "white",
            padding: "14px 28px",
            fontSize: 15,
          }}>
            Start Your Season
          </button>
        </div>
      </div>

      {/* ====== INTRO LINE ====== */}
      <div style={{
        maxWidth: 640,
        margin: "0 auto",
        padding: "56px 24px 48px",
        textAlign: "center",
      }}>
        <p style={{
          fontFamily: fonts.headline,
          fontStyle: "italic",
          fontSize: 22,
          color: theme.text,
          lineHeight: 1.5,
        }}>
          A journal for the season. Share cards for the highlights. A book for the shelf.
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
            <p style={sectionCopy}>
              After every game, practice, or moment worth remembering - write the line. Add the score, a photo, the details you'll want to look back on.
            </p>
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
                {/* Photo area */}
                <div style={{
                  height: 72,
                  background: `linear-gradient(170deg, #52B788 0%, #2D6A4F 60%, #1B4332 100%)`,
                  position: "relative",
                  overflow: "hidden",
                }}>
                  {/* Field illustration */}
                  <svg viewBox="0 0 240 72" style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}>
                    {/* Pitch lines */}
                    <line x1="0" y1="68" x2="240" y2="68" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
                    <rect x="80" y="50" width="80" height="22" rx="1" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.8" />
                    <rect x="100" y="58" width="40" height="14" rx="1" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="0.8" />
                    <circle cx="120" cy="42" r="18" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="0.8" />
                    {/* Player silhouettes */}
                    <g opacity="0.25" fill="white">
                      <ellipse cx="105" cy="30" rx="4" ry="4.5" />
                      <path d="M101,35 L101,48 M101,38 L97,42 M101,38 L105,42 M101,48 L97,54 M101,48 L105,54" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                    </g>
                    <g opacity="0.18" fill="white">
                      <ellipse cx="138" cy="34" rx="3.5" ry="4" />
                      <path d="M134.5,39 L134.5,50 M134.5,42 L131,45 M134.5,42 L138,45 M134.5,50 L131,55 M134.5,50 L138,55" stroke="white" strokeWidth="1.3" strokeLinecap="round" fill="none" />
                    </g>
                    {/* Ball */}
                    <circle cx="118" cy="46" r="2.5" fill="rgba(255,255,255,0.4)" />
                  </svg>
                </div>
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
                    "Two goals in the first half. The energy was unreal."
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
            background: `linear-gradient(160deg, ${theme.primary} 0%, #2D6A4F 60%, #40916C 100%)`,
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
            {/* Field lines background */}
            <svg viewBox="0 0 280 280" style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              opacity: 0.07,
            }}>
              <circle cx="140" cy="110" r="52" fill="none" stroke="white" strokeWidth="1.5" />
              <circle cx="140" cy="110" r="3" fill="white" />
              <line x1="0" y1="110" x2="280" y2="110" stroke="white" strokeWidth="1" />
              <path d="M0,0 Q16,0 16,16" fill="none" stroke="white" strokeWidth="1" />
              <path d="M280,0 Q264,0 264,16" fill="none" stroke="white" strokeWidth="1" />
              <path d="M0,280 Q16,280 16,264" fill="none" stroke="white" strokeWidth="1" />
              <path d="M280,280 Q264,280 264,264" fill="none" stroke="white" strokeWidth="1" />
              <rect x="90" y="0" width="100" height="45" rx="1" fill="none" stroke="white" strokeWidth="0.8" />
              <path d="M115,45 A25,20 0 0,0 165,45" fill="none" stroke="white" strokeWidth="0.8" />
            </svg>

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
              <span>Thunder SC</span>
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
              Hat trick day
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
              "Two goals in the first half. The energy was unreal."
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
            <p style={sectionCopy}>
              Turn any entry into a share card sized for Instagram Stories or your feed. Edit the caption, pick the format, share the moment.
            </p>
          </div>
        </div>
      </div>

      {/* ====== PRINT SECTION ====== */}
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
            <p style={sectionLabel}>Print</p>
            <p style={sectionCopy}>
              At the end of the season, turn it all into a real, printed book. Every entry, every score, every photo - bound and on your shelf.
            </p>
          </div>

          {/* Book cover mockup */}
          <div style={{
            width: 210,
            height: 290,
            position: "relative",
            flexShrink: 0,
          }}>
            {/* Page edges visible on right */}
            <div style={{
              position: "absolute",
              right: -4,
              top: 6,
              bottom: 6,
              width: 8,
              background: "linear-gradient(90deg, #e8e4dc 0%, #f5f2ea 40%, #ece8e0 100%)",
              borderRadius: "0 2px 2px 0",
            }} />
            {/* Cover */}
            <div style={{
              width: "100%",
              height: "100%",
              background: `linear-gradient(160deg, ${theme.primary} 0%, #2D6A4F 100%)`,
              borderRadius: "4px 8px 8px 4px",
              padding: "28px 22px 20px",
              display: "flex",
              flexDirection: "column",
              position: "relative",
              overflow: "hidden",
              boxShadow: "6px 6px 24px rgba(0,0,0,0.14), 2px 2px 6px rgba(0,0,0,0.06)",
            }}>
              {/* Center circle motif */}
              <svg viewBox="0 0 200 200" style={{
                position: "absolute",
                top: "45%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: 200,
                height: 200,
                opacity: 0.07,
              }}>
                <circle cx="100" cy="100" r="70" fill="none" stroke="white" strokeWidth="1.5" />
                <circle cx="100" cy="100" r="4" fill="white" />
                <line x1="0" y1="100" x2="200" y2="100" stroke="white" strokeWidth="1" />
              </svg>

              {/* Spine highlight */}
              <div style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: 10,
                background: "linear-gradient(90deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.05) 50%, transparent 100%)",
                borderRadius: "4px 0 0 4px",
              }} />

              {/* Content */}
              <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column" }}>
                <p style={{
                  fontFamily: fonts.display,
                  fontSize: 30,
                  fontWeight: 700,
                  color: "white",
                  lineHeight: 0.95,
                  marginBottom: 4,
                }}>
                  Thunder
                </p>
                <p style={{
                  fontFamily: fonts.display,
                  fontSize: 30,
                  fontWeight: 700,
                  color: "white",
                  lineHeight: 0.95,
                  marginBottom: 14,
                }}>
                  SC
                </p>

                {/* Gold accent line */}
                <div style={{
                  width: 28,
                  height: 2,
                  background: theme.accent,
                  marginBottom: 14,
                }} />

                <p style={{
                  fontFamily: fonts.mono,
                  fontSize: 9,
                  color: "rgba(255,255,255,0.45)",
                  letterSpacing: 2,
                  textTransform: "uppercase",
                }}>
                  Spring 2026
                </p>

                <div style={{ flex: 1 }} />

                <p style={{
                  fontFamily: fonts.headline,
                  fontStyle: "italic",
                  fontSize: 13,
                  color: "rgba(255,255,255,0.55)",
                  lineHeight: 1.4,
                  marginBottom: 16,
                }}>
                  Every season tells a story
                </p>

                <p style={{
                  fontFamily: fonts.body,
                  fontSize: 7,
                  fontWeight: 700,
                  color: "rgba(255,255,255,0.2)",
                  letterSpacing: 3,
                  textTransform: "uppercase",
                }}>
                  Team Season
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ====== BOTTOM CTA ====== */}
      <div style={{
        background: `linear-gradient(160deg, ${theme.primary} 0%, #2D6A4F 50%, #40916C 100%)`,
        padding: "56px 24px",
        textAlign: "center",
      }}>
        <p style={{
          fontFamily: fonts.headline,
          fontStyle: "italic",
          fontSize: 22,
          color: "rgba(255,255,255,0.8)",
          marginBottom: 32,
        }}>
          Your season is happening right now.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
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
          <button onClick={onStart} className="btn" style={{
            background: theme.accent,
            color: "white",
            padding: "14px 28px",
            fontSize: 15,
          }}>
            Start Your Season
          </button>
        </div>
      </div>

      {/* ====== FAN SEASON TEASER ====== */}
      <div style={{
        background: `${theme.primary}08`,
        borderTop: `1px solid ${theme.border}`,
        padding: "40px 24px",
        textAlign: "center",
      }}>
        <p style={{
          fontFamily: fonts.mono,
          fontSize: 10,
          color: theme.textLight,
          letterSpacing: 3,
          textTransform: "uppercase",
          marginBottom: 12,
        }}>
          Coming soon
        </p>
        <h3 style={{
          fontFamily: fonts.display,
          fontSize: 22,
          fontWeight: 600,
          color: theme.primary,
          marginBottom: 8,
        }}>
          Fan Season
        </h3>
        <p style={{
          fontSize: 14,
          color: theme.textMuted,
          maxWidth: 360,
          margin: "0 auto",
          lineHeight: 1.5,
        }}>
          The fan experience - coming to teamseason.app later this year.
        </p>
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

// --- MAIN APP ---
export default function SportsJournalApp() {
  const [authed, setAuthed] = useState(false);
  const [user, setUser] = useState(null);
  const [screen, setScreen] = useState("loading"); // loading, landing, auth, onboarding, setup, home
  const [role, setRole] = useState(null);
  const [isDemo, setIsDemo] = useState(false);

  // Data
  const [team, setTeam] = useState(null);
  const [season, setSeason] = useState(null);
  const [players, setPlayers] = useState([]);
  const [entries, setEntries] = useState([]);

  // UI state
  const [showComposer, setShowComposer] = useState(false);
  const [showBook, setShowBook] = useState(false);
  const [showOrder, setShowOrder] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [filter, setFilter] = useState("all");
  const menuRef = useRef(null);

  // Share card state
  const [shareEntry, setShareEntry] = useState(null);
  const [showSharePrompt, setShowSharePrompt] = useState(false);

  // Init: restore from localStorage or show landing
  useEffect(() => {
    // Migrate legacy localStorage keys
    if (!localStorage.getItem("teamSeason") && localStorage.getItem("theSeason")) {
      localStorage.setItem("teamSeason", localStorage.getItem("theSeason"));
      localStorage.removeItem("theSeason");
    }
    if (!localStorage.getItem("teamSeasonOrder") && localStorage.getItem("theSeasonOrder")) {
      localStorage.setItem("teamSeasonOrder", localStorage.getItem("theSeasonOrder"));
      localStorage.removeItem("theSeasonOrder");
    }

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
        return;
      } catch (e) {
        // Invalid data, continue to auth
      }
    }

    if (DEMO) {
      setScreen("landing");
      return;
    }
    if (supabase.auth.restore()) {
      setUser(supabase.auth.user);
      setAuthed(true);
      setScreen("onboarding");
    } else {
      setScreen("landing");
    }
  }, []);

  // Persist to localStorage (skip demo, skip mid-setup)
  useEffect(() => {
    if (screen !== "home" || isDemo) return;
    if (!team || !season) return;
    const data = { role, team, season, players, entries };
    localStorage.setItem("teamSeason", JSON.stringify(data));
  }, [role, team, season, players, entries, screen, isDemo]);

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

  const handleAuth = (user) => {
    setUser(user);
    setAuthed(true);
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

  const handleSaveEntry = async (entryData) => {
    let photoData = null;
    if (entryData.photo) {
      photoData = await resizeImage(entryData.photo, 800);
    }
    const { photo, ...rest } = entryData;
    const newEntry = {
      ...rest,
      id: "e_" + Date.now(),
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
  };

  const handleSignOut = () => {
    supabase.auth.signOut();
    localStorage.removeItem("teamSeason");
    setAuthed(false);
    setUser(null);
    setIsDemo(false);
    setScreen("landing");
    setTeam(null);
    setSeason(null);
    setPlayers([]);
    setEntries([]);
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

      {screen === "landing" && <LandingPage onDemo={handleDemo} onStart={() => setScreen("auth")} />}
      {screen === "auth" && <AuthScreen onAuth={handleAuth} onDemo={handleDemo} onSkipAuth={() => setScreen("onboarding")} />}
      {screen === "onboarding" && <OnboardingScreen onComplete={handleOnboarding} />}
      {screen === "setup" && <TeamSetupScreen role={role} onComplete={handleSetup} />}

      {screen === "home" && team && season && (
        <AppShell
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
          <SeasonStats entries={entries} />

          {/* Quick Actions */}
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            <button className="btn btn-primary" onClick={() => setShowComposer(true)}
              style={{ flex: 1, fontSize: 15 }}>
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
              <EntryCard key={entry.id} entry={entry} players={players} onShare={(e) => setShareEntry(e)} />
            ))
          )}

          {/* Modals */}
          {showComposer && (
            <EntryComposer
              season={season}
              onSave={handleSaveEntry}
              onClose={() => setShowComposer(false)}
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
