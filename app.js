// Dziennik Instruktora — aplikacja (design v1 + Supabase)
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== Stan =====
let jezdzcy = [];   // {id, imie, poziom, od, umie[], poprawa[], postawa[], lubi[], konie[], notatki[]}
let konie = [];     // {id, imie, typ, opis, foto}
let treningi = [];  // {id, gid, kto, kon, data, typ, grupowa, cw[], nota, ocena}
let userSubscriptions = []; // ['planer','analityk','raport']
let screen = "start";
let monthOpen = false;
let selDay = new Date().toISOString().slice(0, 10);
let editing = null;
let expandedT = null;
let wybrani = [];
let sameAll = true;
let typSel = "plac";
let edycja = null;
let cwSel = new Set();
let cwOpen = false;
let statsAnimated = false;
let calYear = new Date().getFullYear();
let calMies = new Date().getMonth();
let touchStartX = 0;
const CW_LIMIT = 7;

// ── Custom select ──
const CHEVRON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>`;
function initCustomSelects() {
  document.querySelectorAll('select.f:not([data-cs])').forEach(sel => {
    sel.dataset.cs = '1';
    const wrap = document.createElement('div');
    wrap.className = 'csel';
    const val = document.createElement('div');
    val.className = 'csel-val';
    const span = document.createElement('span');
    span.textContent = sel.options[sel.selectedIndex]?.text || '';
    val.appendChild(span);
    val.innerHTML += CHEVRON;
    const drop = document.createElement('div');
    drop.className = 'csel-drop';
    Array.from(sel.options).forEach(opt => {
      const item = document.createElement('div');
      item.className = 'csel-opt' + (opt.selected ? ' active' : '');
      item.textContent = opt.text;
      item.addEventListener('click', e => {
        e.stopPropagation();
        sel.value = opt.value;
        wrap.querySelector('.csel-val span').textContent = opt.text;
        drop.querySelectorAll('.csel-opt').forEach(o => o.classList.remove('active'));
        item.classList.add('active');
        wrap.classList.remove('open');
      });
      drop.appendChild(item);
    });
    val.addEventListener('click', e => {
      e.stopPropagation();
      document.querySelectorAll('.csel.open').forEach(c => { if (c !== wrap) c.classList.remove('open'); });
      wrap.classList.toggle('open');
    });
    wrap.appendChild(val);
    wrap.appendChild(drop);
    sel.style.display = 'none';
    sel.parentNode.insertBefore(wrap, sel);
  });
}
if (!window._cselOutside) {
  window._cselOutside = true;
  document.addEventListener('click', () => document.querySelectorAll('.csel.open').forEach(c => c.classList.remove('open')));
}

const CWICZENIA = {
  "plac": [
    "Cavaletti w kłusie","Cavaletti w galopie",
    "Przejścia stęp–kłus–stęp","Przejścia kłus–galop–kłus","Przejścia stęp–galop–stęp",
    "Ósemka w kłusie","Ósemka w galopie","Serpentyna",
    "Koło 20 m","Koło 10 m",
    "Półsiad w kłusie","Półsiad w galopie",
    "Skoki przez krzyżak w kłusie","Skoki przez krzyżak w galopie",
    "Ustępowanie od łydki","Jazda bez strzemion",
    "Półwolta w kłusie","Półwolta w galopie"
  ],
  "lonża": [
    "Kłus anglezowany","Kłus ćwiczebny",
    "Półsiad w stępie","Półsiad w kłusie",
    "Anglezowanie na sucho",
    "Drągi w stępie","Drągi w kłusie"
  ],
  "teren": []
};
const SUGESTIE = {
  umie: CWICZENIA["plac"].concat(["Kłus anglezowany","Kłus ćwiczebny","Galop w półsiadzie","Jazda w terenie"]),
  poprawa: ["Praca łydki","Spokojna ręka","Równowaga bez strzemion","Utrzymanie tempa","Półparady","Dokładność najazdów"],
  postawa: ["Patrzy w dół","Spięte ramiona","Garbi się","Zapada się w siodle","Pięta ucieka do góry","Napięte dłonie","Sztywność w biodrach","Zjeżdża na bok"],
  lubi: ["plac","teren","skoki","ujeżdżenie","lonża"]
};
const TYPY = ["plac","teren","lonża"];
const KOLORY = [["#B8D9C8","#2A6648"],["#F7C9AD","#9B4020"],["#B8D8DE","#24707C"],["#D8CEE8","#5C3E8A"],["#EDD9A3","#7A5415"]];
const MCLS = ["m-sage","","m-peach","m-sand"];
const DNI = ["niedziela","poniedziałek","wtorek","środa","czwartek","piątek","sobota"];
const DNI_K = ["nd","pn","wt","śr","cz","pt","so"];
const MIESIACE = ["stycznia","lutego","marca","kwietnia","maja","czerwca","lipca","sierpnia","września","października","listopada","grudnia"];
const MIES_N = ["Styczeń","Luty","Marzec","Kwiecień","Maj","Czerwiec","Lipiec","Sierpień","Wrzesień","Październik","Listopad","Grudzień"];

// ===== Pomocnicze =====
const content = () => document.getElementById("content");
const av = (i) => KOLORY[((i % KOLORY.length) + KOLORY.length) % KOLORY.length];
const avStyle = (i) => { const [bg, fg] = av(i); return `background:${bg};color:${fg}`; };
const idxJ = (imie) => jezdzcy.findIndex(j => j.imie === imie);
const ini = (s) => (s || "?").slice(0, 2).toUpperCase();
const fotoKonia = (n) => (konie.find(k => k.imie === n) || {}).foto || "";
const stars = (n) => `<span class="stars">${"★".repeat(n || 0)}${"☆".repeat(5 - (n || 0))}</span>`;
const fmtD = (iso) => { const d = new Date(iso); return `${DNI[d.getDay()]}, ${d.getDate()} ${MIESIACE[d.getMonth()]}`; };
const gKey = (t) => t.gid || t.id;
const grupy = (lista) => {
  const m = new Map();
  lista.forEach(t => { const k = gKey(t); if (!m.has(k)) m.set(k, []); m.get(k).push(t); });
  return [...m.entries()];
};
const esc = (s) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

// ===== Logowanie =====
const viewLogin = document.getElementById("view-login");
const viewApp = document.getElementById("view-app");
const tabbar = document.getElementById("tabbar");
function showView(v) {
  viewLogin.classList.toggle("hidden", v !== "login");
  viewApp.classList.toggle("hidden", v !== "app");
  tabbar.classList.toggle("hidden", v !== "app");
}
let _authMode = "login"; // "login" | "register"

window.switchAuthMode = (mode) => {
  _authMode = mode;
  const isReg = mode === "register";
  document.getElementById("tab-login").classList.toggle("auth-tab--active", !isReg);
  document.getElementById("tab-register").classList.toggle("auth-tab--active", isReg);
  document.getElementById("register-fields").classList.toggle("hidden", !isReg);
  document.getElementById("auth-submit-btn").textContent = isReg ? "Utwórz konto" : "Zaloguj się";
  document.getElementById("auth-subtitle").textContent = isReg
    ? "Załóż konto i zacznij prowadzić dziennik" : "Twoi jeźdźcy, konie i treningi w jednym miejscu";
  document.getElementById("login-error").classList.add("hidden");
  document.getElementById("login-success").classList.add("hidden");
  if (isReg) {
    document.getElementById("password").autocomplete = "new-password";
  } else {
    document.getElementById("password").autocomplete = "current-password";
    document.getElementById("password2").value = "";
  }
};

window.loginWithGoogle = async function() {
  const { error } = await db.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin }
  });
  if (error) {
    const err = document.getElementById("login-error");
    err.textContent = error.message;
    err.classList.remove("hidden");
  }
};

document.getElementById("login-form").addEventListener("submit", async e => {
  e.preventDefault();
  const err = document.getElementById("login-error");
  const suc = document.getElementById("login-success");
  const btn = document.getElementById("auth-submit-btn");
  err.classList.add("hidden");
  suc.classList.add("hidden");

  const email = document.getElementById("email").value.trim();
  const pass  = document.getElementById("password").value;

  btn.disabled = true;
  btn.textContent = "Chwileczkę…";

  if (_authMode === "register") {
    const pass2 = document.getElementById("password2").value;
    if (pass.length < 6) {
      err.textContent = "Hasło musi mieć co najmniej 6 znaków.";
      err.classList.remove("hidden");
      btn.disabled = false; btn.textContent = "Utwórz konto"; return;
    }
    if (pass !== pass2) {
      err.textContent = "Hasła nie są identyczne.";
      err.classList.remove("hidden");
      btn.disabled = false; btn.textContent = "Utwórz konto"; return;
    }
    const { error } = await db.auth.signUp({ email, password: pass });
    btn.disabled = false; btn.textContent = "Utwórz konto";
    if (error) {
      err.textContent = error.message === "User already registered"
        ? "Ten e-mail jest już zarejestrowany. Zaloguj się."
        : error.message;
      err.classList.remove("hidden");
    } else {
      suc.textContent = "✓ Konto utworzone! Możesz się teraz zalogować.";
      suc.classList.remove("hidden");
      switchAuthMode("login");
      document.getElementById("password").value = "";
    }
  } else {
    const { error } = await db.auth.signInWithPassword({ email, password: pass });
    btn.disabled = false; btn.textContent = "Zaloguj się";
    if (error) {
      err.textContent = "Nieprawidłowy e-mail lub hasło.";
      err.classList.remove("hidden"); return;
    }
    onLogin();
  }
});
async function init() {
  const { data: { session } } = await db.auth.getSession();
  const splash = document.getElementById("view-splash");
  if (session) { onLogin(); } else { showView("login"); }
  if (splash) { splash.style.transition = "opacity .3s"; splash.style.opacity = "0"; setTimeout(() => splash.remove(), 320); }
}
async function onLogin() {
  statsAnimated = false;
  showView("app");
  content().innerHTML = "<p class='loading'>Ładowanie…</p>";
  await loadAll();
  await loadSubscriptions();
  // Obsługa powrotu z Stripe Checkout
  const params = new URLSearchParams(window.location.search);
  // Ciemny motyw
  if (localStorage.getItem("darkMode") === "1") document.body.classList.add("dark-mode");

  if (params.get("payment") === "success") {
    const agentId = params.get("agent") || "";
    history.replaceState({}, "", window.location.pathname);
    openKontoPanel();
    // Webhook może dojść z opóźnieniem — polluj przez maks. 12 sekund
    if (agentId && !userSubscriptions.includes(agentId)) {
      pollSubscription(agentId);
    }
  } else {
    if (params.has("payment")) history.replaceState({}, "", window.location.pathname);
    const defScreen = localStorage.getItem("defaultScreen") || "start";
    go(defScreen);
  }
}

// Polluje co 2s przez maks. 12s aż agent pojawi się w subskrypcjach (obsługa race condition z webhookiem)
async function pollSubscription(agentId, attempts = 0) {
  if (attempts >= 6) return; // 6 × 2s = 12s max
  await new Promise(r => setTimeout(r, 2000));
  await loadSubscriptions();
  if (userSubscriptions.includes(agentId)) {
    renderKontoAgenci(); // odśwież widok — agent odblokowany
    return;
  }
  renderKontoAgenciVerifying(); // pokaż "Weryfikuję…" dalej
  pollSubscription(agentId, attempts + 1);
}

// Tymczasowy render podczas weryfikacji
function renderKontoAgenciVerifying() {
  const el = document.getElementById("konto-agenci");
  if (!el) return;
  // Zmień przyciski przy niezatwierdzonych agentach na spinner
  el.querySelectorAll(".konto-agent__btn--buy").forEach(btn => {
    if (btn.textContent !== "Weryfikuję…") {
      btn.textContent = "Weryfikuję…";
      btn.disabled = true;
    }
  });
}

async function loadSubscriptions() {
  try {
    const { data } = await db.from("subscriptions")
      .select("agent_id, status, current_period_end");
    userSubscriptions = (data || []).filter(s => {
      if (s.status !== "active" && s.status !== "trialing") return false;
      if (s.current_period_end && new Date(s.current_period_end) < new Date()) return false;
      return true;
    }).map(s => s.agent_id);
  } catch {
    userSubscriptions = [];
  }
}
window.logout = async () => {
  if (!confirm("Wylogować się?")) return;
  await db.auth.signOut();
  showView("login");
};

// ===== Dane z Supabase =====
async function loadAll() {
  const [jz, kn] = await Promise.all([
    db.from("jezdzcy").select("*").eq("aktywny", true).order("imie"),
    db.from("konie").select("*").order("imie"),
  ]);
  konie = (kn.data || []).map(r => ({ id: r.id, imie: r.imie, typ: r.typ || "uniwersalny", opis: r.charakterystyka || "", foto: r.zdjecie_url || "", fit: r.zdjecie_fit || "cover", pos: r.zdjecie_pos || "50% 50%" }));
  jezdzcy = (jz.data || []).map(r => ({
    id: r.id, imie: r.imie, poziom: r.poziom || "—", od: r.jezdzi_od || "—",
    umie: r.umiejetnosci || [], poprawa: r.do_poprawy || [], postawa: r.postawa || [],
    lubi: r.preferencje || [], konie: r.konie || [],
    notatki: Array.isArray(r.notatki) ? r.notatki : []
  }));
  await loadTreningi();
}
async function loadTreningi() {
  const { data } = await db.from("treningi").select("*").order("data", { ascending: false }).order("created_at", { ascending: false });
  const jById = Object.fromEntries(jezdzcy.map(j => [j.id, j.imie]));
  const kById = Object.fromEntries(konie.map(k => [k.id, k.imie]));
  treningi = (data || []).map(r => ({
    id: r.id, gid: r.gid, kto: jById[r.jezdziec_id] || "?", kon: kById[r.kon_id] || "—",
    data: r.data, typ: r.typ_jazdy || "plac", grupowa: !!r.grupowa,
    cw: r.cwiczenia || [], nota: r.uwagi || "—", ocena: r.ocena || 0
  }));
}
async function saveJ(i, cols) {
  const { error } = await db.from("jezdzcy").update(cols).eq("id", jezdzcy[i].id);
  if (error) alert("Błąd zapisu: " + error.message);
}
const COLMAP = { umie: "umiejetnosci", poprawa: "do_poprawy", postawa: "postawa", konie: "konie", lubi: "preferencje" };

// ===== Nawigacja =====
document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => go(t.dataset.screen)));
document.getElementById("btn-plus").addEventListener("click", () => renderFormularz(selDay));
function go(s) {
  screen = s;
  document.querySelectorAll(".tab").forEach(x => x.classList.toggle("active", x.dataset.screen === s));
  render(); window.scrollTo(0, 0);
}
window.go = go;
function render() {
  ({ start: renderStart, jezdzcy: () => renderJezdzcy(""), konie: renderKonie, treningi: renderTreningi, agenci: renderAgenci })[screen]?.();
}

// ===== START =====
window.toggleMonth = () => { monthOpen = !monthOpen; renderStart(); };
window.selectDay = (d) => { selDay = d; renderStart(); };
window.prevMonth = () => { calMies--; if (calMies < 0) { calMies = 11; calYear--; } monthOpen = true; renderStart(); };
window.nextMonth = () => { calMies++; if (calMies > 11) { calMies = 0; calYear++; } monthOpen = true; renderStart(); };

function renderStart() {
  const dz = new Date();
  const iso = dz.toISOString().slice(0, 10);
  const rok = calYear, mies = calMies;
  const cnt = {};
  grupy(treningi).forEach(([g, czl]) => cnt[czl[0].data] = (cnt[czl[0].data] || 0) + 1);
  const dots = (n) => `<span class="dots">${n ? "<i></i>".repeat(Math.min(n, 3)) : ""}</span>`;
  const pon = new Date(dz); pon.setDate(dz.getDate() - ((dz.getDay() + 6) % 7));
  let week = "";
  for (let i = 0; i < 7; i++) {
    const d = new Date(pon); d.setDate(pon.getDate() + i);
    const dISO = d.toISOString().slice(0, 10);
    week += `<button class="wd ${dISO === selDay ? "sel" : ""}" onclick="selectDay('${dISO}')">
      <span class="dw">${DNI_K[d.getDay()]}</span><span class="dn">${d.getDate()}</span>${dots(cnt[dISO])}</button>`;
  }
  let month = "";
  if (monthOpen) {
    const pierwszy = (new Date(rok, mies, 1).getDay() + 6) % 7;
    const dniWMies = new Date(rok, mies + 1, 0).getDate();
    const pref = `${rok}-${String(mies + 1).padStart(2, "0")}`;
    month = `<div class="month-grid">` +
      ["pn","wt","śr","cz","pt","so","nd"].map(d => `<div class="dow">${d}</div>`).join("") +
      Array(pierwszy).fill(`<div></div>`).join("") +
      Array.from({ length: dniWMies }, (_, k) => {
        const d = k + 1;
        const dIso = `${pref}-${String(d).padStart(2, "0")}`;
        return `<button class="day ${dIso === selDay ? "today" : ""}" onclick="selectDay('${dIso}')">${d}${dots(cnt[dIso])}</button>`;
      }).join("") + `</div>`;
  }
  const dnia = grupy(treningi.filter(t => t.data === selDay));

  const streak = calcStreak();
  const thisMonth = `${dz.getFullYear()}-${String(dz.getMonth()+1).padStart(2,'0')}`;
  const treningiMiesiaca = grupy(treningi.filter(t => t.data.startsWith(thisMonth))).length;

  content().innerHTML = `
    <div class="brandline">
      <span class="logo" style="font-size:21px;color:var(--ink-strong)">Cześć, Lui</span>
      <div class="right">
        <button class="iconbtn" onclick="go('jezdzcy')"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg></button>
        <a class="iconbtn" href="docs.html" title="API Docs" target="_blank" style="display:inline-flex;align-items:center;justify-content:center;text-decoration:none;color:inherit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg></a>
        <button class="iconbtn iconbtn--ai" id="btn-agent-picker" onclick="toggleAgentPicker(event)" title="Agenci AI"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg></button>
        <button class="iconbtn" onclick="openKontoPanel()" title="Ustawienia i agenci"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></button>
