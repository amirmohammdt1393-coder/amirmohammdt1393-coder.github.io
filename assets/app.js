"use strict";

/* ---------- config (auto-derived from the URL) ---------- */
var host = location.hostname;
var owner = host.split(".")[0];
var segs = location.pathname.split("/").filter(Boolean);
var repo = segs.length ? segs[0] : host;
var RAW = "https://raw.githubusercontent.com/" + owner + "/" + repo + "/main/";
var API = "https://api.github.com/repos/" + owner + "/" + repo;
var TOKEN_KEY = "mizban24_token";

/* ---------- helpers ---------- */
function $(s) { return document.querySelector(s); }
function faNum(n) { return Number(n || 0).toLocaleString("fa-IR"); }
function tehranTime(d) {
  try {
    return new Intl.DateTimeFormat("fa-IR", {
      timeZone: "Asia/Tehran", hour: "2-digit", minute: "2-digit"
    }).format(d);
  } catch (e) { return "--:--"; }
}
function since(ts) {
  if (!ts) return "—";
  var s = (Date.now() - new Date(ts).getTime()) / 1000;
  if (s < 90) return "لحظاتی پیش";
  if (s < 3600) return faNum(Math.floor(s / 60)) + " دقیقه پیش";
  return faNum(Math.floor(s / 3600)) + " ساعت پیش";
}
function hms(ms) {
  var t = Math.max(0, Math.floor(ms / 1000));
  function p(x) { return String(x).padStart(2, "0"); }
  return p(Math.floor(t / 3600)) + ":" + p(Math.floor((t % 3600) / 60)) + ":" + p(t % 60);
}
function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function toast(msg, kind) {
  var el = document.createElement("div");
  el.className = "toast " + (kind || "ok");
  el.textContent = msg;
  $("#toasts").appendChild(el);
  setTimeout(function () { el.classList.add("show"); }, 10);
  setTimeout(function () {
    el.classList.remove("show");
    setTimeout(function () { el.remove(); }, 400);
  }, 4200);
}

/* ---------- status ---------- */
var BOT_STATUS = {
  running:  { label: "در حال اجرا", cls: "ok" },
  starting: { label: "راه‌اندازی", cls: "warn" },
  finished: { label: "پایان چرخه", cls: "warn" },
  timeout:  { label: "پایان دوره", cls: "warn" },
  stopped:  { label: "متوقف (دستی)", cls: "idle" },
  removed:  { label: "حذف‌شده", cls: "idle" },
  crashed:  { label: "خطا", cls: "bad" }
};
var lastStatus = null;
var openLogs = new Set();

function setSys(cls, title, sub) {
  $("#sysDot").className = "pulse " + cls;
  $("#sysTitle").textContent = title;
  $("#sysSub").textContent = sub;
}

