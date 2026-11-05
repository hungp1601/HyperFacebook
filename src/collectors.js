// Functions below are injected into web pages with chrome.scripting.executeScript,
// so they must be fully self-contained (no imports / outer variables).

// ---- Instagram (uses the logged-in session's own web API) ----
export async function igCollect(kind) {
  const uid = document.cookie.match(/ds_user_id=(\d+)/)?.[1];
  if (!uid) return { error: "Not logged in to Instagram in this tab." };
  const out = [];
  let maxId = "";
  for (let i = 0; i < 300; i++) {
    const r = await fetch(`/api/v1/friendships/${uid}/${kind}/?count=100${maxId ? `&max_id=${maxId}` : ""}`, {
      headers: { "x-ig-app-id": "936619743392459", "x-requested-with": "XMLHttpRequest" },
      credentials: "include",
    });
    if (!r.ok) return { error: `Instagram returned HTTP ${r.status}`, users: out };
    const j = await r.json();
    for (const u of j.users || []) {
      out.push({ id: String(u.pk || u.id), username: u.username, fullName: u.full_name || "", isPrivate: !!u.is_private, isVerified: !!u.is_verified });
    }
    if (!j.next_max_id) break;
    maxId = j.next_max_id;
    await new Promise((res) => setTimeout(res, 800 + Math.random() * 700));
  }
  return { users: out };
}

export async function igUnfollow(id) {
  const csrf = document.cookie.match(/csrftoken=([^;]+)/)?.[1] || "";
  const r = await fetch(`/api/v1/friendships/destroy/${id}/`, {
    method: "POST",
    credentials: "include",
    headers: { "x-ig-app-id": "936619743392459", "x-csrftoken": csrf, "x-requested-with": "XMLHttpRequest", "content-type": "application/x-www-form-urlencoded" },
    body: "",
  });
  return { ok: r.ok, status: r.status };
}

// ---- Facebook (scrolls a list page and reads the profile/page/group links) ----
export async function fbCollect(kind) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const seen = new Map();
  const skip = /^(home|watch|marketplace|groups|friends|pages|notifications|messages|menu|see all|more|edit|add friend|message|follow|following|unfollow|joined|liked|likes)$/i;
  const grab = () => {
    const root = document.querySelector('[role="main"]') || document.body;
    for (const a of root.querySelectorAll("a[href]")) {
      let u;
      try { u = new URL(a.href, location.href); } catch { continue; }
      if (!/(^|\.)facebook\.com$/.test(u.hostname)) continue;
      const isGroup = u.pathname.startsWith("/groups/");
      let key;
      if (u.pathname === "/profile.php") key = "/profile.php?id=" + u.searchParams.get("id");
      else key = u.pathname.replace(/\/$/, "");
      const parts = key.split("/").filter(Boolean);
      if (!parts.length) continue;
      if (kind === "groups") {
        if (!(isGroup && parts.length >= 2) || /^(joins|discover|feed|create|category)$/.test(parts[1])) continue;
        key = "/groups/" + parts[1];
      } else {
        if (isGroup || /^(friends|pages|watch|marketplace|gaming|events|photo|photos|reel|stories|help|policies|settings|me|login|messages|notifications|bookmarks|search|hashtag|profile\.php\?id=null)/.test(parts[0])) continue;
        if (parts.length > 1 && !key.startsWith("/profile.php")) continue;
      }
      const name = (a.innerText || a.getAttribute("aria-label") || "").split("\n")[0].trim();
      if (!name || name.length < 2 || skip.test(name)) continue;
      const prev = seen.get(key);
      if (!prev || name.length > prev.name.length) {
        seen.set(key, { id: key, name, url: "https://www.facebook.com" + (key.startsWith("/profile.php") ? key : key) });
      }
    }
  };
  // Wait for the first results, then keep scrolling until nothing new loads.
  for (let i = 0; i < 40 && !(grab(), seen.size); i++) await sleep(250);
  let still = 0;
  for (let i = 0; i < 600 && still < 2; i++) {
    const h = document.documentElement.scrollHeight, n = seen.size;
    window.scrollTo(0, document.documentElement.scrollHeight);
    let changed = false;
    for (let w = 0; w < 24 && !changed; w++) {   // up to ~3.6s, but returns as soon as new content shows
      await sleep(150);
      grab();
      changed = seen.size > n || document.documentElement.scrollHeight > h;
    }
    still = changed ? 0 : still + 1;
  }
  grab();
  return { items: [...seen.values()] };
}