<button class="me" onclick="openKontoPanel()" title="Konto">LU</button>
      </div>
    </div>
    <div class="hello">${fmtD(iso)}</div>
    <div class="stats-row">
      <div class="stat-box"><div class="stat-num" id="stat-tr">${statsAnimated ? treningiMiesiaca : 0}</div><div class="stat-lbl">w tym miesiącu</div></div>
      <div class="stat-box"><div class="stat-num" id="stat-jz">${statsAnimated ? jezdzcy.length : 0}</div><div class="stat-lbl">jeźdźców</div></div>
      <div class="stat-box streak-box"><div class="stat-num">${streak > 0 ? streak + ' 🔥' : '—'}</div><div class="stat-lbl">dni z rzędu</div></div>
    </div>
    <div class="calbox" ontouchstart="touchStartX=event.touches[0].clientX" ontouchend="const dx=event.changedTouches[0].clientX-touchStartX;if(dx>50)prevMonth();else if(dx<-50)nextMonth();">
      <div class="c-top">
        <div style="display:flex;align-items:center;gap:6px">
          <button onclick="prevMonth()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--ink-strong);padding:0 4px;line-height:1;font-weight:300">&#8249;</button>
          <b>${MIES_N[mies]} ${rok}</b>
          <button onclick="nextMonth()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--ink-strong);padding:0 4px;line-height:1;font-weight:300">&#8250;</button>
        </div>
        <button class="btn-month ${monthOpen ? "open" : ""}" onclick="toggleMonth()">${monthOpen ? "zwiń" : "cały miesiąc"} <span class="chev"></span></button>
      </div>
      ${monthOpen ? month : `<div class="week">${week}</div>`}
    </div>
    <div class="sec-h"><h3>Treningi · ${selDay === iso ? "dziś" : fmtD(selDay)}</h3><a onclick="go('treningi')">Zobacz wszystkie</a></div>
    ${dnia.length ? `
    <div class="hscroll">
      ${dnia.map(([gid, czl], i) => {
        const jest = czl.length > 1;
        return `
        <div class="b-card ${MCLS[i % 4]}" onclick="expandedT='${gid}';go('treningi')">
          <span class="pill">${czl[0].typ}${jest ? " · grupa" : ""}</span>
          <h3 style="font-size:${jest ? 15 : 16.5}px">${czl.map(t => esc(t.kto)).join(", ")}</h3>
          <div class="meta">${jest ? czl.length + " os." : stars(czl[0].ocena)}</div>
          <div class="foot">${jest
            ? czl.map(t => `<img src="${fotoKonia(t.kon)}" alt="" style="margin-right:-8px;border:2px solid #fff" onerror="this.style.display='none'"/>`).join("")
            : `<img src="${fotoKonia(czl[0].kon)}" alt="" onerror="this.style.display='none'"/><span>${esc(czl[0].kon)}</span>`}</div>
        </div>`;}).join("")}
      <div class="b-card" style="border:1.5px dashed #D8DCD4;background:transparent;box-shadow:none;align-items:center;justify-content:center;cursor:pointer" onclick="renderFormularz('${selDay}')">
        <span style="font-size:28px;color:var(--sage-deep);line-height:1">＋</span>
        <span style="font-size:12px;font-weight:600;color:var(--sage-deep);margin-top:6px">Dodaj trening</span>
      </div>
    </div>` : `
    <div class="card" style="text-align:center;padding:26px 18px">
      <p style="font-size:14px;font-weight:600;color:var(--muted)">Brak treningów tego dnia</p>
      <button class="btn-sm" style="margin-top:12px" onclick="renderFormularz('${selDay}')">＋ Dodaj trening</button>
    </div>`}
    <div class="sec-h"><h3>Jeźdźcy</h3><a onclick="go('jezdzcy')">Zobacz wszystkich</a></div>
    <div class="hscroll">
      ${jezdzcy.map((j, i) => `
        <div class="rider-mini" onclick="renderProfil(${i})">
          <span class="av" style="${avStyle(i)}">${ini(j.imie)}</span>
          <b>${esc(j.imie)}</b>
          <span class="m">${esc(j.poziom)}</span>
        </div>`).join("")}
    </div>`;
  if (!statsAnimated) {
    animateCount(document.getElementById('stat-tr'), treningiMiesiaca);
    animateCount(document.getElementById('stat-jz'), jezdzcy.length);
    statsAnimated = true;
  }
}

// ===== JEŹDŹCY =====
function renderJezdzcy(filter) {
  const lista = jezdzcy.filter(j => j.imie.toLowerCase().includes(filter.toLowerCase()));
  content().innerHTML = `
    <div class="eyebrow">${jezdzcy.length} aktywnych</div>
    <div class="sec-h" style="margin-top:0"><h1 class="big" style="margin:0">Jeźdźcy</h1><a onclick="renderFormJezdziec()">＋ Dodaj</a></div>
    <input class="search" id="szukaj" placeholder="Szukaj jeźdźca..." value="${esc(filter)}" />
    ${lista.map(j => {
      const i = jezdzcy.indexOf(j);
      return `<div class="row" onclick="renderProfil(${i})">
        <span class="av" style="${avStyle(i)}">${ini(j.imie)}</span>
        <span class="tx"><b>${esc(j.imie)}</b><span class="m">${esc(j.poziom)} · ${j.lubi.join(", ") || "—"}</span></span>
        <span class="aside">→</span>
      </div>`;}).join("") || `<p style="color:var(--muted);font-weight:500">Brak wyników.</p>`}`;
  const s = document.getElementById("szukaj");
  s.addEventListener("input", e => { renderJezdzcy(e.target.value); const n = document.getElementById("szukaj"); n.focus(); n.setSelectionRange(e.target.value.length, e.target.value.length); });
}

window.renderFormJezdziec = function () {
  const konieOpcje = konie.map(k => `<option value="${esc(k.imie)}">${esc(k.imie)}</option>`).join("");
  content().innerHTML = `
    <button class="btn-back" onclick="go('jezdzcy')">← Anuluj</button>
    <h1 class="big">Nowy jeździec</h1>
    <label class="f">Imię *</label>
    <input class="f" id="nj-imie" type="text" />
    <label class="f">Poziom</label>
    <select class="f" id="nj-poziom">
      <option value="początkujący">początkujący</option>
      <option value="średniozaawansowany">średniozaawansowany</option>
      <option value="zaawansowany">zaawansowany</option>
    </select>
    <label class="f">Jeździ od</label>
    <input class="f" id="nj-od" type="text" placeholder="np. 2024" />
    <label class="f">Umiejętności <span style="font-weight:400;color:var(--muted)">(oddziel przecinkiem)</span></label>
    <input class="f" id="nj-umie" type="text" placeholder="np. kłus, galop, skoki" />
    <label class="f">Do poprawy</label>
    <input class="f" id="nj-poprawa" type="text" placeholder="np. dosiad, kontakt z wędzidłem" />
    <label class="f">Postawa</label>
    <input class="f" id="nj-postawa" type="text" placeholder="np. proste plecy, luźne ramiona" />
    <label class="f">Konie</label>
    <select class="f" id="nj-konie" multiple style="height:auto;min-height:48px">${konieOpcje}</select>
    <label class="f">Lubi</label>
    <input class="f" id="nj-lubi" type="text" placeholder="np. skoki, jazda w terenie" />
    <label class="f">Notatki</label>
    <textarea class="f" id="nj-notatki" rows="3" placeholder="Dowolne notatki o jeźdźcu..."></textarea>
    <button class="btn-primary" onclick="zapiszJezdzca()">Zapisz jeźdźca</button>`;
  initCustomSelects();
  window.scrollTo(0, 0);
};
window.zapiszJezdzca = async () => {
  const imie = document.getElementById("nj-imie").value.trim();
  if (!imie) { alert("Podaj imię."); return; }
  const split = id => (document.getElementById(id).value || "").split(",").map(s => s.trim()).filter(Boolean);
  const konieEl = document.getElementById("nj-konie");
  const konieVal = konieEl ? Array.from(konieEl.selectedOptions).map(o => o.value) : [];
  const notatki = document.getElementById("nj-notatki").value.trim();
  const { error } = await db.from("jezdzcy").insert({
    imie, poziom: document.getElementById("nj-poziom").value,
    jezdzi_od: document.getElementById("nj-od").value.trim() || null,
    umiejetnosci: split("nj-umie"),
    do_poprawy: split("nj-poprawa"),
    postawa: split("nj-postawa"),
    konie: konieVal,
    preferencje: split("nj-lubi"),
    notatki: notatki ? [notatki] : []
  });
  if (error) { alert("Błąd: " + error.message); return; }
  await loadAll(); go("jezdzcy");
};

// ===== PROFIL =====
window.renderProfil = function (i) {
  const j = jezdzcy[i];
  const hist = treningi.filter(t => t.kto === j.imie);
  const sekcje = [
    { k: "umie", t: "Umiejętności", chip: "", sug: SUGESTIE.umie },
    { k: "poprawa", t: "Do poprawy", chip: "coral", sug: SUGESTIE.poprawa },
    { k: "postawa", t: "Postawa", chip: "plum", sug: SUGESTIE.postawa },
    { k: "konie", t: "Konie", chip: "sunny", sug: konie.map(k => k.imie) },
    { k: "lubi", t: "Lubi", chip: "sky", sug: SUGESTIE.lubi },
  ];
  content().innerHTML = `
    <button class="btn-back" onclick="editing=null;go('jezdzcy')">← Jeźdźcy</button>
    <div class="p-head">
      <div class="av" style="${avStyle(i)}">${ini(j.imie)}</div>
      <div><h1>${esc(j.imie)}</h1><div class="m">${esc(j.poziom)} · jeździ od ${esc(j.od)}</div></div>
    </div>
    ${sekcje.map(s => sekcjaHTML(i, s, j)).join("")}
    ${notatkiHTML(i, j)}
    <div class="section">
      <div class="s-h"><h4>Ostatnie treningi (${hist.length})</h4></div>
      ${hist.length ? hist.slice(0, 10).map(t => `<p style="padding:3px 0"><b>${t.data.slice(8)}.${t.data.slice(5, 7)}</b> · ${esc(t.kon)} · ${t.typ} · ${stars(t.ocena)}</p>`).join("") : "<p style='color:var(--muted)'>Brak wpisów.</p>"}
    </div>`;
};

function sekcjaHTML(i, s, j) {
  const items = j[s.k];
  const isEdit = editing === s.k;
  return `<div class="section">
    <div class="s-h"><h4>${s.t}</h4><button class="btn-edit" onclick="toggleEdit(${i},'${s.k}')">${isEdit ? "Zamknij" : "Edytuj"}</button></div>
    <div class="chips">
      ${items.length ? items.map((x, xi) => `<span class="chip ${s.chip}">${esc(x)}${isEdit ? `<span class="x" onclick="usun(${i},'${s.k}',${xi})">×</span>` : ""}</span>`).join("") : `<span class="chip ghost">brak — dotknij Edytuj</span>`}
    </div>
    ${isEdit ? `<div class="edit-area">
      <div class="check-list">
        ${s.sug.filter(x => !items.includes(x)).map(x => `<label><input type="checkbox" onchange="dodaj(${i},'${s.k}','${x.replace(/'/g, "\\'")}')" /> ${esc(x)}</label>`).join("") || `<span style="font-size:13px;color:var(--muted)">wszystkie podpowiedzi już dodane</span>`}
      </div>
      <div class="add-row">
        <input id="inp-${s.k}" placeholder="Wpisz własne..." onkeydown="if(event.key==='Enter')dodajWlasne(${i},'${s.k}')" />
        <button class="btn-sm" onclick="dodajWlasne(${i},'${s.k}')">Dodaj</button>
      </div>
      <button class="btn-done" onclick="toggleEdit(${i},null)">Gotowe</button>
    </div>` : ""}
  </div>`;
}

