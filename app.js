// O.S.A.R. public release terminal.
// Records are AES-GCM encrypted; the key is derived from the access code itself.
// Nothing in this file or in /records reveals a code or its contents.

const enc = new TextEncoder();
const normalize = (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function idFor(norm) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode("osar-id:" + norm)));
  return [...h].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 24);
}
async function keyFor(norm, id) {
  const base = await crypto.subtle.importKey("raw", enc.encode(norm), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: enc.encode("osar-vellum-oru:" + id), iterations: 200000, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
}

async function open(code) {
  const norm = normalize(code);
  if (!norm) return null;
  const id = await idFor(norm);
  const res = await fetch(`records/${id}.json`, { cache: "no-store" });
  if (!res.ok) return null;
  const { iv, ct } = await res.json();
  const key = await keyFor(norm, id);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(iv) }, key, fromB64(ct));
  return JSON.parse(new TextDecoder().decode(plain));
}

// ---------- rendering (textContent only) ----------
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

// "[REDACTED]" in text becomes a black bar
function withRedactions(p, text) {
  text.split(/(\[REDACTED\])/).forEach((part) => {
    if (part === "[REDACTED]") {
      const s = el("span", "redacted", "████████████");
      s.setAttribute("aria-label", "redacted");
      p.append(s);
    } else p.append(part);
  });
  return p;
}

function render(rec) {
  const card = el("article", "card negative");
  card.append(el("p", "ref", rec.ref));
  card.append(el("h2", null, rec.title));
  card.append(el("div", "stamp", rec.classification));
  const hasQ = rec.body.some((b) => b.t === "q");
  for (const b of rec.body) {
    if (b.t === "photo") {
      const fig = el("figure");
      const img = el("img");
      img.src = b.src;
      img.alt = b.v;
      fig.append(img, el("figcaption", null, b.v));
      card.append(fig);
    } else if (b.t === "a") {
      card.append(withRedactions(el("p", hasQ ? "a" : "a plain"), b.v));
    } else {
      card.append(withRedactions(el("p", b.t), b.v));
    }
  }
  return card;
}

// ---------- form ----------
const form = document.getElementById("lookup");
const input = document.getElementById("code");
const status = document.getElementById("status");
const slot = document.getElementById("record");
const button = form.querySelector("button");

let attempts = 0;
try { attempts = Number(localStorage.getItem("osar-attempts") || 0); } catch {}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  status.className = "status";
  status.textContent = "Searching the archive…";
  button.disabled = true;
  let rec = null;
  try { rec = await open(input.value); } catch { rec = null; }
  button.disabled = false;

  if (!rec) {
    attempts += 1;
    try { localStorage.setItem("osar-attempts", String(attempts)); } catch {}
    status.className = "status denied";
    status.textContent = `No record matches that code. Check it against the recovered material. Attempt ${attempts} logged.`;
    input.select();
    return;
  }

  status.textContent = `Record ${rec.ref} opened.`;
  const card = render(rec);
  slot.replaceChildren(card);
  card.scrollIntoView({ behavior: "smooth", block: "start" });
  // develop the negative
  requestAnimationFrame(() => requestAnimationFrame(() => {
    card.classList.add("developing");
    card.classList.remove("negative");
  }));
});

console.log("%cYou are reading the source. Something is reading you.", "color:#c8b400;font:16px 'Special Elite',monospace");

// ---------- night of pressure ----------
// Friday, November 13, 2026, from 6:42 PM until 4:00 AM, in the visitor's own time zone.
const EVENT_START = new Date(2026, 10, 13, 18, 42, 0);
const EVENT_END = new Date(2026, 10, 14, 4, 0, 0);
const BARO_BOTTOM = new Date(2026, 10, 13, 23, 59, 0);

function pressureNight(now = new Date()) {
  return now >= EVENT_START && now < EVENT_END;
}

function baroAt(now) {
  const k = Math.min(1, Math.max(0, (now - EVENT_START) / (BARO_BOTTOM - EVENT_START)));
  return 29.92 - (29.92 - 27.14) * Math.pow(k, 1.6);
}

async function startPressureNight() {
  document.body.classList.add("pressure");
  const bar = el("div", "advisory");
  bar.setAttribute("role", "alert");
  const msg = el("span", null, "Surface pressure advisory in effect for your area. Protocol 4 suspended.");
  const baro = el("span", "baro");
  bar.append(msg, baro);
  document.body.prepend(bar);
  const tick = () => { baro.textContent = baroAt(new Date()).toFixed(2) + " inHg"; };
  tick(); setInterval(tick, 1000);

  let rec = null;
  try { rec = await open("PRESSURE-" + EVENT_START.getFullYear() + "1113"); } catch { rec = null; }
  if (!rec) return;
  setTimeout(() => {
    const card = render(rec);
    card.classList.add("transmission");
    slot.replaceChildren(card);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      card.classList.add("developing");
      card.classList.remove("negative");
    }));
  }, 2500);
  console.log("%cThe pressure is falling. Do not look up.", "color:#ff4a3d;font:18px 'Special Elite',monospace");
}

if (pressureNight()) startPressureNight();
