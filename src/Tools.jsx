import React, { useEffect, useMemo, useRef, useState } from "react";
import { igCollect, igUnfollow, fbCollect } from "./collectors.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function useSetting(key, def = false) {
  const [v, setV] = useState(def);
  useEffect(() => { chrome.storage.local.get({ [key]: def }, (s) => setV(!!s[key])); }, []);
  const set = (nv) => { setV(nv); chrome.storage.local.set({ [key]: nv }); return nv; };
  return [v, set];
}

function Toggle({ label, hint, on, onChange }) {
  return (
    <button className="row" role="switch" aria-checked={on} onClick={() => onChange(!on)}>
      <span><b>{label}</b>{hint && <small>{hint}</small>}</span>
      <span className={"switch" + (on ? " on" : "")} aria-hidden />
    </button>
  );
}

function FbPrivacy() {
  const [pixel, setPixel] = useSetting("pixelBlock");
  const [refresh, setRefresh] = useSetting("blockRefresh");
  const [pixelError, setPixelError] = useState("");
  const selfTest = async (dnr) => {
    const tests = [
      ["https://connect.facebook.net/en_US/fbevents.js", "script"],
      ["https://www.facebook.com/tr/?id=1&ev=PageView", "image"],
    ];
    const out = [];
    for (const [url, type] of tests) {
      const r = await dnr.testMatchOutcome({ url, type, initiator: "https://example.com" });
      out.push(r.matchedRules?.length ? "blocked" : "NOT blocked");
    }
    return out.join(", ");
  };
  const sync = async (dnr) => {
    const ids = await dnr.getEnabledRulesets();
    const on = ids.includes("pixel");
    setPixel(on);
    setPixelError(on ? `Active. Self-test (fbevents.js, /tr): ${await selfTest(dnr)}.` : "");
  };
  const togglePixel = async (v) => {
    const dnr = chrome.declarativeNetRequest;
    if (!dnr) return setPixelError("Reload the extension at chrome://extensions (new permission needed).");
    try {
      await dnr.updateEnabledRulesets(v ? { enableRulesetIds: ["pixel"] } : { disableRulesetIds: ["pixel"] });
      await sync(dnr);
    } catch (e) { setPixel(false); setPixelError("Could not change the rule set: " + e.message); }
  };
  useEffect(() => {
    const dnr = chrome.declarativeNetRequest;
    if (!dnr) return setPixelError("Reload the extension at chrome://extensions (new permission needed).");
    sync(dnr).catch((e) => setPixelError(e.message));
  }, []);
  return (
    <section className="card">
      <h2>Privacy</h2>
      <Toggle label="Block Facebook pixel tracking" hint="Blocks fbevents.js and facebook.com/tr on other websites." on={pixel} onChange={togglePixel} />
      {pixelError && <p className="status">{pixelError}</p>}
      <Toggle label="Block auto refresh" hint="Stops Facebook reloading the feed when you return to the tab. Reload open Facebook tabs after changing." on={refresh} onChange={setRefresh} />
    </section>
  );
}