function notatkiHTML(i, j) {
  const isEdit = editing === "notatki";
  return `<div class="section">
    <div class="s-h"><h4>Notatki</h4><button class="btn-edit" onclick="toggleEdit(${i},'notatki')">${isEdit ? "Zamknij" : "Edytuj"}</button></div>
    ${j.notatki.map((n, ni) => `<div class="note-item">${esc(n.t)}<div class="m">${n.d}${isEdit ? ` · <span style="color:#B5704C;cursor:pointer" onclick="usunNote(${i},${ni})">usuń</span>` : ""}</div></div>`).join("") || `<p style="color:var(--muted)">Brak notatek.</p>`}
    ${isEdit ? `<div class="edit-area">
      <textarea class="note-input" id="inp-notatki" rows="2" placeholder="Nowa notatka..."></textarea>
      <div class="add-row" style="margin-top:8px">
        <button class="btn-sm" style="flex:1" onclick="dodajNote(${i})">Dodaj notatkę</button>
      </div>
      <button class="btn-done" onclick="toggleEdit(${i},null)">Gotowe</button>
    </div>` : ""}
  </div>`;
}

window.toggleEdit = (i, k) => { editing = (editing === k) ? null : k; renderProfil(i); };
window.dodaj = (i, k, x) => { jezdzcy[i][k].push(x); saveJ(i, { [COLMAP[k]]: jezdzcy[i][k] }); renderProfil(i); };
window.usun = (i, k, xi) => { jezdzcy[i][k].splice(xi, 1); saveJ(i, { [COLMAP[k]]: jezdzcy[i][k] }); renderProfil(i); };
window.dodajWlasne = (i, k) => { const v = document.getElementById("inp-" + k).value.trim(); if (v) { jezdzcy[i][k].push(v); saveJ(i, { [COLMAP[k]]: jezdzcy[i][k] }); renderProfil(i); } };
window.dodajNote = (i) => {
  const v = document.getElementById("inp-notatki").value.trim();
  if (v) { jezdzcy[i].notatki.unshift({ t: v, d: new Date().toISOString().slice(0, 10) }); saveJ(i, { notatki: jezdzcy[i].notatki }); renderProfil(i); }
};
window.usunNote = (i, ni) => { jezdzcy[i].notatki.splice(ni, 1); saveJ(i, { notatki: jezdzcy[i].notatki }); renderProfil(i); };

