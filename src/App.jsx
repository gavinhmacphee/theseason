import React, { useState, useEffect, useCallback, useRef } from "react";
import html2canvas from "html2canvas";

// ============================================
// TEAM SEASON — Youth Sports Journal
// Role-based: Parent / Player
// ============================================

// --- CONFIG ---
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "YOUR_SUPABASE_URL";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "YOUR_SUPABASE_ANON_KEY";

// --- SUPABASE CLIENT (official SDK — handles token refresh automatically) ---
import { createClient } from "@supabase/supabase-js";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- DEMO MODE ---
const DEMO = SUPABASE_URL === "YOUR_SUPABASE_URL";

// --- OFFLINE SYNC QUEUE ---
// Queues failed cloud syncs in localStorage and retries when back online
const SYNC_QUEUE_KEY = "teamSeasonSyncQueue";

function getSyncQueue() {
  try { return JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY) || "[]"); } catch { return []; }
}

function addToSyncQueue(item) {
  try {
    const queue = getSyncQueue();
    queue.push({ ...item, queued_at: Date.now() });
    localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.warn("Failed to add to sync queue:", e.message);
  }
}

async function flushSyncQueue(userId) {
  const queue = getSyncQueue();
  if (queue.length === 0) return;
  const remaining = [];
  for (const item of queue) {
    try {
      if (item.type === "entry") {
        // Upload photo first if queued
        let photoUrl = null;
        if (item.photoData) {
          const blob = base64ToBlob(item.photoData);
          if (blob) {
            const filePath = `${userId}/${item.entry.id}.jpg`;
            const { error: uploadErr } = await supabase.storage
              .from("entry-photos")
              .upload(filePath, blob, { contentType: "image/jpeg", upsert: true });
            if (!uploadErr) {
              const { data: urlData } = supabase.storage.from("entry-photos").getPublicUrl(filePath);
              photoUrl = urlData?.publicUrl || null;
            }
          }
        }
        const { error } = await supabase.from("entries").insert({
          ...item.entry,
          ...(photoUrl ? { photo_url: photoUrl } : {}),
        });
        if (error) { remaining.push(item); }
      }
    } catch {
      remaining.push(item);
    }
  }
  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(remaining));
  if (remaining.length === 0) localStorage.removeItem(SYNC_QUEUE_KEY);
}

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

// --- SPORTS ---
const SPORTS = [
  { name: "Soccer", emoji: "⚽", event: "game", eventDay: "Game Day" },
  { name: "Basketball", emoji: "🏀", event: "game", eventDay: "Game Day" },
  { name: "Baseball", emoji: "⚾", event: "game", eventDay: "Game Day" },
  { name: "Softball", emoji: "🥎", event: "game", eventDay: "Game Day" },
  { name: "Hockey", emoji: "🏒", event: "game", eventDay: "Game Day" },
  { name: "Lacrosse", emoji: "🥍", event: "game", eventDay: "Game Day" },
  { name: "Football", emoji: "🏈", event: "game", eventDay: "Game Day" },
  { name: "Volleyball", emoji: "🏐", event: "match", eventDay: "Match Day" },
  { name: "Swimming", emoji: "🏊", event: "meet", eventDay: "Meet Day" },
  { name: "Track & Field", emoji: "🏃", event: "meet", eventDay: "Meet Day" },
  { name: "Tennis", emoji: "🎾", event: "match", eventDay: "Match Day" },
  { name: "Multi-Sport", emoji: "🎽", event: "game", eventDay: "Game Day" },
  { name: "Other", emoji: "🏅", event: "game", eventDay: "Game Day" },
];

// --- BASE64 TO BLOB HELPER ---
function base64ToBlob(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith("data:")) return null;
  const [header, data] = dataUrl.split(",");
  const mimeMatch = header.match(/:(.*?);/);
  if (!mimeMatch || !data) return null;
  const bytes = atob(data);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mimeMatch[1] });
}

// --- IMAGE RESIZE HELPER ---
// Uses createImageBitmap for reliable EXIF orientation handling
async function resizeImage(file, maxSize) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (err) {
    // HEIC or corrupt image — fall back to Image element
    const url = URL.createObjectURL(file);
    try {
      bitmap = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Could not load image. Try a JPG or PNG."));
        img.src = url;
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const canvas = document.createElement("canvas");
  let w = bitmap.width, h = bitmap.height;
  if (w > h) {
    if (w > maxSize) { h = h * maxSize / w; w = maxSize; }
  } else {
    if (h > maxSize) { w = w * maxSize / h; h = maxSize; }
  }
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
  if (bitmap.close) bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
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
    team: { id: "demo-team", name: "Thunder", sport: "Soccer", emoji: "⚽", logo: null, orgType: "club", color: "#1B4332" },
    season: { name: "Spring 2026", id: "s_demo" },
    players: [{ name: "Marco", id: "p_demo", is_my_child: true, headshot: null }],
    entries: [
      {
        id: "e_demo_1", entry_type: "game",
        text: "Two assists and the go-ahead goal. He found the open space and made the right pass every time.",
        entry_date: d(2), opponent: "Lightning FC",
        score_home: 3, score_away: 1, result: "win",
        venue: "Memorial Field",
        photoData: "/images/demo/game-action.jpg", photoPreview: "/images/demo/game-action.jpg",
        created_at: new Date().toISOString(),
      },
      {
        id: "e_demo_2", entry_type: "practice",
        text: "Footwork drills are finally clicking. Coach pulled him aside after and said his speed has gotten way sharper.",
        entry_date: d(5), opponent: null,
        score_home: null, score_away: null, result: null,
        venue: "Training Complex",
        photoData: "/images/demo/practice-cones.jpg", photoPreview: "/images/demo/practice-cones.jpg",
        created_at: new Date().toISOString(),
      },
      {
        id: "e_demo_3", entry_type: "game",
        text: "Left it all out there. Played the whole game in the heat and never asked to come off.",
        entry_date: d(9), opponent: "Rapids",
        score_home: 1, score_away: 2, result: "loss",
        venue: "Riverside Park",
        photoData: "/images/demo/water-break.jpg", photoPreview: "/images/demo/water-break.jpg",
        created_at: new Date().toISOString(),
      },
      {
        id: "e_demo_4", entry_type: "tournament",
        text: "Semifinal shutout. The whole bench was on their feet when the final buzzer sounded.",
        entry_date: d(14), opponent: null,
        score_home: 2, score_away: 0, result: "win",
        venue: "City Cup",
        photoData: "/images/demo/game-action.jpg", photoPreview: "/images/demo/game-action.jpg",
        created_at: new Date().toISOString(),
      },
      {
        id: "e_demo_5", entry_type: "moment",
        text: "Walking back from practice with his bag over his shoulder and that look. This kid lives for it.",
        entry_date: d(18), opponent: null,
        score_home: null, score_away: null, result: null,
        venue: null,
        photoData: "/images/demo/walking-off.jpg", photoPreview: "/images/demo/walking-off.jpg",
        created_at: new Date().toISOString(),
      },
      {
        id: "e_demo_6", entry_type: "game",
        text: "Controlled the game but couldn't finish. Hit the post twice in the last few minutes.",
        entry_date: d(23), opponent: "United",
        score_home: 1, score_away: 1, result: "draw",
        venue: "Home Field",
        photoData: "/images/demo/water-break.jpg", photoPreview: "/images/demo/water-break.jpg",
        created_at: new Date().toISOString(),
      },
    ],
  };
}

function coachDemoData() {
  const today = new Date();
  const d = (daysAgo) => {
    const dt = new Date(today);
    dt.setDate(dt.getDate() - daysAgo);
    return dt.toISOString().split("T")[0];
  };

  return {
    role: "coach",
    team: { id: "demo-coach-team", name: "Watertown Raiders", sport: "Football", emoji: "🏈", logo: null, orgType: "school", color: "#B91C1C" },
    season: { name: "Varsity Football 2025", id: "s_coach_demo" },
    players: [],
    entries: [
      {
        id: "ec_1", entry_type: "game",
        text: "Down 14 at the half. Went no-huddle in the third and the kids responded. Martinez found the seam twice. Defense locked down their run game completely in the second half. Won by 3. This team has guts.",
        entry_date: d(2), opponent: "Belmont",
        score_home: 24, score_away: 21, result: "win",
        venue: "Victory Field",
        created_at: new Date().toISOString(),
      },
      {
        id: "ec_2", entry_type: "practice",
        text: "Best practice of the year. Ran the new screen package and the timing was perfect by the third rep. O-line is starting to gel. Need to clean up the snap count — two false starts in the team period.",
        entry_date: d(4),
        created_at: new Date().toISOString(),
      },
      {
        id: "ec_3", entry_type: "film",
        text: "Watched the Belmont film twice. Our safeties are biting on play action every time — that's the third game in a row. Need to drill eyes in practice this week. Also noticed #54 is getting pushed back on inside runs. Might need to move Thompson there.",
        entry_date: d(5),
        created_at: new Date().toISOString(),
      },
      {
        id: "ec_4", entry_type: "player",
        text: "Jake Rivera. This kid has come so far since August. Couldn't run a clean route to save his life in camp. Now he's our most reliable third-down target. Had that conversation with him last week about playing with confidence and you can see the difference. College guys need to see this tape.",
        entry_date: d(7),
        created_at: new Date().toISOString(),
      },
      {
        id: "ec_5", entry_type: "game",
        text: "Flat from the start. No energy in warmups and it carried into the first quarter. We were lucky to only be down 7 at half. Made adjustments but the damage was done. Need to figure out how to start faster. Two weeks in a row we've been slow out of the gate.",
        entry_date: d(9), opponent: "Waltham",
        score_home: 10, score_away: 17, result: "loss",
        venue: "Away",
        created_at: new Date().toISOString(),
      },
      {
        id: "ec_6", entry_type: "week",
        text: "Tough week. Lost to Waltham and the kids are frustrated. But the film showed we're not far off — two blown assignments on defense were the difference. Kept practice light on Monday and ramped up intensity Wednesday. Locker room feels right. They want to bounce back. Playoffs start in three weeks.",
        entry_date: d(10),
        created_at: new Date().toISOString(),
      },
      {
        id: "ec_7", entry_type: "moment",
        text: "Senior night. Parents on the field, kids in tears. Nineteen seniors — most I've ever had. Said a few words about each one. When I got to Rivera his mom completely lost it. This is why you coach.",
        entry_date: d(14),
        created_at: new Date().toISOString(),
      },
    ],
  };
}

// --- PAGINATION ALGORITHM (for print book) ---
function paginateEntries(entries) {
  const PAGE_BUDGET = 1500; // px — 7.75x7.75" square safe area minus bleed/margins at ~260 PPI
  const DIVIDER = 56;

  function estimateHeight(entry) {
    let h = 70; // type badge + date row
    if ((entry.entry_type === "game" || entry.entry_type === "tournament" || entry.entry_type === "event") &&
        entry.score_home !== null && entry.score_away !== null) {
      h += 90; // score block
    }
    if (entry.opponent) h += 40;
    if (entry.photoPreview || entry.photoData) h += 750;
    if (entry.text) h += Math.ceil(entry.text.length / 40) * 50;
    if (entry.venue) h += 38;
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

// --- FLAG EMOJI HELPER ---
function countryFlag(iso2) {
  // Converts 2-letter ISO code to flag emoji (regional indicator symbols)
  if (!iso2 || iso2.length !== 2) return "";
  const base = 0x1F1E6 - 0x41;
  return String.fromCodePoint(base + iso2.toUpperCase().charCodeAt(0)) +
         String.fromCodePoint(base + iso2.toUpperCase().charCodeAt(1));
}

const FLAG_COUNTRIES = [
  { iso: "US", name: "USA" },
  { iso: "MX", name: "Mexico" },
  { iso: "BR", name: "Brazil" },
  { iso: "GB", name: "UK" },
  { iso: "CA", name: "Canada" },
  { iso: "CO", name: "Colombia" },
  { iso: "AR", name: "Argentina" },
  { iso: "DE", name: "Germany" },
  { iso: "FR", name: "France" },
  { iso: "IT", name: "Italy" },
  { iso: "ES", name: "Spain" },
  { iso: "PT", name: "Portugal" },
  { iso: "JP", name: "Japan" },
  { iso: "KR", name: "Korea" },
  { iso: "NG", name: "Nigeria" },
  { iso: "GH", name: "Ghana" },
  { iso: "JM", name: "Jamaica" },
  { iso: "HT", name: "Haiti" },
  { iso: "SV", name: "El Salvador" },
  { iso: "GT", name: "Guatemala" },
  { iso: "HN", name: "Honduras" },
  { iso: "IE", name: "Ireland" },
  { iso: "PL", name: "Poland" },
  { iso: "IN", name: "India" },
  { iso: "CN", name: "China" },
  { iso: "AU", name: "Australia" },
  { iso: "NL", name: "Netherlands" },
  { iso: "SE", name: "Sweden" },
  { iso: "NO", name: "Norway" },
  { iso: "DK", name: "Denmark" },
  { iso: "TR", name: "Turkey" },
  { iso: "EG", name: "Egypt" },
  { iso: "MA", name: "Morocco" },
  { iso: "CI", name: "Ivory Coast" },
  { iso: "SN", name: "Senegal" },
  { iso: "EC", name: "Ecuador" },
  { iso: "UY", name: "Uruguay" },
  { iso: "CL", name: "Chile" },
  { iso: "PE", name: "Peru" },
  { iso: "VE", name: "Venezuela" },
  { iso: "DO", name: "Dominican Rep." },
  { iso: "CU", name: "Cuba" },
  { iso: "PR", name: "Puerto Rico" },
  { iso: "TT", name: "Trinidad" },
  { iso: "BB", name: "Barbados" },
  { iso: "GY", name: "Guyana" },
  { iso: "PY", name: "Paraguay" },
  { iso: "BO", name: "Bolivia" },
  { iso: "CR", name: "Costa Rica" },
  { iso: "PA", name: "Panama" },
  { iso: "NI", name: "Nicaragua" },
  { iso: "BE", name: "Belgium" },
  { iso: "CH", name: "Switzerland" },
  { iso: "AT", name: "Austria" },
  { iso: "HR", name: "Croatia" },
  { iso: "RS", name: "Serbia" },
  { iso: "UA", name: "Ukraine" },
  { iso: "RU", name: "Russia" },
  { iso: "ZA", name: "South Africa" },
];

// --- FLAG PICKER COMPONENT ---
function FlagPicker({ selectedFlags = [], onChange, onClose }) {
  const [search, setSearch] = useState("");
  const filtered = FLAG_COUNTRIES.filter(
    (c) => c.name.toLowerCase().includes(search.toLowerCase()) || c.iso.toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (iso) => {
    if (selectedFlags.includes(iso)) {
      onChange(selectedFlags.filter((f) => f !== iso));
    } else if (selectedFlags.length < 2) {
      onChange([...selectedFlags, iso]);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
      zIndex: 5000, display: "flex", alignItems: "flex-end", justifyContent: "center",
    }} onClick={onClose}>
      <div style={{
        background: "white", borderRadius: "18px 18px 0 0",
        padding: "20px 16px calc(20px + env(safe-area-inset-bottom, 0px))",
        width: "100%", maxWidth: 480, maxHeight: "60vh", overflow: "hidden",
        display: "flex", flexDirection: "column",
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: theme.text }}>Pick Flags</div>
            <div style={{ fontSize: 12, color: theme.textMuted }}>Up to two countries</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: theme.textMuted }}>×</button>
        </div>
        {selectedFlags.length > 0 && (
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            {selectedFlags.map((iso) => (
              <button key={iso} onClick={() => toggle(iso)} style={{
                display: "flex", alignItems: "center", gap: 6, padding: "4px 10px",
                background: theme.borderLight, border: `1px solid ${theme.border}`,
                borderRadius: 20, fontSize: 13, cursor: "pointer",
              }}>
                {countryFlag(iso)} {iso} ×
              </button>
            ))}
          </div>
        )}
        <input
          type="text"
          placeholder="Search country..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: "8px 12px", border: `1px solid ${theme.border}`,
            borderRadius: 8, fontSize: 14, marginBottom: 10, width: "100%",
            boxSizing: "border-box", outline: "none",
          }}
        />
        <div style={{ overflowY: "auto", flex: 1 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
            {filtered.map((c) => {
              const selected = selectedFlags.includes(c.iso);
              return (
                <button key={c.iso} onClick={() => toggle(c.iso)} style={{
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                  padding: "8px 4px", border: `2px solid ${selected ? theme.primary : theme.border}`,
                  background: selected ? `${theme.primary}10` : "white",
                  borderRadius: 6, cursor: "pointer", transition: "all 0.15s",
                }}>
                  <span style={{ fontSize: 22 }}>{countryFlag(c.iso)}</span>
                  <span style={{ fontSize: 9, color: theme.textMuted, lineHeight: 1.2, textAlign: "center" }}>{c.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
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

// --- ERROR BOUNDARY ---
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(err, info) { console.error("ErrorBoundary caught:", err, info); }
  render() {
    if (this.state.hasError) {
      return React.createElement("div", {
        style: {
          minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", padding: 32, fontFamily: "'DM Sans', sans-serif",
          background: "#1B4332", color: "white", textAlign: "center", gap: 16,
        },
      },
        React.createElement("div", { style: { fontSize: 32 } }, "\u26A0\uFE0F"),
        React.createElement("h2", { style: { fontSize: 20, fontWeight: 700 } }, "Something went wrong"),
        React.createElement("p", { style: { fontSize: 14, color: "rgba(255,255,255,0.7)", maxWidth: 300 } },
          "The app hit an unexpected error. Tap below to reload."),
        React.createElement("button", {
          onClick: () => window.location.reload(),
          style: {
            marginTop: 8, padding: "12px 32px", borderRadius: 10, border: "none",
            background: "rgba(255,255,255,0.2)", color: "white", fontSize: 15,
            fontWeight: 600, cursor: "pointer",
          },
        }, "Reload App"),
      );
    }
    return this.props.children;
  }
}

// --- GLOBAL STYLES ---
const GlobalStyle = () => (
  <style>{`
    * { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }

    html { -webkit-text-size-adjust: 100%; }

    body {
      font-family: ${fonts.body};
      background: ${theme.bg};
      color: ${theme.text};
      -webkit-font-smoothing: antialiased;
      touch-action: manipulation;
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

// --- CONFIRM MODAL ---
function ConfirmModal({ title, message, confirmLabel = "Delete", confirmColor = "#e74c3c", onConfirm, onCancel, inputConfirm = null }) {
  const [inputValue, setInputValue] = useState("");
  const canConfirm = inputConfirm ? inputValue === inputConfirm : true;

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
      onClick={onCancel}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }} />
      <div style={{ position: "relative", background: theme.card, borderRadius: 16, padding: 24, maxWidth: 340, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}
        onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700, color: theme.text }}>{title}</h3>
        <p style={{ margin: "0 0 20px", fontSize: 14, lineHeight: 1.5, color: theme.textMuted }}>{message}</p>
        {inputConfirm && (
          <input
            type="text"
            placeholder={`Type ${inputConfirm} to confirm`}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            autoFocus
            style={{
              width: "100%", padding: "10px 12px", marginBottom: 16, fontSize: 14,
              border: `1px solid ${theme.border}`, borderRadius: 8, background: theme.bg,
              color: theme.text, boxSizing: "border-box", fontFamily: "DM Sans, sans-serif",
            }}
          />
        )}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: "12px 16px", borderRadius: 10, border: `1px solid ${theme.border}`,
            background: "transparent", color: theme.text, fontSize: 14, fontWeight: 600, cursor: "pointer",
          }}>Cancel</button>
          <button onClick={() => canConfirm && onConfirm()} disabled={!canConfirm} style={{
            flex: 1, padding: "12px 16px", borderRadius: 10, border: "none",
            background: canConfirm ? confirmColor : theme.border, color: "white",
            fontSize: 14, fontWeight: 600, cursor: canConfirm ? "pointer" : "not-allowed",
            opacity: canConfirm ? 1 : 0.5,
          }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// --- TOAST NOTIFICATION ---
function Toast({ message, type = "error", onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 4000);
    return () => clearTimeout(t);
  }, [onDone]);

  const colors = { error: "#e74c3c", success: "#27ae60", info: theme.primary };
  return (
    <div style={{
      position: "fixed", bottom: "calc(24px + env(safe-area-inset-bottom, 0px))", left: 16, right: 16,
      zIndex: 10001, display: "flex", justifyContent: "center", pointerEvents: "none",
    }}>
      <div style={{
        background: colors[type] || colors.error, color: "white", padding: "12px 20px",
        borderRadius: 12, fontSize: 14, fontWeight: 500, maxWidth: 360, textAlign: "center",
        boxShadow: "0 8px 24px rgba(0,0,0,0.25)", pointerEvents: "auto",
      }}>{message}</div>
    </div>
  );
}

// --- LAYOUT ---
function AppShell({ children, title, titleIcon, subtitle, subtitleIcon, onBack, actions, accentColor }) {
  const shellPrimary = accentColor || theme.primary;
  return (
    <div style={{ maxWidth: 480, margin: "0 auto", minHeight: "100dvh", padding: "env(safe-area-inset-top, 0px) 16px calc(24px + env(safe-area-inset-bottom, 0px))", position: "relative" }}>
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
                <div style={{ fontSize: 13, color: theme.textMuted }}>{subtitle}</div>
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
function AuthScreen({ onAuth, onDemo, onSkipAuth, onBack }) {
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
      const { data, error } = isSignUp
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      onAuth(data.user);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: "100dvh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "calc(24px + env(safe-area-inset-top, 0px)) 24px calc(24px + env(safe-area-inset-bottom, 0px))",
      background: `linear-gradient(160deg, ${theme.primary} 0%, #2D6A4F 50%, #40916C 100%)`,
      position: "relative",
    }}>
      {onBack && <button onClick={onBack} style={{
        position: "absolute", top: "calc(16px + env(safe-area-inset-top, 0px))", left: 16, background: "rgba(255,255,255,0.15)",
        border: "none", color: "white", fontFamily: "'DM Sans', sans-serif",
        fontSize: 14, padding: "8px 16px", cursor: "pointer",
      }}>{"\u2190 Back"}</button>}
      <div className="slide-up" style={{ textAlign: "center", marginBottom: 40 }}>
        <h1 style={{
          fontFamily: "'Crimson Pro', Georgia, serif", fontSize: 32, fontWeight: 700,
          color: "white", lineHeight: 1.1, marginBottom: 10, letterSpacing: 0.5,
        }}>
          Team Season
        </h1>
        <p style={{
          fontFamily: "'Crimson Pro', Georgia, serif", fontSize: 17, color: "rgba(255,255,255,0.6)",
          fontStyle: "italic", maxWidth: 300,
        }}>
          Long after the scores are forgotten, the moments remain.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="fade-in" style={{
        background: "white", padding: 32,
        width: "100%", maxWidth: 360,
      }}>
        <h2 style={{ fontFamily: "'Crimson Pro', Georgia, serif", fontSize: 22, fontWeight: 700, marginBottom: 20, textAlign: "center", color: theme.primary }}>
          {isSignUp ? "Create Account" : "Welcome Back"}
        </h2>

        {error && (
          <div style={{
            background: "#FEE2E2", color: "#991B1B", padding: "10px 14px",
            fontSize: 13, marginBottom: 16, borderLeft: "3px solid #991B1B",
          }}>{error}</div>
        )}

        <div style={{ marginBottom: 14 }}>
          <label className="label">Email</label>
          <input className="input" type="email" value={email}
            onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label className="label">Password</label>
          <input className="input" type="password" value={password}
            onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete="current-password" />
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
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 24, alignItems: "center" }}>
          <button onClick={onSkipAuth}
            className="btn" style={{
              background: "rgba(255,255,255,0.15)",
              color: "white", border: "1px solid rgba(255,255,255,0.25)",
              width: 220,
            }}>
            Start Your Season
          </button>
          <button onClick={onDemo}
            className="btn" style={{
              background: "transparent",
              color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.15)",
              fontSize: 13, padding: "8px 20px",
            }}>
            Try Demo Mode
          </button>
        </div>
      )}
    </div>
  );
}

// --- VALUE-FIRST ONBOARDING ---
const ONBOARD_SEASONS = ["This is their first", "2-3 seasons", "4-6 seasons", "7+ seasons"];
const ONBOARD_MIRROR = {
  "This is their first": { count: "first", msg: "This is the beginning of the story." },
  "2-3 seasons": { count: "a few", msg: "How many of those could you describe game by game?" },
  "4-6 seasons": { count: "several", msg: "How much of that do you actually remember?" },
  "7+ seasons": { count: "many", msg: "Most of those memories are already gone." },
};
const ONBOARD_COLORS = [
  { key: "forest", hex: "#1B4332" },
  { key: "navy", hex: "#1B3A5C" },
  { key: "royal", hex: "#1D4ED8" },
  { key: "red", hex: "#B91C1C" },
  { key: "purple", hex: "#5B21B6" },
  { key: "orange", hex: "#C2410C" },
];
const ONBOARD_WHYS = [
  { label: "The big moments", icon: "🏆", desc: "Goals, wins, breakthroughs" },
  { label: "The funny stuff", icon: "😂", desc: "Car rides, snack bars, team chaos" },
  { label: "Watching them grow", icon: "🌱", desc: "Confidence, effort, resilience" },
  { label: "All of it", icon: "📖", desc: "The whole season, start to finish" },
];
const ONBOARD_MEMORY_PROMPTS = {
  parent: [
    "Scored their first goal and didn't know what to do",
    "Fell down, got back up, kept going",
    "Couldn't stop talking about it in the car",
    "Made a play that surprised everyone",
  ],
  coach: [
    "Down at the half. Changed the plan. Kids responded.",
    "A kid who'd been struggling finally had their moment",
    "The play we practiced all week finally worked",
    "Post-game speech that actually landed",
  ],
};

// Fade-in animation (must be at module level, not inside a component)
function OnboardFade({ children, delay = 0, style: s = {} }) {
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVis(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return (
    <div style={{
      opacity: vis ? 1 : 0, transform: vis ? "translateY(0)" : "translateY(16px)",
      transition: "opacity 0.5s ease, transform 0.5s ease", ...s,
    }}>
      {children}
    </div>
  );
}

function OnboardProgressBar({ current, total = 8 }) {
  const pct = ((current + 1) / total) * 100;
  return (
    <div style={{ width: "100%", marginBottom: 32 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "#a3a3a3", letterSpacing: 0.5 }}>
          {current + 1} of {total}
        </span>
        <span style={{ fontSize: 11, fontWeight: 600, color: "#a3a3a3" }}>
          {Math.round(pct)}%
        </span>
      </div>
      <div style={{ width: "100%", height: 4, background: "rgba(0,0,0,0.08)" }}>
        <div style={{
          height: "100%", background: "#1a1a1a",
          width: `${pct}%`,
          transition: "width 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
        }} />
      </div>
    </div>
  );
}

function OnboardShareCard({ data }) {
  const c = data.teamColor || "#1B4332";
  const hasPhoto = !!data.photo;
  const bg = hasPhoto ? "#000" : `linear-gradient(160deg, ${c} 0%, ${c}cc 60%, ${c}88 100%)`;
  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
  // Match the real ShareCardRender "classic" template at preview scale
  return (
    <div style={{
      width: 320, height: 320, overflow: "hidden",
      fontFamily: "'DM Sans', sans-serif",
      boxShadow: "0 20px 50px rgba(0,0,0,0.35)",
      background: hasPhoto ? "#000" : bg,
      display: "flex", flexDirection: "column",
      position: "relative",
    }}>
      {hasPhoto && (
        <>
          <div style={{
            position: "absolute", inset: 0,
            backgroundImage: `url(${data.photo})`,
            backgroundSize: "cover", backgroundPosition: "center 40%",
            opacity: 0.45,
          }} />
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.1) 100%)",
          }} />
        </>
      )}
      <div style={{
        position: "relative", zIndex: 1, flex: 1,
        display: "flex", flexDirection: "column",
        justifyContent: "flex-end", padding: "24px 24px 20px",
      }}>
        {/* Team strip */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          marginBottom: 12,
        }}>
          <span style={{ fontSize: 14 }}>{data.sportIcon}</span>
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: 1.5,
            textTransform: "uppercase", color: hasPhoto ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.7)",
          }}>
            {data.teamName || "Team Season"}
          </span>
        </div>

        {/* Headline */}
        <h2 style={{
          fontFamily: "'Crimson Pro', Georgia, serif",
          fontStyle: "italic", fontWeight: 400,
          fontSize: 22, color: "white", lineHeight: 1.15,
          marginBottom: 12, letterSpacing: -0.3,
        }}>
          {`${data.childName}'s Moment`}
        </h2>

        {/* Quote */}
        <p style={{
          fontSize: 12, color: "rgba(255,255,255,0.8)", lineHeight: 1.5,
          fontStyle: "italic", margin: "0 0 16px",
          display: "-webkit-box", WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>
          &ldquo;{data.memory}&rdquo;
        </p>

        {/* Date */}
        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", marginBottom: 12 }}>
          {dateStr}
        </div>

        {/* Watermark */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.12)",
        }}>
          <span style={{
            fontSize: 8, fontWeight: 700, color: "rgba(255,255,255,0.4)",
            letterSpacing: 2, textTransform: "uppercase",
          }}>teamseason.app</span>
          <span style={{
            fontSize: 8, color: "rgba(255,255,255,0.3)",
          }}>Entry #1</span>
        </div>
      </div>
    </div>
  );
}

