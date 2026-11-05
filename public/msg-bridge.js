// Relays the popup's message-tool settings to the page-world script.
(() => {
  const push = (s) =>
    window.postMessage({ __hyperfb: { blockSeen: !!s.blockSeen, blockTyping: !!s.blockTyping, blockStory: !!s.blockStory, debug: !!s.debug } }, "*");
  chrome.storage.local.get({ blockSeen: false, blockTyping: false, blockStory: false, debug: false }, push);
  chrome.storage.onChanged.addListener(() =>
    chrome.storage.local.get({ blockSeen: false, blockTyping: false, blockStory: false, debug: false }, push));
})();