// ===== KONIE =====
function renderKonie() {
  content().innerHTML = `
    <div class="eyebrow">${konie.length} w stajni</div>
    <div class="sec-h" style="margin-top:0"><h1 class="big" style="margin:0">Konie</h1><a onclick="renderFormKon()">＋ Dodaj</a></div>
    <div class="horse-grid">
      ${konie.map(k => `
        <div class="horse-card">
          <div class="ph" style="position:relative"><img src="${k.foto}" alt="${esc(k.imie)}" loading="lazy" style="object-fit:${k.fit || 'cover'};object-position:${k.pos || '50% 50%'}" onerror="this.style.display='none'"/>
            <button class="horse-edit-btn" onclick="renderEditKon('${k.id}')" title="Edytuj">✎</button>
          </div>
          <div class="body">
            <h3>${esc(k.imie)}</h3>
            <span class="typ">${esc(k.typ)}</span>
            <p>${esc(k.opis)}</p>
          </div>
        </div>`).join("")}
    </div>`;
}
window.renderFormKon = function () {
  content().innerHTML = `
    <button class="btn-back" onclick="go('konie')">← Anuluj</button>
    <h1 class="big">Nowy koń</h1>
    <label class="f">Imię *</label>
    <input class="f" id="nk-imie" type="text" />
    <label class="f">Typ</label>
    <select class="f" id="nk-typ">
      <option value="gorącokrwisty" selected>gorącokrwisty</option>
      <option value="zimnokrwisty">zimnokrwisty</option>
    </select>
    <label class="f">Charakterystyka</label>
    <textarea class="f" id="nk-opis" rows="3" placeholder="Temperament, do czego się nadaje..."></textarea>
    <label class="f">Zdjęcie (opcjonalnie)</label>
    <div class="foto-upload-box" id="foto-box" onclick="document.getElementById('nk-plik').click()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
      <span id="foto-label">Dotknij, aby dodać zdjęcie</span>
      <input type="file" id="nk-plik" accept="image/jpeg,image/png,image/webp" style="display:none" onchange="previewFoto(this)" />
    </div>
    <img id="nk-preview" style="display:none;width:100%;border-radius:16px;margin-top:10px;max-height:220px;object-fit:cover" />
    <label class="f" style="margin-top:12px">…lub wklej link do zdjęcia</label>
    <input class="f" id="nk-foto" type="text" placeholder="https://..." />
    <button class="btn-primary" onclick="zapiszKonia()">Zapisz konia</button>`;
  initCustomSelects();
  window.scrollTo(0, 0);
};
window.previewFoto = function(input) {
  const file = input.files[0];
  if (!file) return;
  const preview = document.getElementById("nk-preview");
  const label = document.getElementById("foto-label");
  preview.src = URL.createObjectURL(file);
  preview.style.display = "block";
  label.textContent = file.name;
};
window.renderEditKon = function(id) {
  const k = konie.find(k => k.id === id);
  if (!k) return;
  const typy = ['gorącokrwisty','zimnokrwisty'];
  content().innerHTML = `
    <button class="btn-back" onclick="go('konie')">← Anuluj</button>
    <h1 class="big">Edytuj: ${esc(k.imie)}</h1>
    <label class="f">Imię *</label>
    <input class="f" id="ek-imie" type="text" value="${esc(k.imie)}" />
    <label class="f">Typ</label>
    <select class="f" id="ek-typ">
      ${typy.map(t => `<option value="${t}" ${t === k.typ ? 'selected' : ''}>${t}</option>`).join('')}
    </select>
    <label class="f">Charakterystyka</label>
    <textarea class="f" id="ek-opis" rows="3">${esc(k.opis)}</textarea>
    <label class="f">Zdjęcie (URL)</label>
    <input class="f" id="ek-foto" type="text" value="${esc(k.foto)}" placeholder="https://..." oninput="ekFotoLive()" />
    <label class="f">Tryb wyświetlania zdjęcia</label>
    <div class="seg" id="ek-fit-seg">
      <button class="${(k.fit||'cover')==='cover'?'on':''}" onclick="ustawFit(event,'cover')">Crop</button>
      <button class="${(k.fit||'cover')==='contain'?'on':''}" onclick="ustawFit(event,'contain')">Fit</button>
      <button class="${(k.fit||'cover')==='fill'?'on':''}" onclick="ustawFit(event,'fill')">Fill</button>
    </div>
    <div id="ek-foto-preview" style="margin-top:10px;border-radius:16px;overflow:hidden;height:200px;background:var(--sage-mist);position:relative;${k.foto?'':'display:none'}">
      <img id="ek-foto-img" src="${esc(k.foto)}" style="width:100%;height:100%;object-fit:${k.fit||'cover'};object-position:${k.pos||'50% 50%'}" data-pos="${k.pos||'50% 50%'}" onerror="this.parentElement.style.display='none'" />
      <div id="ek-crop-hint" style="display:${(k.fit||'cover')==='cover'?'flex':'none'};position:absolute;bottom:8px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.45);color:#fff;font-size:11px;font-weight:600;padding:4px 12px;border-radius:20px;pointer-events:none;gap:5px;align-items:center;white-space:nowrap">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/></svg>
        Przeciągnij żeby wykadrować
      </div>
    </div>
    <button class="btn-primary" onclick="zapiszEdycjeKonia('${id}')">Zapisz zmiany</button>`;
  initCustomSelects();
  window.scrollTo(0, 0);
  setTimeout(() => {
    const preview = document.getElementById('ek-foto-preview');
    const img = document.getElementById('ek-foto-img');
    if (preview && img && (k.fit||'cover') === 'cover') {
      preview.style.cursor = 'grab';
      initCropDrag(preview, img);
    }
  }, 100);
};