async function fetchStatus() {
  try {
    var res = await fetch(RAW + "runtime/status.json?t=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    lastStatus = await res.json();
    render();
  } catch (e) {
    setSys("bad", "خطا در دریافت وضعیت", "به فایل وضعیت دسترسی نداریم؛ دوباره تلاش می‌کنیم…");
  }
}

function render() {
  var st = lastStatus || {};
  var botsAll = Object.values(st.bots || {});
  var bots = botsAll.filter(function (b) { return b.status !== "removed"; });
  var mode = (st.runner || {}).mode || "unknown";
  var FRESH = 16 * 60 * 1000;
  function isFresh(ts) { return ts && Date.now() - new Date(ts).getTime() < FRESH; }
  var anyRunning = bots.some(function (b) { return b.status === "running" || b.status === "starting"; });

  if (mode === "stopped_by_user") {
    setSys("idle", "سیستم خاموش است", "با فرمان توقف همهٔ ربات‌ها بسته شده‌اند؛ برای روشن‌کردن در چت بگو «شروع کن».");
  } else if (!bots.length) {
    setSys("idle", "آماده به کار", "هنوز رباتی مستقر نشده — اولین فایل را در چت بفرست.");
  } else if (anyRunning && isFresh(st.updated_at)) {
    setSys("ok", "سیستم روشن است", "موتور اجرا فعال است؛ آخرین ضربان " + since(st.updated_at) + " ثبت شده.");
  } else {
    setSys("bad", "مشکل در اجرا", "ضربان تازه‌ای نرسیده؛ نگه‌بان خودکار چرخهٔ جدید را بالا می‌آورد.");
  }

  $("#stBots").textContent = faNum(bots.length);
  $("#stUpdated").textContent = st.updated_at ? since(st.updated_at) : "—";

  var upEl = $("#stUptime");
  var live = null;
  for (var i = 0; i < bots.length; i++) {
    var b = bots[i];
    if ((b.status === "running" || b.status === "starting") && b.started_at) { live = b; break; }
  }
  if (live) {
    upEl.dataset.start = String(new Date(live.started_at).getTime());
    upEl.textContent = hms(Date.now() - new Date(live.started_at).getTime());
  } else {
    delete upEl.dataset.start;
    upEl.textContent = "—";
  }

  renderBots(bots);
}

function renderBots(bots) {
  var grid = $("#bots");
  $("#empty").classList.toggle("hidden", bots.length > 0);
  var admin = !!getToken();
  grid.innerHTML = bots.map(function (b) {
    var meta = BOT_STATUS[b.status] || { label: b.status, cls: "idle" };
    var start = b.started_at ? new Date(b.started_at) : null;
    var errBox = b.last_error
      ? '<div class="err"><b>آخرین خطا:</b><pre dir="ltr">' + esc(b.last_error.slice(-1200)) + "</pre></div>"
      : "";
    var delBtn = admin
      ? '<div class="bot-actions"><button class="btn danger small" data-del="' + esc(b.name) + '">حذف ربات</button></div>'
      : "";
    return '<article class="card bot" data-name="' + esc(b.name) + '">' +
      '<div class="bot-head"><span class="dot ' + meta.cls + '"></span>' +
      '<h3>' + esc(b.name) + '</h3><span class="pill ' + meta.cls + '">' + meta.label + "</span></div>" +
      '<div class="bot-meta">' +
      '<span>شروع: <b>' + (start ? tehranTime(start) : "—") + "</b></span>" +
      "<span>ضربان: <b>" + since(b.last_beat) + "</b></span>" +
      "<span>دوره‌های اجرا: <b>" + faNum((b.restarts || 0) + 1) + "</b></span>" +
      "</div>" +
      '<div class="uptime" data-start="' + (start ? start.getTime() : "") + '">آپتایم: <b>' +
      (start ? hms(Date.now() - start.getTime()) : "—") + "</b></div>" +
      errBox +
      '<details class="logbox" data-name="' + esc(b.name) + '"' + (openLogs.has(b.name) ? " open" : "") + ">" +
      "<summary>مشاهدهٔ لاگ زنده</summary><pre>در حال دریافت…</pre></details>" +
      delBtn +
      "</article>";
  }).join("");

  grid.querySelectorAll("details.logbox").forEach(function (d) {
    d.addEventListener("toggle", function () {
      var n = d.dataset.name;
      if (d.open) { openLogs.add(n); loadLog(n, d.querySelector("pre")); }
      else openLogs.delete(n);
    });
    if (d.open) loadLog(d.dataset.name, d.querySelector("pre"));
  });
  grid.querySelectorAll("[data-del]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      deleteBot(btn.dataset.del).catch(function (e) { toast("خطا: " + e.message, "err"); });
    });
  });
}

async function loadLog(name, pre) {
  try {
    var res = await fetch(RAW + "runtime/logs/" + name + ".log?t=" + Date.now(), { cache: "no-store" });
    pre.textContent = res.ok ? (await res.text()).slice(-8000) : "هنوز لاگی ثبت نشده است.";
  } catch (e) {
    pre.textContent = "دریافت لاگ ناموفق بود.";
  }
}

/* ---------- token mode (optional self-service) ---------- */
function getToken() { return localStorage.getItem(TOKEN_KEY) || ""; }

