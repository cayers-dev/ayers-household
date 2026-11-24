/* Ayers Household - mobile web app (Core)
 * Talks to the Apps Script API (config.js -> apiUrl) with a Google sign-in, then the app's own session.
 * Access comes from the Core sheet: Users (Admin box) and Permissions (role per module / area).
 * Same look and behaviour as Ayers Aquariums.
 */
(function () {
  "use strict";

  const CFG = window.HH_CONFIG || {};
  const TOKEN_KEY = "hh_id_token";     // Google sign-in pass (only until the server gives a session)
  const SESSION_KEY = "hh_session";    // the app's own session: { token, exp }
  const APP_VERSION = "11";

  const state = {
    token: null, session: null, sessionExp: 0,
    me: null, modules: [], roles: [], roleCan: {}, dueSoon: [], tasks: [], admin: null,
    booting: false, authMessage: "", notAllowedEmail: "", gisReady: false,
    log: null, logModule: "", logLoading: false,
    permEdit: null          // unsaved permission picks on the Permissions screen: { userId, picks: { "module/area": role } }
  };

  // ------------------------------------------------------------------
  // Utilities
  // ------------------------------------------------------------------
  const esc = v => String(v === null || v === undefined ? "" : v)
    .replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const plural = (k, one, many) => k + " " + (k === 1 ? one : (many || one + "s"));
  function parseJwt(t) {
    try {
      const p = t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      const json = decodeURIComponent(atob(p).split("").map(c => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join(""));
      return JSON.parse(json);
    } catch (e) { return null; }
  }
  function tokenValid(t) {
    const p = t && parseJwt(t);
    return !!(p && p.exp && p.exp * 1000 > Date.now() + 60 * 1000);
  }
  function fmtStamp(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?$/.exec(String(s || ""));
    if (!m) return s || "";
    const d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) +
      (m[4] ? " " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "");
  }
  let toastTimer;
  function toast(msg, isError) {
    const el = $("#toast");
    el.textContent = msg;
    el.className = "show" + (isError ? " error" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = ""; }, isError ? 4500 : 2200);
  }

  // ------------------------------------------------------------------
  // Pop-ups: while one is open, everything behind it is inert, Tab stays inside,
  // and focus goes back where it was when it closes.
  // ------------------------------------------------------------------
  const modals = [];
  function modalOpen(el, focusEl) {
    const inerted = [];
    Array.from(document.body.children).forEach(c => {
      if (c === el || c.id === "toast" || c.tagName === "SCRIPT" || c.inert) return;
      c.inert = true; inerted.push(c);
    });
    modals.push({ el: el, inerted: inerted, prev: document.activeElement });
    const target = focusEl || el;
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    try { target.focus({ preventScroll: true }); } catch (e) { target.focus(); }
    el.addEventListener("keydown", e => {
      if (e.key !== "Tab") return;
      const items = $$('a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])', el)
        .filter(x => x.offsetParent !== null && !x.closest("[hidden]"));
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !el.contains(document.activeElement) || document.activeElement === target)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }
  new MutationObserver(() => {
    for (let i = modals.length - 1; i >= 0; i--) {
      const m = modals[i];
      if (document.body.contains(m.el)) continue;
      m.inerted.forEach(c => { c.inert = false; });
      modals.splice(i, 1);
      if (i === modals.length && m.prev && document.body.contains(m.prev) && !m.prev.closest("[inert]")) {
        try { m.prev.focus({ preventScroll: true }); } catch (e) { /* gone */ }
      }
    }
  }).observe(document.body, { childList: true });

  function busy(on) {
    let el = $(".busy");
    if (on && !el) {
      el = document.createElement("div");
      el.className = "busy";
      el.setAttribute("role", "alert"); el.setAttribute("aria-label", "Working");
      el.innerHTML = '<div class="busy-box"><div class="spinner"></div></div>';
      document.body.appendChild(el);
      modalOpen(el, $(".busy-box", el));
    } else if (!on && el) el.remove();
  }

  // ------------------------------------------------------------------
  // Icons (same drawing style as Ayers Aquariums)
  // ------------------------------------------------------------------
  const svg = (body, w) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (w || 1.9) + '" stroke-linecap="round" stroke-linejoin="round">' + body + '</svg>';
  const ICONS = {
    home: svg('<path d="M3.5 11L12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5.5h4V20"/>'),
    back: svg('<path d="M15 18l-6-6 6-6"/>', 2.2),
    next: svg('<path d="M9 18l6-6-6-6"/>', 2.2),
    refresh: svg('<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>', 2),
    close: svg('<path d="M6 6l12 12M18 6L6 18"/>', 2.2),
    plus: svg('<path d="M12 5v14M5 12h14"/>', 2.2),
    check: svg('<path d="M5 12.5l4.5 4.5L19 7"/>', 2.6),
    account: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.2-6 8-6s7 2 8 6"/>'),
    users: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8"/><path d="M18 14.8c1.8.7 3 2.5 3.5 5.2"/>'),
    lock: svg('<rect x="4" y="10.5" width="16" height="10.5" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>'),
    admin: svg('<path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.4-7.5 9.5-4.3-1.1-7.5-4.9-7.5-9.5V6z"/><path d="M9 12l2 2 4-4"/>'),
    grid: svg('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>'),
    history: svg('<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"/><path d="M3 4v4h4"/><path d="M12 7.5V12l3 2"/>'),
    clock: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
    // Module icons
    vehicles: svg('<path d="M5 16V11.5l1.8-4.2A2 2 0 0 1 8.6 6h6.8a2 2 0 0 1 1.8 1.3L19 11.5V16"/><path d="M3.5 16h17v2.5h-17z"/><path d="M5 11.5h14"/><circle cx="7.5" cy="14" r=".6"/><circle cx="16.5" cy="14" r=".6"/>'),
    hockey: svg('<path d="M15 3L8.5 16.5"/><path d="M8.5 16.5H4.5a1.5 1.5 0 0 0 0 3h5.2a2 2 0 0 0 1.8-1.1L13 15"/><ellipse cx="18" cy="18.5" rx="3" ry="1.5"/>'),
    inventory: svg('<path d="M3.5 7.5L12 3.5l8.5 4v9L12 20.5l-8.5-4z"/><path d="M3.5 7.5L12 11.5l8.5-4"/><path d="M12 11.5v9"/>'),
    financial: svg('<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6.5 9.5h.01M17.5 14.5h.01"/>'),
    tasks: svg('<path d="M9 6h11M9 12h11M9 18h11"/><path d="M3.5 6l1.2 1.2L7 5M3.5 12l1.2 1.2L7 11M3.5 18l1.2 1.2L7 17"/>'),
    work: svg('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7"/><path d="M3 12.5h18"/>'),
    homeMaint: svg('<path d="M3.5 11L12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M14.5 12.5a2.5 2.5 0 0 0-3.3 3.2l-2.2 2.2 1.1 1.1 2.2-2.2a2.5 2.5 0 0 0 3.2-3.3l-1.4 1.4-1.2-.3-.3-1.2z"/>'),
    shopping: svg('<path d="M4 7h16l-1.6 11.2a2 2 0 0 1-2 1.8H7.6a2 2 0 0 1-2-1.8z"/><path d="M8.5 7V5.5a3.5 3.5 0 0 1 7 0V7"/>')
  };
  const MODULE_ICON = { vehicles: "vehicles", hockey: "hockey", inventory: "inventory", financial: "financial",
                        tasks: "tasks", work: "work", home: "homeMaint", shopping: "shopping" };
  const moduleIcon = key => ICONS[MODULE_ICON[key]] || ICONS.grid;

  // What each role means, in plain words (Permissions screen and Account).
  const ROLE_TEXT = {
    "Admin": "Everything in every module, plus users, permissions, permanent deletes and restoring deleted items.",
    "Editor": "Add, edit, inactivate and delete any record; add new dropdown values.",
    "Data Entry": "Add records using existing dropdown values; edit or delete only what they added.",
    "Viewer": "See everything, change nothing.",
    "No Access": "Hidden."
  };
  const isAdmin = () => !!(state.me && state.me.admin);

  // ------------------------------------------------------------------
  // Server calls
  // ------------------------------------------------------------------
  async function api(action, payload) {
    const useSession = !!(state.session && state.sessionExp > Date.now() + 30 * 1000);
    if (!useSession && !(state.token && tokenValid(state.token))) {
      const e = new Error("You were signed out after an hour without using the app. Please sign in again.");
      e.code = "AUTH"; throw e;
    }
    let res;
    try {
      res = await fetch(CFG.apiUrl, {
        method: "POST",
        body: JSON.stringify(Object.assign({ action: action }, useSession ? { session: state.session } : { idToken: state.token }, payload || {}))
      });
    } catch (err) {
      const e = new Error("Can't reach the server. Check your connection and try again.");
      e.code = "NETWORK"; throw e;
    }
    let json;
    try { json = await res.json(); } catch (err) {
      const e = new Error("The server sent an unexpected response."); e.code = "ERROR"; throw e;
    }
    if (json && json.session) setSession(json.session);
    if (json && json.perm) notePerm(json.perm);
    if (!json.ok) {
      const e = new Error(json.message || "Something went wrong.");
      e.code = json.code; e.email = json.email; e.confirm = json.confirm; throw e;
    }
    return json;
  }

  // ---------- Access changes reach open apps ----------
  // Every reply carries a fingerprint of the person's permissions. When it changes
  // (an admin changed their access), module screens drop what they loaded and reload.
  const MODULE_RESETS = {};
  let lastPermCheck = 0;
  function notePerm(p) {
    if (!state.permStamp) { state.permStamp = p; return; }
    if (p === state.permStamp) return;
    state.permStamp = p;
    Object.keys(MODULE_RESETS).forEach(k => { try { MODULE_RESETS[k](); } catch (e) { /* ignore */ } });
    toast("Your access has changed. The app has updated.");
    setTimeout(refreshInBackground, 0);
  }
  function checkPerms(force) {
    if (!state.me || document.visibilityState !== "visible") return;
    if (!force && Date.now() - lastPermCheck < 30000) return;
    lastPermCheck = Date.now();
    api("whoami").catch(() => {});
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkPerms(); });
  setInterval(() => checkPerms(), 120000);

  function handleError(err) {
    if (err.code === "AUTH" && state.me && $(".sheet-backdrop")) { clearToken(); showReauth(err.message); return; }
    if (err.code === "AUTH" || err.code === "SETUP") {
      clearToken(); state.me = null; state.authMessage = err.message; render();
    } else if (err.code === "NOT_ALLOWED") {
      clearToken(); state.me = null; state.notAllowedEmail = err.email || "";
      if (window.google && google.accounts) google.accounts.id.disableAutoSelect();
      render();
    } else {
      toast(err.message, true);
    }
  }

  function authStop(err) {
    handleError(err);
    if (err.code === "AUTH" && state.me) throw new Error("Your sign-in expired. Sign in again (your entries are kept), then tap Save.");
    return true;
  }

  function showReauth(msg) {
    if ($(".reauth")) return;
    const el = document.createElement("div");
    el.className = "reauth";
    el.innerHTML = '<div class="reauth-box"><h3>Sign in to continue</h3><p>' + esc(msg || "Your sign-in expired.") + '</p>' +
      '<p class="hint">What you entered is kept. After signing in, tap Save again.</p><div class="reauth-btn"></div>' +
      '<button type="button" class="btn" data-reauth-close>Not now</button></div>';
    document.body.appendChild(el);
    el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true");
    modalOpen(el, $(".reauth-box", el));
    $("[data-reauth-close]", el).addEventListener("click", () => el.remove());
    if (window.google && google.accounts && state.gisReady) {
      google.accounts.id.renderButton($(".reauth-btn", el), { theme: "filled_blue", size: "large", text: "signin_with", shape: "pill" });
      google.accounts.id.prompt();
    } else {
      $(".reauth-btn", el).innerHTML = '<p class="form-error-inline">Google sign-in didn’t load. Check your connection.</p>';
    }
  }

  function applyBootstrap(r) {
    state.me = r.user;
    state.modules = r.modules || [];
    state.roles = r.roles || ["Editor", "Data Entry", "Viewer", "No Access"];
    state.roleCan = r.roleCan || {};
    state.dueSoon = r.dueSoon || [];
    state.tasks = r.tasks || [];
    state.admin = r.admin || null;
  }

  async function refresh(silent) {
    try {
      if (!silent) busy(true);
      applyBootstrap(await api("bootstrap"));
      state.log = null;
      render();
      if (!silent) toast("Up to date");
    } catch (err) { handleError(err); } finally { busy(false); }
  }

  // Saves, then reloads in the background (thin bar at the top meanwhile).
  async function write(action, payload, successMsg) {
    busy(true);
    let res;
    try { res = await api(action, payload); }
    catch (err) {
      if (["AUTH", "NOT_ALLOWED", "SETUP"].indexOf(err.code) !== -1) return authStop(err);
      throw err;
    } finally { busy(false); }
    toast((typeof successMsg === "function" ? successMsg(res) : successMsg) || "Saved");
    refreshInBackground();
    return res || true;
  }

  let syncSeq = 0;
  async function refreshInBackground() {
    const mine = ++syncSeq;
    document.body.classList.add("syncing");
    try {
      const data = await api("bootstrap");
      if (mine !== syncSeq) return;
      applyBootstrap(data);
      render();
    } catch (err) {
      if (mine !== syncSeq) return;
      if (["AUTH", "NOT_ALLOWED", "SETUP"].indexOf(err.code) !== -1) handleError(err);
      else toast("Saved, but the screen couldn’t refresh. Tap refresh to update.", true);
    } finally {
      if (mine === syncSeq) document.body.classList.remove("syncing");
    }
  }

  // ------------------------------------------------------------------
  // Auth
  // ------------------------------------------------------------------
  function setToken(t) { state.token = t; try { localStorage.setItem(TOKEN_KEY, t); } catch (e) { /* storage off */ } }
  function clearToken() {
    state.token = null; state.session = null; state.sessionExp = 0;
    try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
  }
  function setSession(token) {
    state.session = token; state.sessionExp = Date.now() + 59 * 60 * 1000;
    try { localStorage.setItem(SESSION_KEY, JSON.stringify({ token: token, exp: state.sessionExp })); } catch (e) { /* storage off */ }
  }
  function loadSession() {
    try {
      const s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      if (s && s.token && s.exp > Date.now()) { state.session = s.token; state.sessionExp = s.exp; }
    } catch (e) { /* ignore */ }
  }

  function gisLoaded() {
    if (!window.google || !google.accounts || !CFG.clientId || CFG.clientId.indexOf("PASTE_") === 0) return;
    google.accounts.id.initialize({
      client_id: CFG.clientId, callback: onCredential, auto_select: true,
      itp_support: true, use_fedcm_for_prompt: true, cancel_on_tap_outside: false
    });
    state.gisReady = true;
    if (!state.me && !state.booting) renderSignIn();
  }

  function onCredential(resp) {
    if (!resp || !resp.credential) return;
    setToken(resp.credential);
    state.authMessage = ""; state.notAllowedEmail = "";
    const re = $(".reauth");
    if (re && state.me) { re.remove(); toast("Signed in again. Tap Save to finish."); refreshInBackground(); return; }
    boot();
  }

  async function boot() {
    state.booting = true;
    render();
    try { applyBootstrap(await api("bootstrap")); }
    catch (err) { state.booting = false; handleError(err); return; }
    state.booting = false;
    render();
  }

  function signOut() {
    clearToken();
    state.me = null; state.admin = null; state.log = null;
    if (window.google && google.accounts) google.accounts.id.disableAutoSelect();
    location.hash = "";
    render();
  }

  // ------------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------------
  function render() {
    if (state.booting) {
      $("#app").innerHTML = '<div class="signin"><img src="icons/icon-192.png" alt=""><h1>Ayers Household</h1><div class="spinner"></div></div>';
      return;
    }
    if (!state.me) { renderSignIn(); return; }
    renderShell();
  }

  function renderSignIn() {
    const notConfigured = !CFG.clientId || CFG.clientId.indexOf("PASTE_") === 0 || !CFG.apiUrl || CFG.apiUrl.indexOf("PASTE_") === 0;
    let notice = "";
    if (notConfigured) notice = '<div class="notice">The app isn\'t fully set up yet (sign-in client ID or server address missing).</div>';
    else if (state.notAllowedEmail) notice = '<div class="notice">' + esc(state.notAllowedEmail) + ' isn\'t on the Ayers Household user list. Ask Chris to add you, or sign in with a different Google account.</div>';
    else if (state.authMessage) notice = '<div class="notice">' + esc(state.authMessage) + '</div>';
    $("#app").innerHTML =
      '<div class="signin"><img src="icons/icon-192.png" alt=""><h1>Ayers Household</h1>' +
      '<p>Sign in with the Google account Chris added to the app.</p>' + notice + '<div id="gsi-button"></div></div>';
    if (state.gisReady && !notConfigured) {
      const dark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      google.accounts.id.renderButton($("#gsi-button"), {
        type: "standard", theme: dark ? "filled_black" : "outline", size: "large",
        shape: "pill", text: "signin_with", logo_alignment: "left", width: 280
      });
      if (!state.notAllowedEmail) google.accounts.id.prompt();
    }
  }

  function parseRoute() {
    const h = location.hash.replace(/^#\/?/, "");
    const parts = h.split("/").filter(Boolean).map(decodeURIComponent);
    return { name: parts[0] || "home", args: parts.slice(1) };
  }

  function renderShell() {
    const route = parseRoute();
    const adminOnly = ["admin", "users", "perms", "modules", "log"];
    if (adminOnly.indexOf(route.name) !== -1 && !isAdmin()) route.name = "home";
    let view;
    switch (route.name) {
      case "module":  view = viewModule(route.args[0]); break;
      case "account": view = viewAccount(); break;
      case "admin":   view = viewAdmin(); break;
      case "users":   view = viewUsers(); break;
      case "perms":   view = route.args[0] ? viewPermsUser(route.args[0]) : viewPerms(); break;
      case "modules": view = viewModulesAdmin(); break;
      case "log":     view = viewLog(); break;
      default:
        view = MODULE_VIEWS[route.name] && state.modules.some(m => m.key === route.name)
          ? MODULE_VIEWS[route.name](route.args) : viewHome();
    }
    const tab = ["users", "perms", "modules", "log"].indexOf(route.name) !== -1 ? "admin" :
                (route.name === "module" || MODULE_VIEWS[route.name]) ? "home" : route.name;
    const tabs = [["home", "Home", "home"]].concat(isAdmin() ? [["admin", "Admin", "admin"]] : []).concat([["account", "Account", "account"]]);
    $("#app").innerHTML =
      '<header class="topbar">' +
        (view.back ? '<button class="icon-btn" data-act="back" aria-label="Back">' + ICONS.back + '</button>' : '<span style="width:6px"></span>') +
        '<h1>' + esc(view.title) + '</h1>' +
        '<button class="icon-btn" data-act="refresh" aria-label="Refresh">' + ICONS.refresh + '</button>' +
      '</header>' +
      '<main class="view' + (view.wide ? " wide" : "") + '">' + view.html + '</main>' +
      '<nav class="tabbar">' +
        tabs.map(t => '<a href="#/' + t[0] + '" class="' + (tab === t[0] ? "active" : "") + '">' + ICONS[t[2]] + '<span>' + t[1] + '</span></a>').join("") +
      '</nav>';
    if (view.after) view.after();
    window.scrollTo(0, view.keepScroll ? window.scrollY : 0);
  }

  // A tile on a home-style grid.
  const tile = (href, icon, label, info, extraClass) =>
    '<a class="home-link' + (extraClass ? " " + extraClass : "") + '" href="' + href + '">' +
      '<span class="home-icon">' + icon + '</span><span class="home-text"><span class="home-label">' + esc(label) + '</span>' +
      (info ? '<span class="home-info">' + esc(info) + '</span>' : "") + '</span></a>';
  const section = (title, inner, headExtra) =>
    '<div class="section"><div class="section-head"><h3>' + esc(title) + '</h3>' + (headExtra || "") + '</div>' + inner + '</div>';

  // ---------- Home ----------
  function viewHome() {
    // A module saved something since Home was loaded: refresh Due Soon quietly.
    if (state.homeStale) { state.homeStale = false; setTimeout(refreshInBackground, 0); }
    const days = state.me.dueSoonDays || 30;
    const all = state.dueSoon || [];
    // Your own items (or ones that belong to no one) unless "Show everyone's" is ticked.
    const mine = d => !d.owner || d.owner === state.me.id;
    const others = all.some(d => !mine(d));
    const showAll = others && dueShowAll();
    const due = showAll ? all : all.filter(mine);
    const dueRow = d => '<a class="list-item" href="' + esc(d.href || "#/") + '"><div class="body"><div class="title">' + esc(d.title) + '</div>' +
      '<div class="sub">' + esc([d.when, d.module].filter(Boolean).join(" · ")) + '</div></div></a>';
    let dueHtml;
    if (!due.length) {
      dueHtml = '<div class="card"><div class="empty">' + (others ? "Nothing of yours due in the next " + plural(days, "day") + ". Tick Show everyone’s to see the rest of the household."
        : "Nothing due in the next " + plural(days, "day") + ". Bills, service, insurance and other reminders show here as each module is added.") + '</div></div>';
    } else if (showAll) {
      // One group per person: you first, then by name, then items that belong to no one.
      const groups = {};
      due.forEach(d => { const k = d.owner || ""; (groups[k] = groups[k] || { name: d.owner === state.me.id ? "Mine" : d.ownerName || "Everyone", items: [] }).items.push(d); });
      const keys = Object.keys(groups).sort((a, b) => (b === state.me.id) - (a === state.me.id) || (a === "") - (b === "") || groups[a].name.localeCompare(groups[b].name));
      dueHtml = keys.map(k => '<div class="due-owner">' + esc(groups[k].name) + '</div><div class="card list">' + groups[k].items.map(dueRow).join("") + '</div>').join("");
    } else {
      dueHtml = '<div class="card list">' + due.map(dueRow).join("") + '</div>';
    }
    const dueHead = (others ? '<label class="due-toggle"><input type="checkbox" data-act="due-all"' + (showAll ? " checked" : "") + '> Show everyone’s</label>' : "") +
      '<button class="link-btn" data-act="due-days">Next ' + plural(days, "day") + '</button>';
    const tasks = state.tasks || [];
    const tasksHtml = tasks.length
      ? '<div class="card list">' + tasks.map(t => '<div class="list-item"><div class="body"><div class="title">' + esc(t.title) + '</div>' +
          (t.due ? '<div class="sub">Due ' + esc(t.due) + '</div>' : "") + '</div></div>').join("") + '</div>'
      : '<div class="card"><div class="empty">Your task list shows here once the Tasks module is set up.</div></div>';
    const tiles = state.modules.map(m => {
      const built = m.status === "Active" && MODULE_VIEWS[m.key];
      const info = m.status === "Off" ? "Off (admins only)" : !built ? "Coming soon" : (m.summary || (m.role === "Admin" ? "" : m.role));
      return tile(built ? "#/" + m.key : "#/module/" + encodeURIComponent(m.key), moduleIcon(m.key), m.name, info, built ? "" : "dim");
    }).join("");
    const html =
      section("Due soon", dueHtml, dueHead) +
      section("My tasks", tasksHtml) +
      section("Modules", state.modules.length ? '<div class="home-grid">' + tiles + '</div>'
        : '<div class="card"><div class="empty">You don\'t have access to any modules yet. Ask Chris to set your permissions.</div></div>');
    return { title: "Ayers Household", html: html };
  }

  // "Show everyone's" on Home: remembered on this device.
  function dueShowAll() { try { return localStorage.getItem("hh-due-all") === "1"; } catch (e) { return !!state.dueAll; } }
  function setDueShowAll(on) { state.dueAll = on; try { localStorage.setItem("hh-due-all", on ? "1" : "0"); } catch (e) { /* in memory only */ } }

  function dueDaysForm() {
    const days = state.me.dueSoonDays || 30;
    openSheet({
      title: "Due soon window",
      body: '<div class="field"><label for="f_days">Show items due in the next (days)</label>' +
        '<input type="number" id="f_days" name="days" min="1" max="365" step="1" inputmode="numeric" value="' + esc(days) + '" required></div>' +
        '<p class="hint">Just for you. ' + (state.admin ? "The default for everyone else is set on Admin ▸ Modules & settings." : "") + '</p>',
      onSubmit: async v => {
        const n = Math.round(Number(v.days));
        if (!(n >= 1 && n <= 365)) throw new Error("Pick between 1 and 365 days.");
        await write("setMyDueSoon", { days: n }, "Due soon: next " + plural(n, "day"));
      }
    });
  }

  // ---------- A module (placeholder until each module is built) ----------
  function viewModule(key) {
    const m = state.modules.find(x => x.key === key);
    if (!m) return { title: "Not found", back: true, html: '<div class="card"><div class="empty">That module isn\'t available to you.</div></div>' };
    const areaRows = (m.areas || []).map(a =>
      '<div class="list-item"><div class="body"><div class="title">' + esc(a.name) + '</div>' +
      (a.description ? '<div class="sub">' + esc(a.description) + '</div>' : "") + '</div>' +
      '<span class="pill' + (a.role === "Editor" || a.role === "Admin" ? " edit" : "") + '">' + esc(a.role) + '</span></div>').join("");
    const html =
      '<div class="card kv">' +
        '<div class="k">Module</div><div>' + esc(m.name) + '</div>' +
        '<div class="k">Status</div><div>' + esc(m.status) + '</div>' +
        '<div class="k">Your access</div><div>' + esc(m.role) + '<div class="hint">' + esc(ROLE_TEXT[m.role] || "") + '</div></div>' +
      '</div>' +
      (m.description ? '<p class="hint" style="margin:12px 4px">' + esc(m.description) + '</p>' : "") +
      (areaRows ? section("Areas", '<div class="card list">' + areaRows + '</div>') : "") +
      (m.status !== "Active" ? '<div class="card" style="margin-top:12px"><div class="empty">This module is still being built. Its screens will appear here when it\'s ready.</div></div>' : "");
    return { title: m.name, back: true, html: html };
  }

  // ---------- Account ----------
  function viewAccount() {
    const me = state.me;
    const mods = state.modules.map(m => '<div class="list-item"><span class="thumb">' + moduleIcon(m.key) + '</span><div class="body"><div class="title">' + esc(m.name) + '</div>' +
      '<div class="sub">' + esc(m.status === "Active" ? "" : m.status) + '</div></div><span class="pill' + (m.role === "Editor" || m.role === "Admin" ? " edit" : "") + '">' + esc(m.role) + '</span></div>').join("");
    return {
      title: "Account",
      html: '<div class="card kv">' +
        '<div class="k">Name</div><div>' + esc(me.name || "") + '</div>' +
        '<div class="k">Email</div><div>' + esc(me.email) + '</div>' +
        '<div class="k">User ID</div><div>' + esc(me.id) + '</div>' +
        '<div class="k">Admin</div><div>' + (me.admin ? "Yes" : "No") + '</div>' +
        '<div class="k">Due soon</div><div>Next ' + esc(plural(me.dueSoonDays || 30, "day")) + ' <button class="link-btn" data-act="due-days">Change</button></div>' +
        '<div class="k">App version</div><div>' + esc(APP_VERSION) + '</div></div>' +
        section("Your modules", mods ? '<div class="card list">' + mods + '</div>' : '<div class="card"><div class="empty">None yet.</div></div>') +
        '<div class="actions"><button class="btn" data-act="refresh">Refresh data</button><button class="btn danger" data-act="sign-out">Sign out</button></div>' +
        '<p class="hint" style="margin-top:16px"><b>Add to your home screen:</b> on iPhone, tap Share → Add to Home Screen. On Android, tap the ⋮ menu → Add to Home screen (or Install app).</p>'
    };
  }

  // ---------- Admin ----------
  function viewAdmin() {
    const A = state.admin || { users: [], perms: [], allModules: [], settings: {} };
    const active = A.users.filter(u => u.active).length;
    const html = '<div class="home-grid">' +
      tile("#/users", ICONS.users, "Users", active + " active" + (A.users.length > active ? " · " + (A.users.length - active) + " off" : "")) +
      tile("#/perms", ICONS.lock, "Permissions", "Role per module and area") +
      tile("#/modules", ICONS.grid, "Modules & settings", plural(A.allModules.length, "module")) +
      tile("#/log", ICONS.history, "Change log", A.settings.changeLog ? "On" : "Off") +
      '</div>' +
      '<div class="card" style="margin-top:12px"><label class="check switch-row"><input type="checkbox" data-act="toggle-changelog"' + (A.settings.changeLog ? " checked" : "") + '> ' +
        '<span><b>Change log</b><span class="hint">Every add, edit and permission change is written to the Change Log tab. Permanent deletes are recorded either way.</span></span></label></div>';
    return { title: "Admin", html: html };
  }

  // ---------- Users ----------
  function viewUsers() {
    const A = state.admin;
    const users = A.users.slice().sort((a, b) => (b.active - a.active) || a.name.localeCompare(b.name));
    const rows = users.map(u =>
      '<div class="list-item user-row ' + (u.active ? "" : "dim") + '" data-act="edit-user" data-id="' + esc(u.id) + '" role="button" tabindex="0">' +
      '<div class="body"><div class="title">' + esc(u.id + " " + u.name) + '</div>' +
      '<div class="sub">' + esc(u.email || "No email yet") + '</div></div>' +
      '<span class="pill ' + (u.admin ? "edit" : "") + '">' + esc(!u.active ? "Off" : u.admin ? "Admin" : "User") + '</span></div>').join("");
    return {
      title: "Users", back: true,
      html: '<div class="actions" style="margin:0 0 12px"><button class="btn primary" data-act="add-user">' + ICONS.plus + 'Add user</button></div>' +
        '<div class="card list">' + (rows || '<div class="empty">No users.</div>') + '</div>' +
        '<p class="hint">Admins can do everything in every module. Everyone else gets what you set on <a href="#/perms">Permissions</a>.</p>'
    };
  }

  function userForm(id) {
    const A = state.admin;
    const u = id ? A.users.find(x => x.id === id) : null;
    const self = u && u.id === state.me.id;
    openSheet({
      title: u ? "Edit " + u.id + " " + u.name : "Add user",
      body:
        '<div class="field"><label for="f_name">Name <span class="req">*</span></label><input type="text" id="f_name" name="name" value="' + esc(u ? u.name : "") + '" required></div>' +
        '<div class="field"><label for="f_email">Google email</label><input type="email" id="f_email" name="email" inputmode="email" autocomplete="off" value="' + esc(u ? u.email : "") + '"' + (self ? " readonly" : "") + '>' +
          '<div class="hint">The Google account they sign in with.' + (self ? " You can't change your own email here." : "") + '</div></div>' +
        '<div class="field"><label class="check"><input type="checkbox" name="admin"' + (u && u.admin ? " checked" : "") + (self ? " disabled" : "") + '> Admin (everything, every module)</label></div>' +
        '<div class="field"><label class="check"><input type="checkbox" name="active"' + (!u || u.active ? " checked" : "") + (self ? " disabled" : "") + '> Can sign in</label></div>' +
        (u && !u.admin ? '<p class="hint"><a href="#/perms/' + encodeURIComponent(u.id) + '" data-close>Set ' + esc(u.name) + '\'s permissions →</a></p>' : ""),
      onSubmit: async v => {
        const payload = { id: u ? u.id : "", name: v.name, email: self ? u.email : v.email,
                          admin: self ? true : !!v.admin, active: self ? true : !!v.active };
        const res = await write("saveUser", { user: payload }, u ? "User saved" : "User added");
        if (res && !u && !payload.admin) location.hash = "#/perms/" + encodeURIComponent(res.userId);
      }
    });
  }

  // ---------- Permissions ----------
  const permKey = (m, a) => m + "/" + (a || "");
  function permsOf(userId) {
    const out = {};
    (state.admin.perms || []).filter(p => p.userId === userId).forEach(p => { out[permKey(p.module, p.area)] = p.role; });
    return out;
  }
  // Short summary for the user list: "Editor in 7 modules", "Data Entry in 6 modules".
  function permSummary(u) {
    if (u.admin) return "Admin: everything";
    const p = permsOf(u.id);
    const counts = {};
    state.admin.allModules.forEach(m => {
      const r = p[permKey(m.key, "")] || "No Access";
      if (r !== "No Access") counts[r] = (counts[r] || 0) + 1;
    });
    const parts = Object.keys(counts).map(r => r + " in " + plural(counts[r], "module"));
    const areaOverrides = Object.keys(p).filter(k => !/\/$/.test(k)).length;
    return (parts.join(", ") || "No access yet") + (areaOverrides ? " · " + plural(areaOverrides, "area setting") : "");
  }

  function viewPerms() {
    const A = state.admin;
    const users = A.users.slice().sort((a, b) => (b.active - a.active) || a.name.localeCompare(b.name));
    const rows = users.map(u =>
      '<a class="list-item ' + (u.active ? "" : "dim") + '" href="#/perms/' + encodeURIComponent(u.id) + '"><div class="body">' +
      '<div class="title">' + esc(u.id + " " + u.name) + '</div><div class="sub">' + esc(permSummary(u)) + '</div></div>' +
      '<span class="thumb">' + ICONS.next + '</span></a>').join("");
    const legend = state.roles.concat(["Admin"]).map(r => '<div class="k">' + esc(r) + '</div><div>' + esc(ROLE_TEXT[r]) + '</div>').join("");
    return {
      title: "Permissions", back: true,
      html: '<div class="card list">' + rows + '</div>' +
        section("What the roles mean", '<div class="card kv">' + legend + '</div>') +
        '<p class="hint">You can also change these on the Permissions tab of the Core sheet. No row for a module means No Access.</p>'
    };
  }

  function viewPermsUser(userId) {
    const A = state.admin;
    const u = A.users.find(x => x.id === userId);
    if (!u) return { title: "Permissions", back: true, html: '<div class="card"><div class="empty">That user no longer exists.</div></div>' };
    if (u.admin) {
      return { title: u.name, back: true, html: '<div class="card"><div class="empty">' + esc(u.id + " " + u.name) +
        ' is an Admin, so they can do everything in every module. Turn off Admin on <a href="#/users">Users</a> to set module permissions instead.</div></div>' };
    }
    if (!state.permEdit || state.permEdit.userId !== userId) state.permEdit = { userId: userId, picks: permsOf(userId), open: {} };
    const picks = state.permEdit.picks;
    const opt = (val, label, cur) => '<option value="' + esc(val) + '"' + (val === cur ? " selected" : "") + '>' + esc(label) + '</option>';
    const blocks = A.allModules.map(m => {
      const modRole = picks[permKey(m.key, "")] || "No Access";
      const areas = (A.areas || []).filter(a => a.module === m.key);
      const overrides = areas.filter(a => picks[permKey(m.key, a.key)]).length;
      const open = state.permEdit.open[m.key] !== undefined ? state.permEdit.open[m.key] : overrides > 0;
      return '<div class="card perm-card">' +
        '<div class="perm-row"><span class="thumb">' + moduleIcon(m.key) + '</span>' +
          '<label class="perm-label" for="p_' + esc(m.key) + '"><b>' + esc(m.name) + '</b>' + (m.status !== "Active" ? '<span class="hint">' + esc(m.status) + '</span>' : "") + '</label>' +
          '<select id="p_' + esc(m.key) + '" data-act="perm-pick" data-module="' + esc(m.key) + '" data-area="">' +
            state.roles.map(r => opt(r, r, modRole)).join("") + '</select></div>' +
        (areas.length ? '<button type="button" class="link-btn perm-toggle" data-act="perm-areas" data-module="' + esc(m.key) + '">' +
            (open ? "Hide areas" : "Set areas separately") + (overrides ? " (" + overrides + " set)" : "") + '</button>' +
          (open ? '<div class="perm-areas">' + areas.map(a => {
            const cur = picks[permKey(m.key, a.key)] || "";
            return '<div class="perm-row"><label class="perm-label" for="p_' + esc(m.key + "_" + a.key) + '">' + esc(a.name) + '</label>' +
              '<select id="p_' + esc(m.key + "_" + a.key) + '" data-act="perm-pick" data-module="' + esc(m.key) + '" data-area="' + esc(a.key) + '">' +
              opt("", "Same: " + modRole, cur) + state.roles.map(r => opt(r, r, cur)).join("") + '</select></div>';
          }).join("") + '</div>' : "") : "") +
        '</div>';
    }).join("");
    const dirty = JSON.stringify(sortObj(picks)) !== JSON.stringify(sortObj(permsOf(userId)));
    return {
      title: u.name, back: true, keepScroll: true,
      html: '<p class="hint" style="margin:0 4px 10px">' + esc(u.id + " " + u.name) + (u.active ? "" : " (can't sign in right now)") + '. Pick a role for each module; open a module\'s areas to give a different role for part of it.</p>' +
        blocks +
        '<div class="actions perm-save"><button class="btn primary" data-act="perm-save"' + (dirty ? "" : " disabled") + '>' + ICONS.check + 'Save permissions</button>' +
        (dirty ? '<button class="btn" data-act="perm-reset">Undo changes</button>' : "") + '</div>'
    };
  }
  const sortObj = o => Object.keys(o).sort().reduce((a, k) => { if (o[k]) a[k] = o[k]; return a; }, {});

  async function savePerms() {
    const pe = state.permEdit;
    if (!pe) return;
    const rows = Object.keys(pe.picks).filter(k => pe.picks[k]).map(k => {
      const i = k.indexOf("/");
      return { module: k.slice(0, i), area: k.slice(i + 1), role: pe.picks[k] };
    });
    try {
      const res = await write("savePermissions", { userId: pe.userId, rows: rows },
        r => r.changed ? "Permissions saved (" + plural(r.changed, "change") + ")" : "No changes");
      if (res) state.permEdit = null;
    } catch (err) { toast(err.message, true); }
  }

  // ---------- Modules & settings ----------
  function viewModulesAdmin() {
    const A = state.admin;
    const rows = A.allModules.map(m =>
      '<div class="list-item ' + (m.status === "Off" ? "dim" : "") + '" data-act="edit-module" data-key="' + esc(m.key) + '" role="button" tabindex="0">' +
      '<span class="thumb">' + moduleIcon(m.key) + '</span><div class="body"><div class="title">' + esc(m.name) + '</div>' +
      '<div class="sub">' + esc(m.description) + '</div></div><span class="pill' + (m.status === "Active" ? " edit" : "") + '">' + esc(m.status) + '</span></div>').join("");
    return {
      title: "Modules & settings", back: true,
      html: '<div class="card list">' + rows + '</div>' +
        '<p class="hint">Coming soon: visible but not built yet. Off: hidden from everyone but admins.</p>' +
        section("Settings", '<div class="card list"><div class="list-item" data-act="edit-due-default" role="button" tabindex="0"><span class="thumb">' + ICONS.clock + '</span>' +
          '<div class="body"><div class="title">Due soon default</div><div class="sub">Next ' + esc(plural(A.settings.dueSoonDefault || 30, "day")) +
          ' for anyone who hasn\'t picked their own</div></div></div></div>')
    };
  }

  function moduleForm(key) {
    const m = state.admin.allModules.find(x => x.key === key);
    if (!m) return;
    openSheet({
      title: "Edit " + m.name,
      body:
        '<div class="field"><label for="f_mname">Name <span class="req">*</span></label><input type="text" id="f_mname" name="name" value="' + esc(m.name) + '" required></div>' +
        '<div class="field"><label for="f_mstatus">Status</label><select id="f_mstatus" name="status">' +
          ["Active", "Coming soon", "Off"].map(s => '<option' + (s === m.status ? " selected" : "") + '>' + s + '</option>').join("") + '</select></div>' +
        '<div class="field"><label for="f_mdesc">Description</label><textarea id="f_mdesc" name="description">' + esc(m.description) + '</textarea></div>' +
        '<div class="field"><label for="f_msort">Order on Home</label><input type="number" id="f_msort" name="sort" step="1" inputmode="numeric" value="' + esc(m.sort) + '"></div>',
      onSubmit: async v => { await write("saveModule", { module: Object.assign({ key: key }, v) }, "Module saved"); }
    });
  }

  function dueDefaultForm() {
    const cur = state.admin.settings.dueSoonDefault || 30;
    openSheet({
      title: "Due soon default",
      body: '<div class="field"><label for="f_dd">Days ahead</label><input type="number" id="f_dd" name="days" min="1" max="365" step="1" inputmode="numeric" value="' + esc(cur) + '" required></div>' +
        '<p class="hint">Used by anyone who hasn\'t set their own window on Home.</p>',
      onSubmit: async v => { await write("saveSetting", { name: "Due Soon Days (default)", value: v.days }, "Default saved"); }
    });
  }

  // ---------- Change log ----------
  function viewLog() {
    const A = state.admin;
    if (!state.log && !state.logLoading) loadLog();
    const modOpts = '<option value="">All</option><option value="__core"' + (state.logModule === "__core" ? " selected" : "") + '>Core (users, permissions)</option>' +
      A.allModules.map(m => '<option value="' + esc(m.key) + '"' + (state.logModule === m.key ? " selected" : "") + '>' + esc(m.name) + '</option>').join("");
    let body;
    if (!state.log) body = '<div class="card"><div class="empty"><div class="spinner"></div></div></div>';
    else {
      const rows = state.log.rows.filter(r => !state.logModule || (state.logModule === "__core" ? !r.module : r.module === state.logModule));
      body = rows.length ? '<div class="card list">' + rows.map(r =>
        '<div class="list-item log-row"><div class="body"><div class="title">' + esc(r.action + " · " + r.table + (r.record ? " · " + r.record : "")) + '</div>' +
        (r.changes ? '<div class="log-changes">' + esc(r.changes) + '</div>' : "") +
        '<div class="sub">' + esc(fmtStamp(r.at) + " · " + [r.userId, r.userName].filter(Boolean).join(" ")) + '</div></div></div>').join("") + '</div>' +
        '<p class="hint">Showing the newest ' + rows.length + ' of ' + state.log.total + '. The full log is on the Change Log tab of the Core sheet.</p>'
        : '<div class="card"><div class="empty">No entries yet.</div></div>';
    }
    return {
      title: "Change log", back: true,
      html: '<div class="card"><label class="check switch-row"><input type="checkbox" data-act="toggle-changelog"' + (A.settings.changeLog ? " checked" : "") + '> ' +
          '<span><b>Logging is ' + (A.settings.changeLog ? "on" : "off") + '</b><span class="hint">Turning it off is recorded. Permanent deletes are logged either way.</span></span></label></div>' +
        '<div class="field" style="margin:12px 0"><label for="f_logmod">Module</label><select id="f_logmod" data-act="log-module">' + modOpts + '</select></div>' +
        body
    };
  }

  async function loadLog() {
    state.logLoading = true;
    try {
      const r = await api("changeLog", { limit: 300 });
      state.log = { rows: r.log, total: r.total };
      if (state.admin) state.admin.settings.changeLog = r.changeLog;
    } catch (err) { handleError(err); state.log = { rows: [], total: 0 }; }
    finally { state.logLoading = false; }
    if (parseRoute().name === "log") render();
  }

  // ------------------------------------------------------------------
  // Forms (bottom sheet, same as Ayers Aquariums)
  // ------------------------------------------------------------------
  function collect(form) {
    const out = {};
    $$("input[name], select[name], textarea[name]", form).forEach(el => {
      if (el.disabled || el.readOnly) return;
      out[el.name] = el.type === "checkbox" ? el.checked : el.value;
    });
    return out;
  }

  function openSheet(opts) {
    const back = document.createElement("div");
    back.className = "sheet-backdrop";
    back.innerHTML =
      '<form class="sheet" novalidate>' +
        '<div class="sheet-head"><h2>' + esc(opts.title) + '</h2><button type="button" class="icon-btn" data-close aria-label="Close">' + ICONS.close + '</button></div>' +
        '<div class="sheet-body"><div class="form-error" hidden></div>' + opts.body + '</div>' +
        '<div class="sheet-foot"><button type="button" class="btn" data-close>' + esc(opts.cancelLabel || "Cancel") + '</button>' +
        (opts.noSubmit ? "" : '<button type="submit" class="btn ' + (opts.danger ? "danger" : "primary") + '">' + esc(opts.submitLabel || "Save") + '</button>') + '</div>' +
      '</form>';
    document.body.appendChild(back);
    document.body.style.overflow = "hidden";
    const form = $("form", back);
    form.setAttribute("role", "dialog"); form.setAttribute("aria-modal", "true"); form.setAttribute("aria-label", opts.title || "Form");
    modalOpen(back, form);
    const close = () => { back.remove(); if (!$(".sheet-backdrop")) document.body.style.overflow = ""; if (opts.onClose) opts.onClose(); };
    form._close = close;
    $$("[data-close]", back).forEach(b => b.addEventListener("click", close));
    back.addEventListener("click", e => { if (e.target === back) close(); });
    if (opts.onReady) opts.onReady(form, close);
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const errBox = $(".form-error", form);
      errBox.hidden = true;
      const missing = $$("[required]", form).filter(el => !el.disabled && String(el.value).trim() === "")
        .map(el => { const l = el.id && $("label[for='" + el.id + "']", form); return l ? l.textContent.replace(/\s*\*\s*$/, "") : el.name; });
      if (missing.length) { errBox.textContent = "Please fill in: " + missing.join(", ") + "."; errBox.hidden = false; return; }
      try {
        const ok = await opts.onSubmit(collect(form), form);
        if (ok !== false) close();
      } catch (err) {
        errBox.textContent = err.message || String(err);
        errBox.hidden = false;
        $(".sheet-body", form).scrollTop = 0;
      }
    });
  }

  // ------------------------------------------------------------------
  // Events
  // ------------------------------------------------------------------
  document.addEventListener("click", e => {
    const el = e.target.closest("[data-act]");
    if (!el || el.tagName === "SELECT" || (el.tagName === "INPUT" && el.type === "checkbox" && e.type === "click" && el.dataset.act !== "toggle-changelog")) return;
    const d = el.dataset;
    switch (d.act) {
      case "back": if (history.length > 1) history.back(); else location.hash = "#/"; break;
      case "refresh": refresh(); break;
      case "sign-out": signOut(); break;
      case "due-days": dueDaysForm(); break;
      case "add-user": userForm(""); break;
      case "edit-user": userForm(d.id); break;
      case "edit-module": moduleForm(d.key); break;
      case "edit-due-default": dueDefaultForm(); break;
      case "perm-areas": {
        state.permEdit.open[d.module] = !$$('select[data-module="' + d.module + '"]:not([data-area=""])').length;
        render(); break;
      }
      case "perm-save": savePerms(); break;
      case "perm-reset": state.permEdit = null; render(); break;
      case "toggle-changelog": {
        const on = el.checked;
        state.admin.settings.changeLog = on;
        state.log = null;
        write("setChangeLog", { on: on }, on ? "Change log on" : "Change log off").catch(err => toast(err.message, true));
        break;
      }
    }
  });
  // Rows that act like buttons answer the keyboard too.
  document.addEventListener("keydown", e => {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches('[role="button"][data-act]')) { e.preventDefault(); e.target.click(); }
  });
  document.addEventListener("change", e => {
    const t = e.target;
    if (t.matches("[data-act='perm-pick']")) {
      const k = permKey(t.dataset.module, t.dataset.area);
      state.permEdit.picks[k] = t.value;
      if (!t.value) delete state.permEdit.picks[k];
      if (t.dataset.area) state.permEdit.open[t.dataset.module] = true;
      render();
    }
    if (t.matches("[data-act='log-module']")) { state.logModule = t.value; render(); }
    if (t.matches("[data-act='due-all']")) { setDueShowAll(t.checked); render(); }
  });
  window.addEventListener("hashchange", () => {
    if (!state.me) return;
    const r = parseRoute();
    if (!(r.name === "perms" && state.permEdit && r.args[0] === state.permEdit.userId)) state.permEdit = null;
    render();
  });

  // ------------------------------------------------------------------
  // Start
  // ------------------------------------------------------------------
  window.HH = { gisLoaded: gisLoaded };

  // Module screens (modules.js, hockey.js...) register here and use these core helpers.
  const MODULE_VIEWS = {};
  window.HH_CORE = {
    state: state, api: api, write: write, refreshInBackground: refreshInBackground, handleError: handleError, authStop: authStop,
    render: render, toast: toast, busy: busy, openSheet: openSheet, collect: collect, esc: esc, $: $, $$: $$,
    plural: plural, ICONS: ICONS, svg: svg, tile: tile, section: section, moduleIcon: moduleIcon, isAdmin: isAdmin, ROLE_TEXT: ROLE_TEXT,
    parseRoute: parseRoute,
    registerModule: (key, viewFn, resetFn) => { MODULE_VIEWS[key] = viewFn; if (resetFn) MODULE_RESETS[key] = resetFn; },
    checkPerms: checkPerms
  };

  // Reload when a newer version is published.
  async function checkForUpdate() {
    try {
      const res = await fetch("version.json?x=" + Date.now(), { cache: "no-store" });
      if (!res.ok) return;
      const v = (await res.json()).version;
      if (!v || v === APP_VERSION) return;
      if ($(".sheet-backdrop")) { toast("A new version is ready. It will load next time you open the app."); return; }
      let tried = "";
      try { tried = sessionStorage.getItem("hh_reloaded_for") || ""; } catch (e) { /* ignore */ }
      if (tried === v) return;
      try { sessionStorage.setItem("hh_reloaded_for", v); } catch (e) { /* ignore */ }
      if (navigator.serviceWorker) { try { const reg = await navigator.serviceWorker.getRegistration(); if (reg) await reg.update(); } catch (e) { /* ignore */ } }
      location.reload();
    } catch (e) { /* offline: try again later */ }
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkForUpdate(); });
  window.addEventListener("load", () => setTimeout(checkForUpdate, 1500));
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }

  try { state.token = localStorage.getItem(TOKEN_KEY); } catch (e) { state.token = null; }
  loadSession();
  if (state.session || (state.token && tokenValid(state.token))) boot();
  else { clearToken(); render(); }
  if (window.google && google.accounts && google.accounts.id) gisLoaded();
})();