window.zapiszEdycjeKonia = async (id) => {
  const imie = document.getElementById("ek-imie").value.trim();
  if (!imie) { alert("Podaj imię konia."); return; }
  const btn = document.querySelector(".btn-primary");
  btn.disabled = true; btn.textContent = "Zapisywanie...";
  const { error } = await db.from("konie").update({
    imie,
    typ: document.getElementById("ek-typ").value,
    charakterystyka: document.getElementById("ek-opis").value.trim() || null,
    zdjecie_url: document.getElementById("ek-foto").value.trim() || null,
    zdjecie_fit: document.querySelector('#ek-fit-seg .on')?.textContent === 'Crop' ? 'cover' : document.querySelector('#ek-fit-seg .on')?.textContent === 'Fit' ? 'contain' : document.querySelector('#ek-fit-seg .on')?.textContent === 'Fill' ? 'fill' : 'cover',
    zdjecie_pos: document.getElementById('ek-foto-img')?.dataset?.pos || '50% 50%'
  }).eq("id", id);
  if (error) { alert("Błąd: " + error.message); btn.disabled = false; btn.textContent = "Zapisz zmiany"; return; }
  await loadAll(); go("konie");
};

window.zapiszKonia = async () => {
  const imie = document.getElementById("nk-imie").value.trim();
  if (!imie) { alert("Podaj imię konia."); return; }
  const btn = document.querySelector(".btn-primary");
  btn.disabled = true; btn.textContent = "Zapisywanie...";
  let fotoUrl = document.getElementById("nk-foto").value.trim() || null;
  const plik = document.getElementById("nk-plik").files[0];
  if (plik) {
    const ext = plik.name.split(".").pop();
    const path = `${Date.now()}-${imie.replace(/\s+/g, "-")}.${ext}`;
    const { error: upErr } = await db.storage.from("konie").upload(path, plik, { contentType: plik.type });
    if (upErr) { alert("Błąd przesyłania zdjęcia: " + upErr.message); btn.disabled = false; btn.textContent = "Zapisz konia"; return; }
    const { data } = db.storage.from("konie").getPublicUrl(path);
    fotoUrl = data.publicUrl;
  }
  const { error } = await db.from("konie").insert({
    imie, typ: document.getElementById("nk-typ").value,
    charakterystyka: document.getElementById("nk-opis").value.trim() || null,
    zdjecie_url: fotoUrl
  });
  if (error) { alert("Błąd: " + error.message); btn.disabled = false; btn.textContent = "Zapisz konia"; return; }
  await loadAll(); go("konie");
};

// ===== TRENINGI =====
window.toggleT = (k) => { expandedT = (expandedT === k) ? null : k; renderTreningi(); };
window.usunTrening = async (gid) => {
  if (!confirm("Usunąć ten trening (wszystkich uczestników)?")) return;
  const czl = treningi.filter(t => gKey(t) === gid);
  const { error } = await db.from("treningi").delete().in("id", czl.map(t => t.id));
  if (error) { alert("Błąd: " + error.message); return; }
  await loadTreningi();
  expandedT = null; renderTreningi();
};
window.edytujTrening = (gid) => {
  const ent = treningi.filter(t => gKey(t) === gid);
  if (ent.length) renderFormularz(ent[0].data, gid);
};

function renderTreningi() {
  const dni = [...new Set(treningi.map(t => t.data))].sort().reverse();
  content().innerHTML = `
    <div class="eyebrow">${grupy(treningi).length} treningów</div>
    <h1 class="big">Treningi</h1>
    ${dni.map(d => `
      <div class="day-h">${fmtD(d)}</div>
      ${grupy(treningi.filter(t => t.data === d)).map(([gid, czl]) => {
        const open = expandedT === gid;
        const jest = czl.length > 1;
        const avs = czl.map(t => `<span class="av" style="${avStyle(idxJ(t.kto))};width:34px;height:34px;margin-right:-9px;border:2px solid #fff">${ini(t.kto)}</span>`).join("");
        return `<div class="t-row ${open ? "open" : ""}">
          <div class="t-line" onclick="toggleT('${gid}')">
            <span style="display:flex;flex:none;padding-right:9px">${avs}</span>
            <span class="tx"><b>${czl.map(t => esc(t.kto)).join(", ")}</b>
              <span class="m">${jest ? `grupa · ${czl.length} os. · ${czl[0].typ}` : `${esc(czl[0].kon)} · ${czl[0].typ} · ${stars(czl[0].ocena)}`}</span></span>
            <span class="chev"></span>
          </div>
          ${open ? `<div class="t-detail">
            ${czl[0].cw.length ? `<div class="d-label">Ćwiczenia</div><div class="chips">${czl[0].cw.map(c => `<span class="chip">${esc(c)}</span>`).join("")}</div>` : ""}
            ${czl.map(t => `
              <div class="d-label">${esc(t.kto)} · ${esc(t.kon)} · ${stars(t.ocena)}</div>
              <p>${esc(t.nota)}</p>`).join("")}
            <div class="d-label">Szczegóły</div>
            <p>${fmtD(czl[0].data)} · ${czl[0].typ}${jest ? " · jazda grupowa" : ""}</p>
            <div class="t-actions">
              <button class="b-edit" onclick="edytujTrening('${gid}')">Edytuj</button>
              <button class="b-del" onclick="usunTrening('${gid}')">Usuń</button>
            </div>
          </div>` : ""}
        </div>`;}).join("")}`).join("") || "<p style='color:var(--muted)'>Brak wpisów.</p>"}`;
}

// ===== FORMULARZ TRENINGU =====
window.updateCwiczenia = (selected = null) => {
  if (selected !== null) cwSel = new Set(selected);
  const wrap = document.getElementById("cw-wrap");
  const lista = CWICZENIA[typSel] || [];
  if (!lista.length) { wrap.innerHTML = ""; return; }
  const visible = cwOpen ? lista : lista.slice(0, CW_LIMIT);
  const reszta = lista.length - CW_LIMIT;
  wrap.innerHTML = `<label class="f">Ćwiczenia</label>
    <div class="cwiczenia-box" id="f-cw">
      ${visible.map(c => `<button class="cw ${cwSel.has(c) ? "on" : ""}" data-cw="${esc(c)}">${esc(c)}</button>`).join("")}
      ${reszta > 0 ? `<button class="cw cw-more" onclick="cwOpen=!cwOpen;updateCwiczenia()">${cwOpen ? "mniej ▲" : `więcej (${reszta}) ▼`}</button>` : ""}
    </div>`;
  document.querySelectorAll("#f-cw .cw[data-cw]").forEach(c => c.addEventListener("click", () => {
    const n = c.dataset.cw;
    cwSel.has(n) ? cwSel.delete(n) : cwSel.add(n);
    c.classList.toggle("on");
  }));
};

window.renderFormularz = function (dataISO, editGid = null) {
  edycja = editGid;
  const czl = editGid !== null ? treningi.filter(t => gKey(t) === editGid) : [];
  const ed = czl[0] || null;
  wybrani = czl.map(t => idxJ(t.kto)).filter(i => i >= 0);
  sameAll = czl.length ? czl.every(t => t.nota === czl[0].nota) : true;
  cwOpen = false;
  typSel = ed ? ed.typ : "plac";
  content().innerHTML = `
    <button class="btn-back" onclick="go('${ed ? "treningi" : "start"}')">← Anuluj</button>
    <div class="eyebrow">${fmtD(dataISO)}</div>
    <h1 class="big">${ed ? "Edytuj trening" : "Nowy trening"}</h1>

    <label class="f" style="margin-top:4px">Kto był na treningu?</label>
    <div class="who-box">
      ${jezdzcy.map((j, i) => `<span class="who ${wybrani.includes(i) ? "on" : ""}" id="who-${i}" onclick="toggleWho(${i})"><span class="mini" style="${avStyle(i)}">${ini(j.imie)}</span>${esc(j.imie)}</span>`).join("")}
    </div>

    <label class="f">Data</label>
    <input class="f" type="date" id="f-data" value="${dataISO}" />

    <label class="f">Typ jazdy</label>
    <div class="seg" id="f-typ">${TYPY.map(t => `<button class="${t === typSel ? "on" : ""}" onclick="setTyp('${t}')">${t}</button>`).join("")}</div>

    <div id="cw-wrap"></div>

    <div class="toggle-row">
      <span class="lbl">Wszystkim poszło tak samo</span>
      <label class="switch"><input type="checkbox" id="f-same" ${sameAll ? "checked" : ""} onchange="toggleSame()" /><span class="slider"></span></label>
    </div>

    <div id="shared-box" class="${sameAll ? "" : "hidden"}" style="margin-top:4px">
      <label class="f">Wspólna ocena</label>
      <div class="ocena-box" id="f-ocena-shared">${[1,2,3,4,5].map(n => `<button class="gw ${n <= 4 ? "on" : ""}" data-n="${n}" onclick="setOcena('f-ocena-shared',${n})">★</button>`).join("")}</div>
      <label class="f">Wspólna notatka</label>
      <textarea class="f" id="f-nota-shared" rows="2" placeholder="Co ćwiczyli, co poszło dobrze, nad czym pracować..."></textarea>
    </div>

    <div id="riders-box"></div>
    <button class="btn-primary" id="btn-zapisz" onclick="zapiszTrening()">${ed ? "Zapisz zmiany" : "Zapisz trening"}</button>`;
  updateCwiczenia(ed ? ed.cw : []);
  updateRiders();
  if (ed) {
    czl.forEach(t => {
      const i = idxJ(t.kto);
      const sel = document.getElementById("f-kon-" + i);
      if (sel) sel.value = t.kon;
      if (!sameAll) {
        setOcena("f-ocena-" + i, t.ocena);
        const n = document.getElementById("f-nota-" + i);
        if (n) n.value = t.nota === "—" ? "" : t.nota;
      }
    });
    if (sameAll) {
      document.getElementById("f-nota-shared").value = ed.nota === "—" ? "" : ed.nota;
      setOcena("f-ocena-shared", ed.ocena);
    }
  }
  window.scrollTo(0, 0);
};

