// Runs inside the Facebook tab via chrome.scripting.executeScript, so it must be self-contained.
export async function extractInPage() {
  const KEYS = {
    browser_native_hd_url: "HD",
    playable_url_quality_hd: "HD",
    hd_src: "HD",
    browser_native_sd_url: "SD",
    playable_url: "SD",
    sd_src: "SD",
  };
  const decode = (s) => {
    try { return JSON.parse('"' + s + '"'); } catch { return s.replace(/\\\//g, "/"); }
  };

  let sources = [document.documentElement.outerHTML];
  try {
    const r = await fetch(location.href, { credentials: "include" });
    sources.push(await r.text());
  } catch (_) {}

  const found = new Map(); // "id|quality" -> {url, quality, id}
  const add = (id, quality, url) => {
    const k = id + "|" + quality;
    if (!found.has(k)) found.set(k, { url, quality, id });
  };
  for (const html of sources) {
    // Current format: "progressive_urls":[{"progressive_url":"...","metadata":{"quality":"HD"}}]
    const re = /"progressive_urls"\s*:\s*\[/g;
    let m;
    while ((m = re.exec(html))) {
      const start = m.index + m[0].length - 1;
      let depth = 0, end = start, inStr = false;
      for (let i = start; i < html.length; i++) {
        const c = html[i];
        if (inStr) { if (c === "\\") i++; else if (c === '"') inStr = false; }
        else if (c === '"') inStr = true;
        else if (c === "[") depth++;
        else if (c === "]" && --depth === 0) { end = i; break; }
      }
      let arr = [];
      try { arr = JSON.parse(html.slice(start, end + 1)); } catch (_) {}
      const before = html.slice(Math.max(0, m.index - 2000), m.index);
      const ids = [...before.matchAll(/dash_mpd_debug\.mpd\?v=(\d+)/g)];
      const id = ids.length ? ids[ids.length - 1][1] : "unknown";
      for (const it of arr) {
        if (it?.progressive_url) add(id, it.metadata?.quality || "SD", it.progressive_url);
      }
    }
    // Legacy keys
    for (const key of Object.keys(KEYS)) {
      const r2 = new RegExp('"' + key + '"\\s*:\\s*"(https:[^"]+)"', "g");
      let m2;
      while ((m2 = r2.exec(html))) add("legacy", KEYS[key], decode(m2[1]));
    }
  }
  let list = [...found.values()];
  // Keep only the video for this page: the ID in the tab URL, else the first one found.
  const mine = list.filter((v) => location.href.includes(v.id));
  const keepId = mine.length ? mine[0].id : list[0]?.id;
  list = list.filter((v) => v.id === keepId);
  list.sort((a, b) => (a.quality === "HD" ? 0 : 1) - (b.quality === "HD" ? 0 : 1));
  return list;
}
