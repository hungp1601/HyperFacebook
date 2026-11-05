// Remembers the volume/mute state of Facebook videos (toggle in the popup).
(() => {
  let enabled = true;
  let saved = { volume: null, muted: null };
  let applying = false;
  let pointerDown = false;
  let lastInput = 0;

  chrome.storage.local.get({ volumeEnabled: true, volume: null, muted: null }, (s) => {
    enabled = s.volumeEnabled;
    saved = { volume: s.volume, muted: s.muted };
  });
  chrome.storage.onChanged.addListener((c) => {
    if (c.volumeEnabled) enabled = c.volumeEnabled.newValue;
    if (c.volume) saved.volume = c.volume.newValue;
    if (c.muted) saved.muted = c.muted.newValue;
  });

  // Only save changes the user made (not Facebook resetting the volume itself).
  const mark = () => (lastInput = Date.now());
  addEventListener("pointerdown", () => { pointerDown = true; mark(); }, true);
  addEventListener("pointerup", () => { pointerDown = false; mark(); }, true);
  addEventListener("keydown", mark, true);
  addEventListener("wheel", mark, true);
  const userActive = () => pointerDown || Date.now() - lastInput < 800;

  function apply(v) {
    if (!enabled || saved.volume === null) return;
    applying = true;
    try {
      if (v.volume !== saved.volume) v.volume = saved.volume;
      if (v.muted !== saved.muted) v.muted = saved.muted;
    } finally {
      setTimeout(() => (applying = false), 0);
    }
  }

  // Media events don't bubble, but they can be caught in the capture phase.
  for (const ev of ["loadedmetadata", "playing"]) {
    document.addEventListener(ev, (e) => e.target instanceof HTMLVideoElement && apply(e.target), true);
  }

  document.addEventListener("volumechange", (e) => {
    const v = e.target;
    if (!enabled || applying || !(v instanceof HTMLVideoElement) || !userActive()) return;
    saved = { volume: v.volume, muted: v.muted };
    chrome.storage.local.set(saved);
  }, true);
})();