window.setTyp = (t) => {
  typSel = t; cwOpen = false;
  document.querySelectorAll("#f-typ button").forEach(b => b.classList.toggle("on", b.textContent === t));
  updateCwiczenia([]);
};
window.toggleWho = (i) => {
  const idx = wybrani.indexOf(i);
  idx >= 0 ? wybrani.splice(idx, 1) : wybrani.push(i);
  document.getElementById("who-" + i).classList.toggle("on", idx < 0);
  updateRiders();
};
window.toggleSame = () => {
  sameAll = document.getElementById("f-same").checked;
  document.getElementById("shared-box").classList.toggle("hidden", !sameAll);
  updateRiders();
};

function updateRiders() {
  const box = document.getElementById("riders-box");
  if (!wybrani.length) { box.innerHTML = `<p style="margin-top:16px;font-size:13px;color:var(--muted);font-weight:500">Zaznacz przynajmniej jednego jeźdźca powyżej.</p>`; return; }
  box.innerHTML = wybrani.map(i => {
    const j = jezdzcy[i];
    return `<div class="rider-block">
      <div class="rb-head"><span class="mini" style="${avStyle(i)}">${ini(j.imie)}</span>${esc(j.imie)}</div>
      <label class="f" style="margin-top:10px">Koń</label>
      <select class="f" id="f-kon-${i}">${konie.map(k => `<option ${j.konie[0] === k.imie ? "selected" : ""}>${esc(k.imie)}</option>`).join("")}</select>
      ${!sameAll ? `
        <label class="f">Ocena — ${esc(j.imie)}</label>
        <div class="ocena-box" id="f-ocena-${i}">${[1,2,3,4,5].map(n => `<button class="gw ${n <= 4 ? "on" : ""}" data-n="${n}" onclick="setOcena('f-ocena-${i}',${n})">★</button>`).join("")}</div>
        <label class="f">Notatka — ${esc(j.imie)}</label>
        <textarea class="f" id="f-nota-${i}" rows="2" placeholder="Indywidualne uwagi..."></textarea>` : ""}
    </div>`;
  }).join("");
  initCustomSelects();
}

window.setOcena = (boxId, n) => {
  document.querySelectorAll(`#${boxId} .gw`).forEach(g => g.classList.toggle("on", parseInt(g.dataset.n) <= n));
};
const getOcena = (boxId) => document.querySelectorAll(`#${boxId} .gw.on`).length || 4;

window.zapiszTrening = async () => {
  if (!wybrani.length) { alert("Zaznacz przynajmniej jednego jeźdźca."); return; }
  const btn = document.getElementById("btn-zapisz");
  btn.disabled = true; btn.textContent = "Zapisywanie...";
  const kByName = Object.fromEntries(konie.map(k => [k.imie, k.id]));
  const data = document.getElementById("f-data").value;
  const gid = "g" + Date.now();
  const rows = wybrani.map(i => {
    const j = jezdzcy[i];
    return {
      gid, jezdziec_id: j.id,
      kon_id: kByName[document.getElementById("f-kon-" + i).value] || null,
      data, typ_jazdy: typSel, grupowa: wybrani.length > 1,
      cwiczenia: [...cwSel],
      uwagi: sameAll ? (document.getElementById("f-nota-shared").value || "—") : (document.getElementById("f-nota-" + i).value || "—"),
      ocena: sameAll ? getOcena("f-ocena-shared") : getOcena("f-ocena-" + i)
    };
  });
  if (edycja !== null) {
    const stare = treningi.filter(t => gKey(t) === edycja);
    await db.from("treningi").delete().in("id", stare.map(t => t.id));
  }
  const { error } = await db.from("treningi").insert(rows);
  if (error) { alert("Błąd zapisu: " + error.message); return; }
  const bylaEdycja = edycja !== null;
  selDay = data;
  edycja = null;
  await loadAll();
  go("start");
  if (!bylaEdycja) spawnConfetti();
}

// ===== Cwałek — AI chat agent =====

const CWALEK_FN_URL = `${SUPABASE_URL}/functions/v1/chat-agent`;