// ---------- generic list table ----------
function ListTable({ columns, rows, sort, setSort, selected, setSelected, rowKey }) {
  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const val = (r) => (col.value ? col.value(r) : r[col.key]);
    return [...rows].sort((a, b) => {
      const x = val(a), y = val(b);
      const c = typeof x === "string" ? x.localeCompare(y) : (x === y ? 0 : x > y ? 1 : -1);
      return sort.dir * c;
    });
  }, [rows, sort, columns]);
  const allOn = sorted.length > 0 && sorted.every((r) => selected.has(rowKey(r)));
  const flip = (key) => setSort((s) => ({ key, dir: s.key === key ? -s.dir : 1 }));
  return (
    <div className="tablewrap">
      <table>
        <thead>
          <tr>
            <th><input type="checkbox" checked={allOn}
              onChange={() => setSelected(allOn ? new Set() : new Set(sorted.map(rowKey)))} /></th>
            {columns.map((c) => (
              <th key={c.key} onClick={() => flip(c.key)} className="sortable">
                {c.label}{sort.key === c.key ? (sort.dir > 0 ? " ▲" : " ▼") : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const k = rowKey(r);
            return (
              <tr key={k} className={selected.has(k) ? "sel" : ""}>
                <td><input type="checkbox" checked={selected.has(k)} onChange={() => {
                  const n = new Set(selected); n.has(k) ? n.delete(k) : n.add(k); setSelected(n);
                }} /></td>
                {columns.map((c) => <td key={c.key}>{c.render ? c.render(r) : String(r[c.key] ?? "")}</td>)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Instagram ----------
function Instagram() {
  const [data, setData] = useState({ following: [], followers: [] });
  const [view, setView] = useState("following");
  const [status, setStatus] = useState("Open instagram.com in a tab (logged in), then click Scan.");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [sort, setSort] = useState({ key: "username", dir: 1 });
  const [filter, setFilter] = useState("");
  const stop = useRef(false);

  const igTab = async () => {
    const [tab] = await chrome.tabs.query({ url: ["https://www.instagram.com/*", "https://*.instagram.com/*"] });
    return tab;
  };
  const run = async (func, args) => {
    const tab = await igTab();
    if (!tab) throw new Error("Open instagram.com in a tab first.");
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func, args });
    return result;
  };

  async function scan() {
    setBusy(true); setSelected(new Set());
    try {
      setStatus("Reading following list…");
      const a = await run(igCollect, ["following"]);
      if (a.error && !a.users?.length) throw new Error(a.error);
      setStatus(`Following: ${a.users.length}. Reading followers…`);
      const b = await run(igCollect, ["followers"]);
      if (b.error && !b.users?.length) throw new Error(b.error);
      setData({ following: a.users, followers: b.users });
      setStatus(`Done: ${a.users.length} following, ${b.users.length} followers.${a.error || b.error ? " (Partial: " + (a.error || b.error) + ")" : ""}`);
    } catch (e) { setStatus("Failed: " + e.message); }
    setBusy(false);
  }

  const followerIds = useMemo(() => new Set(data.followers.map((u) => u.id)), [data]);
  const followingIds = useMemo(() => new Set(data.following.map((u) => u.id)), [data]);
  const base = view === "following" ? data.following : data.followers;
  const rows = useMemo(() => base
    .map((u) => ({ ...u, followsYou: followerIds.has(u.id), youFollow: followingIds.has(u.id) }))
    .filter((u) => !filter || (u.username + " " + u.fullName).toLowerCase().includes(filter.toLowerCase())),
    [base, followerIds, followingIds, filter]);

  const yn = (v) => (v ? "Yes" : "No");
  const columns = [
    { key: "username", label: "Username", render: (r) => <a href={`https://www.instagram.com/${r.username}/`} target="_blank" rel="noreferrer">@{r.username}</a> },
    { key: "fullName", label: "Name" },
    view === "following"
      ? { key: "followsYou", label: "Follows you", value: (r) => +r.followsYou, render: (r) => yn(r.followsYou) }
      : { key: "youFollow", label: "You follow", value: (r) => +r.youFollow, render: (r) => yn(r.youFollow) },
    { key: "isPrivate", label: "Private", value: (r) => +r.isPrivate, render: (r) => yn(r.isPrivate) },
    { key: "isVerified", label: "Verified", value: (r) => +r.isVerified, render: (r) => yn(r.isVerified) },
  ];

  const selectWhere = (fn) => setSelected(new Set(rows.filter(fn).map((r) => r.id)));

  async function unfollowSelected() {
    const ids = [...selected].filter((id) => followingIds.has(id));
    if (!ids.length) return setStatus("Select accounts you follow first.");
    if (!confirm(`Unfollow ${ids.length} account(s)? This runs slowly (3–6s each) to avoid Instagram limits.`)) return;
    stop.current = false; setBusy(true);
    let done = 0;
    for (const id of ids) {
      if (stop.current) break;
      setStatus(`Unfollowing ${done + 1}/${ids.length}…`);
      try {
        const r = await run(igUnfollow, [id]);
        if (!r.ok) { setStatus(`Stopped: Instagram returned HTTP ${r.status}. Try again later.`); break; }
        done++;
        setData((d) => ({ ...d, following: d.following.filter((u) => u.id !== id) }));
        setSelected((s) => { const n = new Set(s); n.delete(id); return n; });
      } catch (e) { setStatus("Stopped: " + e.message); break; }
      await sleep(3000 + Math.random() * 3000);
    }
    setStatus(`Unfollowed ${done} account(s).`);
    setBusy(false);
  }

  return (
    <>
      <section className="card">
        <div className="bar">
          <button className="btn btn-primary" disabled={busy} onClick={scan}>Scan following &amp; followers</button>
          <div className="seg">
            <button className={view === "following" ? "on" : ""} onClick={() => { setView("following"); setSelected(new Set()); }}>Following ({data.following.length})</button>
            <button className={view === "followers" ? "on" : ""} onClick={() => { setView("followers"); setSelected(new Set()); }}>Followers ({data.followers.length})</button>
          </div>
          <input className="search" placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        <div className="bar">
          <span className="muted">Quick select:</span>
          {view === "following" && <button className="btn btn-light" onClick={() => selectWhere((r) => !r.followsYou)}>Not following back</button>}
          <button className="btn btn-light" onClick={() => selectWhere((r) => r.isPrivate)}>Private</button>
          <button className="btn btn-light" onClick={() => selectWhere((r) => !r.isVerified)}>Not verified</button>
          <button className="btn btn-light" onClick={() => setSelected(new Set())}>Clear</button>
          <span className="grow" />
          <span className="muted">{selected.size} selected</span>
          {view === "following" && <button className="btn btn-danger" disabled={busy || !selected.size} onClick={unfollowSelected}>Unfollow selected</button>}
          {busy && <button className="btn btn-light" onClick={() => (stop.current = true)}>Stop</button>}
        </div>
        <p className="status">{status}</p>
        <ListTable columns={columns} rows={rows} sort={sort} setSort={setSort} selected={selected} setSelected={setSelected} rowKey={(r) => r.id} />
      </section>
    </>
  );
}

// ---------- Facebook ----------
const FB_LISTS = [
  { key: "friends", label: "Friends", url: "https://www.facebook.com/me/friends" },
  { key: "following", label: "Following", url: "https://www.facebook.com/me/following" },
  { key: "pages", label: "Pages", url: "https://www.facebook.com/pages/?category=liked" },
  { key: "groups", label: "Groups", url: "https://www.facebook.com/groups/joins/" },
];

function Facebook() {
  const [list, setList] = useState("friends");
  const [data, setData] = useState({});
  const [status, setStatus] = useState("Click Scan to read this list from your Facebook account.");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [sort, setSort] = useState({ key: "name", dir: 1 });
  const [filter, setFilter] = useState("");
  const cur = FB_LISTS.find((l) => l.key === list);
  const rows = (data[list] || []).filter((r) => !filter || r.name.toLowerCase().includes(filter.toLowerCase()));

  async function scan() {
    setBusy(true); setSelected(new Set());
    setStatus(`Scanning ${cur.label.toLowerCase()}… a small window opens in the background and closes by itself.`);
    let win;
    try {
      // Small, unfocused window: stays visible (so Facebook keeps loading) but never takes focus.
      win = await chrome.windows.create({ url: cur.url, type: "popup", focused: false, width: 420, height: 600 });
      const tabId = win.tabs[0].id;
      for (let i = 0; i < 80; i++) {
        if ((await chrome.tabs.get(tabId)).status === "complete") break;
        await sleep(250);
      }
      const t = await chrome.tabs.get(tabId);
      if (/login|checkpoint/.test(t.url)) throw new Error("Not logged in to Facebook.");
      const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, func: fbCollect, args: [list] });
      setData((d) => ({ ...d, [list]: result.items }));
      setStatus(result.items.length ? `Found ${result.items.length} ${cur.label.toLowerCase()}.` : "Nothing found — Facebook's layout may have changed.");
    } catch (e) { setStatus("Failed: " + e.message); }
    if (win) chrome.windows.remove(win.id).catch(() => {});
    setBusy(false);
  }

  const columns = [
    { key: "name", label: "Name", render: (r) => <a href={r.url} target="_blank" rel="noreferrer">{r.name}</a> },
    { key: "url", label: "Link", render: (r) => <span className="muted">{r.url.replace("https://www.facebook.com", "")}</span> },
  ];

  async function openSelected() {
    const urls = rows.filter((r) => selected.has(r.id)).map((r) => r.url);
    if (!urls.length) return;
    if (urls.length > 10 && !confirm(`Open ${urls.length} tabs?`)) return;
    for (const url of urls) { await chrome.tabs.create({ url, active: false }); await sleep(400); }
  }

  return (
    <>
      <FbPrivacy />
      <section className="card">
        <div className="bar">
          <div className="seg">
            {FB_LISTS.map((l) => (
              <button key={l.key} className={list === l.key ? "on" : ""} onClick={() => { setList(l.key); setSelected(new Set()); }}>
                {l.label}{data[l.key] ? ` (${data[l.key].length})` : ""}
              </button>
            ))}
          </div>
          <button className="btn btn-primary" disabled={busy} onClick={scan}>Scan {cur.label.toLowerCase()}</button>
          <input className="search" placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        <div className="bar">
          <span className="muted">{selected.size} selected</span>
          <button className="btn btn-light" disabled={!selected.size} onClick={openSelected}>Open selected in tabs</button>
          <button className="btn btn-light" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
        <p className="status">{status}</p>
        <ListTable columns={columns} rows={rows} sort={sort} setSort={setSort} selected={selected} setSelected={setSelected} rowKey={(r) => r.id} />
      </section>
    </>
  );
}

export default function Tools({ site, onBack }) {
  useEffect(() => {
    document.body.classList.add("wide");
    return () => document.body.classList.remove("wide");
  }, []);
  return (
    <div className="page">
      <header>
        <button className="btn btn-light" onClick={onBack}>← Back</button>
        <h1>{site === "ig" ? "Instagram tools" : "Facebook tools"}</h1>
      </header>
      {site === "ig" ? <Instagram /> : <Facebook />}
    </div>
  );
}