async function gh(path, method, body) {
  var res = await fetch(API + path, {
    method: method || "GET",
    headers: {
      Authorization: "Bearer " + getToken(),
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    var msg = "HTTP " + res.status;
    try { var j = await res.json(); msg = j.message || msg; } catch (e) {}
    throw new Error(msg);
  }
  return res.json();
}
async function getSha(path) {
  try {
    var j = await gh("/contents/" + path + "?t=" + Date.now());
    return j.sha;
  } catch (e) { return null; }
}
function b64utf(s) {
  var bytes = new TextEncoder().encode(s);
  var bin = "";
  bytes.forEach(function (c) { bin += String.fromCharCode(c); });
  return btoa(bin);
}
async function putFile(path, contentB64, msg) {
  var sha = await getSha(path);
  var body = { message: msg, content: contentB64, branch: "main" };
  if (sha) body.sha = sha;
  return gh("/contents/" + path, "PUT", body);
}
async function setControl(next) {
  return putFile("runtime/control.json", b64utf(JSON.stringify(next)), "control update [skip ci]");
}
async function dispatchRunner() {
  return gh("/actions/workflows/runner.yml/dispatches", "POST", { ref: "main" });
}

async function uploadBot(file) {
  if (!/\.py$/i.test(file.name)) throw new Error("فقط فایل پایتون (.py) مجاز است");
  if (file.size > 1024 * 1024) throw new Error("حجم فایل باید کمتر از ۱ مگابایت باشد");
  var safe = file.name.replace(/\.py$/i, "").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 40) || "bot";
  var b64 = await new Promise(function (ok, no) {
    var r = new FileReader();
    r.onload = function () { ok(String(r.result).split(",")[1]); };
    r.onerror = function () { no(new Error("خواندن فایل ناموفق بود")); };
    r.readAsDataURL(file);
  });
  await putFile("bots/" + safe + ".py", b64, "deploy bot: " + safe);
  await setControl({ stop_all: false, stop: [] });
  await dispatchRunner().catch(function () {});
  return safe;
}
async function stopAll() {
  await setControl({ stop_all: true, stop: [] });
}
async function startAll() {
  await setControl({ stop_all: false, stop: [] });
  await dispatchRunner().catch(function () {});
}
async function deleteBot(name) {
  if (!confirm('ربات "' + name + '" برای همیشه حذف شود؟')) return;
  var sha = await getSha("bots/" + name + ".py");
  if (!sha) throw new Error("فایل ربات پیدا نشد");
  await setControl({ stop_all: false, stop: [name] });
  await gh("/contents/bots/" + name + ".py", "DELETE", {
    message: "remove bot: " + name, sha: sha, branch: "main"
  });
  toast("ربات حذف شد؛ پروسهٔ فعال هم تا یک دقیقه بسته می‌شود.");
}

async function handleUpload(f) {
  toast("در حال استقرار " + f.name + " …");
  try {
    var name = await uploadBot(f);
    toast('ربات "' + name + '" مستقر شد! تا ۶۰ ثانیه دیگر روشن است.');
  } catch (e) {
    toast("استقرار ناموفق: " + e.message, "err");
  }
}

/* ---------- wiring ---------- */
function tick() {
  $("#clock").textContent = tehranTime(new Date());
  var up = $("#stUptime");
  if (up.dataset.start) up.textContent = hms(Date.now() - Number(up.dataset.start));
  document.querySelectorAll(".uptime[data-start]").forEach(function (el) {
    if (el.dataset.start) {
      var b = el.querySelector("b");
      if (b) b.textContent = hms(Date.now() - Number(el.dataset.start));
    }
  });
}

function initTokenPanel() {
  var t = getToken();
  $("#tokenInput").value = t;
  $("#adminBox").classList.toggle("hidden", !t);
  if (t) {
    $("#tokenState").textContent = "توکن ذخیره شده است — در حال بررسی اتصال…";
    gh("/user").then(function (u) {
      $("#tokenState").textContent = "متصل با حساب: " + u.login;
    }).catch(function () {
      $("#tokenState").textContent = "توکن ذخیره‌شده کار نمی‌کند — آن را عوض کن.";
    });
  } else {
    $("#tokenState").textContent = "";
  }
}

window.addEventListener("DOMContentLoaded", function () {
  $("#repoLink").href = "https://github.com/" + owner + "/" + repo;
  tick();
  setInterval(tick, 1000);
  fetchStatus();
  setInterval(fetchStatus, 60000);

  $("#tokenToggle").addEventListener("click", function () {
    $("#tokenPanel").classList.toggle("hidden");
  });
  $("#tokenSave").addEventListener("click", function () {
    var v = $("#tokenInput").value.trim();
    if (!v) { toast("اول توکن را وارد کن", "warn"); return; }
    localStorage.setItem(TOKEN_KEY, v);
    initTokenPanel();
    render();
    toast("توکن ذخیره شد — مدیریت مستقیم فعال شد.");
  });
  $("#tokenRemove").addEventListener("click", function () {
    localStorage.removeItem(TOKEN_KEY);
    $("#tokenInput").value = "";
    initTokenPanel();
    render();
    toast("توکن از مرورگر پاک شد.");
  });
  $("#btnStop").addEventListener("click", function () {
    stopAll().then(function () {
      toast("فرمان توقف صادر شد؛ تا یک دقیقه همهٔ پروسه‌ها بسته می‌شوند.");
    }).catch(function (e) { toast("خطا: " + e.message, "err"); });
  });
  $("#btnStart").addEventListener("click", function () {
    startAll().then(function () {
      toast("فرمان اجرا صادر شد؛ تا یک دقیقه ربات‌ها روشن می‌شوند.");
    }).catch(function (e) { toast("خطا: " + e.message, "err"); });
  });

  var drop = $("#drop"), fi = $("#fileInput");
  drop.addEventListener("click", function () { fi.click(); });
  drop.addEventListener("dragover", function (e) { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", function () { drop.classList.remove("over"); });
  drop.addEventListener("drop", function (e) {
    e.preventDefault();
    drop.classList.remove("over");
    var f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleUpload(f);
  });
  fi.addEventListener("change", function () {
    if (fi.files[0]) handleUpload(fi.files[0]);
    fi.value = "";
  });

  initTokenPanel();
});
