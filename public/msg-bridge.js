// Relays the popup's message-tool settings to the page-world script.
(() => {
  const push = (s) =>
    window.postMessage({ __hyperfb: { blockSeen: !!s.blockSeen, blockTyping: !!s.blockTyping, blockStory: !!s.blockStory } }, "*");
  chrome.storage.local.get({ blockSeen: false, blockTyping: false, blockStory: false }, push);
  chrome.storage.onChanged.addListener(() =>
    chrome.storage.local.get({ blockSeen: false, blockTyping: false, blockStory: false }, push));
})();