(function initCwalek() {
  const btn = document.getElementById("cwalek-btn");
  const panel = document.getElementById("cwalek-panel");
  const closeBtn = document.getElementById("cwalek-close");
  const input = document.getElementById("cwalek-input");
  const sendBtn = document.getElementById("cwalek-send");
  const messagesEl = document.getElementById("cwalek-messages");

  let chatHistory = []; // { role: "user"|"assistant", content: string }

  // Toggle panel
  btn.addEventListener("click", () => {
    const isOpen = !panel.classList.contains("hidden");
    panel.classList.toggle("hidden", isOpen);
    btn.classList.toggle("open", !isOpen);
    if (!isOpen) input.focus();
  });

  closeBtn.addEventListener("click", () => {
    panel.classList.add("hidden");
    btn.classList.remove("open");
  });

  // Send on Enter
  input.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  sendBtn.addEventListener("click", sendMessage);

  function formatMsg(text) {
    return text
      .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\n- /g, "\n• ")
      .replace(/^- /g, "• ")
      .replace(/\n/g, "<br>");
  }
  function appendMessage(role, text) {
    const div = document.createElement("div");
    div.className = `cwalek-msg cwalek-msg--${role === "user" ? "user" : "bot"}`;
    const p = document.createElement("p");
    p.innerHTML = formatMsg(text);
    div.appendChild(p);
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
  }

  async function sendMessage() {
    const text = input.value.trim();
    if (!text) return;

    input.value = "";
    sendBtn.disabled = true;

    appendMessage("user", text);
    chatHistory.push({ role: "user", content: text });

    // Typing indicator
    const typing = appendMessage("bot", "Cwałek myśli…");
    typing.classList.add("cwalek-msg--typing");

    // Build context from current app state
    const treningiDnia = treningi.filter(t => t.data === selDay).map(t => ({
      jezdziec: t.kto,
      kon: t.kon,
      typ: t.typ,
      cwiczenia: t.cw,
      uwagi: t.nota,
      ocena: t.ocena,
    }));

    // Get JWT token from Supabase session
    const { data: { session } } = await db.auth.getSession();
    const jwt = session?.access_token || "";

    try {
      const res = await fetch(CWALEK_FN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${jwt}`,
          "apikey": SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          messages: chatHistory,
          context: {
            selDay,
            today: new Date().toISOString().slice(0, 10),
            treningiDnia,
            jezdzcy: jezdzcy.map(j => ({ imie: j.imie, poziom: j.poziom })),
            konie: konie.map(k => ({ imie: k.imie, typ: k.typ })),
          },
        }),
      });

      const data = await res.json();
      typing.remove();

      if (data.error) {
        appendMessage("bot", `Ups, coś poszło nie tak: ${data.error}`);
      } else {
        const reply = data.reply || "Przepraszam, nie rozumiem.";
        appendMessage("bot", reply);
        chatHistory.push({ role: "assistant", content: reply });
      }
    } catch (err) {
      typing.remove();
      appendMessage("bot", "Błąd połączenia. Sprawdź internet i spróbuj ponownie.");
    }

    sendBtn.disabled = false;
    input.focus();
  }
})();

// ===== Konfetti =====
function spawnConfetti() {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:99999';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const colors = ['#557F69','#F2A98B','#B5704C','#8aab97','#f7c59f','#c0dfd1'];
  const pieces = Array.from({length: 100}, () => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * 80,
    vy: 3 + Math.random() * 4,
    vx: (Math.random() - 0.5) * 3,
    rot: Math.random() * Math.PI * 2,
    rotV: (Math.random() - 0.5) * 0.2,
    color: colors[Math.floor(Math.random() * colors.length)],
    w: 8 + Math.random() * 8,
    h: 5 + Math.random() * 5,
  }));
  let frame;
  const start = Date.now();
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;
    pieces.forEach(p => {
      p.y += p.vy; p.x += p.vx; p.rot += p.rotV;
      if (p.y < canvas.height + 20) alive = true;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, 1 - (Date.now() - start) / 2500);
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    if (alive && Date.now() - start < 2600) frame = requestAnimationFrame(draw);
    else canvas.remove();
  }
  draw();
}

// ===== Streak =====
const localISO = (d) => {
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
};
function calcStreak() {
  const daty = new Set(treningi.map(t => t.data));
  const today = localISO(new Date());
  let streak = 0;
  const d = new Date();
  if (!daty.has(today)) d.setDate(d.getDate() - 1); // łaska: jeśli dziś brak, licz od wczoraj
  for (let i = 0; i < 365; i++) {
    const iso = localISO(d);
    if (daty.has(iso)) { streak++; d.setDate(d.getDate() - 1); }
    else break;
  }
  return streak;
}

// ===== Animowane liczniki =====
function animateCount(el, target, duration = 700) {
  if (!el) return;
  let start = null;
  function step(ts) {
    if (!start) start = ts;
    const p = Math.min((ts - start) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(ease * target);
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ===== Edycja zdjęcia konia — fit =====
window.ustawFit = function(e, val) {
  e.preventDefault();
  document.querySelectorAll('#ek-fit-seg button').forEach(b => b.classList.remove('on'));
  e.currentTarget.classList.add('on');
  const img = document.getElementById('ek-foto-img');
  const hint = document.getElementById('ek-crop-hint');
  const preview = document.getElementById('ek-foto-preview');
  if (img) img.style.objectFit = val;
  if (hint) hint.style.display = val === 'cover' ? 'flex' : 'none';
  if (preview) {
    preview.style.cursor = val === 'cover' ? 'grab' : 'default';
    if (val === 'cover') initCropDrag(preview, img); else removeCropDrag(preview);
  }
};
window.ekFotoLive = function() {
  const url = document.getElementById('ek-foto').value.trim();
  const preview = document.getElementById('ek-foto-preview');
  const img = document.getElementById('ek-foto-img');
  if (!preview || !img) return;
  if (url) { img.src = url; preview.style.display = 'block'; initCropDragIfCrop(preview, img); }
  else { preview.style.display = 'none'; }
};
function initCropDragIfCrop(preview, img) {
  const isCrop = document.querySelector('#ek-fit-seg .on')?.textContent === 'Crop';
  if (isCrop) { preview.style.cursor = 'grab'; initCropDrag(preview, img); }
}
function removeCropDrag(el) {
  el._cropDrag = false;
  el.style.cursor = 'default';
}
function initCropDrag(preview, img) {
  if (preview._cropDrag) return;
  preview._cropDrag = true;
  let dragging = false, startX, startY, startPx, startPy;
  function getPosPercent() {
    const pos = img.dataset.pos || '50% 50%';
    const parts = pos.split(' ');
    return { x: parseFloat(parts[0]), y: parseFloat(parts[1]) };
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  preview.addEventListener('mousedown', function(e) {
    e.preventDefault();
    const cur = getPosPercent();
    dragging = true; startX = e.clientX; startY = e.clientY;
    startPx = cur.x; startPy = cur.y;
    preview.style.cursor = 'grabbing';
    const hint = document.getElementById('ek-crop-hint');
    if (hint) hint.style.display = 'none';
  });
  document.addEventListener('mousemove', function(e) {
    if (!dragging) return;
    const rect = preview.getBoundingClientRect();
    const dx = (e.clientX - startX) / rect.width * 100;
    const dy = (e.clientY - startY) / rect.height * 100;
    const nx = clamp(startPx - dx, 0, 100);
    const ny = clamp(startPy - dy, 0, 100);
    const posStr = nx.toFixed(1) + '% ' + ny.toFixed(1) + '%';
    img.style.objectPosition = posStr;
    img.dataset.pos = posStr;
  });
  document.addEventListener('mouseup', function() {
    if (!dragging) return;
    dragging = false;
    preview.style.cursor = 'grab';
  });
  preview.addEventListener('touchstart', function(e) {
    const t = e.touches[0];
    const cur = getPosPercent();
    dragging = true; startX = t.clientX; startY = t.clientY;
    startPx = cur.x; startPy = cur.y;
    const hint = document.getElementById('ek-crop-hint');
    if (hint) hint.style.display = 'none';
  }, { passive: true });
  preview.addEventListener('touchmove', function(e) {
    if (!dragging) return;
    e.preventDefault();
    const t = e.touches[0];
    const rect = preview.getBoundingClientRect();
    const dx = (t.clientX - startX) / rect.width * 100;
    const dy = (t.clientY - startY) / rect.height * 100;
    const nx = clamp(startPx - dx, 0, 100);
    const ny = clamp(startPy - dy, 0, 100);
    const posStr = nx.toFixed(1) + '% ' + ny.toFixed(1) + '%';
    img.style.objectPosition = posStr;
    img.dataset.pos = posStr;
  }, { passive: false });
  preview.addEventListener('touchend', function() { dragging = false; });
}


// ===== PANEL KONTA =====
window.openKontoPanel = async () => {
  const panel = document.getElementById("konto-panel");
  panel.classList.remove("hidden");
  requestAnimationFrame(() => panel.classList.add("konto-panel--open"));

  // Email użytkownika
  const { data: { user } } = await db.auth.getUser();
  const emailEl = document.getElementById("ust-email-label");
  if (emailEl && user?.email) emailEl.textContent = user.email;

  // Załaduj ustawienia z localStorage
  loadUstawienia();

  // Odśwież subskrypcje
  await loadSubscriptions();
};

window.closeKontoPanel = () => {
  const panel = document.getElementById("konto-panel");
  panel.classList.remove("konto-panel--open");
  setTimeout(() => panel.classList.add("hidden"), 280);
};

function renderKontoAgenci() {
  const el = document.getElementById("konto-agenci");
  if (!el) return;
  el.innerHTML = AGENCI_CONFIG.map(a => {
    const active = userSubscriptions.includes(a.id);
    return `
      <div class="konto-agent ${active ? "konto-agent--active" : ""}">
        <div class="konto-agent__left">
          <span class="konto-agent__emoji">${a.emoji}</span>
          <div>
            <div class="konto-agent__name">${a.nazwa}</div>
            <div class="konto-agent__cena">${active ? "✓ aktywny" : a.cena}</div>
          </div>
        </div>
        ${active
          ? `<button class="konto-agent__btn konto-agent__btn--open" onclick="closeKontoPanel();openAgentChat('${a.id}')">Otwórz</button>`
          : `<button class="konto-agent__btn konto-agent__btn--buy" onclick="subscribeAgent('${a.id}')">Kup</button>`}
      </div>`;
  }).join("");
}

// ===== USTAWIENIA =====
function loadUstawienia() {
  // Awatar
  const ac = localStorage.getItem("avatarColor") || "#557F69";
  const ab = localStorage.getItem("avatarBg") || "#EAF2ED";
  applyAvatarColor(ac, ab);

  // Powiadomienia
  ["notif-trening","notif-tydzien","notif-brak"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.checked = localStorage.getItem(id) === "1";
  });

  // Aplikacja
  const dark = localStorage.getItem("darkMode") === "1";
  const darkEl = document.getElementById("app-dark");
  if (darkEl) darkEl.checked = dark;
  if (dark) document.body.classList.add("dark-mode");

  const defScreen = localStorage.getItem("defaultScreen") || "start";
  const sel = document.getElementById("app-default-screen");
  if (sel) sel.value = defScreen;
}

window.setAvatarColor = (color, bg) => {
  localStorage.setItem("avatarColor", color);
  localStorage.setItem("avatarBg", bg);
  applyAvatarColor(color, bg);
};

function applyAvatarColor(color, bg) {
  document.querySelectorAll(".me").forEach(el => {
    el.style.background = bg;
    el.style.color = color;
  });
  const prev = document.getElementById("ust-avatar-preview");
  if (prev) { prev.style.background = bg; prev.style.color = color; }
}

window.toggleHaslo = () => {
  const form = document.getElementById("haslo-form");
  const arrow = document.getElementById("haslo-arrow");
  const open = form.classList.toggle("hidden");
  if (arrow) arrow.textContent = open ? "›" : "‹";
};

window.zapiszHaslo = async () => {
  const nowe = document.getElementById("haslo-nowe").value;
  const potw = document.getElementById("haslo-potw").value;
  const msg = document.getElementById("haslo-msg");
  if (nowe.length < 6) { msg.textContent = "Hasło musi mieć min. 6 znaków."; msg.style.color = "#B5503F"; return; }
  if (nowe !== potw) { msg.textContent = "Hasła nie są identyczne."; msg.style.color = "#B5503F"; return; }
  msg.textContent = "Zapisywanie…"; msg.style.color = "var(--muted)";
  const { error } = await db.auth.updateUser({ password: nowe });
  if (error) { msg.textContent = "Błąd: " + error.message; msg.style.color = "#B5503F"; }
  else { msg.textContent = "✓ Hasło zmienione!"; msg.style.color = "var(--sage-deep)"; document.getElementById("haslo-nowe").value = ""; document.getElementById("haslo-potw").value = ""; }
};

window.saveNotifSettings = () => {
  ["notif-trening","notif-tydzien","notif-brak"].forEach(id => {
    const el = document.getElementById(id);
    if (el) localStorage.setItem(id, el.checked ? "1" : "0");
  });
};

window.toggleDarkMode = () => {
  const el = document.getElementById("app-dark");
  const on = el?.checked;
  document.body.classList.toggle("dark-mode", on);
  localStorage.setItem("darkMode", on ? "1" : "0");
};

window.saveAppSettings = () => {
  const sel = document.getElementById("app-default-screen");
  if (sel) localStorage.setItem("defaultScreen", sel.value);
};

// ===== AGENCI =====
const AGENCI_CONFIG = [
  {
    id: "planer",
    nazwa: "Planer treningów",
    opis: "Układa spersonalizowany plan na 2–4 tygodnie. Analizuje historię, poziom i obszary do poprawy każdego jeźdźca.",
    emoji: "📋",
    cena: "9 zł / mc",
    fn: "planer-treningow",
    starter: "Ułóż plan treningowy dla...",
    podpowiedzi: ["Ułóż plan dla Tatiany na 3 tygodnie", "Co powinnam ćwiczyć z Anią w tym miesiącu?", "Plan dla Marty przed zawodami"],
  },
  {
    id: "analityk",
    nazwa: "Analityk postępów",
    opis: "Generuje szczegółowe raporty postępów gotowe do wysłania jeźdźcom lub rodzicom. Trendy, statystyki, oceny.",
    emoji: "📈",
    cena: "9 zł / mc",
    fn: "analityk-postepu",
    starter: "Przeanalizuj postępy...",
    podpowiedzi: ["Analiza postępów Oli za ostatni miesiąc", "Porównaj wyniki Kuby z poprzednim kwartałem", "Raport dla rodziców Ani"],
  },
  {
    id: "raport",
    nazwa: "Raport miesięczny",
    opis: "Generuje kompleksowy raport miesiąca: liczba treningów, aktywność jeźdźców, obciążenie koni, rekomendacje.",
    emoji: "📊",
    cena: "1 zł / mc",
    fn: "raport-miesieczny",
    starter: null, // auto-generuje przy otwarciu
    podpowiedzi: ["Pokaż raport za maj", "Co było wyzwaniem w tym miesiącu?", "Jak rozkładało się obciążenie koni?"],
  },
];

// ===== AGENT PICKER (dropdown z górnego paska) =====
let _agentPickerOpen = false;

window.toggleAgentPicker = (e) => {
  e?.stopPropagation();
  _agentPickerOpen ? closeAgentPicker() : openAgentPicker();
};

window.openAgentPicker = () => {
  _renderAgentPickerContent();
  const el = document.getElementById("agent-picker");
  if (!el) return;
  el.classList.remove("hidden");
  requestAnimationFrame(() => el.classList.add("agent-picker--open"));
  _agentPickerOpen = true;
};

window.closeAgentPicker = () => {
  const el = document.getElementById("agent-picker");
  if (!el) return;
  el.classList.remove("agent-picker--open");
  setTimeout(() => { el.classList.add("hidden"); _agentPickerOpen = false; }, 200);
};

function _renderAgentPickerContent() {
  const panel = document.getElementById("agent-picker-panel");
  if (!panel) return;

  const hasAny = userSubscriptions.length > 0;

  panel.innerHTML = `
    <div class="ap-header">
      <span class="ap-title">Agenci AI</span>
      ${hasAny ? `<span class="ap-subtitle">${userSubscriptions.length} aktywn${userSubscriptions.length === 1 ? 'y' : 'ych'}</span>` : ""}
    </div>
    ${AGENCI_CONFIG.map(a => {
      const active = userSubscriptions.includes(a.id);
      const isCurrent = activeAgentId === a.id;
      return `
        <div class="ap-row ${active ? 'ap-row--unlocked' : 'ap-row--locked'} ${isCurrent ? 'ap-row--current' : ''}"
          ${active ? `onclick="closeAgentPicker();openAgentChat('${a.id}')"` : ""}>
          <div class="ap-emoji">${a.emoji}</div>
          <div class="ap-info">
            <div class="ap-name">${a.nazwa}</div>
            <div class="ap-status">${active ? (isCurrent ? '● Ostatnio używany' : '✓ Aktywny') : '🔒 ' + a.cena}</div>
          </div>
          ${active
            ? `<svg class="ap-arrow" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>`
            : `<button class="ap-buy" onclick="event.stopPropagation();closeAgentPicker();subscribeAgent('${a.id}')">KUP</button>`}
        </div>`;
    }).join("")}
    <button class="ap-see-all" onclick="closeAgentPicker();go('agenci')">
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
      Zobacz wszystkich
    </button>`;
}

function renderAgenci() {
  content().innerHTML = `
    <div class="brandline">
      <span class="logo" style="font-size:21px;color:var(--ink-strong)">Agenci AI</span>
      <div class="right">
        <button class="iconbtn" onclick="openKontoPanel()" title="Ustawienia i agenci"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></button>
<button class="me" onclick="openKontoPanel()" title="Konto">LU</button>
      </div>
    </div>
    <p style="font-size:13px;color:var(--muted);margin-bottom:20px;font-weight:500">Specjalistyczni asystenci AI dla Twojej stajni</p>
    ${AGENCI_CONFIG.map(a => renderAgentCard(a)).join("")}
    <div style="margin-top:16px;padding:14px 16px;background:var(--sage-mist);border-radius:16px;font-size:12px;color:var(--sage-deep);font-weight:500;line-height:1.5">
      🔒 Darmowy agent <b>Cwałek</b> jest zawsze dostępny przez przycisk 🐴 na dole.
    </div>`;
}

function renderAgentCard(a) {
  const active = userSubscriptions.includes(a.id);
  return `
    <div class="agent-card ${active ? "agent-card--active" : ""}">
      <div class="agent-card__top">
        <div class="agent-emoji">${a.emoji}</div>
        <div class="agent-info">
          <div class="agent-nazwa">${a.nazwa}</div>
          <div class="agent-cena">${active ? "✓ Aktywny" : a.cena}</div>
        </div>
        ${active
          ? `<button class="agent-btn agent-btn--open" onclick="openAgentChat('${a.id}')">Otwórz</button>`
          : `<button class="agent-btn agent-btn--buy" onclick="subscribeAgent('${a.id}')">Subskrybuj</button>`}
      </div>
      <p class="agent-opis">${a.opis}</p>
      ${active ? `<div class="agent-chips">${a.podpowiedzi.map(p => `<button class="agent-chip" onclick="openAgentChatWith('${a.id}', '${p.replace(/'/g, "\\'")}')">${p}</button>`).join("")}</div>` : ""}
    </div>`;
}

window.subscribeAgent = async (agentId) => {
  const btn = event.target;
  btn.disabled = true;
  btn.textContent = "Przekierowuję…";
  try {
    const { data: { session } } = await db.auth.getSession();
    const token = session?.access_token;
    if (!token) { alert("Zaloguj się ponownie."); return; }

    const res = await fetch(`${SUPABASE_URL}/functions/v1/create-checkout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        "apikey": SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ agent_id: agentId }),
    });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      alert("Błąd: " + (data.error || "Nieznany błąd"));
      btn.disabled = false;
      btn.textContent = "Subskrybuj";
    }
  } catch (err) {
    alert("Błąd połączenia: " + err);
    btn.disabled = false;
    btn.textContent = "Subskrybuj";
  }
};