function ValueOnboarding({ onComplete, onSignIn, onDemo, initialStep = 0 }) {
  const [step, setStep] = useState(initialStep);
  const [transitioning, setTransitioning] = useState(false);
  const [data, setData] = useState({
    userRole: "parent", // "parent" or "coach"
    sport: "", sportIcon: "", sportEvent: "game", sportEventDay: "Game Day",
    childName: "", childFlags: [], seasonsPlayed: "", teamLevel: "",
    teamName: "", teamColor: "#1B4332", memory: "", photo: null,
    whyJournal: "", // "what matters most" answer
  });
  const [showOnboardFlagPicker, setShowOnboardFlagPicker] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const memoryRef = useRef(null);
  const photoRef = useRef(null);
  const celebCardRef = useRef(null);

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const dataUrl = await resizeImage(file, 800);
    setData((d) => ({ ...d, photo: dataUrl }));
  };

  const goNext = () => {
    setTransitioning(true);
    setTimeout(() => { setStep((s) => s + 1); setTransitioning(false); }, 300);
  };
  const goBack = () => {
    setTransitioning(true);
    setTimeout(() => { setStep((s) => Math.max(0, s - 1)); setTransitioning(false); }, 300);
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError("");
    try {
      const { data: authData, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      onComplete(authData.user, data);
    } catch (err) {
      setAuthError(err.message);
    }
    setAuthLoading(false);
  };

  // Background shifts as you progress: warm cream → cool gray → dark reveal
  const stepBgs = [
    `linear-gradient(160deg, ${theme.primary} 0%, #2D6A4F 50%, #40916C 100%)`,  // 0: green (welcome)
    "linear-gradient(180deg, #FAF8F4 0%, #F0EDE6 100%)",  // 1: sport
    "linear-gradient(180deg, #F6F5F2 0%, #ECEAE5 100%)",  // 2: name
    "linear-gradient(180deg, #F4F3F0 0%, #E8E6E2 100%)",  // 3: why (new)
    "linear-gradient(180deg, #F2F1EF 0%, #E5E3DF 100%)",  // 4: seasons
    "linear-gradient(180deg, #EEEDEB 0%, #DDDBD7 100%)",  // 5: mirror
    "linear-gradient(180deg, #E8E7E5 0%, #D5D3CF 100%)",  // 6: team + color
    "linear-gradient(180deg, #E0DFDD 0%, #CCCAC6 100%)",  // 7: write memory
    "#111",                                                 // 8: celebration (dark payoff)
    "#0a0a0a",                                              // 9: signup (darker)
  ];
  const container = {
    minHeight: "100dvh", fontFamily: "'DM Sans', sans-serif",
    display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center",
    padding: "calc(40px + env(safe-area-inset-top, 0px)) 20px calc(40px + env(safe-area-inset-bottom, 0px))",
    background: stepBgs[step] || "#FAFAF7",
    transition: "background 0.5s ease",
  };
  const card = {
    width: "100%", maxWidth: 440,
    opacity: transitioning ? 0 : 1,
    transform: transitioning ? "translateY(12px)" : "translateY(0)",
    transition: "opacity 0.3s ease, transform 0.3s ease",
  };
  const label = {
    fontSize: 13, fontWeight: 600, color: "#a3a3a3",
    textTransform: "uppercase", letterSpacing: 1.2,
    marginBottom: 12, textAlign: "center",
  };
  const heading = {
    fontSize: 26, fontWeight: 800, color: "#1a1a1a",
    textAlign: "center", lineHeight: 1.25,
    marginBottom: 8, letterSpacing: -0.3,
  };
  const sub = {
    fontSize: 15, color: "#737373", textAlign: "center",
    lineHeight: 1.5, marginBottom: 32,
  };
  const solidBtn = (active = true) => ({
    width: "100%", padding: "16px 24px", border: "none",
    background: active ? "#1a1a1a" : "#e5e5e5",
    color: active ? "#fafafa" : "#a3a3a3",
    fontSize: 15, fontWeight: 700, cursor: active ? "pointer" : "default",
    transition: "all 0.2s ease", fontFamily: "'DM Sans', sans-serif",
    letterSpacing: 0.2,
  });
  const handleBack = () => {
    if (step > initialStep) {
      goBack();
    }
  };
  const backArrow = step > initialStep ? (
    <button onClick={handleBack} style={{
      position: "absolute", top: "calc(20px + env(safe-area-inset-top, 0px))", left: 20, background: "none",
      border: "none", fontSize: 14, color: "#a3a3a3", cursor: "pointer",
      fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
    }}>
      ← Back
    </button>
  ) : null;

  const Fade = OnboardFade;

  // STEP 0: Welcome + Role Picker (green — matches landing page hero)
  if (step === 0) {
    return (
      <div style={container}>
        <div style={card}>
          <Fade>
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <div style={{
                fontFamily: "'Crimson Pro', Georgia, serif",
                fontSize: 32, fontWeight: 700, color: "white",
                marginBottom: 6,
              }}>Team Season</div>
              <div style={{
                fontFamily: "'Crimson Pro', Georgia, serif",
                fontSize: 16, fontStyle: "italic", color: "rgba(255,255,255,0.6)",
              }}>Long after the scores are forgotten, the moments remain.</div>
            </div>
          </Fade>
          <Fade delay={150}>
            <h1 style={{ ...heading, fontSize: 28, color: "white" }}>Let's capture this season</h1>
          </Fade>
          <Fade delay={300}>
            <p style={{ ...sub, color: "rgba(255,255,255,0.7)" }}>
              A few quick questions. Then we'll show you something worth keeping.
            </p>
          </Fade>
          <Fade delay={500}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <button style={{
                ...solidBtn(),
                background: "white", color: theme.primary,
              }} onClick={() => {
                setData((d) => ({ ...d, userRole: "parent" }));
                goNext();
              }}>Let's go →</button>
            </div>
          </Fade>
          <Fade delay={600}>
            <p style={{ textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 16 }}>
              Takes about two minutes. No sign-up needed yet.
            </p>
          </Fade>
          <Fade delay={700}>
            <p style={{ textAlign: "center", marginTop: 16 }}>
              <span onClick={onSignIn} style={{
                fontSize: 14, color: "rgba(255,255,255,0.8)", fontWeight: 600,
                cursor: "pointer", textDecoration: "underline",
              }}>
                Already have an account? Sign in
              </span>
            </p>
          </Fade>
        </div>
      </div>
    );
  }

  // STEP 1: Sport
  if (step === 1) {
    return (
      <div style={container}>
        {backArrow}
        <div style={card}>
          <OnboardProgressBar current={0} />
          <Fade>
            <p style={label}>First things first</p>
            <h2 style={heading}>What sport does your kid play?</h2>
            <p style={sub}>Pick the main one. You can add more later.</p>
          </Fade>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {SPORTS.filter(s => s.name !== "Other").map((s, i) => (
              <Fade key={s.name} delay={100 + i * 50}>
                <button
                  onClick={() => {
                    setData((d) => ({ ...d, sport: s.name, sportIcon: s.emoji, sportEvent: s.event || "game", sportEventDay: s.eventDay || "Game Day" }));
                    setTimeout(goNext, 200);
                  }}
                  style={{
                    width: "100%", padding: 16, cursor: "pointer",
                    border: data.sport === s.name ? "2px solid #1a1a1a" : "2px solid #e5e5e5",
                    background: data.sport === s.name ? "rgba(245,245,244,0.9)" : "rgba(255,255,255,0.85)",
                    fontSize: 15, fontWeight: 600,
                    fontFamily: "'DM Sans', sans-serif",
                    display: "flex", alignItems: "center", gap: 10,
                    transition: "all 0.15s ease", color: "#1a1a1a",
                  }}
                >
                  <span style={{ fontSize: 22 }}>{s.emoji}</span>
                  {s.name}
                </button>
              </Fade>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // STEP 2: Child's name
  if (step === 2) {
    return (
      <div style={container}>
        {backArrow}
        <div style={card}>
          <OnboardProgressBar current={1} />
          <Fade>
            <p style={label}>{data.sportIcon} {data.sport}</p>
            <h2 style={heading}>What's your kid's name?</h2>
            <p style={sub}>First name is perfect.</p>
          </Fade>
          <Fade delay={200}>
            <div style={{ display: "flex", gap: 10, marginBottom: 20, alignItems: "stretch" }}>
              <input autoFocus type="text" placeholder="e.g. Freya"
                value={data.childName}
                onChange={(e) => setData((d) => ({ ...d, childName: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && data.childName.trim() && goNext()}
                style={{
                  flex: 1, padding: "18px 20px",
                  border: "2px solid #e5e5e5", fontSize: 18,
                  fontFamily: "'DM Sans', sans-serif", outline: "none",
                  textAlign: "center",
                  fontWeight: 600, color: "#1a1a1a", boxSizing: "border-box",
                }}
              />
              <button onClick={() => setShowOnboardFlagPicker(true)} style={{
                padding: "0 16px", border: "2px solid #e5e5e5",
                background: "rgba(255,255,255,0.85)", cursor: "pointer",
                fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
                fontFamily: "'DM Sans', sans-serif",
              }}>
                {data.childFlags && data.childFlags.length > 0
                  ? data.childFlags.map((iso) => countryFlag(iso)).join("")
                  : "🌍"}
              </button>
            </div>
            {showOnboardFlagPicker && (
              <FlagPicker
                selectedFlags={data.childFlags || []}
                onChange={(flags) => setData((d) => ({ ...d, childFlags: flags }))}
                onClose={() => setShowOnboardFlagPicker(false)}
              />
            )}
            <button style={solidBtn(data.childName.trim().length > 0)}
              onClick={() => data.childName.trim() && goNext()}>
              Continue →
            </button>
          </Fade>
        </div>
      </div>
    );
  }

  // STEP 3: What matters most (NEW — Duolingo-style personalization)
  if (step === 3) {
    return (
      <div style={container}>
        {backArrow}
        <div style={card}>
          <OnboardProgressBar current={2} />
          <Fade>
            <p style={label}>{data.sportIcon} {data.sport}</p>
            <h2 style={heading}>
              {`What do you want to remember about ${data.childName}'s season?`}
            </h2>
            <p style={sub}>Pick the one that feels right.</p>
          </Fade>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {ONBOARD_WHYS.map((w, i) => (
              <Fade key={w.label} delay={150 + i * 80}>
                <button
                  onClick={() => {
                    setData((d) => ({ ...d, whyJournal: w.label }));
                    setTimeout(goNext, 250);
                  }}
                  style={{
                    width: "100%", padding: "16px 20px",
                    border: data.whyJournal === w.label ? "2px solid #1a1a1a" : "2px solid #e5e5e5",
                    background: data.whyJournal === w.label ? "rgba(245,245,244,0.9)" : "rgba(255,255,255,0.8)",
                    fontSize: 15, fontWeight: 600, cursor: "pointer",
                    fontFamily: "'DM Sans', sans-serif", textAlign: "left",
                    transition: "all 0.15s ease", color: "#1a1a1a",
                    display: "flex", alignItems: "center", gap: 14,
                  }}
                >
                  <span style={{ fontSize: 24 }}>{w.icon}</span>
                  <div>
                    <div>{w.label}</div>
                    <div style={{ fontSize: 12, fontWeight: 400, color: "#737373", marginTop: 2 }}>{w.desc}</div>
                  </div>
                </button>
              </Fade>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // STEP 4: Seasons played
  if (step === 4) {
    return (
      <div style={container}>
        {backArrow}
        <div style={card}>
          <OnboardProgressBar current={3} />
          <Fade>
            <p style={label}>{data.childName}'s {data.sport.toLowerCase()} journey</p>
            <h2 style={heading}>How many seasons has {data.childName} played?</h2>
            <p style={sub}>Roughly. Don't overthink it.</p>
          </Fade>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {ONBOARD_SEASONS.map((opt, i) => (
              <Fade key={opt} delay={150 + i * 80}>
                <button
                  onClick={() => {
                    setData((d) => ({ ...d, seasonsPlayed: opt }));
                    setTimeout(goNext, 250);
                  }}
                  style={{
                    width: "100%", padding: "18px 20px",
                    border: data.seasonsPlayed === opt ? "2px solid #1a1a1a" : "2px solid #e5e5e5",
                    background: data.seasonsPlayed === opt ? "rgba(245,245,244,0.9)" : "rgba(255,255,255,0.8)",
                    fontSize: 15, fontWeight: 600, cursor: "pointer",
                    fontFamily: "'DM Sans', sans-serif", textAlign: "left",
                    transition: "all 0.15s ease", color: "#1a1a1a",
                  }}
                >
                  {opt}
                </button>
              </Fade>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // STEP 5: Mirror moment
  if (step === 5) {
    const mirror = ONBOARD_MIRROR[data.seasonsPlayed] || ONBOARD_MIRROR["2-3 seasons"];
    const isFirst = data.seasonsPlayed === "This is their first";
    return (
      <div style={container}>
        {backArrow}
        <div style={card}>
          <OnboardProgressBar current={4} />
          <Fade>
            <div style={{
              background: "rgba(255,255,255,0.7)", padding: "36px 28px",
              textAlign: "center", border: "1px solid rgba(0,0,0,0.08)",
              marginBottom: 28, backdropFilter: "blur(8px)",
            }}>
              <span style={{ fontSize: 40, display: "block", marginBottom: 16 }}>{data.sportIcon}</span>
              <h2 style={{ ...heading, marginBottom: 12 }}>
                {isFirst
                  ? `${data.childName}'s first ${data.sport.toLowerCase()} season`
                  : `${data.childName} has played ${mirror.count} seasons of ${data.sport.toLowerCase()}`}
              </h2>
              <p style={{ fontSize: 17, color: "#525252", lineHeight: 1.5, margin: 0, fontWeight: 500 }}>
                {isFirst
                  ? "Every first is worth remembering. Let's make sure you do."
                  : mirror.msg}
              </p>
            </div>
          </Fade>
          <Fade delay={600}>
            <p style={{ textAlign: "center", fontSize: 15, color: "#737373", marginBottom: 24, lineHeight: 1.5 }}>
              {isFirst ? "Let's start capturing it — right now." : "This season, let's change that."}
            </p>
            <button style={solidBtn()} onClick={goNext}>
              {isFirst ? "Let's do it →" : "Let's start remembering →"}
            </button>
          </Fade>
        </div>
      </div>
    );
  }

  // STEP 6: Team name + color
  if (step === 6) {
    return (
      <div style={container}>
        {backArrow}
        <div style={card}>
          <OnboardProgressBar current={5} />
          <Fade>
            <p style={label}>Almost there</p>
            <h2 style={heading}>What's the team name?</h2>
            <p style={sub}>{`This goes on ${data.childName}'s share cards.`}</p>
          </Fade>
            <Fade delay={200}>
              <input autoFocus type="text" placeholder="e.g. Thunder FC"
                value={data.teamName}
                onChange={(e) => setData((d) => ({ ...d, teamName: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && data.teamName.trim() && goNext()}
                style={{
                  width: "100%", padding: "18px 20px",
                  border: "2px solid #e5e5e5", fontSize: 18,
                  fontFamily: "'DM Sans', sans-serif", outline: "none",
                  marginBottom: 20, textAlign: "center",
                  fontWeight: 600, color: "#1a1a1a", boxSizing: "border-box",
                }}
              />
            </Fade>
          <Fade delay={300}>
            <p style={{ ...label, marginBottom: 10, marginTop: 4 }}>Pick a team color</p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 28 }}>
              {ONBOARD_COLORS.map((c) => (
                <button key={c.key} onClick={() => setData((d) => ({ ...d, teamColor: c.hex }))}
                  style={{
                    width: 40, height: 40, borderRadius: "50%",
                    background: c.hex, cursor: "pointer",
                    border: data.teamColor === c.hex ? "3px solid #1a1a1a" : "3px solid transparent",
                    transition: "all 0.15s ease",
                    outline: data.teamColor === c.hex ? "2px solid #fff" : "none",
                    outlineOffset: -5,
                  }}
                />
              ))}
            </div>
          </Fade>
          <Fade delay={400}>
            <button style={solidBtn(data.teamName.trim().length > 0)}
              onClick={() => data.teamName.trim() && goNext()}>
              Continue →
            </button>
          </Fade>
        </div>
      </div>
    );
  }

  // STEP 7: Write a memory (with tap prompts — Duolingo "impossible to fail")
  if (step === 7) {
    const prompts = ONBOARD_MEMORY_PROMPTS.parent;
    return (
      <div style={container}>
        {backArrow}
        <div style={card}>
          <OnboardProgressBar current={6} />
          <Fade>
            <p style={label}>Try it right now</p>
            <h2 style={heading}>{`Think about ${data.childName}'s last ${data.sportEvent}`}</h2>
            <p style={sub}>Tap one that sounds familiar, or write your own.</p>
          </Fade>
          <Fade delay={200}>
            {!data.memory && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                {prompts.map((p) => (
                  <button key={p} onClick={() => setData((d) => ({ ...d, memory: p }))}
                    style={{
                      padding: "10px 14px", border: "2px solid #e5e5e5",
                      background: "rgba(255,255,255,0.8)", fontSize: 13, fontWeight: 500,
                      cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                      color: "#525252", textAlign: "left", lineHeight: 1.4,
                      transition: "all 0.15s ease", flex: "1 1 45%", minWidth: 150,
                    }}>
                    "{p}"
                  </button>
                ))}
              </div>
            )}
            <textarea ref={memoryRef} autoFocus={!!data.memory}
              placeholder={data.sportEvent === "meet"
                ? `"Dropped two seconds off her best time and didn't even realize..."`
                : data.sportEvent === "match"
                ? `"That second set was all heart..."`
                : `"Found the open lane and didn't even hesitate..."`}
              value={data.memory}
              onChange={(e) => setData((d) => ({ ...d, memory: e.target.value }))}
              rows={4}
              style={{
                width: "100%", padding: "18px 20px",
                border: "2px solid #e5e5e5", fontSize: 16,
                fontFamily: "'DM Sans', sans-serif", outline: "none",
                marginBottom: 12, resize: "none", lineHeight: 1.5,
                color: "#1a1a1a", boxSizing: "border-box",
              }}
            />
            <input ref={photoRef} type="file" accept="image/*"
              onChange={handlePhotoUpload} style={{ display: "none" }} />
            {data.photo ? (
              <div style={{
                marginBottom: 20, position: "relative",
                border: "2px solid #e5e5e5", overflow: "hidden",
              }}>
                <img src={data.photo} alt="" style={{
                  width: "100%", height: 140, objectFit: "cover", display: "block",
                }} />
                <button onClick={() => setData((d) => ({ ...d, photo: null }))}
                  style={{
                    position: "absolute", top: 8, right: 8,
                    background: "rgba(0,0,0,0.6)", color: "#fff",
                    border: "none", padding: "4px 10px", fontSize: 12,
                    fontWeight: 600, cursor: "pointer",
                    fontFamily: "'DM Sans', sans-serif",
                  }}>
                  Remove
                </button>
              </div>
            ) : (
              <button onClick={() => photoRef.current?.click()}
                style={{
                  width: "100%", padding: "12px 16px", marginBottom: 20,
                  border: "2px dashed #d4d4d4", background: "transparent",
                  color: "#a3a3a3", fontSize: 14, fontWeight: 600,
                  cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}>
                <span style={{ fontSize: 16 }}>+</span> Add a photo (optional)
              </button>
            )}
            <button style={solidBtn(data.memory.trim().length > 0)}
              onClick={() => data.memory.trim() && goNext()}>
              See your share card →
            </button>
          </Fade>
        </div>
      </div>
    );
  }

  // STEP 8: Celebration — share card payoff (NEW — Duolingo-style reward before signup)
  if (step === 8) {
    return (
      <div style={container}>
        <div style={{ ...card, maxWidth: 480 }}>
          <Fade>
            <div style={{ textAlign: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 48, display: "inline-block", animation: "none" }}>
                {data.sportIcon}
              </span>
            </div>
            <p style={{
              textAlign: "center", fontSize: 13, fontWeight: 600, color: data.teamColor || "#1B4332",
              textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8,
            }}>
              First memory captured
            </p>
            <h2 style={{
              ...heading, color: "#fafafa", marginBottom: 6, fontSize: 24,
            }}>
              {`That's ${data.childName}'s first entry.`}
            </h2>
            <p style={{
              fontSize: 15, color: "#888", textAlign: "center", lineHeight: 1.5, marginBottom: 28,
            }}>
              Imagine a whole season of these — every game, every moment, all in one place.
            </p>
          </Fade>

          <Fade delay={400}>
            <div ref={celebCardRef} style={{ display: "flex", justifyContent: "center", marginBottom: 28 }}>
              <OnboardShareCard data={data} />
            </div>
          </Fade>

          <Fade delay={800}>
            <div style={{
              display: "flex", gap: 10, marginBottom: 20,
              justifyContent: "center",
            }}>
              <button onClick={() => {
                // Screenshot the share card for download
                if (typeof html2canvas !== "undefined" && celebCardRef.current) {
                  html2canvas(celebCardRef.current, { scale: 2, backgroundColor: "#0a0a0a" }).then(canvas => {
                    const link = document.createElement("a");
                    link.download = `${data.childName || "team-season"}-first-memory.png`;
                    link.href = canvas.toDataURL("image/png");
                    link.click();
                  });
                }
              }}
                style={{
                  padding: "12px 20px", border: "1px solid #333",
                  background: "transparent", color: "#ccc", fontSize: 14,
                  fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                  display: "flex", alignItems: "center", gap: 8,
                }}>
                Save image
              </button>
              {typeof navigator !== "undefined" && navigator.share && (
                <button onClick={() => {
                  navigator.share({
                    title: "Team Season",
                    text: data.memory,
                    url: "https://teamseason.app",
                  }).catch(() => {});
                }}
                  style={{
                    padding: "12px 20px", border: "1px solid #333",
                    background: "transparent", color: "#ccc", fontSize: 14,
                    fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                    display: "flex", alignItems: "center", gap: 8,
                  }}>
                  Share
                </button>
              )}
            </div>
          </Fade>

          <Fade delay={1100}>
            <button style={{
              ...solidBtn(), background: data.teamColor || "#1B4332",
              color: "#fafafa", fontSize: 16, marginBottom: 12,
            }} onClick={goNext}>
              {`Keep ${data.childName}'s season going →`}
            </button>
            <p style={{ textAlign: "center", fontSize: 12, color: "#555" }}>
              Takes 10 seconds — free forever
            </p>
          </Fade>
        </div>
      </div>
    );
  }

  // STEP 9: Signup — soft wall with "maybe later" (Duolingo-style delayed registration)
  if (step === 9) {
    return (
      <div style={container}>
        <div style={{ ...card, maxWidth: 440 }}>
          <Fade>
            <h2 style={{
              ...heading, color: "#fafafa", marginBottom: 8, fontSize: 22,
            }}>
              Create an account to save your progress
            </h2>
            <p style={{
              fontSize: 14, color: "#777", textAlign: "center", lineHeight: 1.5, marginBottom: 28,
            }}>
              Your first memory is ready. Sign up so you don't lose it.
            </p>
          </Fade>

          <Fade delay={300}>
            <div style={{
              background: "#1a1a1a", padding: 24,
              marginBottom: 20, border: "1px solid #262626",
            }}>
              <form onSubmit={handleSignUp}>
                {authError && (
                  <div style={{
                    background: "rgba(185,28,28,0.15)", color: "#fca5a5",
                    padding: "10px 14px", fontSize: 13, marginBottom: 16,
                    borderLeft: "3px solid #B91C1C",
                  }}>{authError}</div>
                )}
                <input type="email" placeholder="Email" value={email}
                  onChange={(e) => setEmail(e.target.value)} required autoComplete="email"
                  style={{
                    width: "100%", padding: "14px 16px", border: "1px solid #333",
                    background: "#0a0a0a", color: "#fafafa", fontSize: 15,
                    fontFamily: "'DM Sans', sans-serif", outline: "none",
                    marginBottom: 10, boxSizing: "border-box",
                  }}
                />
                <input type="password" placeholder="Password (6+ characters)" value={password}
                  onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete="new-password"
                  style={{
                    width: "100%", padding: "14px 16px", border: "1px solid #333",
                    background: "#0a0a0a", color: "#fafafa", fontSize: 15,
                    fontFamily: "'DM Sans', sans-serif", outline: "none",
                    marginBottom: 16, boxSizing: "border-box",
                  }}
                />
                <button type="submit" disabled={authLoading}
                  style={{
                    width: "100%", padding: "16px 24px", border: "none",
                    background: data.teamColor || "#1B4332",
                    color: "#fafafa", fontSize: 16, fontWeight: 700,
                    cursor: authLoading ? "default" : "pointer",
                    fontFamily: "'DM Sans', sans-serif",
                    opacity: authLoading ? 0.7 : 1,
                  }}>
                  {authLoading ? "Saving..." : "Save my season →"}
                </button>
              </form>

              <p style={{ fontSize: 12, color: "#555", marginTop: 12, textAlign: "center" }}>
                Free forever. No credit card.
              </p>
            </div>
          </Fade>

          <Fade delay={600}>
            <button onClick={() => onComplete(null, data)}
              style={{
                width: "100%", padding: "14px 24px", border: "1px solid #333",
                background: "transparent", color: "#777", fontSize: 14, fontWeight: 600,
                cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                marginBottom: 16,
              }}>
              Maybe later — just let me in
            </button>
            <p style={{ textAlign: "center" }}>
              <span onClick={onSignIn} style={{
                fontSize: 13, color: "#555", cursor: "pointer",
                textDecoration: "underline",
              }}>
                Already have an account? Sign in
              </span>
            </p>
          </Fade>
        </div>
      </div>
    );
  }

  return null;
}

// --- TEAM SETUP ---
function TeamSetupScreen({ role, onComplete }) {
  const [selectedSport, setSelectedSport] = useState(null);
  const [customSport, setCustomSport] = useState("");
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

  const sportName = selectedSport?.name === "Other" ? (customSport || "Sports") : (selectedSport?.name || "Sports");
  const sportEmoji = selectedSport?.emoji || "🏅";

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

  const [sportError, setSportError] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!selectedSport) {
      setSportError(true);
      return;
    }
    if (selectedSport.name === "Other" && !customSport.trim()) {
      setSportError(true);
      return;
    }
    setSportError(false);
    onComplete({
      team: { id: generateId(), name: teamName || "My Team", sport: sportName, emoji: sportEmoji, logo, orgType, color: brandColor },
      season: { id: generateId(), name: `${sportName} ${new Date().getFullYear()}` },
      myPlayer: role === "parent" ? { name: childName, headshot: childHeadshot } : null,
    });
  };

  return (
    <div style={{ minHeight: "100dvh", padding: "calc(24px + env(safe-area-inset-top, 0px)) 24px calc(24px + env(safe-area-inset-bottom, 0px))", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <form onSubmit={handleSubmit} className="slide-up" style={{ maxWidth: 400, width: "100%" }}>
        <h1 style={{ fontFamily: fonts.display, fontSize: 28, fontWeight: 700, color: theme.primary, marginBottom: 6 }}>
          {role === "parent" ? "Set up your child's season" : "Set up your season"}
        </h1>
        <p style={{ fontSize: 14, color: theme.textMuted, marginBottom: 28 }}>
          Quick setup — you can edit everything later
        </p>

        {/* Sport picker */}
        <div style={{ marginBottom: 20 }}>
          <label className="label" style={sportError ? { color: "#B91C1C" } : {}}>
            Sport {sportError && <span style={{ fontWeight: 400 }}>— pick one</span>}
          </label>
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8,
          }}>
            {SPORTS.map((s) => (
              <button key={s.name} type="button" onClick={() => { setSelectedSport(s); setSportError(false); }}
                style={{
                  padding: "10px 4px", cursor: "pointer",
                  border: `1.5px solid ${selectedSport?.name === s.name ? brandColor : theme.border}`,
                  background: selectedSport?.name === s.name ? `${brandColor}10` : "white",
                  borderRadius: 8, display: "flex", flexDirection: "column",
                  alignItems: "center", gap: 4, transition: "all 0.15s",
                }}>
                <span style={{ fontSize: 22 }}>{s.emoji}</span>
                <span style={{
                  fontSize: 11, fontWeight: selectedSport?.name === s.name ? 600 : 400,
                  color: selectedSport?.name === s.name ? brandColor : theme.textMuted,
                }}>{s.name}</span>
              </button>
            ))}
          </div>
          {selectedSport?.name === "Other" && (
            <input className="input" value={customSport} onChange={(e) => setCustomSport(e.target.value)}
              placeholder="Enter sport name" style={{ marginTop: 8 }} />
          )}
        </div>

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

        {/* Team logo */}
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
              <span style={{ fontSize: 12, color: theme.textLight, textAlign: "center", lineHeight: 1.3 }}>Team<br/>Logo</span>
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

        {/* Team type */}
        <div style={{ marginBottom: 20 }}>
          <label className="label">Team Type</label>
          <div style={{ display: "flex", gap: 8 }}>
            {[
              { id: "club", label: "Travel/Club" },
              { id: "rec", label: "Rec League" },
              { id: "school", label: "School" },
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

// --- EDIT SEASON MODAL ---
function EditSeasonModal({ team, season, players, onSave, onClose, brandColor, role }) {
  const [teamName, setTeamName] = useState(team?.name || "");
  const [seasonName, setSeasonName] = useState(season?.name || "");
  const [childName, setChildName] = useState(players?.[0]?.name || "");
  const [childFlags, setChildFlags] = useState(players?.[0]?.flags || []);
  const [showFlagPicker, setShowFlagPicker] = useState(false);
  const [color, setColor] = useState(team?.color || "#1B4332");
  const [selectedSport, setSelectedSport] = useState(() =>
    SPORTS.find((s) => s.name === team?.sport) || SPORTS[SPORTS.length - 1]
  );
  const [customSport, setCustomSport] = useState(
    SPORTS.find((s) => s.name === team?.sport) ? "" : (team?.sport || "")
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    const sportName = selectedSport?.name === "Other" ? (customSport || "Sports") : (selectedSport?.name || team?.sport || "Sports");
    const sportEmoji = selectedSport?.emoji || team?.emoji || "🏅";
    onSave({
      team: { ...team, name: teamName || team?.name, sport: sportName, emoji: sportEmoji, color },
      season: { ...season, name: seasonName || season?.name },
      players: players?.length > 0
        ? [{ ...players[0], name: childName || players[0]?.name, flags: childFlags }]
        : childName ? [{ id: generateId(), name: childName, is_my_child: true, flags: childFlags }] : [],
    });
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 100, padding: 16,
    }}>
      <form onSubmit={handleSubmit} style={{
        background: "white", borderRadius: 16, padding: 24,
        maxWidth: 380, width: "100%", maxHeight: "90vh", overflowY: "auto",
        boxShadow: "0 16px 64px rgba(0,0,0,0.2)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontFamily: fonts.display, fontSize: 22, fontWeight: 700, color: theme.text }}>Edit Season</h2>
          <button type="button" onClick={onClose} style={{
            background: "none", border: "none", fontSize: 22, color: theme.textMuted, cursor: "pointer",
          }}>&times;</button>
        </div>

        {/* Sport */}
        <div style={{ marginBottom: 16 }}>
          <label className="label">Sport</label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
            {SPORTS.map((s) => (
              <button key={s.name} type="button" onClick={() => setSelectedSport(s)}
                style={{
                  padding: "8px 2px", cursor: "pointer",
                  border: `1.5px solid ${selectedSport?.name === s.name ? color : theme.border}`,
                  background: selectedSport?.name === s.name ? `${color}10` : "white",
                  borderRadius: 8, display: "flex", flexDirection: "column",
                  alignItems: "center", gap: 2, transition: "all 0.15s",
                }}>
                <span style={{ fontSize: 18 }}>{s.emoji}</span>
                <span style={{
                  fontSize: 10, fontWeight: selectedSport?.name === s.name ? 600 : 400,
                  color: selectedSport?.name === s.name ? color : theme.textMuted,
                }}>{s.name}</span>
              </button>
            ))}
          </div>
          {selectedSport?.name === "Other" && (
            <input className="input" value={customSport} onChange={(e) => setCustomSport(e.target.value)}
              placeholder="Enter sport name" style={{ marginTop: 8 }} />
          )}
        </div>

        {/* Team Name */}
        <div style={{ marginBottom: 16 }}>
          <label className="label">Team Name</label>
          <input className="input" value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Thunder U12" />
        </div>

        {/* Season Name */}
        <div style={{ marginBottom: 16 }}>
          <label className="label">Season Name</label>
          <input className="input" value={seasonName} onChange={(e) => setSeasonName(e.target.value)} placeholder="Spring 2026" />
        </div>

        {/* Child Name (parent only) */}
        {role !== "coach" && (
          <div style={{ marginBottom: 16 }}>
            <label className="label">Child's Name</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input className="input" value={childName} onChange={(e) => setChildName(e.target.value)} placeholder="Alex" style={{ flex: 1 }} />
              <button type="button" onClick={() => setShowFlagPicker(true)} style={{
                padding: "10px 12px", border: `1.5px solid ${theme.border}`,
                background: "white", borderRadius: 10, cursor: "pointer",
                fontSize: 16, flexShrink: 0, display: "flex", alignItems: "center", gap: 4,
              }}>
                {childFlags.length > 0
                  ? childFlags.map((iso) => countryFlag(iso)).join("")
                  : "🌍"}
              </button>
            </div>
          </div>
        )}
        {showFlagPicker && (
          <FlagPicker
            selectedFlags={childFlags}
            onChange={setChildFlags}
            onClose={() => setShowFlagPicker(false)}
          />
        )}

        {/* Team Color */}
        <div style={{ marginBottom: 20 }}>
          <label className="label">Team Color</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {COLOR_PRESETS.map((c) => (
              <button key={c.hex} type="button" title={c.label}
                onClick={() => setColor(c.hex)}
                style={{
                  width: 32, height: 32, borderRadius: "50%", border: "none", cursor: "pointer",
                  background: c.hex, flexShrink: 0,
                  outline: color === c.hex ? `2px solid ${c.hex}` : "2px solid transparent",
                  outlineOffset: 3, transition: "outline 0.15s",
                }} />
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={onClose} className="btn btn-ghost" style={{ flex: 1, padding: "12px 16px" }}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" style={{ flex: 1, padding: "12px 16px", background: color }}>
            Save Changes
          </button>
        </div>
      </form>
    </div>
  );
}

// --- ENTRY COMPOSER ---
function EntryComposer({ season, players, onSave, onClose, brandColor, orgName, role, prefillDate, prefillOpponent }) {
  const composerPrimary = brandColor || theme.primary;
  const isCoach = role === "coach";
  const [entryType, setEntryType] = useState("game");
  const [text, setText] = useState("");
  const [opponent, setOpponent] = useState(prefillOpponent || "");
  const [venue, setVenue] = useState("");
  const [scoreHome, setScoreHome] = useState("");
  const [scoreAway, setScoreAway] = useState("");
  const [showGameData, setShowGameData] = useState(!!prefillOpponent);
  const [goals, setGoals] = useState("");
  const [assists, setAssists] = useState("");
  const [cleanSheet, setCleanSheet] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [consentShared, setConsentShared] = useState(!!orgName);
  const [entryDate, setEntryDate] = useState(prefillDate || new Date().toISOString().split("T")[0]);
  const [mood, setMood] = useState(null);
  const [highlights, setHighlights] = useState([]);
  const fileRef = useRef(null);
  const previewUrlRef = useRef(null);

  useEffect(() => {
    return () => { if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current); };
  }, []);

  const parentEntryTypes = [
    { id: "game", label: "Game", emoji: "🏟️" },
    { id: "practice", label: "Practice", emoji: "🔄" },
    { id: "tournament", label: "Tournament", emoji: "🏆" },
    { id: "event", label: "Event", emoji: "✈️" },
    { id: "sightseeing", label: "Sightseeing", emoji: "📍" },
    { id: "food", label: "Food", emoji: "🍕" },
    { id: "moment", label: "Moment", emoji: "⭐" },
  ];

  const coachEntryTypes = [
    { id: "game", label: "Game Recap", emoji: "🏟️" },
    { id: "practice", label: "Practice", emoji: "📋" },
    { id: "film", label: "Film Notes", emoji: "🎬" },
    { id: "player", label: "Player Note", emoji: "👤" },
    { id: "week", label: "Week Recap", emoji: "📓" },
    { id: "moment", label: "Moment", emoji: "⭐" },
  ];

  const entryTypes = isCoach ? coachEntryTypes : parentEntryTypes;

  const childName = players?.[0]?.name || null;
  const n = childName || "they";
  const nPoss = childName ? `${childName}'s` : "their";
  const nDid = childName ? `${childName} did` : "they did";
  const nHandle = childName ? `${childName} handle` : "they handle";
  const nTry = childName ? `${childName} try` : "they try";
  const nLearn = childName ? `${childName} learn` : "they learn";

  const parentPrompts = {
    game: [
      `What moment made you proudest of ${n} today?`,
      `What's something ${nDid} that surprised you?`,
      `How did ${nHandle} a tough moment?`,
      `What will you remember most about ${nPoss} game?`,
      `Did ${nTry} something new today?`,
    ],
    practice: [
      `What is ${n} working on getting better at?`,
      `What was ${nPoss} energy like today?`,
      `Did ${nLearn} something new?`,
      `What did the coach focus on today?`,
    ],
    tournament: [
      `How did ${nPoss} team come together today?`,
      `What was the atmosphere like?`,
      `What was ${nPoss} highlight of the day?`,
      `How did ${nHandle} the pressure?`,
    ],
    event: [
      `What made this event special for ${n}?`,
      `What will ${n} remember about this?`,
    ],
    sightseeing: [
      `What did ${n} discover?`,
      `What was the coolest thing you saw?`,
    ],
    food: [
      `What was ${nPoss} post-game meal?`,
      `What's the team's favorite spot?`,
    ],
    moment: [
      `Why does this moment matter?`,
      `What do you want to remember about ${n}?`,
      `What made you stop and smile?`,
    ],
  };

  const coachPrompts = {
    game: [
      "What was the turning point of the game?",
      "What adjustment made the biggest difference?",
      "Who stepped up when it mattered?",
      "What do you wish you'd done differently?",
      "What did you see that the stats won't show?",
    ],
    practice: [
      "What drill got the best response today?",
      "Who showed the most improvement?",
      "What do you need to clean up before game day?",
      "What was the energy like out there?",
    ],
    film: [
      "What did you see on film that you missed live?",
      "What pattern keeps showing up?",
      "What's the one thing to fix before next game?",
      "Who looked different on film than you expected?",
    ],
    player: [
      "What's this kid doing better than a month ago?",
      "What's holding them back right now?",
      "What conversation do you need to have with them?",
      "What role could they grow into?",
    ],
    week: [
      "What was the theme of this week?",
      "What are you most proud of from this week?",
      "What's the one thing to carry into next week?",
      "How's the locker room right now?",
    ],
    moment: [
      "Why does this moment matter to the season?",
      "What will you want to remember about this?",
      "What made you stop and take it in?",
    ],
  };

  const prompts = isCoach ? coachPrompts : parentPrompts;

  const [showPrompt, setShowPrompt] = useState(false);
  const [promptIdx, setPromptIdx] = useState(0);

  const getPrompt = () => {
    const pool = prompts[entryType] || prompts.moment;
    return pool[promptIdx % pool.length];
  };

  const shufflePrompt = () => {
    setPromptIdx((prev) => prev + 1);
    setShowPrompt(true);
  };

  const handlePhoto = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const url = URL.createObjectURL(file);
    previewUrlRef.current = url;
    setPhoto(file);
    setPhotoPreview(url);
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
    // With mood/highlights, text is optional — auto-generate if empty
    let finalText = text.trim();
    if (!finalText && (mood || highlights.length > 0)) {
      const parts = [];
      if (mood) {
        const moodLabel = GAME_MOODS.find((m) => m.id === mood)?.label || mood;
        parts.push(moodLabel + " day.");
      }
      if (highlights.length > 0) {
        const tags = highlights.map((h) => {
          const tag = [...(HIGHLIGHT_TAGS.parent || []), ...(HIGHLIGHT_TAGS.coach || [])].find((t) => t.id === h);
          return tag?.label || h;
        });
        parts.push(tags.join(", ") + ".");
      }
      finalText = parts.join(" ");
    }
    if (!finalText) return;
    onSave({
      entry_type: entryType,
      text: finalText,
      entry_date: entryDate,
      opponent: opponent || null,
      venue: venue || null,
      score_home: scoreHome !== "" ? parseInt(scoreHome) : null,
      score_away: scoreAway !== "" ? parseInt(scoreAway) : null,
      result: computeResult(),
      goals: goals !== "" ? parseInt(goals) : null,
      assists: assists !== "" ? parseInt(assists) : null,
      clean_sheet: cleanSheet || false,
      mood: mood || null,
      highlights: highlights.length > 0 ? highlights : null,
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
        background: "white", borderRadius: "18px 18px 0 0", padding: "24px 24px calc(24px + env(safe-area-inset-bottom, 0px))",
        width: "100%", maxWidth: 480, maxHeight: "90vh", overflow: "auto",
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
          <h2 style={{ fontFamily: fonts.display, fontSize: 22, fontWeight: 700 }}>New Entry</h2>
          <button onClick={onClose} style={{
            background: "none", border: "none", fontSize: 24, cursor: "pointer", color: theme.textMuted,
          }}>×</button>
        </div>

        {/* Date picker */}
        <div style={{ marginBottom: 16 }}>
          <label className="label">Date</label>
          <input
            type="date"
            className="input"
            value={entryDate}
            max={new Date().toISOString().split("T")[0]}
            onChange={(e) => setEntryDate(e.target.value)}
            style={{ fontSize: 15 }}
          />
        </div>

        {/* Entry Type */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 16 }}>
          {entryTypes.map((t) => (
            <button key={t.id} onClick={() => {
                setEntryType(t.id);
                // Clear game fields when switching to non-game types
                if (!["game", "tournament", "event"].includes(t.id)) {
                  setScoreHome(""); setScoreAway(""); setOpponent(""); setShowGameData(false);
                }
              }}
              style={{
                padding: "10px 4px", borderRadius: 10, border: `1.5px solid ${entryType === t.id ? composerPrimary : theme.border}`,
                background: entryType === t.id ? `${composerPrimary}10` : "white",
                cursor: "pointer", textAlign: "center", transition: "all 0.15s",
              }}>
              <div style={{ fontSize: 18 }}>{t.emoji}</div>
              <div style={{
                fontSize: 10, fontWeight: 600, marginTop: 2,
                color: entryType === t.id ? composerPrimary : theme.textMuted,
              }}>{t.label}</div>
            </button>
          ))}
        </div>

        {/* Quick Mood (Daylio-style — game/tournament entries only) */}
        {(entryType === "game" || entryType === "tournament") && (
          <div style={{ marginBottom: 16 }}>
            <label className="label">How'd it go?</label>
            <div style={{ display: "flex", gap: 6, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
              {GAME_MOODS.map((m) => (
                <QuickMoodTag key={m.id} label={m.label} icon={m.icon}
                  selected={mood === m.id} onClick={() => setMood(mood === m.id ? null : m.id)}
                  color={composerPrimary} />
              ))}
            </div>
          </div>
        )}

        {/* Highlight Tags (tap-based, Daylio-style) */}
        {(entryType === "game" || entryType === "tournament") && (
          <div style={{ marginBottom: 16 }}>
            <label className="label">Highlights</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {(HIGHLIGHT_TAGS[isCoach ? "coach" : "parent"] || []).map((tag) => {
                const sel = highlights.includes(tag.id);
                return (
                  <button key={tag.id} onClick={() => setHighlights((prev) =>
                    sel ? prev.filter((h) => h !== tag.id) : [...prev, tag.id]
                  )}
                    style={{
                      padding: "7px 12px", border: `1.5px solid ${sel ? composerPrimary : theme.border}`,
                      background: sel ? `${composerPrimary}10` : "white",
                      borderRadius: 20, cursor: "pointer", fontSize: 12, fontWeight: sel ? 600 : 400,
                      color: sel ? composerPrimary : theme.textMuted,
                      transition: "all 0.15s", display: "flex", alignItems: "center", gap: 4,
                    }}>
                    <span style={{ fontSize: 13 }}>{tag.icon}</span>
                    {tag.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* The Line */}
        <div style={{ marginBottom: 16 }}>
          {showPrompt && (
            <div style={{
              background: `${composerPrimary}08`, border: `1px solid ${composerPrimary}15`,
              borderRadius: 10, padding: "10px 14px", marginBottom: 8,
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{ fontSize: 16 }}>💡</span>
              <span style={{ flex: 1, fontSize: 14, color: composerPrimary, fontStyle: "italic", lineHeight: 1.4 }}>
                {getPrompt()}
              </span>
              <button onClick={shufflePrompt} style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: 14, color: theme.textMuted, padding: "2px 6px",
              }} title="Another prompt">↻</button>
              <button onClick={() => setShowPrompt(false)} style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: 14, color: theme.textMuted, padding: "2px 6px",
              }}>×</button>
            </div>
          )}
          <textarea
            className="input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={mood || highlights.length > 0
              ? "Add more details (optional)..."
              : isCoach ? "What happened today..." : "Write the moment..."}
            maxLength={isCoach ? 2000 : 500}
            rows={isCoach ? 6 : 3}
            style={{ resize: "none", fontSize: 16, lineHeight: 1.5 }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
            {!showPrompt ? (
              <button onClick={shufflePrompt} style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: 12, color: theme.textMuted, padding: 0,
              }}>
                💡 Need inspiration?
              </button>
            ) : <span />}
            <span style={{ fontSize: 11, color: theme.textLight }}>{text.length}/{isCoach ? 2000 : 500}</span>
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
              <button onClick={() => { if (previewUrlRef.current) { URL.revokeObjectURL(previewUrlRef.current); previewUrlRef.current = null; } setPhoto(null); setPhotoPreview(null); }}
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
              📷 {isCoach ? "Add Photo (optional)" : "Add Photo"}
            </button>
          )}
        </div>

        {/* Optional Game Data Toggle */}
        {(entryType === "game" || entryType === "tournament" || entryType === "event") && (
          <>
            <button onClick={() => setShowGameData(!showGameData)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: 13, fontWeight: 600, color: composerPrimary,
                marginBottom: showGameData ? 12 : 0,
                display: "flex", alignItems: "center", gap: 6,
              }}>
              {showGameData ? "▾" : "▸"} {entryType === "event" ? "Event Details" : "Game Details"} (optional)
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

                {/* Player stats */}
                {!isCoach && (
                  <div style={{ marginTop: 12, borderTop: `1px solid ${theme.border}`, paddingTop: 12 }}>
                    <label className="label">Player Stats (optional)</label>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <div style={{ flex: 1 }}>
                        <input className="input" value={goals} onChange={(e) => setGoals(e.target.value)}
                          placeholder="Goals" type="number" min="0" style={{ background: "white", textAlign: "center" }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <input className="input" value={assists} onChange={(e) => setAssists(e.target.value)}
                          placeholder="Assists" type="number" min="0" style={{ background: "white", textAlign: "center" }} />
                      </div>
                      <button type="button" onClick={() => setCleanSheet(!cleanSheet)}
                        style={{
                          flex: 1, padding: "10px 8px", cursor: "pointer",
                          border: `1.5px solid ${cleanSheet ? composerPrimary : theme.border}`,
                          background: cleanSheet ? `${composerPrimary}10` : "white",
                          color: cleanSheet ? composerPrimary : theme.textMuted,
                          fontSize: 12, fontWeight: cleanSheet ? 600 : 400,
                          borderRadius: 8, transition: "all 0.15s",
                        }}>
                        Clean Sheet
                      </button>
                    </div>
                  </div>
                )}
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
                Your team can feature this entry
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
          disabled={!text.trim() && !mood && highlights.length === 0}
          style={{
            width: "100%", padding: "14px 24px", fontSize: 16,
            opacity: (text.trim() || mood || highlights.length > 0) ? 1 : 0.5,
            background: composerPrimary,
          }}>
          Save Entry ✓
        </button>
      </div>
    </div>
  );
}

// --- ON THIS DAY (Day One-style memory resurfacing) ---
function OnThisDay({ entries, playerName, brandColor, onEntryTap }) {
  const color = brandColor || theme.primary;
  const today = new Date();
  const month = today.getMonth();
  const day = today.getDate();

  // Find entries from previous years on this date (or within 1 day)
  const memories = entries.filter((e) => {
    if (!e.entry_date) return false;
    const d = new Date(e.entry_date);
    if (d.getFullYear() === today.getFullYear()) return false;
    return d.getMonth() === month && Math.abs(d.getDate() - day) <= 1;
  });

  if (memories.length === 0) return null;

  const memory = memories[0];
  const memoryDate = new Date(memory.entry_date);
  const yearsAgo = today.getFullYear() - memoryDate.getFullYear();
  const dateStr = memoryDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  return (
    <div onClick={() => onEntryTap?.(memory)} style={{
      background: `linear-gradient(135deg, ${color}08, ${color}04)`,
      border: `1px solid ${color}20`,
      borderRadius: 12, padding: "14px 16px", marginBottom: 12, cursor: "pointer",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 16 }}>📅</span>
        <span style={{
          fontSize: 12, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: 0.8,
        }}>
          {yearsAgo === 1 ? "One year ago today" : `${yearsAgo} years ago today`}
        </span>
      </div>
      <p style={{
        fontSize: 14, color: theme.text, lineHeight: 1.5, margin: "0 0 6px",
        fontStyle: "italic", display: "-webkit-box", WebkitLineClamp: 2,
        WebkitBoxOrient: "vertical", overflow: "hidden",
      }}>
        "{memory.text}"
      </p>
      <span style={{ fontSize: 11, color: theme.textMuted }}>{dateStr}</span>
    </div>
  );
}

// --- SCHEDULE IMPORT & UPCOMING GAMES ---
function parseICS(text) {
  const events = [];
  const lines = text.replace(/\r\n /g, "").split(/\r?\n/);
  let current = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { current = {}; continue; }
    if (line === "END:VEVENT" && current) {
      if (current.dtstart) {
        events.push({
          id: current.uid || String(Math.random()),
          date: current.dtstart,
          summary: current.summary || "Game",
          location: current.location || "",
        });
      }
      current = null;
      continue;
    }
    if (!current) continue;
    const colonIdx = line.indexOf(":");
    if (colonIdx < 0) continue;
    const keyFull = line.slice(0, colonIdx);
    const val = line.slice(colonIdx + 1);
    const key = keyFull.split(";")[0].toUpperCase();
    if (key === "DTSTART") {
      // Handle both 20260315T100000 and 20260315T100000Z and 20260315 formats
      const clean = val.replace(/[Z]/g, "");
      if (clean.length === 8) {
        current.dtstart = `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`;
      } else if (clean.length >= 15) {
        current.dtstart = `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`;
        current.time = `${clean.slice(9, 11)}:${clean.slice(11, 13)}`;
      }
    }
    if (key === "SUMMARY") current.summary = val;
    if (key === "LOCATION") current.location = val;
    if (key === "UID") current.uid = val;
  }
  return events.sort((a, b) => a.date.localeCompare(b.date));
}

function parseScheduleCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].toLowerCase().split(",").map((h) => h.trim().replace(/"/g, ""));
  const dateCol = headers.findIndex((h) => /date/.test(h));
  const summaryCol = headers.findIndex((h) => /summary|title|event|opponent|team|description/.test(h));
  const locationCol = headers.findIndex((h) => /location|venue|field|where/.test(h));
  const timeCol = headers.findIndex((h) => /^time$|start.?time/.test(h));

  if (dateCol < 0) return [];

  return lines.slice(1).map((line, i) => {
    const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const rawDate = cols[dateCol] || "";
    // Try to parse various date formats
    let date = "";
    const d = new Date(rawDate);
    if (!isNaN(d.getTime())) {
      date = d.toISOString().split("T")[0];
    } else {
      date = rawDate;
    }
    return {
      id: `csv-${i}`,
      date,
      summary: cols[summaryCol] || "Game",
      location: cols[locationCol] || "",
      time: cols[timeCol] || "",
    };
  }).filter((e) => e.date).sort((a, b) => a.date.localeCompare(b.date));
}

function ScheduleImportModal({ onImport, onClose, brandColor }) {
  const color = brandColor || theme.primary;
  const fileRef = useRef(null);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const [manualEvents, setManualEvents] = useState([{ date: "", summary: "", location: "" }]);
  const [mode, setMode] = useState("file"); // "file" or "manual"

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setError("");
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      let events;
      if (file.name.endsWith(".ics") || file.name.endsWith(".ical")) {
        events = parseICS(text);
      } else if (file.name.endsWith(".csv")) {
        events = parseScheduleCSV(text);
      } else {
        // Try ICS first, then CSV
        events = parseICS(text);
        if (events.length === 0) events = parseScheduleCSV(text);
      }
      if (events.length === 0) {
        setError("No events found. Try a .ics or .csv file with a date column.");
        return;
      }
      setPreview(events);
    };
    reader.readAsText(file);
  };

  const addManualRow = () => {
    setManualEvents((prev) => [...prev, { date: "", summary: "", location: "" }]);
  };

  const updateManualRow = (i, field, val) => {
    setManualEvents((prev) => prev.map((e, j) => j === i ? { ...e, [field]: val } : e));
  };

  const handleManualImport = () => {
    const valid = manualEvents.filter((e) => e.date);
    if (valid.length === 0) return;
    onImport(valid.map((e, i) => ({ ...e, id: `manual-${i}` })));
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 100,
    }}>
      <div className="slide-up" style={{
        background: "white", borderRadius: "18px 18px 0 0",
        padding: "24px 24px calc(24px + env(safe-area-inset-bottom, 0px))",
        width: "100%", maxWidth: 480, maxHeight: "85vh", overflow: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
          <h2 style={{ fontFamily: fonts.display, fontSize: 22, fontWeight: 700 }}>Import Schedule</h2>
          <button onClick={onClose} style={{
            background: "none", border: "none", fontSize: 24, cursor: "pointer", color: theme.textMuted,
          }}>×</button>
        </div>

        <p style={{ fontSize: 13, color: theme.textMuted, marginBottom: 16, lineHeight: 1.5 }}>
          Import from TeamSnap, Google Calendar, or any .ics/.csv file. Or add games manually.
        </p>

        {/* Mode tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {[{ id: "file", label: "Import File" }, { id: "manual", label: "Add Manually" }].map((m) => (
            <button key={m.id} onClick={() => setMode(m.id)}
              style={{
                flex: 1, padding: "10px 12px", border: `1.5px solid ${mode === m.id ? color : theme.border}`,
                background: mode === m.id ? `${color}10` : "white",
                color: mode === m.id ? color : theme.textMuted,
                fontSize: 14, fontWeight: mode === m.id ? 600 : 400,
                borderRadius: 8, cursor: "pointer", transition: "all 0.15s",
              }}>
              {m.label}
            </button>
          ))}
        </div>

        {mode === "file" && (
          <>
            <input ref={fileRef} type="file" accept=".ics,.ical,.csv,.txt"
              onChange={handleFile} style={{ display: "none" }} />
            {!preview ? (
              <button onClick={() => fileRef.current?.click()}
                style={{
                  width: "100%", padding: 20, borderRadius: 12,
                  border: `2px dashed ${theme.border}`, background: theme.borderLight,
                  cursor: "pointer", color: theme.textMuted, fontSize: 14,
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                }}>
                <span style={{ fontSize: 24 }}>📁</span>
                <span>Choose .ics or .csv file</span>
                <span style={{ fontSize: 11, color: theme.textLight }}>
                  Works with TeamSnap, Google Calendar, Apple Calendar
                </span>
              </button>
            ) : (
              <div>
                <div style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12,
                }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: theme.text }}>
                    {preview.length} game{preview.length !== 1 ? "s" : ""} found
                  </span>
                  <button onClick={() => { setPreview(null); setError(""); }}
                    style={{ background: "none", border: "none", fontSize: 13, color: color, cursor: "pointer", fontWeight: 600 }}>
                    Choose different file
                  </button>
                </div>
                <div style={{
                  maxHeight: 200, overflow: "auto", border: `1px solid ${theme.border}`,
                  borderRadius: 8, marginBottom: 16,
                }}>
                  {preview.map((ev, i) => (
                    <div key={i} style={{
                      padding: "10px 14px", borderBottom: i < preview.length - 1 ? `1px solid ${theme.borderLight}` : "none",
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                    }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>{ev.summary}</div>
                        <div style={{ fontSize: 11, color: theme.textMuted }}>
                          {new Date(ev.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                          {ev.time ? ` at ${ev.time}` : ""}
                          {ev.location ? ` — ${ev.location}` : ""}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <button onClick={() => onImport(preview)}
                  className="btn btn-primary"
                  style={{ width: "100%", padding: "14px 24px", fontSize: 16, background: color }}>
                  Import {preview.length} Game{preview.length !== 1 ? "s" : ""}
                </button>
              </div>
            )}
          </>
        )}

        {mode === "manual" && (
          <div>
            {manualEvents.map((ev, i) => (
              <div key={i} style={{
                display: "flex", gap: 8, marginBottom: 8, alignItems: "center",
              }}>
                <input type="date" value={ev.date}
                  onChange={(e) => updateManualRow(i, "date", e.target.value)}
                  className="input" style={{ flex: 1, fontSize: 13, padding: "10px 8px" }} />
                <input type="text" placeholder="vs Opponent" value={ev.summary}
                  onChange={(e) => updateManualRow(i, "summary", e.target.value)}
                  className="input" style={{ flex: 1.5, fontSize: 13, padding: "10px 8px" }} />
                <input type="text" placeholder="Location" value={ev.location}
                  onChange={(e) => updateManualRow(i, "location", e.target.value)}
                  className="input" style={{ flex: 1, fontSize: 13, padding: "10px 8px" }} />
              </div>
            ))}
            <button onClick={addManualRow}
              style={{
                background: "none", border: `1px dashed ${theme.border}`,
                borderRadius: 8, padding: "8px 14px", cursor: "pointer",
                fontSize: 13, color: theme.textMuted, width: "100%", marginBottom: 16,
              }}>
              + Add another game
            </button>
            <button onClick={handleManualImport}
              className="btn btn-primary"
              disabled={!manualEvents.some((e) => e.date)}
              style={{
                width: "100%", padding: "14px 24px", fontSize: 16,
                background: manualEvents.some((e) => e.date) ? color : theme.border,
                opacity: manualEvents.some((e) => e.date) ? 1 : 0.5,
              }}>
              Save Schedule
            </button>
          </div>
        )}

        {error && (
          <div style={{
            background: "#FEE2E2", color: "#991B1B", padding: "10px 14px",
            fontSize: 13, marginTop: 12, borderLeft: "3px solid #991B1B",
          }}>{error}</div>
        )}
      </div>
    </div>
  );
}

function UpcomingGames({ schedule, entries, brandColor, onLogGame, onOpenSchedule }) {
  const color = brandColor || theme.primary;
  const today = new Date().toISOString().split("T")[0];

  // Find next upcoming games
  const upcoming = schedule
    .filter((g) => g.date >= today)
    .slice(0, 3);

  // Find past games with no entry logged
  const missedGames = schedule
    .filter((g) => {
      if (g.date >= today) return false;
      // Check if there's an entry within 1 day of the game
      return !entries.some((e) => {
        const diff = Math.abs(new Date(e.entry_date) - new Date(g.date));
        return diff < 2 * 86400000; // within 2 days
      });
    })
    .slice(-2); // last 2 missed

  if (upcoming.length === 0 && missedGames.length === 0) return null;

  return (
    <div style={{ marginBottom: 12 }}>
      {/* Missed game nudge */}
      {missedGames.length > 0 && (
        <div style={{
          background: "#FEF3C7", border: "1px solid #FCD34D",
          borderRadius: 12, padding: "12px 14px", marginBottom: 8,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 14 }}>📝</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#92400E", textTransform: "uppercase", letterSpacing: 0.5 }}>
              Don't forget
            </span>
          </div>
          {missedGames.map((g) => (
            <div key={g.id} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "6px 0",
            }}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#78350F" }}>{g.summary}</span>
                <span style={{ fontSize: 11, color: "#92400E", marginLeft: 8 }}>
                  {new Date(g.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                </span>
              </div>
              <button onClick={() => onLogGame(g)}
                style={{
                  background: "#92400E", color: "white", border: "none",
                  borderRadius: 6, padding: "6px 12px", fontSize: 12,
                  fontWeight: 600, cursor: "pointer",
                }}>
                Log it
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upcoming games */}
      {upcoming.length > 0 && (
        <div style={{
          background: `${color}06`, border: `1px solid ${color}15`,
          borderRadius: 12, padding: "12px 14px",
        }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 14 }}>📅</span>
              <span style={{ fontSize: 12, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Coming up
              </span>
            </div>
            {onOpenSchedule && (
              <button onClick={onOpenSchedule} style={{
                background: "none", border: "none", fontSize: 12, color, cursor: "pointer", fontWeight: 600,
              }}>
                Full schedule →
              </button>
            )}
          </div>
          {upcoming.map((g, i) => {
            const gameDate = new Date(g.date + "T12:00:00");
            const daysUntil = Math.ceil((gameDate - new Date()) / 86400000);
            const isToday = g.date === today;
            const isTomorrow = daysUntil === 1;
            return (
              <div key={g.id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "8px 0",
                borderTop: i > 0 ? `1px solid ${color}10` : "none",
              }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: theme.text }}>{g.summary}</div>
                  <div style={{ fontSize: 11, color: theme.textMuted }}>
                    {gameDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                    {g.time ? ` at ${g.time}` : ""}
                    {g.location ? ` — ${g.location}` : ""}
                  </div>
                </div>
                {isToday ? (
                  <span style={{
                    background: color, color: "white", padding: "4px 10px",
                    borderRadius: 6, fontSize: 11, fontWeight: 700,
                  }}>TODAY</span>
                ) : isTomorrow ? (
                  <span style={{
                    background: `${color}15`, color, padding: "4px 10px",
                    borderRadius: 6, fontSize: 11, fontWeight: 600,
                  }}>Tomorrow</span>
                ) : (
                  <span style={{ fontSize: 11, color: theme.textMuted }}>
                    {daysUntil} day{daysUntil !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// --- QUICK ENTRY MODE (Daylio-style tap-based) ---
function QuickMoodTag({ label, icon, selected, onClick, color }) {
  return (
    <button onClick={onClick} style={{
      padding: "10px 14px", border: `2px solid ${selected ? color : theme.border}`,
      background: selected ? `${color}10` : "white",
      borderRadius: 10, cursor: "pointer", display: "flex", flexDirection: "column",
      alignItems: "center", gap: 4, transition: "all 0.15s", minWidth: 60,
    }}>
      <span style={{ fontSize: 22 }}>{icon}</span>
      <span style={{
        fontSize: 10, fontWeight: selected ? 700 : 500,
        color: selected ? color : theme.textMuted,
      }}>{label}</span>
    </button>
  );
}

const GAME_MOODS = [
  { id: "amazing", icon: "🔥", label: "Amazing" },
  { id: "good", icon: "😊", label: "Good" },
  { id: "okay", icon: "😐", label: "Okay" },
  { id: "tough", icon: "😤", label: "Tough" },
  { id: "rough", icon: "😔", label: "Rough" },
];

const HIGHLIGHT_TAGS = {
  parent: [
    { id: "first-goal", label: "First goal", icon: "⚽" },
    { id: "great-effort", label: "Great effort", icon: "💪" },
    { id: "big-save", label: "Big save", icon: "🧤" },
    { id: "team-player", label: "Team player", icon: "🤝" },
    { id: "tough-loss-good-attitude", label: "Tough loss, good attitude", icon: "💚" },
    { id: "breakthrough", label: "Breakthrough", icon: "⭐" },
    { id: "car-ride-stories", label: "Car ride stories", icon: "🚗" },
    { id: "fun-day", label: "Fun day", icon: "😂" },
  ],
  coach: [
    { id: "tactical-shift", label: "Tactical shift", icon: "📋" },
    { id: "player-stepped-up", label: "Player stepped up", icon: "⭐" },
    { id: "defense-solid", label: "Defense solid", icon: "🛡️" },
    { id: "set-piece-worked", label: "Set piece worked", icon: "🎯" },
    { id: "team-chemistry", label: "Team chemistry", icon: "🤝" },
    { id: "gutsy-win", label: "Gutsy win", icon: "🔥" },
    { id: "learning-moment", label: "Learning moment", icon: "📖" },
    { id: "substitution-impact", label: "Sub impact", icon: "🔄" },
  ],
};

// --- TIMELINE ENTRY CARD ---
function EntryCard({ entry, players, onShare, onDelete, brandColor }) {
  const typeColors = {
    game: entry.result === "win" ? theme.win : entry.result === "loss" ? theme.loss : theme.draw,
    practice: theme.practice,
    tournament: theme.tournament,
    event: theme.tournament,
    sightseeing: "#6B7280",
    food: "#C2410C",
    moment: theme.moment,
    film: "#7C3AED",
    player: "#0369A1",
    week: "#92400E",
  };

  const typeEmojis = { game: "🏟️", practice: "🔄", tournament: "🏆", event: "✈️", sightseeing: "📍", food: "🍕", moment: "⭐", film: "🎬", player: "👤", week: "📓" };
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
          {onDelete && (
            <button
              onClick={() => onDelete(entry.id)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                color: theme.textLight,
                padding: "2px 4px",
                lineHeight: 1,
                transition: "color 0.15s",
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = "#dc2626"}
              onMouseLeave={(e) => e.currentTarget.style.color = theme.textLight}
              title="Delete entry"
            >
              🗑
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

      {/* Player Stats */}
      {(entry.goals > 0 || entry.assists > 0 || entry.clean_sheet) && (
        <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
          {entry.goals > 0 && (
            <span style={{
              fontSize: 12, padding: "3px 10px", borderRadius: 10,
              background: `${theme.win}12`, color: theme.win, fontWeight: 600,
            }}>
              ⚽ {entry.goals} {entry.goals === 1 ? "goal" : "goals"}
            </span>
          )}
          {entry.assists > 0 && (
            <span style={{
              fontSize: 12, padding: "3px 10px", borderRadius: 10,
              background: `${theme.accent}12`, color: theme.accent, fontWeight: 600,
            }}>
              🎯 {entry.assists} {entry.assists === 1 ? "assist" : "assists"}
            </span>
          )}
          {entry.clean_sheet && (
            <span style={{
              fontSize: 12, padding: "3px 10px", borderRadius: 10,
              background: `${theme.primary}12`, color: theme.primary, fontWeight: 600,
            }}>
              🧤 Clean sheet
            </span>
          )}
        </div>
      )}

      {/* Photo */}
      {(entry.photoPreview || entry.photoData) && (
        <img src={entry.photoPreview || entry.photoData} alt="" style={{
          width: "100%", height: 220, objectFit: "cover", objectPosition: "center 60%", borderRadius: 10, marginBottom: 10,
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
  const games = entries.filter((e) => e.entry_type === "game" || e.entry_type === "tournament" || e.entry_type === "event");
  const wins = games.filter((e) => e.result === "win").length;
  const losses = games.filter((e) => e.result === "loss").length;
  const draws = games.filter((e) => e.result === "draw").length;
  const practices = entries.filter((e) => e.entry_type === "practice").length;
  const photos = entries.filter((e) => e.photoPreview || e.photoData || e.photo_url).length;

  // Streak: consecutive weeks (Sun-Sat) with at least one entry, counting back from the current week
  const streak = (() => {
    if (entries.length === 0) return 0;
    const now = new Date();
    const getWeekKey = (d) => {
      const date = new Date(d);
      const day = date.getDay();
      const sun = new Date(date);
      sun.setDate(sun.getDate() - day);
      return `${sun.getFullYear()}-${sun.getMonth()}-${sun.getDate()}`;
    };
    const weeks = new Set(entries.map((e) => getWeekKey(e.entry_date)));
    let count = 0;
    const check = new Date(now);
    // Start from current week, walk backwards
    for (let i = 0; i < 52; i++) {
      if (weeks.has(getWeekKey(check))) {
        count++;
        check.setDate(check.getDate() - 7);
      } else {
        break;
      }
    }
    return count;
  })();

  // Book page count from pagination algorithm
  const bookPages = entries.length > 0 ? paginateEntries(entries).length + 3 : 0; // +3 for title, summary, closing pages
  const bookMessage = bookPages === 0 ? null
    : bookPages < 8 ? "Keep going"
    : bookPages < 16 ? "Building something special"
    : bookPages < 30 ? "This is going to be a great book"
    : "A season to remember";

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        display: "flex", gap: 6, overflowX: "auto",
        padding: "2px 0",
      }}>
        {[
          { label: "Entries", value: entries.length, color: brandColor || theme.primary },
          { label: "W-L-D", value: `${wins}-${losses}-${draws}`, color: theme.win },
          { label: "Streak", value: streak > 0 ? `${streak}🔥` : "0", color: "#F59E0B" },
          { label: "Photos", value: photos, color: theme.accent },
          { label: "Book", value: `${bookPages} pg`, color: theme.tournament },
        ].map((stat) => (
          <div key={stat.label} style={{
            flex: "1 0 auto", padding: "10px 14px", borderRadius: 10,
            background: `${stat.color}08`, border: `1px solid ${stat.color}20`,
            textAlign: "center", minWidth: 65,
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
      {bookMessage && (
        <div style={{
          fontSize: 12, color: theme.textMuted, fontStyle: "italic",
          textAlign: "center", marginTop: 8, fontFamily: fonts.display,
        }}>
          {bookMessage}
        </div>
      )}
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

  const games = sortedEntries.filter((e) => e.entry_type === "game" || e.entry_type === "tournament" || e.entry_type === "event");
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
    const isSinglePhoto = pageEntries.length === 1 && hasAnyPhoto;

    return (
      <div style={{
        width: "100%", height: "100%", background: "#FFFDF8",
        display: "flex", flexDirection: "column",
        justifyContent: isTextOnly ? "center" : "flex-start",
        padding: isSinglePhoto ? 0 : isTextOnly ? 56 : 24,
      }}>
        {pageEntries.map((entry, i) => {
          const hasScore = entry.score_home !== null && entry.score_away !== null;
          const resultColors = { win: theme.win, loss: theme.loss, draw: theme.draw };
          const resultLabels = { win: "W", loss: "L", draw: "D" };
          const photo = entry.photoPreview || entry.photoData;

          // Single photo entry: photo-first, full bleed layout
          if (isSinglePhoto && photo) {
            return (
              <div key={entry.id} style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: "16px 24px" }}>
                <img src={photo} alt="" style={{
                  maxWidth: "90%", flex: 1, objectFit: "cover", objectPosition: "center 60%",
                  display: "block", minHeight: 0, margin: "0 auto",
                }} />
                <div style={{ padding: "16px 0 8px", textAlign: "center" }}>
                  <div style={{ display: "flex", justifyContent: "center", alignItems: "baseline", gap: 12, marginBottom: 6 }}>
                    <span style={{
                      fontFamily: fonts.mono, fontSize: 7, fontWeight: 500,
                      color: theme.textLight, textTransform: "uppercase", letterSpacing: 2,
                    }}>{entry.entry_type}{entry.opponent ? ` vs ${entry.opponent}` : ""}</span>
                    <span style={{ fontFamily: fonts.mono, fontSize: 8, color: theme.textLight }}>
                      {formatDate(entry.entry_date)}
                    </span>
                  </div>
                  {hasScore && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{
                        fontFamily: fonts.mono, fontSize: 22, fontWeight: 700,
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
                  {entry.text && (
                    <p style={{
                      fontFamily: fonts.display, fontSize: 13, lineHeight: 1.5,
                      color: "#2A2A2A", fontStyle: "italic", textAlign: "center",
                    }}>
                      &ldquo;{entry.text}&rdquo;
                    </p>
                  )}
                </div>
              </div>
            );
          }

          // Multi-entry or text-only layout
          return (
            <div key={entry.id} style={{
              textAlign: "center",
              ...(i > 0 ? { paddingTop: 18, marginTop: 18, borderTop: `1px solid ${bookPrimary}0F` } : {}),
            }}>
              <div style={{ display: "flex", justifyContent: "center", alignItems: "baseline", gap: 12, marginBottom: 8 }}>
                <span style={{
                  fontFamily: fonts.mono, fontSize: 7, fontWeight: 500,
                  color: theme.textLight, textTransform: "uppercase", letterSpacing: 2,
                }}>{entry.entry_type}</span>
                <span style={{ fontFamily: fonts.mono, fontSize: 8, color: theme.textLight }}>
                  {formatDate(entry.entry_date)}
                </span>
              </div>

              {hasScore && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 10 }}>
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
                <p style={{ fontFamily: fonts.body, fontSize: 10, color: theme.textMuted, marginBottom: 8, textAlign: "center" }}>
                  vs {entry.opponent}
                </p>
              )}

              {photo && (
                <img src={photo} alt="" style={{
                  maxWidth: "90%", height: 320, objectFit: "cover", objectPosition: "center 60%",
                  marginBottom: 10, display: "block", margin: "0 auto 10px",
                }} />
              )}

              {entry.text && (
                <p style={{
                  fontFamily: fonts.display, fontSize: isTextOnly ? 15 : 12, lineHeight: 1.6,
                  color: "#2A2A2A", fontStyle: "italic", textAlign: "center",
                }}>
                  &ldquo;{entry.text}&rdquo;
                </p>
              )}

              {entry.venue && (
                <p style={{ fontFamily: fonts.body, fontSize: 8, color: theme.textLight, marginTop: 6, textAlign: "center" }}>
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
    const playerName = players[0]?.name;
    const closingLine = playerName ? `This was ${playerName}'s.` : "This was yours.";
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
          Every season tells a story.<br />{closingLine}
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

  const RENDER_W = 544;  // 7.75" at ~70ppi
  const RENDER_H = 544;  // 7.75" square
  const CONTAINER_W = 290;
  const CONTAINER_H = 290;
  const scale = CONTAINER_W / RENDER_W;

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
          width: CONTAINER_W, height: CONTAINER_H,
          overflow: "hidden", borderRadius: 4,
          boxShadow: "0 16px 64px rgba(0,0,0,0.5)",
          marginBottom: 16, position: "relative",
          background: "#FFFDF8",
        }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div style={{
          width: RENDER_W, height: RENDER_H,
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
          Order Book $39
        </button>
      </div>
    </div>
  );
}

// --- ORDER FLOW ---
function OrderFlow({ entries, team, season, players, onClose, onStartNewSeason }) {
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
    return { name: "", email: "", street: "", city: "", state: "", zip: "", phone: "" };
  });

  const [orderStatus, setOrderStatus] = useState(() => {
    const saved = localStorage.getItem("teamSeasonOrder");
    if (saved) {
      try { return JSON.parse(saved).status || "idle"; } catch (e) {}
    }
    return "idle";
  });

  const [trackingInfo, setTrackingInfo] = useState(null);
  const [statusChecking, setStatusChecking] = useState(false);
  const [errors, setErrors] = useState({});

  // Persist order state
  useEffect(() => {
    const saved = localStorage.getItem("teamSeasonOrder");
    let existing = {};
    try { existing = JSON.parse(saved) || {}; } catch {}
    localStorage.setItem("teamSeasonOrder", JSON.stringify({ ...existing, shipping, status: orderStatus }));
  }, [shipping, orderStatus]);

  // Check order status from Lulu via our API
  const checkOrderStatus = async () => {
    const saved = localStorage.getItem("teamSeasonOrder");
    let sessionId = null;
    try { sessionId = JSON.parse(saved)?.sessionId; } catch {}
    if (!sessionId) return;

    setStatusChecking(true);
    try {
      const res = await fetch(`/api/order-status?sessionId=${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.status && data.status !== "processing") {
          setOrderStatus(data.status);
        }
        if (data.trackingUrl || data.trackingNumber) {
          setTrackingInfo({ url: data.trackingUrl, number: data.trackingNumber });
        }
      }
    } catch (e) {
      console.warn("Status check failed:", e);
    }
    setStatusChecking(false);
  };

  // Auto-check status when showing ordered state
  useEffect(() => {
    if (step === "status" && (orderStatus === "ordered" || orderStatus === "printing")) {
      checkOrderStatus();
    }
  }, [step]);

  const validateShipping = () => {
    const errs = {};
    if (!shipping.name.trim()) errs.name = "Name is required";
    if (!shipping.email.trim() || !/\S+@\S+\.\S+/.test(shipping.email)) errs.email = "Valid email is required";
    if (!shipping.street.trim()) errs.street = "Street address is required";
    if (!shipping.city.trim()) errs.city = "City is required";
    if (!shipping.state.trim() || shipping.state.trim().length !== 2) errs.state = "Two-letter state code";
    if (!shipping.zip.trim() || !/^\d{5}(-\d{4})?$/.test(shipping.zip.trim())) errs.zip = "Valid ZIP code";
    if (!shipping.phone.trim() || !/^\d{10}$/.test(shipping.phone.trim().replace(/\D/g, ''))) errs.phone = "10-digit phone number";
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
        body: JSON.stringify({ bookDataUrl, shipping: { ...shipping, phone: shipping.phone.replace(/\D/g, '') } }),
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
                <span style={{ fontSize: 14, fontWeight: 500 }}>7.5" Square Hardcover</span>
              </div>
              <div style={{ height: 1, background: theme.border, margin: "12px 0" }} />
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 16, fontWeight: 600 }}>Total</span>
                <span style={{ fontFamily: fonts.mono, fontSize: 16, fontWeight: 700, color: orderPrimary }}>$39 + shipping</span>
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
            {shippingField("phone", "Phone", "(555) 123-4567", { type: "tel" })}
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
              <p style={{ fontSize: 13, color: theme.textMuted }}>{shipping.phone}</p>
            </div>
            <div className="card" style={{ marginBottom: 16 }}>
              <p className="label">Book</p>
              <p style={{ fontSize: 14 }}>{team.name} — {season.name}</p>
              <p style={{ fontSize: 13, color: theme.textMuted }}>{totalBookPages} pages, {sortedEntries.length} entries</p>
              <div style={{ height: 1, background: theme.border, margin: "10px 0" }} />
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 600 }}>Total</span>
                <span style={{ fontFamily: fonts.mono, fontWeight: 700, color: orderPrimary }}>$39 + shipping</span>
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
                    const activeIdx = statusSteps.findIndex((ss) => ss.key === orderStatus);
                    const active = activeIdx >= i;
                    const isCurrent = activeIdx === i;
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
                        <div style={{ flex: 1 }}>
                          <span style={{
                            fontSize: 14, fontWeight: active ? 600 : 400,
                            color: active ? theme.text : theme.textMuted,
                          }}>{s.label}</span>
                          {isCurrent && s.key === "ordered" && (
                            <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>
                              Expect 5–10 business days
                            </div>
                          )}
                          {isCurrent && s.key === "shipped" && trackingInfo?.url && (
                            <a href={trackingInfo.url} target="_blank" rel="noopener noreferrer" style={{
                              fontSize: 12, color: orderPrimary, display: "block", marginTop: 2,
                            }}>
                              Track your package →
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Check Status + Extra Copy */}
                <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                  <button
                    className="btn btn-ghost"
                    onClick={checkOrderStatus}
                    disabled={statusChecking}
                    style={{ flex: 1 }}
                  >
                    {statusChecking ? "Checking..." : "Check Status"}
                  </button>
                  <button className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }}>
                    Close
                  </button>
                </div>

                {/* Extra copy upsell */}
                {orderStatus === "ordered" && (
                  <div style={{
                    marginTop: 16, padding: "14px 16px", background: `${orderPrimary}08`,
                    border: `1px solid ${orderPrimary}15`, borderRadius: 10, textAlign: "center",
                  }}>
                    <div style={{ fontSize: 13, color: theme.textMuted, marginBottom: 4 }}>
                      Want a copy for the grandparents?
                    </div>
                    <div style={{ fontSize: 12, color: theme.textLight }}>
                      Same book, same memories — coming soon.
                    </div>
                  </div>
                )}

                {/* Start Next Season */}
                {onStartNewSeason && (
                  <div style={{ marginTop: 20 }}>
                    <div style={{
                      height: 1, background: theme.border, marginBottom: 20,
                    }} />
                    <div style={{ textAlign: "center" }}>
                      <div style={{
                        fontSize: 13, color: theme.textMuted, marginBottom: 12,
                        fontWeight: 500,
                      }}>
                        Season wrapped. Ready for the next one?
                      </div>
                      <button
                        onClick={() => { onClose(); onStartNewSeason(); }}
                        style={{
                          padding: "12px 24px", border: "none",
                          background: orderPrimary, color: "white",
                          fontSize: 14, fontWeight: 700, cursor: "pointer",
                          fontFamily: "'DM Sans', sans-serif",
                        }}
                      >
                        Start Next Season →
                      </button>
                    </div>
                  </div>
                )}
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

  if (type === "event") {
    return pick(["Event day", "Off the field", "The experience"]);
  }

  if (type === "sightseeing") {
    return pick(["Taking it in", "The view", "Off the field"]);
  }

  if (type === "food") {
    return pick(["Fuel up", "Team dinner", "The spread"]);
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
const ShareCardRender = React.forwardRef(function ShareCardRender({
  entry, team, season, aspect, preview, headline: headlineProp, entryNumber,
  template = "classic", cardTheme = "dark", cardFont = "editorial", cardAlign = "left",
  cardColor, photoPos = "center", hasSeasonPass = false, entries = [],
}, ref) {
  const isStory = aspect === "story";
  const width = 1080;
  const height = isStory ? 1920 : 1080;

  const headline = headlineProp || generateHeadline(entry);
  const entryText = entry.text || "";
  const hasPhoto = !!(entry.photoPreview || entry.photoData);
  const hasScore = entry.score_home !== null && entry.score_away !== null;

  const activeColor = cardColor || team?.color || theme.primary;
  const isDark = cardTheme === "dark";
  const isCenter = cardAlign === "center";
  const isModern = cardFont === "modern";

  // Theme-derived colors
  const bg = isDark
    ? (hasPhoto && template !== "statLine" && template !== "minimal" ? "#000" : gradientFromColor(activeColor))
    : "#FAFAF7";
  const textPrimary = isDark ? "#FFFFFF" : "#1A1A1A";
  const textSecondary = isDark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.5)";
  const textTertiary = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.3)";
  const textQuote = isDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.7)";
  const badgeBg = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)";
  const badgeBorder = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)";
  const watermarkColor = isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.35)";
  const watermarkBorder = isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.1)";

  // Font-derived styles
  const headlineFont = isModern ? fonts.body : fonts.headline;
  const headlineStyle = isModern ? "normal" : "italic";
  const headlineWeight = isModern ? 800 : 400;

  const lineFontSize = entryText.length > 200 ? 36 : entryText.length > 100 ? 42 : 52;

  const dateStr = new Date(entry.entry_date).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

  const photoPosMap = { top: "center 10%", center: "center 40%", bottom: "center 75%" };
  const bgPosition = photoPosMap[photoPos] || "center 40%";

  // Stat line computations
  const seasonGames = entries.filter((e) => e.entry_type === "game" || e.entry_type === "tournament" || e.entry_type === "event");
  const wins = seasonGames.filter((e) => e.result === "win").length;
  const losses = seasonGames.filter((e) => e.result === "loss").length;
  const draws = seasonGames.filter((e) => e.result === "draw").length;
  const goalsFor = seasonGames.reduce((s, e) => s + (e.score_home || 0), 0);
  const goalsAgainst = seasonGames.reduce((s, e) => s + (e.score_away || 0), 0);

  // Watermark bar (shared across templates)
  const watermarkBar = (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      paddingTop: 20,
      borderTop: `1px solid ${watermarkBorder}`,
    }}>
      {hasSeasonPass ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {team.logo && (
            <img src={team.logo} alt="" style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }} />
          )}
          <span style={{
            fontFamily: fonts.body, fontSize: 24, fontWeight: 700,
            color: watermarkColor, letterSpacing: 2, textTransform: "uppercase",
          }}>
            {team.name}
          </span>
        </div>
      ) : (
        <span style={{
          fontFamily: fonts.body, fontSize: 26, fontWeight: 700,
          color: watermarkColor, letterSpacing: 5, textTransform: "uppercase",
        }}>
          teamseason.app
        </span>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {entryNumber && (
          <span style={{ fontFamily: fonts.mono, fontSize: 20, fontWeight: 500, color: watermarkColor }}>
            Entry #{entryNumber}
          </span>
        )}
      </div>
    </div>
  );

  // Team strip (shared)
  const teamStrip = (
    <div style={{
      fontSize: 28, fontWeight: 600, color: textSecondary,
      letterSpacing: 2, textTransform: "uppercase", marginBottom: 16,
      display: "flex", alignItems: "center", gap: 14,
      justifyContent: isCenter ? "center" : "flex-start",
    }}>
      {team.logo ? (
        <img src={team.logo} alt="" style={{
          width: 64, height: 64, borderRadius: "50%", objectFit: "cover",
          border: `2px solid ${badgeBorder}`,
        }} />
      ) : (
        <span style={{ fontSize: 36 }}>{team.emoji}</span>
      )}
      <span>{team.name}</span>
    </div>
  );

  // --- TEMPLATE: BIG SCORE ---
  if (template === "bigScore" && hasScore) {
    return (
      <div ref={ref} style={{
        width, height,
        ...(preview ? {} : { position: "absolute", left: -9999, top: -9999 }),
        overflow: "hidden", fontFamily: fonts.body,
        background: isDark ? gradientFromColor(activeColor) : bg,
        display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center",
        padding: "64px",
      }}>
        {teamStrip}
        <h2 style={{
          fontFamily: headlineFont, fontStyle: headlineStyle, fontWeight: headlineWeight,
          fontSize: isStory ? 56 : 48, color: textPrimary, lineHeight: 1.1,
          marginBottom: 40, textAlign: "center", letterSpacing: -0.5,
        }}>
          {headline}
        </h2>
        <div style={{
          fontFamily: fonts.mono, fontSize: isStory ? 180 : 140, fontWeight: 700,
          color: textPrimary, letterSpacing: 8, lineHeight: 1,
          marginBottom: 24,
        }}>
          {entry.score_home} - {entry.score_away}
        </div>
        {entry.opponent && (
          <div style={{ fontSize: 32, color: textSecondary, fontWeight: 500, marginBottom: 12 }}>
            vs {entry.opponent}
          </div>
        )}
        <div style={{ fontSize: 24, color: textTertiary, marginBottom: 48 }}>
          {dateStr}
        </div>
        <div style={{
          width: 80, height: 4, background: isDark ? "rgba(255,255,255,0.3)" : activeColor,
          borderRadius: 2, marginBottom: 48,
        }} />
        <div style={{ width: "100%", marginTop: "auto" }}>{watermarkBar}</div>
      </div>
    );
  }

  // --- TEMPLATE: PHOTO HERO ---
  if (template === "photoHero" && hasPhoto) {
    return (
      <div ref={ref} style={{
        width, height,
        ...(preview ? {} : { position: "absolute", left: -9999, top: -9999 }),
        overflow: "hidden", fontFamily: fonts.body,
        background: isDark ? "#000" : bg,
        display: "flex", flexDirection: "column",
      }}>
        <div style={{
          flex: isStory ? "1 1 75%" : "1 1 70%",
          position: "relative", overflow: "hidden",
          backgroundImage: `url(${entry.photoPreview || entry.photoData})`,
          backgroundSize: "cover", backgroundPosition: bgPosition, backgroundRepeat: "no-repeat",
        }}>
          <div style={{
            position: "absolute", bottom: 0, left: 0, right: 0, height: "50%",
            background: isDark
              ? "linear-gradient(to top, rgba(0,0,0,0.95) 0%, transparent 100%)"
              : "linear-gradient(to top, rgba(250,250,247,1) 0%, transparent 100%)",
          }} />
        </div>
        <div style={{
          flex: isStory ? "1 1 25%" : "1 1 30%",
          background: isDark ? "#000" : bg,
          padding: "32px 64px 48px",
          display: "flex", flexDirection: "column", justifyContent: "flex-end",
        }}>
          <h1 style={{
            fontFamily: headlineFont, fontStyle: headlineStyle, fontWeight: headlineWeight,
            fontSize: isStory ? 80 : 64, color: textPrimary, lineHeight: 1.0,
            marginBottom: 12, letterSpacing: -1, textAlign: isCenter ? "center" : "left",
          }}>
            {headline}
          </h1>
          {hasScore && (
            <div style={{
              fontFamily: fonts.mono, fontSize: 36, fontWeight: 700,
              color: isDark ? activeColor : textPrimary, letterSpacing: 2,
              marginBottom: 8, textAlign: isCenter ? "center" : "left",
            }}>
              {entry.score_home} - {entry.score_away}
              {entry.opponent && <span style={{ fontSize: 24, color: textSecondary, fontWeight: 500, marginLeft: 16 }}>vs {entry.opponent}</span>}
            </div>
          )}
          <div style={{
            fontSize: 20, color: textTertiary, marginBottom: 24,
            textAlign: isCenter ? "center" : "left",
          }}>
            {dateStr}
          </div>
          {watermarkBar}
        </div>
      </div>
    );
  }

  // --- TEMPLATE: STAT LINE ---
  if (template === "statLine" && hasScore) {
    return (
      <div ref={ref} style={{
        width, height,
        ...(preview ? {} : { position: "absolute", left: -9999, top: -9999 }),
        overflow: "hidden", fontFamily: fonts.mono,
        background: isDark ? gradientFromColor(activeColor) : bg,
        display: "flex", flexDirection: "column",
        padding: isStory ? "80px 64px 60px" : "64px 64px 48px",
      }}>
        {teamStrip}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <h1 style={{
            fontFamily: headlineFont, fontStyle: headlineStyle, fontWeight: headlineWeight,
            fontSize: isStory ? 72 : 60, color: textPrimary, lineHeight: 1.0,
            marginBottom: 48, letterSpacing: -1, textAlign: isCenter ? "center" : "left",
          }}>
            {headline}
          </h1>
          {/* Today's score */}
          <div style={{
            display: "flex", alignItems: "baseline", gap: 20, marginBottom: 40,
            justifyContent: isCenter ? "center" : "flex-start",
          }}>
            <span style={{ fontSize: 96, fontWeight: 700, color: textPrimary, letterSpacing: 4 }}>
              {entry.score_home} - {entry.score_away}
            </span>
            {entry.opponent && (
              <span style={{ fontSize: 28, color: textSecondary, fontFamily: fonts.body, fontWeight: 500 }}>
                vs {entry.opponent}
              </span>
            )}
          </div>
          {/* Stat block */}
          <div style={{
            background: badgeBg, border: `1px solid ${badgeBorder}`, borderRadius: 16,
            padding: "32px 40px", marginBottom: 40,
          }}>
            {[
              { label: "RECORD", value: `${wins}W - ${losses}L - ${draws}D` },
              { label: "GOALS FOR", value: String(goalsFor) },
              { label: "GOALS AGAINST", value: String(goalsAgainst) },
              { label: "ENTRIES", value: String(entries.length) },
            ].map((row, i) => (
              <div key={i} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "14px 0",
                borderBottom: i < 3 ? `1px solid ${badgeBorder}` : "none",
              }}>
                <span style={{ fontSize: 22, color: textSecondary, letterSpacing: 3 }}>{row.label}</span>
                <span style={{ fontSize: 28, fontWeight: 700, color: textPrimary }}>{row.value}</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 22, color: textTertiary, textAlign: isCenter ? "center" : "left" }}>
            {dateStr}
          </div>
        </div>
        {watermarkBar}
      </div>
    );
  }

  // --- TEMPLATE: VICTORY ---
  if (template === "victory") {
    const scoreLine = hasScore ? `${entry.score_home} – ${entry.score_away}` : null;
    const massiveSize = isStory ? 260 : 200;
    const photoSrc = entry.photoPreview || entry.photoData;

    return (
      <div ref={ref} style={{
        width, height,
        position: preview ? "relative" : "absolute",
        ...(preview ? {} : { left: -9999, top: -9999 }),
        overflow: "hidden", fontFamily: fonts.body,
        background: `linear-gradient(175deg, #0a0a0a 0%, ${activeColor}22 40%, #000 100%)`,
        display: "flex", flexDirection: "column",
      }}>
        {/* Full-bleed photo layer */}
        {photoSrc && (
          <div style={{
            position: "absolute", inset: 0,
            backgroundImage: `url(${photoSrc})`,
            backgroundSize: "cover", backgroundPosition: bgPosition,
            backgroundRepeat: "no-repeat",
            opacity: 0.45,
          }} />
        )}

        {/* Deep gradient overlays */}
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 35%, transparent 50%, rgba(0,0,0,0.85) 75%, rgba(0,0,0,0.97) 100%)",
        }} />
        <div style={{
          position: "absolute", inset: 0,
          background: `linear-gradient(to right, ${activeColor}55 0%, transparent 60%)`,
        }} />

        {/* VICTORY text — massive, behind/layered with photo */}
        <div style={{
          position: "absolute",
          top: isStory ? "18%" : "15%",
          left: 0, right: 0,
          display: "flex", justifyContent: "center", alignItems: "center",
          zIndex: 1,
          pointerEvents: "none",
        }}>
          <span style={{
            fontFamily: fonts.body, fontWeight: 900,
            fontSize: massiveSize, lineHeight: 0.85,
            color: "rgba(255,255,255,0.12)",
            letterSpacing: -8, textTransform: "uppercase",
            textAlign: "center",
            userSelect: "none",
          }}>
            VICTORY
          </span>
        </div>

        {/* Content — sits above photo and massive text */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          padding: isStory ? "0 72px 72px" : "0 64px 56px",
          zIndex: 3,
        }}>
          {/* Team vs Opponent row */}
          <div style={{
            display: "flex", alignItems: "center", gap: 20,
            marginBottom: isStory ? 32 : 24,
          }}>
            <span style={{ fontSize: isStory ? 44 : 36 }}>{team?.emoji || "⚽"}</span>
            {entry.opponent && (
              <>
                <span style={{
                  fontFamily: fonts.body, fontSize: isStory ? 26 : 22, fontWeight: 700,
                  color: "rgba(255,255,255,0.5)", letterSpacing: 3, textTransform: "uppercase",
                }}>
                  VS
                </span>
                <span style={{
                  fontFamily: fonts.body, fontSize: isStory ? 26 : 22, fontWeight: 700,
                  color: "rgba(255,255,255,0.7)", letterSpacing: 2, textTransform: "uppercase",
                }}>
                  {entry.opponent}
                </span>
              </>
            )}
          </div>

          {/* Score — huge */}
          {scoreLine && (
            <div style={{
              fontFamily: fonts.mono, fontSize: isStory ? 144 : 112, fontWeight: 700,
              color: "#FFFFFF", letterSpacing: 4, lineHeight: 0.9,
              marginBottom: isStory ? 28 : 20,
            }}>
              {scoreLine}
            </div>
          )}

          {/* VICTORY label */}
          <div style={{
            fontFamily: fonts.body, fontWeight: 900, fontSize: isStory ? 52 : 42,
            color: activeColor, letterSpacing: 6, textTransform: "uppercase",
            marginBottom: isStory ? 28 : 20,
          }}>
            VICTORY
          </div>

          {/* Date and watermark */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            paddingTop: 20, borderTop: "1px solid rgba(255,255,255,0.15)",
          }}>
            <span style={{
              fontFamily: fonts.body, fontSize: 22, fontWeight: 500,
              color: "rgba(255,255,255,0.45)", letterSpacing: 1,
            }}>
              {dateStr}
            </span>
            <span style={{
              fontFamily: fonts.body, fontSize: 22, fontWeight: 700,
              color: "rgba(255,255,255,0.4)", letterSpacing: 4, textTransform: "uppercase",
            }}>
              {hasSeasonPass && team?.name ? team.name : "TEAM SEASON"}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // --- TEMPLATE: MATCHDAY ---
  if (template === "matchday") {
    const photoSrc = entry.photoPreview || entry.photoData;
    const isPastGame = hasScore;
    const massiveLabel = isPastGame ? "FINAL" : "MATCHDAY";
    const massiveSize = isStory ? 200 : 160;
    const subScoreSize = isStory ? 130 : 100;

    return (
      <div ref={ref} style={{
        width, height,
        position: preview ? "relative" : "absolute",
        ...(preview ? {} : { left: -9999, top: -9999 }),
        overflow: "hidden", fontFamily: fonts.body,
        background: `linear-gradient(150deg, ${activeColor} 0%, #000 70%)`,
        display: "flex", flexDirection: "column",
      }}>
        {/* Photo layer */}
        {photoSrc && (
          <div style={{
            position: "absolute", inset: 0,
            backgroundImage: `url(${photoSrc})`,
            backgroundSize: "cover", backgroundPosition: bgPosition,
            backgroundRepeat: "no-repeat",
            opacity: 0.35,
          }} />
        )}

        {/* Gradient overlays */}
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(to bottom, rgba(0,0,0,0.4) 0%, transparent 30%, rgba(0,0,0,0.6) 60%, rgba(0,0,0,0.95) 100%)",
        }} />
        <div style={{
          position: "absolute", inset: 0,
          background: `linear-gradient(to right, rgba(0,0,0,0.5) 0%, transparent 70%)`,
        }} />

        {/* MATCHDAY / FINAL — massive background word */}
        <div style={{
          position: "absolute",
          top: isStory ? "12%" : "10%",
          left: 0, right: 0,
          display: "flex", justifyContent: "center",
          zIndex: 1, pointerEvents: "none",
        }}>
          <span style={{
            fontFamily: fonts.body, fontWeight: 900,
            fontSize: massiveSize, lineHeight: 0.85,
            color: "rgba(255,255,255,0.10)",
            letterSpacing: -6, textTransform: "uppercase",
            textAlign: "center", userSelect: "none",
          }}>
            {massiveLabel}
          </span>
        </div>

        {/* Top bar: team info */}
        <div style={{
          position: "absolute", top: isStory ? 72 : 56, left: 0, right: 0,
          padding: "0 64px",
          display: "flex", alignItems: "center", gap: 20,
          zIndex: 3,
        }}>
          {team?.logo ? (
            <img src={team.logo} alt="" style={{ width: 56, height: 56, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(255,255,255,0.25)" }} />
          ) : (
            <span style={{ fontSize: 44 }}>{team?.emoji || "⚽"}</span>
          )}
          <div>
            <div style={{
              fontFamily: fonts.body, fontSize: 28, fontWeight: 700,
              color: "rgba(255,255,255,0.9)", letterSpacing: 2, textTransform: "uppercase",
            }}>
              {team?.name || "Team"}
            </div>
            {season?.name && (
              <div style={{
                fontFamily: fonts.body, fontSize: 20, fontWeight: 500,
                color: "rgba(255,255,255,0.5)", letterSpacing: 1,
              }}>
                {season.name}
              </div>
            )}
          </div>
        </div>

        {/* Bottom content */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          padding: isStory ? "0 64px 64px" : "0 64px 52px",
          zIndex: 3,
        }}>
          {/* Foreground MATCHDAY / FINAL label */}
          <div style={{
            fontFamily: fonts.body, fontWeight: 900,
            fontSize: isStory ? 80 : 64,
            color: isPastGame ? activeColor : "#FFFFFF",
            letterSpacing: isPastGame ? 8 : 4,
            textTransform: "uppercase",
            marginBottom: isPastGame ? 8 : 24,
          }}>
            {massiveLabel}
          </div>

          {/* Score for past games */}
          {isPastGame && (
            <div style={{
              fontFamily: fonts.mono, fontSize: subScoreSize, fontWeight: 700,
              color: "#FFFFFF", letterSpacing: 4, lineHeight: 0.9,
              marginBottom: 24,
            }}>
              {entry.score_home} – {entry.score_away}
            </div>
          )}

          {/* vs Opponent */}
          {entry.opponent && (
            <div style={{
              fontFamily: fonts.body, fontSize: isStory ? 32 : 26, fontWeight: 600,
              color: "rgba(255,255,255,0.65)", letterSpacing: 2, textTransform: "uppercase",
              marginBottom: isStory ? 28 : 20,
            }}>
              {isPastGame ? "vs" : "vs"} {entry.opponent}
            </div>
          )}

          {/* Date + watermark row */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            paddingTop: 20, borderTop: "1px solid rgba(255,255,255,0.15)",
          }}>
            <span style={{
              fontFamily: fonts.body, fontSize: 22, fontWeight: 500,
              color: "rgba(255,255,255,0.45)",
            }}>
              {dateStr}
            </span>
            <span style={{
              fontFamily: fonts.body, fontSize: 22, fontWeight: 700,
              color: "rgba(255,255,255,0.4)", letterSpacing: 4, textTransform: "uppercase",
            }}>
              {hasSeasonPass && team?.name ? team.name : "TEAM SEASON"}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // --- TEMPLATE: SEASON STATS ---
  if (template === "seasonStats") {
    const gameEntries = entries.filter((e) => e.entry_type === "game" || e.entry_type === "tournament");
    const totalGames = gameEntries.length;
    const totalGoalsFor = gameEntries.reduce((s, e) => s + (e.score_home || 0), 0);
    const totalGoalsAgainst = gameEntries.reduce((s, e) => s + (e.score_away || 0), 0);
    const winPct = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;
    const record = `${wins}-${losses}-${draws}`;

    const statItems = [
      { num: totalGames, label: "GAMES" },
      { num: record, label: "RECORD" },
      { num: totalGoalsFor, label: "GOALS" },
      { num: `${winPct}%`, label: "WIN RATE" },
    ];

    return (
      <div ref={ref} style={{
        width, height,
        position: preview ? "relative" : "absolute",
        ...(preview ? {} : { left: -9999, top: -9999 }),
        overflow: "hidden", fontFamily: fonts.body,
        background: `linear-gradient(155deg, ${activeColor} 0%, #000 65%)`,
        display: "flex", flexDirection: "column",
        padding: isStory ? "80px 72px 72px" : "64px 72px 56px",
      }}>
        {/* Subtle texture layer */}
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(to bottom right, rgba(255,255,255,0.04) 0%, transparent 60%)",
          pointerEvents: "none",
        }} />

        {/* Top: team */}
        <div style={{ display: "flex", alignItems: "center", gap: 24, marginBottom: isStory ? 56 : 40, zIndex: 1 }}>
          {team?.logo ? (
            <img src={team.logo} alt="" style={{ width: 80, height: 80, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(255,255,255,0.25)" }} />
          ) : (
            <span style={{ fontSize: 56 }}>{team?.emoji || "⚽"}</span>
          )}
          <div>
            <div style={{
              fontFamily: fonts.body, fontSize: isStory ? 36 : 30, fontWeight: 800,
              color: "#FFFFFF", letterSpacing: 2, textTransform: "uppercase",
            }}>
              {team?.name || "My Team"}
            </div>
            {season?.name && (
              <div style={{
                fontFamily: fonts.body, fontSize: isStory ? 26 : 22, fontWeight: 500,
                color: "rgba(255,255,255,0.55)", letterSpacing: 1,
              }}>
                {season.name}
              </div>
            )}
          </div>
        </div>

        {/* Section label */}
        <div style={{
          fontFamily: fonts.body, fontWeight: 900, fontSize: isStory ? 28 : 24,
          color: activeColor, letterSpacing: 6, textTransform: "uppercase",
          marginBottom: isStory ? 40 : 28, zIndex: 1,
          borderLeft: `4px solid ${activeColor}`, paddingLeft: 20,
        }}>
          SEASON STATS
        </div>

        {/* Stat grid */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: isStory ? 32 : 24,
          flex: 1,
          zIndex: 1,
        }}>
          {statItems.map(({ num, label }, i) => (
            <div key={i} style={{
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.1)",
              padding: isStory ? "40px 32px" : "28px 24px",
              display: "flex", flexDirection: "column",
              justifyContent: "flex-end",
            }}>
              <div style={{
                fontFamily: fonts.mono, fontSize: isStory ? 88 : 68, fontWeight: 700,
                color: "#FFFFFF", lineHeight: 0.9, letterSpacing: -2,
                marginBottom: 12,
              }}>
                {num}
              </div>
              <div style={{
                fontFamily: fonts.body, fontSize: isStory ? 24 : 20, fontWeight: 700,
                color: "rgba(255,255,255,0.45)", letterSpacing: 4, textTransform: "uppercase",
              }}>
                {label}
              </div>
            </div>
          ))}
        </div>

        {/* Watermark row */}
        <div style={{
          marginTop: isStory ? 40 : 28,
          paddingTop: 20, borderTop: "1px solid rgba(255,255,255,0.12)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          zIndex: 1,
        }}>
          <span style={{
            fontFamily: fonts.body, fontSize: 22, fontWeight: 500,
            color: "rgba(255,255,255,0.35)", letterSpacing: 1,
          }}>
            {season?.name || "Season Recap"}
          </span>
          <span style={{
            fontFamily: fonts.body, fontSize: 22, fontWeight: 700,
            color: "rgba(255,255,255,0.35)", letterSpacing: 4, textTransform: "uppercase",
          }}>
            {hasSeasonPass && team?.name ? team.name : "TEAM SEASON"}
          </span>
        </div>
      </div>
    );
  }

  // --- TEMPLATE: MINIMAL ---
  if (template === "minimal") {
    return (
      <div ref={ref} style={{
        width, height,
        ...(preview ? {} : { position: "absolute", left: -9999, top: -9999 }),
        overflow: "hidden", fontFamily: fonts.body,
        background: isDark ? gradientFromColor(activeColor) : bg,
        display: "flex", flexDirection: "column",
        padding: isStory ? "120px 80px 60px" : "80px 80px 48px",
        justifyContent: "center",
      }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <h1 style={{
            fontFamily: headlineFont, fontStyle: headlineStyle, fontWeight: headlineWeight,
            fontSize: isStory ? 120 : 96, color: textPrimary, lineHeight: 0.95,
            marginBottom: 32, letterSpacing: -2, textAlign: isCenter ? "center" : "left",
          }}>
            {headline}
          </h1>
          <div style={{
            width: isCenter ? 80 : 80, height: 4,
            background: isDark ? "rgba(255,255,255,0.3)" : activeColor,
            borderRadius: 2, marginBottom: 32,
            marginLeft: isCenter ? "auto" : 0, marginRight: isCenter ? "auto" : undefined,
          }} />
          {entryText && (
            <p style={{
              fontFamily: fonts.display, fontStyle: "italic",
              fontSize: entryText.length > 150 ? 40 : 52, lineHeight: 1.4,
              color: textQuote, marginBottom: 40,
              maxHeight: isStory ? 400 : 240, overflow: "hidden",
              textAlign: isCenter ? "center" : "left",
            }}>
              &ldquo;{entryText}&rdquo;
            </p>
          )}
          <div style={{
            fontSize: 24, color: textTertiary,
            textAlign: isCenter ? "center" : "left",
          }}>
            {entry.opponent && <span>vs {entry.opponent} · </span>}
            {dateStr}
          </div>
        </div>
        <div style={{ marginTop: 48 }}>{watermarkBar}</div>
      </div>
    );
  }

  // --- TEMPLATE: CLASSIC (default) ---
  return (
    <div
      ref={ref}
      style={{
        width,
        height,
        ...(preview ? {} : { position: "absolute", left: -9999, top: -9999 }),
        overflow: "hidden",
        fontFamily: fonts.body,
        background: hasPhoto ? (isDark ? "#000" : bg) : (isDark ? gradientFromColor(activeColor) : bg),
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
          backgroundImage: `url(${entry.photoPreview || entry.photoData})`,
          backgroundSize: "cover",
          backgroundPosition: bgPosition,
          backgroundRepeat: "no-repeat",
        }}>
          <div style={{
            position: "absolute",
            bottom: 0, left: 0, right: 0, height: "60%",
            background: isDark
              ? "linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.6) 40%, transparent 100%)"
              : "linear-gradient(to top, rgba(250,250,247,1) 0%, rgba(250,250,247,0.6) 40%, transparent 100%)",
          }} />
        </div>
      ) : (
        <div style={{ flex: isStory ? "1 1 30%" : "1 1 25%" }} />
      )}

      {/* Content area */}
      <div style={{
        flex: hasPhoto ? (isStory ? "1 1 45%" : "1 1 50%") : (isStory ? "1 1 70%" : "1 1 75%"),
        background: hasPhoto ? (isDark ? "#000" : bg) : "transparent",
        padding: isStory ? "48px 64px 60px" : "40px 64px 48px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
      }}>
        {/* Team strip */}
        {teamStrip}

        {/* Headline */}
        <h1 style={{
          fontFamily: headlineFont,
          fontStyle: headlineStyle,
          fontSize: isStory ? 96 : 80,
          fontWeight: headlineWeight,
          color: textPrimary,
          lineHeight: 1.0,
          marginBottom: 20,
          letterSpacing: -1,
          textAlign: isCenter ? "center" : "left",
        }}>
          {headline}
        </h1>

        {/* Accent divider */}
        <div style={{
          width: 80, height: 4,
          background: isDark ? activeColor : activeColor,
          marginBottom: 24, borderRadius: 2,
          marginLeft: isCenter ? "auto" : 0, marginRight: isCenter ? "auto" : undefined,
        }} />

        {/* The line */}
        <p style={{
          fontFamily: fonts.display,
          fontStyle: "italic",
          fontSize: lineFontSize,
          lineHeight: 1.4,
          color: textQuote,
          marginBottom: 32,
          maxHeight: isStory ? 280 : 200,
          overflow: "hidden",
          textAlign: isCenter ? "center" : "left",
        }}>
          &ldquo;{entryText}&rdquo;
        </p>

        {/* Score badge */}
        {hasScore && (
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
            background: badgeBg,
            borderRadius: 16,
            padding: "20px 28px",
            marginBottom: 32,
            border: `1px solid ${badgeBorder}`,
            justifyContent: isCenter ? "center" : "flex-start",
          }}>
            <span style={{
              fontFamily: fonts.mono, fontSize: 56, fontWeight: 700,
              color: textPrimary, letterSpacing: 2,
            }}>
              {entry.score_home} – {entry.score_away}
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {entry.opponent && (
                <span style={{ fontSize: 24, color: isDark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.6)", fontWeight: 500 }}>
                  vs {entry.opponent}
                </span>
              )}
              {entry.venue && (
                <span style={{ fontSize: 20, color: textTertiary }}>{entry.venue}</span>
              )}
              <span style={{ fontSize: 20, color: textTertiary }}>{dateStr}</span>
            </div>
          </div>
        )}

        {/* No-score date */}
        {!hasScore && (
          <div style={{ fontSize: 22, color: textTertiary, marginBottom: 32, textAlign: isCenter ? "center" : "left" }}>
            {entry.opponent && <span>vs {entry.opponent} · </span>}
            {dateStr}
          </div>
        )}

        {/* Watermark */}
        {watermarkBar}
      </div>
    </div>
  );
});

// --- SHARE PROMPT (post-save toast) ---
function SharePrompt({ entry, onShare, onDismiss, brandColor, bookPageCount }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 8000);
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
        width: "100%",
        maxWidth: 440,
        boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
      }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 16 }}>&#10003;</span>
              <span style={{ fontSize: 14, fontWeight: 600 }}>Saved</span>
            </div>
            {bookPageCount > 0 && (
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", paddingLeft: 24 }}>
                Your book is now {bookPageCount} page{bookPageCount !== 1 ? "s" : ""}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
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
              &#215;
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- PLAYER MILESTONE CARDS (FIFA-style) ---
const MILESTONE_DEFS = [
  // Games
  { id: "first_game", label: "First Game", stat: "games", threshold: 1, tier: "bronze", icon: "🏟️" },
  { id: "games_10", label: "10 Games", stat: "games", threshold: 10, tier: "silver", icon: "🏟️" },
  { id: "games_25", label: "25 Games", stat: "games", threshold: 25, tier: "gold", icon: "🏟️" },
  { id: "games_50", label: "50 Games", stat: "games", threshold: 50, tier: "diamond", icon: "🏟️" },
  // Wins
  { id: "first_win", label: "First Win", stat: "wins", threshold: 1, tier: "bronze", icon: "🏆" },
  { id: "wins_10", label: "10 Wins", stat: "wins", threshold: 10, tier: "silver", icon: "🏆" },
  { id: "wins_25", label: "25 Wins", stat: "wins", threshold: 25, tier: "gold", icon: "🏆" },
  // Goals
  { id: "first_goal", label: "First Goal", stat: "goals", threshold: 1, tier: "bronze", icon: "⚽" },
  { id: "goals_5", label: "5 Goals", stat: "goals", threshold: 5, tier: "silver", icon: "⚽" },
  { id: "goals_10", label: "10 Goals", stat: "goals", threshold: 10, tier: "gold", icon: "⚽" },
  { id: "goals_25", label: "25 Goals", stat: "goals", threshold: 25, tier: "diamond", icon: "⚽" },
  // Assists
  { id: "first_assist", label: "First Assist", stat: "assists", threshold: 1, tier: "bronze", icon: "🎯" },
  { id: "assists_5", label: "5 Assists", stat: "assists", threshold: 5, tier: "silver", icon: "🎯" },
  { id: "assists_10", label: "10 Assists", stat: "assists", threshold: 10, tier: "gold", icon: "🎯" },
  // Clean Sheets
  { id: "first_cleansheet", label: "Clean Sheet", stat: "cleanSheets", threshold: 1, tier: "bronze", icon: "🧤" },
  { id: "cleansheets_5", label: "5 Clean Sheets", stat: "cleanSheets", threshold: 5, tier: "silver", icon: "🧤" },
  // Hat Trick (single-game)
  { id: "hat_trick", label: "Hat Trick", stat: "hatTricks", threshold: 1, tier: "gold", icon: "🎩" },
  // Brace (single-game)
  { id: "brace", label: "Brace", stat: "braces", threshold: 1, tier: "silver", icon: "✌️" },
  // Streaks
  { id: "win_streak_3", label: "3-Game Win Streak", stat: "winStreak", threshold: 3, tier: "silver", icon: "🔥" },
  { id: "win_streak_5", label: "5-Game Win Streak", stat: "winStreak", threshold: 5, tier: "gold", icon: "🔥" },
  { id: "win_streak_10", label: "10-Game Win Streak", stat: "winStreak", threshold: 10, tier: "diamond", icon: "🔥" },
  // Unbeaten
  { id: "unbeaten_5", label: "5-Game Unbeaten", stat: "unbeatenStreak", threshold: 5, tier: "silver", icon: "🛡️" },
  { id: "unbeaten_10", label: "10-Game Unbeaten", stat: "unbeatenStreak", threshold: 10, tier: "gold", icon: "🛡️" },
];

const TIER_STYLES = {
  bronze: {
    bg: "linear-gradient(160deg, #4a2800 0%, #7a4010 25%, #CD7F32 55%, #e8a85a 75%, #A0522D 100%)",
    borderGradient: "linear-gradient(160deg, #e8a85a, #CD7F32, #7a4010, #e8a85a)",
    accent: "#CD7F32", glow: "rgba(205,127,50,0.5)", text: "#FFF8F0",
    nameBar: "rgba(0,0,0,0.35)", statSeparator: "rgba(255,255,255,0.15)",
  },
  silver: {
    bg: "linear-gradient(160deg, #1a1a1a 0%, #555 25%, #C0C0C0 55%, #e8e8e8 75%, #888 100%)",
    borderGradient: "linear-gradient(160deg, #e8e8e8, #C0C0C0, #555, #e8e8e8)",
    accent: "#C0C0C0", glow: "rgba(192,192,192,0.45)", text: "#FFFFFF",
    nameBar: "rgba(0,0,0,0.4)", statSeparator: "rgba(255,255,255,0.15)",
  },
  gold: {
    bg: "linear-gradient(160deg, #2a1800 0%, #6b4000 25%, #c8963e 55%, #FFD700 75%, #B8860B 100%)",
    borderGradient: "linear-gradient(160deg, #FFD700, #c8963e, #6b4000, #FFD700)",
    accent: "#FFD700", glow: "rgba(200,150,62,0.6)", text: "#FFF5DC",
    nameBar: "rgba(0,0,0,0.35)", statSeparator: "rgba(255,255,255,0.18)",
  },
  diamond: {
    bg: "linear-gradient(160deg, #020b18 0%, #0a1628 30%, #0e2040 55%, #1a3a6b 80%, #0d1f45 100%)",
    borderGradient: "linear-gradient(160deg, #4a90d9, #2060b0, #0a1628, #6ab0f0, #4a90d9)",
    accent: "#4a90d9", glow: "rgba(74,144,217,0.6)", text: "#d4eaff",
    nameBar: "rgba(0,20,60,0.5)", statSeparator: "rgba(74,144,217,0.25)",
  },
};

function computePlayerStats(entries) {
  const gameEntries = entries
    .filter((e) => e.entry_type === "game" || e.entry_type === "tournament")
    .sort((a, b) => new Date(a.entry_date) - new Date(b.entry_date));

  const stats = {
    games: gameEntries.length,
    wins: gameEntries.filter((e) => e.result === "win").length,
    losses: gameEntries.filter((e) => e.result === "loss").length,
    goals: 0,
    assists: 0,
    cleanSheets: 0,
    hatTricks: 0,
    braces: 0,
    winStreak: 0,
    unbeatenStreak: 0,
  };

  // Count goals, assists, clean sheets, hat tricks, braces
  for (const e of gameEntries) {
    const g = e.goals || 0;
    const a = e.assists || 0;
    stats.goals += g;
    stats.assists += a;
    if (e.clean_sheet) stats.cleanSheets++;
    if (g >= 3) stats.hatTricks++;
    if (g === 2) stats.braces++;
  }

  // Calculate current win streak (consecutive wins from most recent)
  let ws = 0;
  for (let i = gameEntries.length - 1; i >= 0; i--) {
    if (gameEntries[i].result === "win") ws++;
    else break;
  }
  stats.winStreak = ws;

  // Calculate current unbeaten streak (no losses from most recent)
  let us = 0;
  for (let i = gameEntries.length - 1; i >= 0; i--) {
    if (gameEntries[i].result !== "loss") us++;
    else break;
  }
  stats.unbeatenStreak = us;

  return stats;
}

function getEarnedMilestones(entries) {
  const stats = computePlayerStats(entries);
  return MILESTONE_DEFS.filter((m) => stats[m.stat] >= m.threshold);
}

function computeOverallRating(stats) {
  const raw = stats.games * 1 + stats.wins * 2 + stats.goals * 3 + stats.assists * 2 + stats.cleanSheets * 2;
  // Map raw score to 55–99 range
  return Math.min(99, Math.max(55, 55 + Math.floor(raw * 0.8)));
}

function getNewMilestones(entriesBefore, entriesAfter) {
  const before = new Set(getEarnedMilestones(entriesBefore).map((m) => m.id));
  const after = getEarnedMilestones(entriesAfter);
  return after.filter((m) => !before.has(m.id));
}

// --- FIFA UT CARD INNER (reusable for both popup and gallery) ---
function FIFACardInner({ milestone, playerName, playerPhoto, playerFlags = [], playerPosition, teamEmoji, teamName, seasonName, stats, size = "full" }) {
  const tier = TIER_STYLES[milestone.tier] || TIER_STYLES.bronze;
  const isFull = size === "full";
  const W = isFull ? 280 : 100;
  const H = isFull ? 420 : 150;
  const scale = isFull ? 1 : (W / 280);

  const overallRating = stats ? computeOverallRating(stats) : 60;
  const pos = playerPosition || "ST";

  const statItems = stats ? [
    { label: "GAM", value: stats.games || 0 },
    { label: "WIN", value: stats.wins || 0 },
    { label: "GOL", value: stats.goals || 0 },
    { label: "AST", value: stats.assists || 0 },
    { label: "CS", value: stats.cleanSheets || 0 },
    { label: "STK", value: stats.winStreak || 0 },
  ] : [];

  const cardEl = (
    <div style={{
      width: 280, height: 420,
      background: tier.bg,
      position: "relative", overflow: "hidden",
      boxShadow: isFull ? `0 0 50px ${tier.glow}, 0 20px 60px rgba(0,0,0,0.5)` : `0 2px 12px rgba(0,0,0,0.3)`,
      fontFamily: "'DM Sans', sans-serif",
    }}>
      {/* Ornate border frame */}
      <div style={{
        position: "absolute", inset: 4,
        border: `1px solid rgba(255,255,255,0.25)`,
        pointerEvents: "none", zIndex: 10,
      }} />
      <div style={{
        position: "absolute", inset: 7,
        border: `1px solid rgba(255,255,255,0.10)`,
        pointerEvents: "none", zIndex: 10,
      }} />

      {/* Corner accents */}
      {[{ top: 4, left: 4 }, { top: 4, right: 4 }, { bottom: 4, left: 4 }, { bottom: 4, right: 4 }].map((pos2, i) => (
        <div key={i} style={{
          position: "absolute", width: 12, height: 12,
          border: `2px solid rgba(255,255,255,0.35)`,
          ...pos2,
          borderTopWidth: pos2.bottom !== undefined ? 0 : "2px",
          borderBottomWidth: pos2.top !== undefined ? 0 : "2px",
          borderLeftWidth: pos2.right !== undefined ? 0 : "2px",
          borderRightWidth: pos2.left !== undefined ? 0 : "2px",
          zIndex: 11,
        }} />
      ))}

      {/* Shine overlay */}
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(135deg, rgba(255,255,255,0.18) 0%, transparent 45%, rgba(255,255,255,0.04) 100%)",
        pointerEvents: "none", zIndex: 9,
      }} />

      {/* TOP: Rating + Position (left) | Tier + Team emoji (right) */}
      <div style={{
        position: "absolute", top: 14, left: 16, zIndex: 20,
        display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1,
      }}>
        <div style={{
          fontSize: 48, fontWeight: 900, color: tier.text,
          fontFamily: "'DM Sans', sans-serif", lineHeight: 1,
          textShadow: "0 2px 8px rgba(0,0,0,0.4)",
        }}>{overallRating}</div>
        <div style={{
          fontSize: 13, fontWeight: 800, color: tier.text,
          letterSpacing: 1.5, textTransform: "uppercase", opacity: 0.85,
          marginTop: 2,
        }}>{pos}</div>
        <div style={{
          fontSize: 11, fontWeight: 700, color: tier.text,
          letterSpacing: 1, textTransform: "uppercase", opacity: 0.55,
          marginTop: 4,
        }}>{(milestone.tier).toUpperCase()}</div>
      </div>

      <div style={{
        position: "absolute", top: 14, right: 16, zIndex: 20,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
      }}>
        <span style={{ fontSize: 26 }}>{teamEmoji || "⚽"}</span>
        <div style={{
          fontSize: 9, fontWeight: 700, color: tier.text,
          letterSpacing: 0.8, textTransform: "uppercase", opacity: 0.5,
          textAlign: "center",
        }}>TEAM<br/>SEASON</div>
      </div>

      {/* MILESTONE RIBBON */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, zIndex: 15,
        display: "flex", justifyContent: "center", paddingTop: 88,
      }}>
        <div style={{
          background: "rgba(0,0,0,0.5)",
          backdropFilter: "blur(2px)",
          padding: "3px 14px",
          fontSize: 10, fontWeight: 800, color: tier.text,
          letterSpacing: 1.5, textTransform: "uppercase",
          borderTop: `1px solid rgba(255,255,255,0.2)`,
          borderBottom: `1px solid rgba(255,255,255,0.2)`,
        }}>
          {milestone.label}
        </div>
      </div>

      {/* PLAYER PHOTO — rectangular FIFA-style cutout */}
      <div style={{
        position: "absolute", top: 100, left: 0, right: 0,
        height: 190,
        display: "flex", justifyContent: "center", alignItems: "flex-end",
        overflow: "hidden",
        zIndex: 5,
      }}>
        {playerPhoto ? (
          <img src={playerPhoto} alt="" style={{
            height: "100%", width: "auto",
            objectFit: "cover", objectPosition: "center top",
            // no border-radius — FIFA card style
            filter: "drop-shadow(0 8px 20px rgba(0,0,0,0.5))",
          }} />
        ) : (
          <div style={{
            width: 130, height: 170,
            background: "rgba(255,255,255,0.06)",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            gap: 8,
          }}>
            <svg width="70" height="70" viewBox="0 0 100 100" style={{ opacity: 0.3 }}>
              <circle cx="50" cy="32" r="20" fill={tier.text} />
              <ellipse cx="50" cy="80" rx="32" ry="24" fill={tier.text} />
            </svg>
            <div style={{ fontSize: 28, opacity: 0.4 }}>{milestone.icon}</div>
          </div>
        )}
      </div>

      {/* PLAYER NAME BAR */}
      <div style={{
        position: "absolute", top: 290, left: 0, right: 0, zIndex: 20,
        background: tier.nameBar,
        backdropFilter: "blur(4px)",
        padding: "7px 8px 5px",
        textAlign: "center",
      }}>
        <div style={{
          fontSize: playerName && playerName.length > 12 ? 13 : 16,
          fontWeight: 800, color: tier.text,
          letterSpacing: 1.5, textTransform: "uppercase",
          textShadow: "0 1px 4px rgba(0,0,0,0.4)",
        }}>
          {playerName || "PLAYER"}
        </div>
      </div>

      {/* STAT BAR */}
      {stats && (
        <div style={{
          position: "absolute", top: 318, left: 0, right: 0, zIndex: 20,
          display: "flex", alignItems: "stretch",
          background: "rgba(0,0,0,0.45)",
          backdropFilter: "blur(4px)",
          padding: "6px 8px",
        }}>
          {statItems.map((s, i) => (
            <div key={s.label} style={{
              flex: 1, textAlign: "center",
              borderRight: i < statItems.length - 1 ? `1px solid ${tier.statSeparator}` : "none",
            }}>
              <div style={{
                fontSize: 14, fontWeight: 800, color: tier.text, lineHeight: 1,
              }}>{s.value}</div>
              <div style={{
                fontSize: 8, fontWeight: 700, color: tier.text, opacity: 0.55,
                letterSpacing: 0.5, textTransform: "uppercase", marginTop: 2,
              }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* BOTTOM ROW: Flags | Team | TEAM SEASON */}
      <div style={{
        position: "absolute", bottom: 8, left: 0, right: 0, zIndex: 20,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 14px",
      }}>
        <div style={{ display: "flex", gap: 3 }}>
          {(playerFlags || []).slice(0, 2).map((iso) => (
            <span key={iso} style={{ fontSize: 16 }}>{countryFlag(iso)}</span>
          ))}
          {(!playerFlags || playerFlags.length === 0) && (
            <span style={{ fontSize: 10, opacity: 0.3, color: tier.text }}>—</span>
          )}
        </div>
        <div style={{
          fontSize: 10, fontWeight: 700, color: tier.text,
          opacity: 0.35, letterSpacing: 0.5, textTransform: "uppercase",
        }}>
          TEAM SEASON
        </div>
      </div>
    </div>
  );

  if (size === "full") return cardEl;

  return (
    <div style={{ width: W, height: H, overflow: "hidden", flexShrink: 0 }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: 280, height: 420 }}>
        {cardEl}
      </div>
    </div>
  );
}

// --- CANVAS SHARE HELPER ---
async function shareMilestoneCard(milestone, playerName, playerPhoto, playerFlags, playerPosition, teamEmoji, teamName, seasonName, stats) {
  const tier = TIER_STYLES[milestone.tier] || TIER_STYLES.bronze;
  const canvasW = 600;
  const canvasH = 900;
  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d");

  // Draw gradient background
  const grd = ctx.createLinearGradient(0, 0, canvasW, canvasH);
  // Parse tier colors from gradient string — use solid fallbacks
  const tierColors = {
    bronze: ["#4a2800", "#CD7F32", "#e8a85a"],
    silver: ["#1a1a1a", "#C0C0C0", "#e8e8e8"],
    gold: ["#2a1800", "#c8963e", "#FFD700"],
    diamond: ["#020b18", "#0a1628", "#1a3a6b"],
  };
  const [c0, c1, c2] = tierColors[milestone.tier] || tierColors.bronze;
  grd.addColorStop(0, c0);
  grd.addColorStop(0.5, c1);
  grd.addColorStop(1, c2);
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Shine overlay
  const shine = ctx.createLinearGradient(0, 0, canvasW, canvasH * 0.5);
  shine.addColorStop(0, "rgba(255,255,255,0.18)");
  shine.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = shine;
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Border frame
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 2;
  ctx.strokeRect(12, 12, canvasW - 24, canvasH - 24);
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.strokeRect(20, 20, canvasW - 40, canvasH - 40);

  const textColor = tier.text === "#1a1a1a" ? "#1a1a1a" : "#FFFFFF";

  // Rating
  const overallRating = stats ? computeOverallRating(stats) : 60;
  ctx.fillStyle = textColor;
  ctx.font = "bold 110px 'DM Sans', sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(String(overallRating), 36, 140);

  ctx.font = "bold 28px 'DM Sans', sans-serif";
  ctx.globalAlpha = 0.85;
  ctx.fillText((playerPosition || "ST").toUpperCase(), 40, 175);
  ctx.globalAlpha = 0.5;
  ctx.font = "bold 20px 'DM Sans', sans-serif";
  ctx.fillText((milestone.tier).toUpperCase(), 40, 205);
  ctx.globalAlpha = 1;

  // Team emoji (right)
  ctx.font = "56px sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(teamEmoji || "⚽", canvasW - 36, 120);
  ctx.font = "bold 18px 'DM Sans', sans-serif";
  ctx.globalAlpha = 0.4;
  ctx.fillText("TEAM SEASON", canvasW - 36, 150);
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";

  // Milestone ribbon
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(0, 220, canvasW, 42);
  ctx.fillStyle = textColor;
  ctx.font = "bold 20px 'DM Sans', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(milestone.label.toUpperCase(), canvasW / 2, 248);
  ctx.textAlign = "left";

  // Player photo
  if (playerPhoto) {
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = resolve; // don't fail if image can't load
        img.src = playerPhoto;
        setTimeout(resolve, 3000);
      });
      if (img.complete && img.naturalHeight > 0) {
        const photoH = 400;
        const photoW = (img.naturalWidth / img.naturalHeight) * photoH;
        ctx.drawImage(img, (canvasW - photoW) / 2, 270, photoW, photoH);
      }
    } catch (_) {}
  } else {
    // Silhouette
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(200, 270, 200, 380);
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.beginPath();
    ctx.arc(300, 360, 60, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(210, 430, 180, 100);
  }

  // Name bar
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(0, 680, canvasW, 68);
  ctx.fillStyle = textColor;
  ctx.font = "bold 34px 'DM Sans', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText((playerName || "PLAYER").toUpperCase(), canvasW / 2, 724);
  ctx.textAlign = "left";

  // Stat bar
  if (stats) {
    const statItems = [
      { label: "GAM", value: stats.games || 0 },
      { label: "WIN", value: stats.wins || 0 },
      { label: "GOL", value: stats.goals || 0 },
      { label: "AST", value: stats.assists || 0 },
      { label: "CS", value: stats.cleanSheets || 0 },
      { label: "STK", value: stats.winStreak || 0 },
    ];
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, 750, canvasW, 78);
    const colW = canvasW / 6;
    statItems.forEach((s, i) => {
      const cx = colW * i + colW / 2;
      ctx.fillStyle = textColor;
      ctx.font = "bold 30px 'DM Sans', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(s.value), cx, 787);
      ctx.globalAlpha = 0.55;
      ctx.font = "bold 16px 'DM Sans', sans-serif";
      ctx.fillText(s.label, cx, 810);
      ctx.globalAlpha = 1;
      if (i > 0) {
        ctx.strokeStyle = "rgba(255,255,255,0.15)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(colW * i, 758);
        ctx.lineTo(colW * i, 820);
        ctx.stroke();
      }
    });
  }

  // Flags
  if (playerFlags && playerFlags.length > 0) {
    ctx.font = "36px sans-serif";
    ctx.textAlign = "left";
    let fx = 36;
    playerFlags.slice(0, 2).forEach((iso) => {
      ctx.fillText(countryFlag(iso), fx, 870);
      fx += 50;
    });
  }

  // TEAM SEASON watermark
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = textColor;
  ctx.font = "bold 18px 'DM Sans', sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("TEAM SEASON", canvasW - 36, 870);
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

function PlayerMilestoneCard({ milestone, playerName, playerPhoto, playerFlags, playerPosition, teamName, teamColor, teamEmoji, seasonName, stats, onClose }) {
  const [sharing, setSharing] = useState(false);

  const handleShare = async () => {
    setSharing(true);
    try {
      const blob = await shareMilestoneCard(milestone, playerName, playerPhoto, playerFlags, playerPosition, teamEmoji, teamName, seasonName, stats);
      const file = new File([blob], "milestone.png", { type: "image/png" });
      const shareText = `${playerName || "Player"} just unlocked ${milestone.label}! \uD83C\uDFC6 #TeamSeason`;

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text: shareText });
      } else if (navigator.share) {
        // fallback: share without file
        await navigator.share({ text: shareText, url: "https://teamseason.app" });
      } else {
        // Download fallback
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${(playerName || "player").toLowerCase()}-${milestone.id}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 3000);
      }
    } catch (e) {
      if (e.name !== "AbortError") console.warn("Share failed:", e);
    }
    setSharing(false);
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", zIndex: 250,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }} onClick={onClose}>
      <div className="slide-up" onClick={(e) => e.stopPropagation()} style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
      }}>
        {/* "Milestone Unlocked" label */}
        <div style={{
          fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)",
          letterSpacing: 2, textTransform: "uppercase",
        }}>
          Milestone Unlocked
        </div>

        {/* The Card */}
        <div id="milestone-card-render">
          <FIFACardInner
            milestone={milestone}
            playerName={playerName}
            playerPhoto={playerPhoto}
            playerFlags={playerFlags}
            playerPosition={playerPosition}
            teamEmoji={teamEmoji}
            teamName={teamName}
            seasonName={seasonName}
            stats={stats}
            size="full"
          />
        </div>

        {/* Action buttons below card */}
        <div style={{ display: "flex", gap: 8, width: 280 }}>
          <button onClick={handleShare} disabled={sharing} style={{
            flex: 1, padding: "13px 16px", border: "none",
            background: "white", color: "#1a1a1a",
            fontSize: 14, fontWeight: 700, cursor: sharing ? "default" : "pointer",
            fontFamily: "'DM Sans', sans-serif",
            opacity: sharing ? 0.7 : 1,
          }}>
            {sharing ? "..." : "Share"}
          </button>
          <button onClick={onClose} style={{
            flex: 1, padding: "13px 16px", border: "1px solid rgba(255,255,255,0.25)",
            background: "transparent", color: "white",
            fontSize: 14, fontWeight: 600, cursor: "pointer",
            fontFamily: "'DM Sans', sans-serif",
          }}>
            Nice
          </button>
        </div>
      </div>
    </div>
  );
}

function MilestoneGallery({ milestones, playerName, playerPhoto, playerFlags, playerPosition, teamName, teamColor, teamEmoji, seasonName, stats, onClose }) {
  const earned = milestones;
  const locked = MILESTONE_DEFS.filter((m) => !earned.find((e) => e.id === m.id));
  const [selected, setSelected] = useState(null);

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 100,
    }}>
      <div className="slide-up" style={{
        background: "#0a0a0a", borderRadius: "18px 18px 0 0",
        padding: "24px 16px calc(24px + env(safe-area-inset-bottom, 0px))",
        width: "100%", maxWidth: 480, maxHeight: "88vh", overflow: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontFamily: fonts.display, fontSize: 22, fontWeight: 700, color: "white" }}>
            {playerName ? `${playerName}'s Milestones` : "Milestones"}
          </h2>
          <button onClick={onClose} style={{
            background: "rgba(255,255,255,0.1)", border: "none", fontSize: 20, cursor: "pointer",
            color: "rgba(255,255,255,0.6)", width: 32, height: 32, display: "flex",
            alignItems: "center", justifyContent: "center",
          }}>×</button>
        </div>

        {earned.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 20px", color: "rgba(255,255,255,0.5)" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🏅</div>
            <p style={{ fontSize: 15 }}>No milestones yet. Keep logging games!</p>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", marginTop: 8 }}>
              Add goals and assists in Game Details to unlock milestone cards.
            </p>
          </div>
        ) : (
          <>
            <div style={{
              fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)",
              textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12,
            }}>
              Earned — {earned.length}
            </div>
            <div style={{
              display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 28,
            }}>
              {earned.map((m) => {
                return (
                  <div key={m.id} onClick={() => setSelected(m)} style={{ cursor: "pointer" }}>
                    <FIFACardInner
                      milestone={m}
                      playerName={playerName}
                      playerPhoto={playerPhoto}
                      playerFlags={playerFlags}
                      playerPosition={playerPosition}
                      teamEmoji={teamEmoji}
                      teamName={teamName}
                      seasonName={seasonName}
                      stats={stats}
                      size="small"
                    />
                  </div>
                );
              })}
            </div>
          </>
        )}

        {locked.length > 0 && (
          <>
            <div style={{
              fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.25)",
              textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10,
            }}>
              Locked — {locked.length}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {locked.map((m) => (
                <div key={m.id} style={{
                  width: 80, background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  padding: "10px 6px", textAlign: "center",
                  opacity: 0.5,
                }}>
                  <div style={{ fontSize: 20, marginBottom: 4, filter: "grayscale(1)" }}>{m.icon}</div>
                  <div style={{
                    fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.5)",
                    lineHeight: 1.2, textTransform: "uppercase", letterSpacing: 0.5,
                  }}>
                    {m.label}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Full card view when tapped from gallery */}
      {selected && (
        <PlayerMilestoneCard
          milestone={selected}
          playerName={playerName}
          playerPhoto={playerPhoto}
          playerFlags={playerFlags}
          playerPosition={playerPosition}
          teamName={teamName}
          teamColor={teamColor}
          teamEmoji={teamEmoji}
          seasonName={seasonName}
          stats={stats}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

// --- BOOK ORDERED CELEBRATION ---
function BookOrderedCelebration({ seasonName, teamColor, onStartNewSeason, onClose }) {
  const color = teamColor || theme.primary;

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 500,
      background: color,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "calc(40px + env(safe-area-inset-top, 0px)) 24px calc(40px + env(safe-area-inset-bottom, 0px))",
    }}>
      <style>{`
        @keyframes confettiFall {
          0% { transform: translateY(-20px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
        @keyframes sparkle {
          0%, 100% { opacity: 0.2; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }
        @keyframes bookBounce {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-12px) scale(1.05); }
        }
      `}</style>

      {/* Confetti dots */}
      {Array.from({ length: 24 }).map((_, i) => (
        <div key={i} style={{
          position: "absolute",
          left: `${Math.random() * 100}%`,
          top: `-${Math.random() * 20 + 5}%`,
          width: Math.random() * 10 + 6,
          height: Math.random() * 10 + 6,
          borderRadius: Math.random() > 0.5 ? "50%" : "0",
          background: ["rgba(255,255,255,0.8)", "rgba(255,215,0,0.8)", "rgba(255,255,255,0.5)", "rgba(200,150,62,0.9)"][Math.floor(Math.random() * 4)],
          animation: `confettiFall ${Math.random() * 3 + 2}s ease-in ${Math.random() * 2}s both infinite`,
          pointerEvents: "none",
        }} />
      ))}

      {/* Sparkle dots around the book */}
      {Array.from({ length: 8 }).map((_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        const r = 80;
        return (
          <div key={i} style={{
            position: "absolute",
            left: `calc(50% + ${Math.cos(angle) * r}px)`,
            top: `calc(50% + ${Math.sin(angle) * r - 60}px)`,
            width: 8, height: 8, borderRadius: "50%",
            background: "rgba(255,255,255,0.7)",
            animation: `sparkle 1.5s ease-in-out ${i * 0.18}s infinite`,
            pointerEvents: "none",
          }} />
        );
      })}

      <div className="slide-up" style={{ textAlign: "center", maxWidth: 340, width: "100%", position: "relative", zIndex: 2 }}>
        <div style={{
          fontSize: 80, marginBottom: 24,
          animation: "bookBounce 2s ease-in-out infinite",
          display: "inline-block",
        }}>
          📖
        </div>

        <h1 style={{
          fontFamily: "'Crimson Pro', Georgia, serif",
          fontSize: 30, fontWeight: 700, color: "white",
          lineHeight: 1.2, marginBottom: 16,
          textShadow: "0 2px 12px rgba(0,0,0,0.2)",
        }}>
          Your Book Is On Its Way!
        </h1>

        <p style={{
          fontSize: 16, color: "rgba(255,255,255,0.8)",
          lineHeight: 1.6, marginBottom: 40,
        }}>
          Your <strong style={{ color: "white" }}>{seasonName || "season"}</strong> book is being printed and will ship to you soon.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <button onClick={onStartNewSeason} style={{
            padding: "16px 24px", border: "none",
            background: "white", color: color,
            fontSize: 16, fontWeight: 700, cursor: "pointer",
            fontFamily: "'DM Sans', sans-serif",
          }}>
            Start Next Season →
          </button>
          <button onClick={onClose} style={{
            padding: "14px 24px",
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.35)",
            color: "rgba(255,255,255,0.8)",
            fontSize: 15, fontWeight: 600, cursor: "pointer",
            fontFamily: "'DM Sans', sans-serif",
          }}>
            Back to Season
          </button>
        </div>
      </div>
    </div>
  );
}

// --- SEASON LIFECYCLE: Celebration + Milestone Modal ---
function CelebrationModal({ celebration, onClose, onViewBook, brandColor, playerName }) {
  const color = brandColor || theme.primary;

  useEffect(() => {
    if (celebration?.type !== "first") {
      const timer = setTimeout(onClose, 6000);
      return () => clearTimeout(timer);
    }
  }, [celebration, onClose]);

  if (!celebration) return null;

  const milestoneMessages = {
    5: "Five entries deep. Your book is taking shape.",
    10: "Double digits. This is becoming a real season story.",
    15: "Fifteen entries — that's a book worth reading.",
    20: "Twenty entries. This season has some weight to it.",
    25: "Twenty-five. You're building something special.",
  };

  if (celebration.type === "first") {
    return (
      <div style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }} onClick={onClose}>
        <div className="slide-up" style={{
          background: "white", borderRadius: 16, padding: 32, maxWidth: 340,
          width: "100%", textAlign: "center",
        }} onClick={(e) => e.stopPropagation()}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>&#9998;</div>
          <h2 style={{ fontFamily: fonts.display, fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
            That's one.
          </h2>
          <p style={{ fontSize: 15, color: theme.textMuted, lineHeight: 1.6, marginBottom: 24 }}>
            {playerName
              ? `By the end of the season, ${playerName}'s whole story will be here. Every game, every moment.`
              : "By the end of the season, this will be a whole book. Every game, every moment."
            }
          </p>
          <div style={{
            background: `${color}08`, border: `1px solid ${color}20`,
            borderRadius: 10, padding: "14px 16px", marginBottom: 24,
          }}>
            <div style={{ fontFamily: fonts.mono, fontSize: 12, color: color, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>
              Your book
            </div>
            <div style={{ fontSize: 14, color: theme.textMuted }}>
              1 entry — just getting started
            </div>
          </div>
          <button onClick={onClose} className="btn btn-primary" style={{ width: "100%", background: color, padding: "14px 24px", fontSize: 15 }}>
            Keep going
          </button>
        </div>
      </div>
    );
  }

  // Milestone toast
  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 150,
      display: "flex", justifyContent: "center", padding: "0 16px 24px",
      animation: "slideUp 0.35s ease-out both",
    }}>
      <div style={{
        background: color, color: "white", borderRadius: 14,
        padding: "16px 20px", width: "100%", maxWidth: 440,
        boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
              {milestoneMessages[celebration.count] || `${celebration.count} entries. Nice.`}
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
              Your book is {celebration.count} pages and counting
            </div>
          </div>
          {celebration.count >= 8 && (
            <button onClick={(e) => { e.stopPropagation(); onClose(); onViewBook(); }} style={{
              background: "rgba(255,255,255,0.2)", color: "white", border: "none",
              borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>
              Preview
            </button>
          )}
          <button onClick={onClose} style={{
            background: "none", color: "rgba(255,255,255,0.5)", border: "none",
            fontSize: 18, cursor: "pointer", padding: "4px 8px",
          }}>&#215;</button>
        </div>
      </div>
    </div>
  );
}

// --- SEASON LIFECYCLE: Timeline Banners ---
function SeasonBanner({ type, entryCount, brandColor, onAction, onDismiss, playerName }) {
  const color = brandColor || theme.primary;

  const banners = {
    bookTease: {
      title: `Your book is ${entryCount} pages and counting`,
      subtitle: playerName ? `${playerName}'s season is starting to look like something real.` : "Your season is starting to look like something real.",
      action: "Preview Book",
    },
    wrapUp: {
      title: "Season winding down?",
      subtitle: `${entryCount} entries — your book is ready when you are.`,
      action: "See Your Book",
    },
    bookNudge: {
      title: `${entryCount} entries. That's a whole season.`,
      subtitle: "Turn it into a hardcover book they'll keep forever.",
      action: "Order Book",
    },
  };

  const banner = banners[type];
  if (!banner) return null;

  return (
    <div style={{
      background: `${color}08`, border: `1px solid ${color}20`,
      borderRadius: 12, padding: "14px 16px", marginBottom: 12,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: theme.text, marginBottom: 2 }}>
            {banner.title}
          </div>
          <div style={{ fontSize: 12, color: theme.textMuted, lineHeight: 1.5 }}>
            {banner.subtitle}
          </div>
        </div>
        <button onClick={onDismiss} style={{
          background: "none", border: "none", cursor: "pointer",
          fontSize: 18, color: theme.textMuted, padding: 0, lineHeight: 1, flexShrink: 0,
        }}>×</button>
      </div>
      <button onClick={onAction} style={{
        marginTop: 10, width: "100%", padding: "10px 16px",
        background: color, color: "white", border: "none",
        fontSize: 14, fontWeight: 600, borderRadius: 8, cursor: "pointer",
      }}>
        {banner.action}
      </button>
    </div>
  );
}

// --- SHARE CARD MODAL ---
function ShareCardModal({ entry, team, season, onClose, entryNumber, entries = [] }) {
  const sharePrimary = team?.color || theme.primary;
  const cardRef = useRef(null);
  const [aspect, setAspect] = useState("story");
  const [exporting, setExporting] = useState(false);
  const [headline, setHeadline] = useState(generateHeadline(entry));

  const hasPhoto = !!(entry.photoPreview || entry.photoData);
  const hasScore = entry.score_home !== null && entry.score_away !== null;
  const isGameEntry = entry.entry_type === "game" || entry.entry_type === "tournament";
  const gameEntryCount = entries.filter((e) => e.entry_type === "game" || e.entry_type === "tournament").length;

  // Auto-pick the best template
  const autoTemplate = (() => {
    if (hasScore && entry.result === "win") return "victory";
    if (hasPhoto && (entry.text || "").length < 80) return "photoHero";
    if (hasScore && entry.result === "win" && (entry.score_home - entry.score_away) >= 2) return "bigScore";
    if (isGameEntry) return "matchday";
    if (hasScore) return "classic";
    return "minimal";
  })();

  const [template, setTemplate] = useState(autoTemplate);

  // Available templates — filtered by what makes sense for this entry
  const availableTemplates = [
    { id: "classic", label: "Classic", always: true },
    { id: "bigScore", label: "Big Score", when: hasScore },
    { id: "photoHero", label: "Photo", when: hasPhoto },
    { id: "victory", label: "Victory", when: hasScore && entry.result === "win" },
    { id: "matchday", label: "Matchday", when: isGameEntry },
    { id: "seasonStats", label: "Season", when: gameEntryCount >= 5 },
    { id: "statLine", label: "Stats", when: hasScore },
    { id: "minimal", label: "Minimal", always: true },
  ].filter((t) => t.always || t.when);

  const cardColor = team?.color || theme.primary;

  const [savedUrl, setSavedUrl] = useState(null);
  const savedUrlRef = useRef(null);

  useEffect(() => {
    savedUrlRef.current = savedUrl;
    return () => { if (savedUrlRef.current) URL.revokeObjectURL(savedUrlRef.current); };
  }, [savedUrl]);

  const previewScale = aspect === "story"
    ? Math.min(300 / 1080, (window.innerHeight * 0.45) / 1920)
    : Math.min(300 / 1080, (window.innerHeight * 0.45) / 1080);

  const previewWidth = 1080 * previewScale;
  const previewHeight = (aspect === "story" ? 1920 : 1080) * previewScale;

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

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: "Team Season" });
          setExporting(false);
          return;
        } catch (err) {
          if (err.name === "AbortError") { setExporting(false); return; }
        }
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `team-season-${entry.id}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setSavedUrl(url);
      setExporting(false);
    } catch (err) {
      console.error("Export failed:", err);
      setExporting(false);
    }
  };

  const toggleBtn = (active) => ({
    padding: "8px 16px",
    borderRadius: 8,
    border: "none",
    background: active ? "rgba(255,255,255,0.2)" : "transparent",
    color: active ? "white" : "rgba(255,255,255,0.45)",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.15s",
  });

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.92)",
      zIndex: 200,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: 16,
      overflowY: "auto",
    }}>
      {/* Close button */}
      <button
        onClick={onClose}
        style={{
          position: "fixed", top: 16, right: 16,
          background: "rgba(255,255,255,0.1)", border: "none", borderRadius: "50%",
          width: 40, height: 40, color: "white", fontSize: 20, cursor: "pointer", zIndex: 201,
        }}
      >
        ×
      </button>

      {/* Aspect toggle */}
      <div style={{
        display: "flex", gap: 4, background: "rgba(255,255,255,0.1)",
        borderRadius: 10, padding: 4, marginBottom: 16,
      }}>
        {[
          { id: "story", label: "Story 9:16" },
          { id: "square", label: "Square 1:1" },
        ].map((opt) => (
          <button key={opt.id} onClick={() => setAspect(opt.id)} style={toggleBtn(aspect === opt.id)}>
            {opt.label}
          </button>
        ))}
      </div>

      {/* Template picker */}
      <div style={{
        display: "flex", gap: 8, marginBottom: 16,
        overflowX: "auto", paddingBottom: 4,
        maxWidth: Math.max(previewWidth + 40, 320),
        WebkitOverflowScrolling: "touch",
        scrollbarWidth: "none",
      }}>
        {availableTemplates.map((t) => (
          <button
            key={t.id}
            onClick={() => setTemplate(t.id)}
            style={{
              flexShrink: 0,
              padding: "6px 14px",
              borderRadius: 20,
              border: template === t.id ? "1.5px solid rgba(255,255,255,0.8)" : "1.5px solid rgba(255,255,255,0.2)",
              background: template === t.id ? "rgba(255,255,255,0.18)" : "transparent",
              color: template === t.id ? "white" : "rgba(255,255,255,0.45)",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 1,
              textTransform: "uppercase",
              cursor: "pointer",
              transition: "all 0.15s",
              fontFamily: fonts.body,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Scaled preview */}
      <div style={{
        width: previewWidth, height: previewHeight,
        overflow: "hidden", borderRadius: 12,
        boxShadow: "0 12px 48px rgba(0,0,0,0.4)", marginBottom: 20,
      }}>
        <div style={{
          width: 1080, height: aspect === "story" ? 1920 : 1080,
          transform: `scale(${previewScale})`, transformOrigin: "top left",
        }}>
          <ShareCardRender
            entry={entry} team={team} season={season} aspect={aspect}
            headline={headline} entryNumber={entryNumber}
            template={template} cardColor={cardColor}
            entries={entries}
            preview
          />
        </div>
      </div>

      {/* Editable headline */}
      <div style={{ width: Math.max(previewWidth, 280), marginBottom: 16 }}>
        <input
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          maxLength={40}
          placeholder="Edit headline..."
          style={{
            width: "100%", padding: "10px 14px",
            background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 8, color: "white", fontSize: 14,
            fontFamily: fonts.headline, fontStyle: "italic",
            outline: "none", textAlign: "center",
          }}
        />
      </div>

      {/* Share button */}
      <button
        onClick={handleExport}
        disabled={exporting}
        className="btn btn-primary"
        style={{
          padding: "14px 40px", fontSize: 16,
          opacity: exporting ? 0.6 : 1, minWidth: 160,
          background: sharePrimary, marginBottom: 32,
        }}
      >
        {exporting ? "Exporting..." : navigator.canShare ? "Share" : "Download PNG"}
      </button>

      {/* Long-press save fallback for iOS */}
      {savedUrl && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.95)",
          zIndex: 210, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", padding: 20,
        }}>
          <p style={{
            color: "rgba(255,255,255,0.8)", fontSize: 16, textAlign: "center",
            marginBottom: 20, maxWidth: 300, lineHeight: 1.5,
          }}>
            Long-press the image and tap <strong style={{ color: "white" }}>Save Image</strong>
          </p>
          <img
            src={savedUrl}
            alt="Share card"
            style={{
              maxWidth: "95%", maxHeight: "65vh", borderRadius: 12,
              boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
            }}
          />
          <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
            {typeof navigator.share === "function" && (
              <button
                onClick={async () => {
                  try {
                    const res = await fetch(savedUrl);
                    const blob = await res.blob();
                    const file = new File([blob], `team-season-${entry.id}.png`, { type: "image/png" });
                    await navigator.share({ files: [file], title: "Team Season" });
                  } catch (err) { /* user cancelled */ }
                }}
                style={{
                  background: sharePrimary, border: "none", borderRadius: 10,
                  padding: "12px 28px", color: "white", fontSize: 15,
                  fontWeight: 600, cursor: "pointer",
                }}
              >
                Share
              </button>
            )}
            <button
              onClick={() => { URL.revokeObjectURL(savedUrl); setSavedUrl(null); }}
              style={{
                background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 10,
                padding: "12px 32px", color: "white", fontSize: 15,
                fontWeight: 600, cursor: "pointer",
              }}
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Hidden full-size card for capture */}
      <ShareCardRender
        ref={cardRef}
        entry={entry} team={team} season={season} aspect={aspect}
        headline={headline} entryNumber={entryNumber}
        template={template} cardColor={cardColor}
        entries={entries}
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
    <div style={{ background: theme.bg, minHeight: "100dvh" }}>
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
                    vs Lightning
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
                    "Found the open lane and made the right play every time."
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
                  "Finally nailed the crossover. Coach noticed."
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
              <span style={{ fontSize: 11 }}>🏅</span>
              <span>Thunder</span>
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
              "Found the open lane and didn't even hesitate."
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
              At the end of the season, turn the whole journal into a printed hardcover photo book. Every entry, every score, every photo - bound and in their hands. The kind of thing they keep.
            </p>
            <p style={{
              fontFamily: fonts.body,
              fontSize: 14,
              color: theme.text,
              fontWeight: 600,
              marginTop: 16,
            }}>
              $39 per book + shipping
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
          Logging, sharing, and building your journal costs nothing. When you're ready to turn it into a book, it's $39 per copy plus shipping.
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
            }}>$39</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {["7.75\" square hardcover", "Auto-designed from your journal", "Every entry, photo, and score", "Shipping calculated at checkout", "Order anytime"].map((f) => (
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
          - Sports parent, U12
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
    <div style={{ minHeight: "100dvh", padding: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>
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
    event: theme.tournament,
    sightseeing: "#6B7280",
    food: "#C2410C",
    moment: theme.moment,
  };

  const resultLabels = { win: "W", loss: "L", draw: "D" };

  return (
    <div style={{ minHeight: "100dvh", background: theme.bg }}>
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
      const { data, error } = isSignUp
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      onComplete(data.user, joinInfo);
    } catch (err) {
      setAuthError(err.message);
    }
    setAuthLoading(false);
  };

  if (loading) {
    return (
      <div style={{
        minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center",
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
        minHeight: "100dvh", display: "flex", flexDirection: "column",
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
      minHeight: "100dvh", display: "flex", flexDirection: "column",
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
            onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label className="label">Password</label>
          <input className="input" type="password" value={password}
            onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete="current-password" />
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
function SportsJournalAppInner() {
  const [authed, setAuthed] = useState(false);
  const [user, setUser] = useState(null);
  const [screen, setScreen] = useState("loading"); // loading, onboard, auth, setup, home
  const [role, setRole] = useState(null);
  const [isDemo, setIsDemo] = useState(false);

  // Listen for auth state changes (SDK handles token refresh automatically)
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const isSignedOut = event === "SIGNED_OUT";
      const isTokenRefreshFailed = event === "TOKEN_REFRESHED" && !session;
      if (isSignedOut || isTokenRefreshFailed) {
        setAuthed(false);
        setUser(null);
        setScreen("auth");
      } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        setUser(session?.user || null);
        setAuthed(!!session);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Data (parent)
  const [team, setTeam] = useState(null);
  const [season, setSeason] = useState(null);
  const [players, setPlayers] = useState([]);
  const [entries, setEntries] = useState([]);

  // Data (admin)
  const [org, setOrg] = useState(null);
  const [orgTeams, setOrgTeams] = useState([]);

  // Multi-season
  const [allSeasons, setAllSeasons] = useState([]); // Array of { team, season, players, entries, role }
  const [activeSeasonIdx, setActiveSeasonIdx] = useState(0);
  const [showSeasonSwitcher, setShowSeasonSwitcher] = useState(false);

  // Join flow
  const [joinToken, setJoinToken] = useState(null);

  // UI state
  const [showComposer, setShowComposer] = useState(false);
  const [showBook, setShowBook] = useState(false);
  const [showOrder, setShowOrder] = useState(false);
  const [showOrderCelebration, setShowOrderCelebration] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [filter, setFilter] = useState("all");
  const menuRef = useRef(null);
  const joinTokenRef = useRef(null);

  // Confirm modal + toast state
  const [confirmModal, setConfirmModal] = useState(null);
  const [toast, setToast] = useState(null);
  const showToast = useCallback((message, type = "error") => setToast({ message, type }), []);

  // Schedule state
  const [schedule, setSchedule] = useState(() => {
    try { return JSON.parse(localStorage.getItem("ts_schedule") || "[]"); } catch { return []; }
  });
  const [showScheduleImport, setShowScheduleImport] = useState(false);
  const [composerPrefill, setComposerPrefill] = useState(null); // { date, opponent }

  const handleScheduleImport = (events) => {
    setSchedule(events);
    localStorage.setItem("ts_schedule", JSON.stringify(events));
    setShowScheduleImport(false);
  };

  // Share card state
  const [shareEntry, setShareEntry] = useState(null);
  const [showSharePrompt, setShowSharePrompt] = useState(false);
  const [nudgeDismissed, setNudgeDismissed] = useState(() => {
    const d = localStorage.getItem("ts_nudge_dismissed");
    return d && (new Date() - new Date(d)) < 24 * 60 * 60 * 1000;
  });

  // PWA install prompt
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showInstallBanner, setShowInstallBanner] = useState(() => !localStorage.getItem("ts_install_dismissed"));
  const [showHelp, setShowHelp] = useState(false);
  const [showEditSeason, setShowEditSeason] = useState(false);

  // Lifecycle: milestones, celebrations, banners
  const [showCelebration, setShowCelebration] = useState(null); // null or { type, count }
  const [showMilestoneCard, setShowMilestoneCard] = useState(null); // null or milestone object
  const [showMilestoneGallery, setShowMilestoneGallery] = useState(false);
  const [dismissedBanners, setDismissedBanners] = useState(() => {
    try { return JSON.parse(localStorage.getItem("ts_dismissed_banners") || "{}"); } catch { return {}; }
  });
  const dismissBanner = (key) => {
    const updated = { ...dismissedBanners, [key]: new Date().toISOString() };
    setDismissedBanners(updated);
    localStorage.setItem("ts_dismissed_banners", JSON.stringify(updated));
  };

  // Capture beforeinstallprompt (Android/Chrome)
  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;

  const handleInstall = async () => {
    if (installPrompt) {
      installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === "accepted") {
        setShowInstallBanner(false);
        localStorage.setItem("ts_install_dismissed", "1");
      }
      setInstallPrompt(null);
    }
  };

  const dismissInstallBanner = () => {
    setShowInstallBanner(false);
    localStorage.setItem("ts_install_dismissed", "1");
  };

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

    // Admin restore disabled (admin flow hidden, code kept for future use)
    // const adminSaved = localStorage.getItem("teamSeasonAdmin");
    // if (adminSaved) { ... }

    // Strip base64 photoData from entries that have a cloud URL (saves localStorage space)
    const cleanEntryPhotos = (entries) => (entries || []).map((e) => {
      const cloudUrl = e.photo_url || e.photo_path;
      if (cloudUrl && e.photoData) {
        const { photoData, ...rest } = e;
        return { ...rest, photoPreview: cloudUrl };
      }
      return { ...e, photoPreview: e.photoData || cloudUrl || null };
    });

    // Restore multi-season data
    const allSaved = localStorage.getItem("teamSeasonAll");
    if (allSaved) {
      try {
        const { seasons, activeIdx } = JSON.parse(allSaved);
        if (seasons && seasons.length > 0) {
          // Clean photo data from all seasons on load
          const cleanedSeasons = seasons.map((s) => ({ ...s, entries: cleanEntryPhotos(s.entries) }));
          setAllSeasons(cleanedSeasons);
          const idx = Math.min(activeIdx || 0, cleanedSeasons.length - 1);
          setActiveSeasonIdx(idx);
          const data = cleanedSeasons[idx];
          setRole(data.role);
          setTeam(data.team);
          setSeason(data.season);
          setPlayers(data.players);
          setEntries(data.entries);
          setScreen("home");
          // Restore auth in background (async — won't block rendering)
          if (!DEMO) {
            supabase.auth.getSession().then(({ data: { session } }) => {
              if (session) { setUser(session.user); setAuthed(true); }
            });
          }
          return;
        }
      } catch (e) { /* continue */ }
    }

    // Check legacy single-season localStorage
    const saved = localStorage.getItem("teamSeason");
    if (saved) {
      try {
        const data = JSON.parse(saved);
        setRole(data.role);
        setTeam(data.team);
        setSeason(data.season);
        setPlayers(data.players);
        const cleanedEntries = cleanEntryPhotos(data.entries);
        setEntries(cleanedEntries);
        setAllSeasons([{ ...data, entries: cleanedEntries }]);
        setActiveSeasonIdx(0);
        setScreen("home");
        if (!DEMO) {
          supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) { setUser(session.user); setAuthed(true); }
          });
        }
        return;
      } catch (e) {
        // Invalid data, continue to auth
      }
    }

    if (DEMO) {
      setScreen("onboard");
      return;
    }

    // No localStorage data — try cloud restore (all teams + all seasons)
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setScreen("onboard");
        return;
      }
      setUser(session.user);
      setAuthed(true);
      try {
        const uid = session.user.id;
        const { data: teams } = await supabase.from("teams").select("*").eq("created_by", uid);
        if (teams && teams.length > 0) {
          // Build allSeasons from every team + season pair
          const restoredSeasons = [];
          for (const cloudTeam of teams) {
            const { data: seasons } = await supabase.from("seasons").select("*").eq("team_id", cloudTeam.id).eq("user_id", uid).is("deleted_at", null);
            const { data: cloudPlayers } = await supabase.from("players").select("*").eq("team_id", cloudTeam.id);
            const teamObj = { id: cloudTeam.id, name: cloudTeam.name, sport: cloudTeam.sport, emoji: cloudTeam.emoji, color: cloudTeam.color || "#1B4332", logo: null, orgType: "club" };
            const playersArr = (cloudPlayers || []).map((p) => ({ id: p.id, name: p.name, number: p.number, position: p.position, is_my_child: p.is_my_child }));
            for (const cloudSeason of (seasons || [])) {
              const { data: cloudEntries } = await supabase.from("entries").select("*").eq("season_id", cloudSeason.id).order("entry_date", { ascending: false });
              restoredSeasons.push({
                role: "parent",
                team: teamObj,
                season: { id: cloudSeason.id, name: cloudSeason.name, startDate: cloudSeason.start_date, endDate: cloudSeason.end_date },
                players: playersArr,
                entries: (cloudEntries || []).map((e) => ({ ...e, photoPreview: e.photo_url || e.photo_path || null })),
              });
            }
          }
          if (restoredSeasons.length > 0) {
            setAllSeasons(restoredSeasons);
            setActiveSeasonIdx(0);
            const first = restoredSeasons[0];
            setRole(first.role);
            setTeam(first.team);
            setSeason(first.season);
            setPlayers(first.players);
            setEntries(first.entries);
            setScreen("home");
            return;
          }
        }
      } catch (e) {
        console.warn("Cloud load failed:", e);
      }
      setRole("parent");
      setScreen("setup");
    })();
  }, []);

  // Keep a ref for activeSeasonIdx so persist useEffect always reads current value
  const activeIdxRef = useRef(activeSeasonIdx);
  useEffect(() => { activeIdxRef.current = activeSeasonIdx; }, [activeSeasonIdx]);

  // Persist to localStorage (skip demo, skip mid-setup)
  useEffect(() => {
    if (isDemo) return;
    if (screen === "home" && team && season) {
      const data = { role, team, season, players, entries };
      try {
        localStorage.setItem("teamSeason", JSON.stringify(data));
      } catch (e) {
        // Quota exceeded — retry without photo data
        console.warn("localStorage full, stripping photos:", e);
        const lite = { ...data, entries: entries.map(({ photoData, ...rest }) => ({ ...rest, photoPreview: null })) };
        try { localStorage.setItem("teamSeason", JSON.stringify(lite)); } catch (_) { /* give up */ }
      }

      // Also persist to allSeasons array using ref for current index
      const idx = activeIdxRef.current;
      setAllSeasons((prev) => {
        const updated = [...prev];
        if (updated.length === 0) {
          updated.push(data);
        } else if (idx < updated.length) {
          updated[idx] = data;
        }
        try {
          localStorage.setItem("teamSeasonAll", JSON.stringify({ seasons: updated, activeIdx: idx }));
        } catch (e) {
          // Quota exceeded — retry without photo data
          const lite = { seasons: updated.map((s) => ({ ...s, entries: (s.entries || []).map(({ photoData, ...rest }) => ({ ...rest, photoPreview: null })) })), activeIdx: idx };
          try { localStorage.setItem("teamSeasonAll", JSON.stringify(lite)); } catch (_) { /* give up */ }
        }
        return updated;
      });
    }
    if (screen === "admin" && org) {
      try {
        const data = { role: "admin", org, orgTeams };
        localStorage.setItem("teamSeasonAdmin", JSON.stringify(data));
      } catch (e) {
        console.warn("localStorage persist (admin) failed:", e);
      }
    }
  }, [role, team, season, players, entries, org, orgTeams, screen, isDemo]);

  // Flush offline sync queue when back online
  useEffect(() => {
    if (DEMO || !user) return;
    // Try flushing on mount
    flushSyncQueue(user.id);
    // Listen for connectivity restored
    const handleOnline = () => flushSyncQueue(user.id);
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [user]);

  // Handle Stripe checkout return
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('order') === 'success') {
      const sessionId = params.get('session_id');
      const saved = localStorage.getItem("teamSeasonOrder");
      if (saved) {
        try {
          const order = JSON.parse(saved);
          order.status = "ordered";
          order.orderedAt = new Date().toISOString();
          if (sessionId) order.sessionId = sessionId;
          localStorage.setItem("teamSeasonOrder", JSON.stringify(order));
        } catch (e) {}
      }
      setShowOrder(true);
      setShowOrderCelebration(true);
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
              const { data: connections } = await supabase.from("player_connections").select("player_id,join_token,user_id").in("player_id", playerIds);
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

      // Check if user has teams (parent flow - self-created)
      const { data: teams } = await supabase.from("teams").select("*").eq("created_by", uid);
      if (teams?.length > 0) {
        const restoredSeasons = [];
        for (const cloudTeam of teams) {
          const { data: seasons } = await supabase.from("seasons").select("*").eq("team_id", cloudTeam.id).eq("user_id", uid).is("deleted_at", null);
          const { data: cloudPlayers } = await supabase.from("players").select("*").eq("team_id", cloudTeam.id);
          const teamObj = { id: cloudTeam.id, name: cloudTeam.name, sport: cloudTeam.sport, emoji: cloudTeam.emoji, color: cloudTeam.color || "#1B4332", logo: null, orgType: "club", orgId: cloudTeam.org_id || null };
          const playersArr = (cloudPlayers || []).map((p) => ({ id: p.id, name: p.name, number: p.number, position: p.position, is_my_child: p.is_my_child }));
          for (const cloudSeason of (seasons || [])) {
            const { data: cloudEntries } = await supabase.from("entries").select("*").eq("season_id", cloudSeason.id).order("entry_date", { ascending: false });
            restoredSeasons.push({
              role: "parent",
              team: teamObj,
              season: { id: cloudSeason.id, name: cloudSeason.name, startDate: cloudSeason.start_date, endDate: cloudSeason.end_date },
              players: playersArr,
              entries: (cloudEntries || []).map((e) => ({ ...e, photoPreview: e.photo_url || e.photo_path || null })),
            });
          }
        }
        if (restoredSeasons.length > 0) {
          setAllSeasons(restoredSeasons);
          setActiveSeasonIdx(0);
          const first = restoredSeasons[0];
          setRole(first.role);
          setTeam(first.team);
          setSeason(first.season);
          setPlayers(first.players);
          setEntries(first.entries);
          setScreen("home");
          return;
        }
      }

      // Check if user has a season via join flow (team owned by admin, season owned by parent)
      const { data: joinSeasons } = await supabase.from("seasons").select("*, teams(*)").eq("user_id", uid).is("deleted_at", null).limit(1);
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
          setEntries((cloudEntries || []).map((e) => ({ ...e, photoPreview: e.photo_url || e.photo_path || null })));
          setScreen("home");
          return;
        }
      }
    } catch (e) {
      console.warn("Cloud restore on login failed:", e);
    }

    // No cloud data — check localStorage before giving up
    const allSaved = localStorage.getItem("teamSeasonAll");
    const singleSaved = localStorage.getItem("teamSeason");
    const localData = allSaved ? (() => {
      try { const { seasons, activeIdx } = JSON.parse(allSaved); return seasons?.[activeIdx || 0]; } catch { return null; }
    })() : singleSaved ? (() => {
      try { return JSON.parse(singleSaved); } catch { return null; }
    })() : null;

    if (localData?.team && localData?.season) {
      // Restore from localStorage and re-sync to cloud
      setRole(localData.role || "parent");
      setTeam(localData.team);
      setSeason(localData.season);
      setPlayers(localData.players || []);
      setEntries((localData.entries || []).map((e) => ({
        ...e, photoPreview: e.photo_url || e.photoData || null,
      })));
      if (allSaved) {
        try {
          const { seasons } = JSON.parse(allSaved);
          setAllSeasons(seasons);
        } catch {}
      } else {
        setAllSeasons([localData]);
      }
      setActiveSeasonIdx(0);
      setScreen("home");

      // Re-attempt cloud sync for the team/season/players
      (async () => {
        try {
          const uid = authUser.id;
          const t = localData.team;
          const s = localData.season;
          // Try inserting — will no-op if RLS blocks duplicates or they already exist
          await supabase.from("teams").upsert({
            id: t.id, created_by: uid,
            name: t.name, sport: t.sport || "Sports",
            emoji: t.emoji || "🏅", color: t.color || "#1B4332",
          }, { onConflict: "id" });
          await supabase.from("seasons").upsert({
            id: s.id, user_id: uid,
            team_id: t.id, name: s.name,
          }, { onConflict: "id" });
          for (const p of (localData.players || [])) {
            await supabase.from("players").upsert({
              id: p.id, team_id: t.id,
              name: p.name, is_my_child: p.is_my_child || false,
            }, { onConflict: "id" });
          }
          console.log("Re-synced localStorage data to cloud");
        } catch (e) {
          console.warn("Re-sync to cloud failed:", e);
        }
      })();
      return;
    }

    // Truly no data anywhere — new user, go to setup
    setRole("parent");
    setScreen("setup");
  };

  const handleDemo = (demoRole) => {
    const data = demoRole === "coach" ? coachDemoData() : demoData();
    setRole(data.role);
    setTeam(data.team);
    setSeason(data.season);
    setPlayers(data.players);
    setEntries(data.entries);
    setAllSeasons([data]);
    setActiveSeasonIdx(0);
    activeIdxRef.current = 0;
    setIsDemo(true);
    setAuthed(true);
    setScreen("home");
  };

  const handleOnboarding = (selectedRole) => {
    setRole(selectedRole);
    setScreen(selectedRole === "admin" ? "org-setup" : "setup");
  };

  // Value-first onboarding: user signed up after writing their first memory
  const handleOnboardComplete = async (authUser, onboardData) => {
    setUser(authUser);
    setAuthed(!!authUser);
    const onboardRole = onboardData.userRole || "parent";
    setRole(onboardRole);

    const teamId = generateId();
    const seasonId = generateId();
    const playerId = generateId();
    const entryId = generateId();

    const sportObj = SPORTS.find((s) => s.name === onboardData.sport);
    const teamData = {
      id: teamId,
      name: onboardData.teamName || "My Team",
      sport: onboardData.sport || "Sports",
      emoji: sportObj?.emoji || onboardData.sportIcon || "🏅",
      color: onboardData.teamColor || "#1B4332",
      logo: null,
      orgType: onboardRole === "coach" ? "school" : "club",
    };
    const seasonName = onboardRole === "coach" && onboardData.teamLevel
      ? `${onboardData.teamLevel} ${onboardData.sport || "Sports"} ${new Date().getFullYear()}`
      : `${onboardData.sport || "Sports"} ${new Date().getFullYear()}`;
    const seasonData = {
      id: seasonId,
      name: seasonName,
    };
    const playerData = onboardRole !== "coach" ? {
      id: playerId,
      name: onboardData.childName || "Player",
      is_my_child: true,
      flags: onboardData.childFlags || [],
    } : null;
    const entryData = {
      id: entryId,
      entry_type: "game",
      text: onboardData.memory || "",
      entry_date: new Date().toISOString().split("T")[0],
      season_id: seasonId,
      created_at: new Date().toISOString(),
      photoData: null,
      photoPreview: null,
    };

    setTeam(teamData);
    setSeason(seasonData);
    setPlayers(playerData ? [playerData] : []);
    setEntries(onboardData.memory ? [entryData] : []);
    setScreen("home");

    // Add to allSeasons
    const newSeasonData = {
      role: onboardRole, team: teamData, season: seasonData,
      players: onboardRole === "coach" ? [] : [playerData],
      entries: onboardData.memory ? [entryData] : [],
    };
    setAllSeasons([newSeasonData]);
    setActiveSeasonIdx(0);
    activeIdxRef.current = 0;

    // Sync to cloud (SDK handles token automatically)
    if (!DEMO && authUser) {
      (async () => {
        try {
          const { error: teamErr } = await supabase.from("teams").insert({
            id: teamId, created_by: authUser.id,
            name: teamData.name, sport: teamData.sport,
            emoji: teamData.emoji, color: teamData.color,
          });
          if (teamErr) console.warn("Team insert failed:", teamErr);
          const { error: seasonErr } = await supabase.from("seasons").insert({
            id: seasonId, user_id: authUser.id,
            team_id: teamId, name: seasonData.name,
          });
          if (seasonErr) console.warn("Season insert failed:", seasonErr);
          if (playerData) {
            const { error: playerErr } = await supabase.from("players").insert({
              id: playerId, team_id: teamId,
              name: playerData.name, is_my_child: true,
            });
            if (playerErr) console.warn("Player insert failed:", playerErr);
          }
          if (onboardData.memory) {
            const { error: entryErr } = await supabase.from("entries").insert({
              id: entryId, user_id: authUser.id, season_id: seasonId,
              entry_date: entryData.entry_date, entry_type: "game",
              text: entryData.text,
            });
            if (entryErr) console.warn("Entry insert failed:", entryErr);
          }
          console.log("Cloud sync (onboard) complete");
        } catch (e) {
          console.warn("Cloud sync (onboard) failed:", e);
        }
      })();
    }
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
        // Fall back to regular setup
        setJoinToken(null);
        setRole("parent");
        setScreen("setup");
        return;
      }

      // Set up parent state from claim response
      const teamData = {
        id: data.team_id,
        name: data.team_name,
        sport: data.team_sport || "Sports",
        emoji: data.team_emoji || "🏅",
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
      setRole("parent");
      setScreen("setup");
    }
  };

  const switchToSeason = (idx) => {
    if (idx < 0 || idx >= allSeasons.length) return;
    // Save current season before switching
    const currentIdx = activeIdxRef.current;
    setAllSeasons((prev) => {
      const updated = [...prev];
      if (currentIdx < updated.length && team && season) {
        updated[currentIdx] = { role, team, season, players, entries };
      }
      localStorage.setItem("teamSeasonAll", JSON.stringify({ seasons: updated, activeIdx: idx }));
      // Now hydrate the target season
      const s = updated[idx];
      if (s) {
        setRole(s.role);
        setTeam(s.team);
        setSeason(s.season);
        setPlayers(s.players);
        setEntries((s.entries || []).map((e) => ({ ...e, photoPreview: e.photo_url || e.photoData || null })));
      }
      return updated;
    });
    setActiveSeasonIdx(idx);
    activeIdxRef.current = idx;
    setFilter("all");
    setShowSeasonSwitcher(false);
  };

  // v2 — soft delete with session validation
  const executeDeleteSeason = async (idx) => {
    const s = allSeasons[idx];
    // Soft delete — set deleted_at timestamp instead of hard delete
    if (!DEMO && user?.id && s.season?.id) {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        console.log("[DELETE] Session check:", sessionData?.session ? "valid" : "EXPIRED", "user:", user?.id, "season:", s.season.id);
        if (!sessionData?.session) {
          showToast("Your session has expired. Please sign out and sign back in.");
          return;
        }

        const { data: updated, error } = await supabase
          .from("seasons")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", s.season.id)
          .eq("user_id", user.id)
          .select();

        console.log("[DELETE] Soft delete result:", updated?.length, "rows updated, error:", error);

        if (error || !updated || updated.length === 0) {
          showToast("Failed to delete the season. Please try again.");
          console.error("Soft delete failed:", error, "Rows:", updated?.length);
          return;
        }
      } catch (e) {
        showToast("Something went wrong deleting that season. Please try again.");
        console.error("Cloud season delete failed:", e);
        return;
      }
    }

    // Only remove from local state after cloud delete confirmed
    setAllSeasons((prev) => {
      const updated = prev.filter((_, i) => i !== idx);
      let newIdx = activeIdxRef.current;
      if (idx === newIdx) {
        newIdx = 0;
      } else if (idx < newIdx) {
        newIdx = newIdx - 1;
      }
      const target = updated[newIdx];
      if (target) {
        setRole(target.role);
        setTeam(target.team);
        setSeason(target.season);
        setPlayers(target.players);
        setEntries((target.entries || []).map((e) => ({ ...e, photoPreview: e.photo_url || e.photoData || null })));
      }
      activeIdxRef.current = newIdx;
      setActiveSeasonIdx(newIdx);
      localStorage.setItem("teamSeasonAll", JSON.stringify({ seasons: updated, activeIdx: newIdx }));
      return updated;
    });
    setShowSeasonSwitcher(false);
  };

  const deleteSeason = (idx) => {
    if (allSeasons.length <= 1) return;
    const s = allSeasons[idx];
    setConfirmModal({
      title: "Delete Season",
      message: `Delete "${s.team?.name || "Team"} — ${s.season?.name || "Season"}"? This cannot be undone.`,
      confirmLabel: "Delete",
      onConfirm: () => { setConfirmModal(null); executeDeleteSeason(idx); },
    });
  };

  const startNewSeason = () => {
    // Save current season first
    const idx = activeIdxRef.current;
    if (team && season) {
      setAllSeasons((prev) => {
        const updated = [...prev];
        if (idx < updated.length) {
          updated[idx] = { role, team, season, players, entries };
        }
        localStorage.setItem("teamSeasonAll", JSON.stringify({ seasons: updated, activeIdx: idx }));
        return updated;
      });
    }
    setShowSeasonSwitcher(false);
    setScreen("setup");
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
    setEntries([]);
    setScreen("home");

    // Add to allSeasons
    const newSeasonData = { role: role || "parent", team: teamData, season: seasonData, players: playersList, entries: [] };
    setAllSeasons((prev) => {
      const updated = [...prev, newSeasonData];
      const newIdx = updated.length - 1;
      // Update ref and state for active index
      activeIdxRef.current = newIdx;
      localStorage.setItem("teamSeasonAll", JSON.stringify({ seasons: updated, activeIdx: newIdx }));
      return updated;
    });
    // Set active index after allSeasons update is queued
    setActiveSeasonIdx((prev) => {
      const newIdx = allSeasons.length; // will be the index of the appended item
      activeIdxRef.current = newIdx;
      return newIdx;
    });

    // Sync to cloud (fire and forget — SDK handles token automatically)
    if (!DEMO && user) {
      (async () => {
        try {
          const { error: teamErr } = await supabase.from("teams").upsert({
            id: teamData.id, created_by: user.id,
            name: teamData.name, sport: teamData.sport || "Sports",
            emoji: teamData.emoji || "🏅", color: teamData.color || "#1B4332",
          }, { onConflict: "id" });
          if (teamErr) console.warn("Team upsert failed:", teamErr);
          const { error: seasonErr } = await supabase.from("seasons").upsert({
            id: seasonData.id, user_id: user.id,
            team_id: teamData.id, name: seasonData.name,
          }, { onConflict: "id" });
          if (seasonErr) console.warn("Season upsert failed:", seasonErr);
          for (const p of playersList) {
            const { error: playerErr } = await supabase.from("players").upsert({
              id: p.id, team_id: teamData.id,
              name: p.name, is_my_child: p.is_my_child || false,
            }, { onConflict: "id" });
            if (playerErr) console.warn("Player upsert failed:", playerErr);
          }
          console.log("Cloud sync (setup) complete");
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
            id: newTeam.id, created_by: user.id, org_id: org.id,
            name: newTeam.name, sport: newTeam.sport || "Sports",
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
            id: playerId, team_id: teamId,
            name: newPlayer.name, number: newPlayer.number || null,
          });
          await supabase.from("player_connections").insert({
            player_id: playerId, join_token: joinToken,
          });
        } catch (e) {
          console.warn("Cloud sync (player) failed:", e);
        }
      })();
    }
  };

  const handleEditSeason = async (editData) => {
    const newTeam = editData.team;
    const newSeason = editData.season;
    const newPlayers = editData.players;

    setTeam(newTeam);
    setSeason(newSeason);
    setPlayers(newPlayers);
    setShowEditSeason(false);

    // Sync to Supabase
    if (!DEMO && user) {
      (async () => {
        try {
          if (newTeam?.id) {
            await supabase.from("teams").update({
              name: newTeam.name, sport: newTeam.sport,
              emoji: newTeam.emoji, color: newTeam.color,
            }).eq("id", newTeam.id).eq("created_by", user.id);
          }
          if (newSeason?.id) {
            await supabase.from("seasons").update({
              name: newSeason.name,
            }).eq("id", newSeason.id).eq("user_id", user.id);
          }
          if (newPlayers?.[0]?.id && newTeam?.id) {
            await supabase.from("players").upsert({
              id: newPlayers[0].id, team_id: newTeam.id,
              name: newPlayers[0].name, is_my_child: newPlayers[0].is_my_child || true,
            }, { onConflict: "id" });
          }
          console.log("Season edit synced to cloud");
        } catch (e) {
          console.warn("Season edit sync failed:", e);
        }
      })();
    }
  };

  const handleSaveEntry = async (entryData) => {
    let newEntry;
    try {
      let photoData = null;
      if (entryData.photo) {
        photoData = await resizeImage(entryData.photo, 800);
      }
      const { photo, ...rest } = entryData;
      newEntry = {
        ...rest,
        id: generateId(),
        entry_date: entryData.entry_date || new Date().toISOString().split("T")[0],
        season_id: season?.id,
        photoData,
        photoPreview: photoData,
        created_at: new Date().toISOString(),
      };
      const prevCount = entries.length;
      const newCount = prevCount + 1;
      const updatedEntries = [newEntry, ...entries];
      setEntries(updatedEntries);
      setShowComposer(false);

      // Check for player milestone cards (parent mode only, game/tournament entries)
      if (role === "parent" && (newEntry.entry_type === "game" || newEntry.entry_type === "tournament")) {
        const newMilestones = getNewMilestones(entries, updatedEntries);
        if (newMilestones.length > 0) {
          // Show the highest-tier new milestone
          const tierOrder = { diamond: 4, gold: 3, silver: 2, bronze: 1 };
          newMilestones.sort((a, b) => (tierOrder[b.tier] || 0) - (tierOrder[a.tier] || 0));
          setShowMilestoneCard(newMilestones[0]);
          return; // Skip other celebrations — milestone card is the celebration
        }
      }

      // First entry celebration
      if (prevCount === 0) {
        setShowCelebration({ type: "first", count: 1 });
      } else if ([5, 10, 15, 20, 25].includes(newCount)) {
        // Milestone celebration
        setShowCelebration({ type: "milestone", count: newCount });
      } else {
        setShareEntry(newEntry);
        setShowSharePrompt(true);
      }
    } catch (e) {
      console.error("Entry save failed:", e);
      setShowComposer(false);
      return;
    }

    // Sync entry to cloud (SDK handles token automatically)
    if (!DEMO && user && season?.id) {
      (async () => {
        try {
          let photoUrl = null;

          // Upload photo to Supabase Storage if present
          if (newEntry.photoData) {
            const blob = base64ToBlob(newEntry.photoData);
            if (!blob) {
              console.warn("Photo conversion failed, skipping upload");
            } else {
              const filePath = `${user.id}/${newEntry.id}.jpg`;
              const { error: uploadErr } = await supabase.storage
                .from("entry-photos")
                .upload(filePath, blob, { contentType: "image/jpeg", upsert: true });
              if (uploadErr) {
                console.warn("Photo upload failed:", uploadErr);
              } else {
                const { data: urlData } = supabase.storage.from("entry-photos").getPublicUrl(filePath);
                photoUrl = urlData?.publicUrl || null;
              }
            }
          }

          const { error: entryErr } = await supabase.from("entries").insert({
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
            goals: newEntry.goals || 0,
            assists: newEntry.assists || 0,
            clean_sheet: newEntry.clean_sheet || false,
            ...(photoUrl ? { photo_url: photoUrl } : {}),
          });
          if (entryErr) console.warn("Entry sync failed:", entryErr);

          // Update local entry with cloud URL (so localStorage doesn't bloat with base64)
          if (photoUrl) {
            setEntries((prev) => prev.map((e) =>
              e.id === newEntry.id ? { ...e, photo_url: photoUrl, photoPreview: photoUrl, photoData: null } : e
            ));
          }
        } catch (e) {
          console.warn("Entry sync error, queuing for retry:", e.message);
          addToSyncQueue({
            type: "entry",
            entry: {
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
            },
            photoData: newEntry.photoData || null,
          });
        }
      })();
    }
  };

  const executeDeleteEntry = async (entryId) => {
    // Remove from local state
    setEntries((prev) => prev.filter((e) => e.id !== entryId));

    // Delete from Supabase
    if (!DEMO && user) {
      try {
        const filePath = `${user.id}/${entryId}.jpg`;
        await supabase.storage.from("entry-photos").remove([filePath]);
        const { error } = await supabase.from("entries").delete().eq("id", entryId).eq("user_id", user.id);
        if (error) console.warn("Entry delete failed:", error);
      } catch (e) {
        console.warn("Entry delete error:", e.message);
      }
    }
  };

  const handleDeleteEntry = (entryId) => {
    setConfirmModal({
      title: "Delete Entry",
      message: "Delete this entry? This can't be undone.",
      confirmLabel: "Delete",
      onConfirm: () => { setConfirmModal(null); executeDeleteEntry(entryId); },
    });
  };

  const handleSignOut = async () => {
    const wasDemo = isDemo;
    await supabase.auth.signOut();
    localStorage.removeItem("teamSeason");
    localStorage.removeItem("teamSeasonAdmin");
    localStorage.removeItem("teamSeasonAll");
    localStorage.removeItem(SYNC_QUEUE_KEY);
    setAuthed(false);
    setUser(null);
    setIsDemo(false);
    setScreen(wasDemo ? "onboard" : "auth");
    setTeam(null);
    setSeason(null);
    setPlayers([]);
    setEntries([]);
    setAllSeasons([]);
    setActiveSeasonIdx(0);
    activeIdxRef.current = 0;
    setOrg(null);
    setOrgTeams([]);
    setRole(null);
    setShowMenu(false);
  };

  const executeDeleteAccount = async () => {
    try {
      if (user) {
        await supabase.from("entries").delete().eq("user_id", user.id);
        await supabase.from("seasons").delete().eq("user_id", user.id);
        await supabase.from("players").delete().eq("team_id", team?.id);
        await supabase.from("teams").delete().eq("created_by", user.id);
        const { data: files } = await supabase.storage.from("entry-photos").list(user.id);
        if (files?.length) {
          await supabase.storage.from("entry-photos").remove(files.map((f) => `${user.id}/${f.name}`));
        }
      }
    } catch (e) {
      console.warn("Cleanup error (continuing with signout):", e);
    }
    handleSignOut();
  };

  const handleDeleteAccount = () => {
    setConfirmModal({
      title: "Delete Account",
      message: "This will permanently delete all your entries, photos, and seasons. This cannot be undone.",
      confirmLabel: "Delete Everything",
      inputConfirm: "DELETE",
      onConfirm: () => { setConfirmModal(null); executeDeleteAccount(); },
    });
  };

  // Sort entries newest first, then filter
  const sortedEntries = [...entries].sort((a, b) => {
    const dateCompare = new Date(b.entry_date) - new Date(a.entry_date);
    if (dateCompare !== 0) return dateCompare;
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  });
  const offFieldTypes = ["event", "sightseeing", "food"];
  const filteredEntries = filter === "all"
    ? sortedEntries
    : filter === "off-field"
    ? sortedEntries.filter((e) => offFieldTypes.includes(e.entry_type))
    : sortedEntries.filter((e) => e.entry_type === filter);

  // --- RENDER ---
  return (
    <>
      <GlobalStyle />

      {screen === "loading" && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          minHeight: "100dvh", fontFamily: fonts.body, color: "rgba(255,255,255,0.7)",
          flexDirection: "column", gap: 12,
          background: `linear-gradient(160deg, ${theme.primary} 0%, #2D6A4F 50%, #40916C 100%)`,
        }}>
          <div style={{
            width: 32, height: 32, border: "3px solid rgba(255,255,255,0.2)",
            borderTopColor: "rgba(255,255,255,0.8)", borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <span style={{ fontSize: 14 }}>Loading your journal...</span>
        </div>
      )}
      {screen === "landing" && <LandingPage onDemo={handleDemo} onStart={() => setScreen("onboard")} />}
      {screen === "onboard" && (
        <ValueOnboarding
          onComplete={handleOnboardComplete}
          onSignIn={() => setScreen("auth")}
          onDemo={handleDemo}
          initialStep={new URLSearchParams(window.location.search).get("skip") === "welcome" ? 1 : 0}
        />
      )}
      {screen === "auth" && <AuthScreen onAuth={handleAuth} onDemo={handleDemo} onSkipAuth={() => { setRole("parent"); setScreen("setup"); }} onBack={() => setScreen("onboard")} />}
      {screen === "join" && joinToken && (
        <JoinScreen
          token={joinToken}
          onComplete={handleJoinAuth}
          onBack={() => { setJoinToken(null); setScreen("onboard"); }}
        />
      )}
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

      {screen === "home" && team && season && (<>
        <AppShell
          accentColor={brandPrimary}
          title={(() => {
            const myChild = players.find(p => p.is_my_child);
            return myChild ? `${myChild.name} — ${team.name}` : team.name;
          })()}
          titleIcon={team.logo ? (
            <img src={team.logo} alt="" style={{
              width: 28, height: 28, borderRadius: "50%", objectFit: "cover",
            }} />
          ) : null}
          subtitle={(() => {
            const orderData = (() => {
              try { return JSON.parse(localStorage.getItem("teamSeasonOrder") || "{}"); } catch { return {}; }
            })();
            const hasBookOrder = ["ordered", "printing", "shipped", "delivered"].includes(orderData.status);
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <button
                  onClick={() => setShowSeasonSwitcher(!showSeasonSwitcher)}
                  style={{
                    background: `${brandPrimary}08`, border: `1px solid ${brandPrimary}20`,
                    borderRadius: 20, padding: "3px 10px 3px 6px", cursor: "pointer",
                    display: "inline-flex", alignItems: "center", gap: 4,
                    fontSize: 13, color: theme.textMuted, transition: "all 0.15s",
                  }}
                >
                  <span>{team.emoji}</span>
                  <span>{season.name}</span>
                  <span style={{ fontSize: 10, marginLeft: 2 }}>{showSeasonSwitcher ? "▲" : "▼"}</span>
                </button>
                {hasBookOrder && (
                  <div onClick={() => setShowOrder(true)} style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    background: "#D1FAE5", color: "#065F46",
                    border: "1px solid #6EE7B7",
                    borderRadius: 20, padding: "2px 8px",
                    fontSize: 11, fontWeight: 600, cursor: "pointer",
                    width: "fit-content",
                  }}>
                    <span>📖</span>
                    <span>Book {orderData.status === "shipped" ? "Shipped" : orderData.status === "delivered" ? "Delivered" : "Ordered"}</span>
                  </div>
                )}
              </div>
            );
          })()}
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
                  <button onClick={() => { setShowMenu(false); setShowHelp(true); }} style={{
                      display: "block", width: "100%", padding: "10px 16px",
                      background: "none", border: "none", cursor: "pointer",
                      fontSize: 14, color: theme.text, textAlign: "left",
                    }}>
                      Help & FAQ
                  </button>
                  {role === "parent" && (
                    <button onClick={() => { setShowMenu(false); setShowMilestoneGallery(true); }} style={{
                        display: "block", width: "100%", padding: "10px 16px",
                        background: "none", border: "none", cursor: "pointer",
                        fontSize: 14, color: theme.text, textAlign: "left",
                      }}>
                        🏅 Milestones
                    </button>
                  )}
                  <button onClick={() => { setShowMenu(false); setShowScheduleImport(true); }} style={{
                      display: "block", width: "100%", padding: "10px 16px",
                      background: "none", border: "none", cursor: "pointer",
                      fontSize: 14, color: theme.text, textAlign: "left",
                    }}>
                      📅 Import Schedule
                  </button>
                  <button onClick={() => { setShowMenu(false); setShowEditSeason(true); }} style={{
                      display: "block", width: "100%", padding: "10px 16px",
                      background: "none", border: "none", cursor: "pointer",
                      fontSize: 14, color: theme.text, textAlign: "left",
                    }}>
                      Edit Season
                  </button>
                  {allSeasons.length > 1 && (
                    <button onClick={() => { setShowMenu(false); deleteSeason(activeSeasonIdx); }} style={{
                      display: "block", width: "100%", padding: "10px 16px",
                      background: "none", border: "none", cursor: "pointer",
                      fontSize: 14, color: "#DC2626", textAlign: "left",
                    }}>
                      Delete Season
                    </button>
                  )}
                  <button onClick={handleSignOut} style={{
                    display: "block", width: "100%", padding: "10px 16px",
                    background: "none", border: "none", cursor: "pointer",
                    fontSize: 14, color: theme.text, textAlign: "left",
                  }}>
                    Sign Out
                  </button>
                  <div style={{ borderTop: `1px solid ${theme.border}` }}>
                    <button onClick={() => { setShowMenu(false); handleDeleteAccount(); }} style={{
                      display: "block", width: "100%", padding: "10px 16px",
                      background: "none", border: "none", cursor: "pointer",
                      fontSize: 12, color: "#DC2626", textAlign: "left",
                    }}>
                      Delete Account
                    </button>
                  </div>
                  <div style={{ borderTop: `1px solid ${theme.border}`, padding: "8px 16px" }}>
                    <a href="/privacy" target="_blank" style={{ fontSize: 11, color: theme.textMuted, textDecoration: "none", marginRight: 12 }}>Privacy</a>
                    <a href="/terms" target="_blank" style={{ fontSize: 11, color: theme.textMuted, textDecoration: "none" }}>Terms</a>
                  </div>
                </div>
              )}
            </div>
          }
        >
          {/* Season Switcher Dropdown */}
          {showSeasonSwitcher && (
            <div style={{
              background: "white", border: `1px solid ${theme.border}`,
              borderRadius: 12, padding: 8, marginBottom: 16,
              boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
            }}>
              {allSeasons.map((s, idx) => (
                <button key={idx} onClick={() => switchToSeason(idx)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    width: "100%", padding: "10px 12px", border: "none",
                    background: idx === activeSeasonIdx ? `${brandPrimary}10` : "transparent",
                    cursor: "pointer", borderRadius: 8, textAlign: "left",
                    transition: "background 0.15s",
                  }}>
                  <span style={{ fontSize: 20 }}>{s.team?.emoji || "🏅"}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontSize: 14, fontWeight: idx === activeSeasonIdx ? 600 : 400,
                      color: idx === activeSeasonIdx ? brandPrimary : theme.text,
                    }}>{(() => {
                      const child = s.players?.find(p => p.is_my_child);
                      return child ? `${child.name} — ${s.team?.name || "Team"}` : (s.team?.name || "Team");
                    })()}</div>
                    <div style={{ fontSize: 12, color: theme.textMuted }}>{s.season?.name || "Season"}</div>
                  </div>
                  {idx === activeSeasonIdx && (
                    <span style={{ fontSize: 12, color: brandPrimary, fontWeight: 600 }}>Active</span>
                  )}
                </button>
              ))}
              <button onClick={startNewSeason}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  width: "100%", padding: "10px 12px", border: `1px dashed ${theme.border}`,
                  background: "transparent", cursor: "pointer", borderRadius: 8,
                  marginTop: 4, textAlign: "left",
                }}>
                <span style={{ fontSize: 18, color: theme.textMuted }}>+</span>
                <span style={{ fontSize: 14, color: theme.textMuted, fontWeight: 500 }}>New Season</span>
              </button>
            </div>
          )}

          {/* PWA Install Banner */}
          {showInstallBanner && !isStandalone && (installPrompt || isIOS) && (
            <div style={{
              background: `linear-gradient(135deg, ${brandPrimary}12, ${brandPrimary}06)`,
              border: `1px solid ${brandPrimary}25`,
              borderRadius: 12, padding: "16px 16px", marginBottom: 12,
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: theme.text, marginBottom: 4 }}>
                    Add to Home Screen
                  </div>
                  {isIOS ? (
                    <div style={{ fontSize: 13, color: theme.textMuted, lineHeight: 1.5 }}>
                      Tap the share button <span style={{ fontSize: 15 }}>&#x2191;</span> in Safari, then "Add to Home Screen" for the full app experience.
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, color: theme.textMuted, lineHeight: 1.5 }}>
                      Install Team Season on your phone so it's ready after every game.
                    </div>
                  )}
                </div>
                <button onClick={dismissInstallBanner} style={{
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: 18, color: theme.textMuted, padding: 0, lineHeight: 1, flexShrink: 0,
                }}>×</button>
              </div>
              {installPrompt && (
                <button onClick={handleInstall} style={{
                  marginTop: 12, width: "100%", padding: "10px 16px",
                  background: brandPrimary, color: "white", border: "none",
                  fontSize: 14, fontWeight: 600, borderRadius: 8, cursor: "pointer",
                }}>
                  Install App
                </button>
              )}
            </div>
          )}

          {/* Stats */}
          <SeasonStats entries={entries} brandColor={brandPrimary} />

          {/* On This Day — memory resurfacing (Day One-style) */}
          <OnThisDay
            entries={entries}
            playerName={players?.find((p) => p.is_my_child)?.name}
            brandColor={brandPrimary}
          />

          {/* Upcoming Games + Missed Game Nudges */}
          {schedule.length > 0 && (
            <UpcomingGames
              schedule={schedule}
              entries={entries}
              brandColor={brandPrimary}
              onLogGame={(game) => {
                setComposerPrefill({ date: game.date, opponent: game.summary });
                setShowComposer(true);
              }}
              onOpenSchedule={() => setShowScheduleImport(true)}
            />
          )}

          {/* Import schedule prompt (only show if no schedule yet and has entries) */}
          {schedule.length === 0 && entries.length >= 2 && !localStorage.getItem("ts_schedule_dismissed") && (
            <div style={{
              background: `${brandPrimary}06`, border: `1px solid ${brandPrimary}15`,
              borderRadius: 12, padding: "12px 14px", marginBottom: 12,
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>
                  📅 Import your schedule
                </div>
                <div style={{ fontSize: 11, color: theme.textMuted }}>
                  We'll remind you to log games and track what's coming up
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button onClick={() => setShowScheduleImport(true)} style={{
                  background: brandPrimary, color: "white", border: "none",
                  borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}>Import</button>
                <button onClick={() => localStorage.setItem("ts_schedule_dismissed", "1")} style={{
                  background: "none", border: "none", color: theme.textLight, fontSize: 16, cursor: "pointer",
                }}>×</button>
              </div>
            </div>
          )}

          {/* Post-game nudge */}
          {(() => {
            if (entries.length === 0 || nudgeDismissed) return null;
            const sorted = [...entries].sort((a, b) => new Date(b.entry_date) - new Date(a.entry_date));
            const lastDate = new Date(sorted[0].entry_date);
            const now = new Date();
            const daysSince = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));
            if (daysSince < 1 || daysSince > 3) return null;
            return (
              <div style={{
                background: `${brandPrimary}08`,
                border: `1px solid ${brandPrimary}20`,
                borderRadius: 12,
                padding: "14px 16px",
                marginBottom: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: theme.text, marginBottom: 2 }}>
                    How'd the weekend go?
                  </div>
                  <div style={{ fontSize: 12, color: theme.textMuted }}>
                    {daysSince === 1 ? "Yesterday" : `${daysSince} days ago`} was your last entry
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button
                    onClick={() => { setShowComposer(true); }}
                    style={{
                      background: brandPrimary,
                      color: "white",
                      border: "none",
                      borderRadius: 8,
                      padding: "8px 14px",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Log it
                  </button>
                  <button
                    onClick={() => { localStorage.setItem("ts_nudge_dismissed", new Date().toISOString()); setNudgeDismissed(true); }}
                    style={{
                      background: "none",
                      border: "none",
                      color: theme.textLight,
                      fontSize: 16,
                      cursor: "pointer",
                      padding: "4px 6px",
                    }}
                  >
                    &#215;
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Season Lifecycle Banners */}
          {(() => {
            const hasOrder = (() => {
              try { const o = JSON.parse(localStorage.getItem("teamSeasonOrder") || "{}"); return o.status && o.status !== "idle"; } catch { return false; }
            })();
            const lastEntry = entries.length > 0 ? [...entries].sort((a, b) => new Date(b.entry_date) - new Date(a.entry_date))[0] : null;
            const daysSinceLast = lastEntry ? Math.floor((new Date() - new Date(lastEntry.entry_date)) / (1000 * 60 * 60 * 24)) : 0;
            const childName = players?.find(p => p.is_my_child)?.name || null;

            // Priority: wrap-up > book order nudge > book tease
            if (daysSinceLast >= 14 && entries.length >= 5 && !hasOrder && !dismissedBanners.wrapUp) {
              return <SeasonBanner type="wrapUp" entryCount={entries.length} brandColor={brandPrimary} playerName={childName}
                onAction={() => setShowBook(true)} onDismiss={() => dismissBanner("wrapUp")} />;
            }
            if (entries.length >= 15 && !hasOrder && !dismissedBanners.bookNudge) {
              return <SeasonBanner type="bookNudge" entryCount={entries.length} brandColor={brandPrimary} playerName={childName}
                onAction={() => { setShowBook(true); }} onDismiss={() => dismissBanner("bookNudge")} />;
            }
            if (entries.length >= 8 && entries.length < 15 && !hasOrder && !dismissedBanners.bookTease) {
              return <SeasonBanner type="bookTease" entryCount={entries.length} brandColor={brandPrimary} playerName={childName}
                onAction={() => setShowBook(true)} onDismiss={() => dismissBanner("bookTease")} />;
            }
            return null;
          })()}

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
            overflowX: "auto", WebkitOverflowScrolling: "touch",
            scrollbarWidth: "none", msOverflowStyle: "none",
          }}>
            {[
              { id: "all", label: "All" },
              { id: "game", label: "Games" },
              { id: "practice", label: "Practice" },
              { id: "tournament", label: "Tournaments" },
              { id: "off-field", label: "Off Field" },
              { id: "moment", label: "Moments" },
            ].map((tab) => (
              <button key={tab.id} onClick={() => setFilter(tab.id)}
                style={{
                  padding: "6px 14px", borderRadius: 8, border: "none",
                  background: filter === tab.id ? `${brandPrimary}10` : "transparent",
                  color: filter === tab.id ? brandPrimary : theme.textMuted,
                  fontWeight: filter === tab.id ? 600 : 400, fontSize: 13,
                  cursor: "pointer", transition: "all 0.15s",
                  whiteSpace: "nowrap", flexShrink: 0,
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
                {role === "coach"
                  ? "Your season record starts here"
                  : role === "parent" && players[0]?.name
                  ? `${players[0].name}'s season story starts here`
                  : "Your season story starts here"}
              </p>
              <p style={{ fontSize: 14 }}>
                {role === "coach"
                  ? "Tap \"New Entry\" after your next game"
                  : "Tap \"New Entry\" after your next game or practice"}
              </p>
            </div>
          ) : (
            filteredEntries.map((entry) => (
              <EntryCard key={entry.id} entry={entry} players={players} onShare={(e) => setShareEntry(e)} onDelete={handleDeleteEntry} brandColor={brandPrimary} />
            ))
          )}

          {/* Modals */}
          {showComposer && (
            <EntryComposer
              season={season}
              players={players}
              onSave={(data) => { handleSaveEntry(data); setComposerPrefill(null); }}
              onClose={() => { setShowComposer(false); setComposerPrefill(null); }}
              brandColor={brandPrimary}
              orgName={team?.orgName || null}
              role={role}
              prefillDate={composerPrefill?.date}
              prefillOpponent={composerPrefill?.opponent}
            />
          )}

          {showScheduleImport && (
            <ScheduleImportModal
              onImport={handleScheduleImport}
              onClose={() => setShowScheduleImport(false)}
              brandColor={brandPrimary}
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
              onStartNewSeason={startNewSeason}
            />
          )}

          {/* Edit Season Modal */}
          {showEditSeason && (
            <EditSeasonModal
              team={team}
              season={season}
              players={players}
              brandColor={brandPrimary}
              role={role}
              onSave={handleEditSeason}
              onClose={() => setShowEditSeason(false)}
            />
          )}

          {/* Help & FAQ Modal */}
          {showHelp && (
            <div style={{
              position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
              zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
              padding: 20,
            }} onClick={() => setShowHelp(false)}>
              <div style={{
                background: "white", borderRadius: 16, maxWidth: 440, width: "100%",
                maxHeight: "80vh", overflow: "auto", padding: "28px 24px",
                boxShadow: "0 24px 48px rgba(0,0,0,0.15)",
              }} onClick={(e) => e.stopPropagation()}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <h2 style={{
                    fontFamily: "'Crimson Pro', Georgia, serif", fontSize: 24,
                    fontWeight: 700, color: brandPrimary, margin: 0,
                  }}>Help & FAQ</h2>
                  <button onClick={() => setShowHelp(false)} style={{
                    background: "none", border: "none", fontSize: 22, color: theme.textMuted,
                    cursor: "pointer", padding: 0, lineHeight: 1,
                  }}>×</button>
                </div>

                {[
                  { q: "Is Team Season free?", a: "The journal app is free forever. You only pay if you want a printed hardcover book at the end of the season." },
                  { q: "How do I add an entry?", a: "Tap the \"New Entry\" button after a game, practice, or any moment worth remembering. Add a score, a photo, and what you noticed." },
                  { q: "Can I journal for more than one kid?", a: "Yes. Tap the season name at the top of your journal to switch between seasons, or tap \"+\" to start a new one." },
                  { q: "How does the book work?", a: "At the end of the season, tap the book icon to preview your hardcover photo book. Every entry becomes a page. You can order it right from the app." },
                  { q: "Is my data private?", a: "Your journal is yours. Nothing is shared unless you choose to share it." },
                  { q: "How do I install the app?", a: isIOS
                    ? "In Safari, tap the share button and select \"Add to Home Screen.\" Team Season will appear as an app on your phone."
                    : "If you see the \"Add to Home Screen\" banner, tap \"Install App.\" You can also install from your browser's menu."
                  },
                ].map((item, i) => (
                  <div key={i} style={{
                    borderTop: i === 0 ? "none" : `1px solid ${theme.border}`,
                    paddingTop: i === 0 ? 0 : 14, paddingBottom: 14,
                  }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: theme.text, marginBottom: 4 }}>
                      {item.q}
                    </div>
                    <div style={{ fontSize: 14, color: theme.textMuted, lineHeight: 1.6 }}>
                      {item.a}
                    </div>
                  </div>
                ))}

                <div style={{
                  borderTop: `1px solid ${theme.border}`, paddingTop: 16, marginTop: 4,
                  textAlign: "center",
                }}>
                  <div style={{ fontSize: 13, color: theme.textMuted, marginBottom: 6 }}>
                    Still have a question?
                  </div>
                  <a href="mailto:hello@teamseason.app" style={{
                    fontSize: 14, fontWeight: 600, color: brandPrimary, textDecoration: "none",
                  }}>
                    hello@teamseason.app
                  </a>
                </div>
              </div>
            </div>
          )}
        </AppShell>
      </>)}

      {/* Book Ordered Celebration */}
      {showOrderCelebration && (
        <BookOrderedCelebration
          seasonName={season?.name || ""}
          teamColor={brandPrimary}
          onStartNewSeason={() => { setShowOrderCelebration(false); setShowOrder(false); startNewSeason(); }}
          onClose={() => setShowOrderCelebration(false)}
        />
      )}

      {/* Celebration / Milestone modal */}
      {showCelebration && (
        <CelebrationModal
          celebration={showCelebration}
          brandColor={brandPrimary}
          playerName={players?.find(p => p.is_my_child)?.name || null}
          onClose={() => setShowCelebration(null)}
          onViewBook={() => setShowBook(true)}
        />
      )}

      {/* Player Milestone Card (FIFA-style) */}
      {showMilestoneCard && (() => {
        const myChild = players?.find(p => p.is_my_child);
        const milestoneStats = computePlayerStats(entries);
        return (
          <PlayerMilestoneCard
            milestone={showMilestoneCard}
            playerName={myChild?.name || null}
            playerPhoto={myChild?.headshot || null}
            playerFlags={myChild?.flags || []}
            playerPosition={myChild?.position || null}
            teamName={team?.name || ""}
            teamColor={brandPrimary}
            teamEmoji={team?.emoji || "🏅"}
            seasonName={season?.name || ""}
            stats={milestoneStats}
            onClose={() => setShowMilestoneCard(null)}
          />
        );
      })()}

      {/* Milestone Gallery */}
      {showMilestoneGallery && (() => {
        const myChild = players?.find(p => p.is_my_child);
        const milestoneStats = computePlayerStats(entries);
        return (
          <MilestoneGallery
            milestones={getEarnedMilestones(entries)}
            playerName={myChild?.name || null}
            playerPhoto={myChild?.headshot || null}
            playerFlags={myChild?.flags || []}
            playerPosition={myChild?.position || null}
            teamName={team?.name || ""}
            teamColor={brandPrimary}
            teamEmoji={team?.emoji || "🏅"}
            seasonName={season?.name || ""}
            stats={milestoneStats}
            onClose={() => setShowMilestoneGallery(false)}
          />
        );
      })()}

      {/* Share prompt toast */}
      {showSharePrompt && shareEntry && (
        <SharePrompt
          entry={shareEntry}
          brandColor={brandPrimary}
          bookPageCount={entries.length > 0 ? paginateEntries(entries).length + 3 : 0}
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
          entries={entries}
          onClose={() => setShareEntry(null)}
          entryNumber={(() => {
            const sorted = [...entries].sort((a, b) => new Date(a.entry_date) - new Date(b.entry_date));
            return sorted.findIndex((e) => e.id === shareEntry.id) + 1;
          })()}
        />
      )}

      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          confirmLabel={confirmModal.confirmLabel}
          confirmColor={confirmModal.confirmColor}
          inputConfirm={confirmModal.inputConfirm}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal(null)}
        />
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />
      )}
    </>
  );
}

export default function SportsJournalApp() {
  return <ErrorBoundary><SportsJournalAppInner /></ErrorBoundary>;
}