// ===== AGENT CHAT MODAL =====
let agentChatHistory = [];
let activeAgentId = null;

window.openAgentChat = (agentId) => {
  agentChatHistory = [];
  activeAgentId = agentId;
  const agent = AGENCI_CONFIG.find(a => a.id === agentId);
  if (!agent) return;
  showAgentModal(agent, agent.starter ? null : "__auto__");
};

window.openAgentChatWith = (agentId, msg) => {
  agentChatHistory = [];
  activeAgentId = agentId;
  const agent = AGENCI_CONFIG.find(a => a.id === agentId);
  if (!agent) return;
  showAgentModal(agent, msg);
};

function showAgentModal(agent, autoMsg) {
  const existing = document.getElementById("agent-modal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "agent-modal";
  modal.className = "agent-modal";
  modal.innerHTML = `
    <div class="agent-modal__header">
      <span style="font-size:22px">${agent.emoji}</span>
      <div>
        <div class="agent-modal__name">${agent.nazwa}</div>
        <div class="agent-modal__sub">agent AI · ${agent.cena}</div>
      </div>
      <button class="agent-modal__close" onclick="closeAgentModal()">✕</button>
    </div>
    <div class="agent-modal__msgs" id="agent-msgs"></div>
    <div class="agent-modal__chips" id="agent-quick-chips">
      ${agent.podpowiedzi.map(p => `<button class="agent-chip" onclick="sendAgentMsg('${p.replace(/'/g, "\\'")}')">${p}</button>`).join("")}
    </div>
    <div class="agent-modal__input-row">
      <input type="text" id="agent-input" placeholder="Napisz do ${agent.nazwa}…" autocomplete="off" />
      <button id="agent-send" onclick="sendAgentMsg()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/></svg>
      </button>
    </div>`;
  document.body.appendChild(modal);

  const input = document.getElementById("agent-input");
  input.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendAgentMsg(); } });

  requestAnimationFrame(() => modal.classList.add("agent-modal--open"));

  if (autoMsg === "__auto__") {
    // raport miesięczny — auto-generuj bez wiadomości wejściowej
    sendAgentMsg("", true);
  } else if (autoMsg) {
    sendAgentMsg(autoMsg);
  }
}

window.closeAgentModal = () => {
  const modal = document.getElementById("agent-modal");
  if (!modal) return;
  modal.classList.remove("agent-modal--open");
  setTimeout(() => modal.remove(), 280);
};

function appendAgentMsg(role, text) {
  const el = document.getElementById("agent-msgs");
  if (!el) return;
  const div = document.createElement("div");
  div.className = `agent-msg agent-msg--${role === "user" ? "user" : "bot"}`;
  // Escape HTML przed renderowaniem markdown (zapobiega XSS z odpowiedzi AI)
  const safe = text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/^### (.+)$/gm, "<b>$1</b>")
    .replace(/^## (.+)$/gm, "<b style='font-size:14px'>$1</b>");
  div.innerHTML = safe;
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
  return div;
}

window.sendAgentMsg = async (overrideText, silent) => {
  const agent = AGENCI_CONFIG.find(a => a.id === activeAgentId);
  if (!agent) return;

  const input = document.getElementById("agent-input");
  const sendBtn = document.getElementById("agent-send");
  const chipsEl = document.getElementById("agent-quick-chips");
  if (chipsEl) chipsEl.style.display = "none";

  const text = overrideText !== undefined ? overrideText : (input?.value?.trim() || "");
  if (!text && !silent) return;

  if (input) input.value = "";
  if (sendBtn) sendBtn.disabled = true;

  if (!silent && text) {
    appendAgentMsg("user", text);
    agentChatHistory.push({ role: "user", content: text });
  }

  // Typing indicator
  const typing = document.createElement("div");
  typing.className = "agent-msg agent-msg--bot agent-msg--typing";
  typing.innerHTML = "<span></span><span></span><span></span>";
  document.getElementById("agent-msgs")?.appendChild(typing);
  document.getElementById("agent-msgs").scrollTop = 99999;

  try {
    const { data: { session } } = await db.auth.getSession();
    const token = session?.access_token;

    const res = await fetch(`${SUPABASE_URL}/functions/v1/${agent.fn}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        "apikey": SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ messages: agentChatHistory }),
    });

    const data = await res.json();
    typing.remove();

    if (data.error) {
      appendAgentMsg("bot", `⚠️ ${data.error}`);
    } else {
      const reply = data.reply || "Nie udało się wygenerować odpowiedzi.";
      appendAgentMsg("bot", reply);
      agentChatHistory.push({ role: "assistant", content: reply });
    }
  } catch (err) {
    typing.remove();
    appendAgentMsg("bot", "Błąd połączenia. Sprawdź internet.");
  }

  if (sendBtn) sendBtn.disabled = false;
  if (input) input.focus();
};

init();
