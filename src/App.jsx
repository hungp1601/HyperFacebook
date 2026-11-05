import { useEffect, useState } from "react";
import { extractInPage } from "./extract.js";

const FEATURES = [{ key: "volumeEnabled", label: "Remember video volume" }];
const MESSAGE_TOOLS = [
  { key: "blockSeen", label: "Block seen" },
  { key: "blockTyping", label: "Block typing" },
  { key: "blockStory", label: "Block story seen" },
  { key: "debug", label: "Debug log (page console)" },
];

function MessageTools({ onBack }) {
  const [settings, setSettings] = useState({ blockSeen: false, blockTyping: false, blockStory: false, debug: false });

  useEffect(() => {
    chrome.storage.local.get({ blockSeen: false, blockTyping: false, blockStory: false, debug: false }, setSettings);
  }, []);

  const toggle = (key) => {
    const value = !settings[key];
    setSettings((s) => ({ ...s, [key]: value }));
    chrome.storage.local.set({ [key]: value });
  };

  return (
    <div className="app">
      <header>
        <button className="btn btn-light" onClick={onBack}>← Back</button>
      </header>
      <h1>Message tools</h1>
      <div className="list">
        {MESSAGE_TOOLS.map(({ key, label }) => (
          <button className="row" key={key} role="switch" aria-checked={!!settings[key]} onClick={() => toggle(key)}>
            <span>{label}</span>
            <span className={"switch" + (settings[key] ? " on" : "")} aria-hidden />
          </button>
        ))}
      </div>
      <p className="status">Works on Facebook, Messenger and Instagram (Threads has no stories). Reload the chat tab after changing.</p>
    </div>
  );
}

function Videos({ onBack }) {
  const [videos, setVideos] = useState([]);
  const [status, setStatus] = useState("Scanning…");

  async function scan() {
    setVideos([]);
    setStatus("Scanning…");
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url || !/^https:\/\/([\w-]+\.)?facebook\.com\//.test(tab.url)) {
      return setStatus("Open a facebook.com page first.");
    }
    let results;
    try {
      [{ result: results }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractInPage,
      });
    } catch (e) {
      return setStatus("Failed: " + e.message);
    }
    if (!results?.length) {
      return setStatus("No direct video link found. Open the video's own page (click its timestamp) and rescan.");
    }
    setVideos(results);
    setStatus(`Found ${results.length} file(s).`);
  }

  useEffect(() => { scan(); }, []);

  const download = ({ url, quality }) =>
    chrome.downloads.download({ url, filename: `facebook-video-${Date.now()}-${quality}.mp4` });

  return (
    <div className="app">
      <header>
        <button className="btn btn-light" onClick={onBack}>← Back</button>
        <button className="btn btn-light" onClick={scan}>Rescan</button>
      </header>
      <h1>Videos</h1>
      {videos.map((v) => (
        <div className="item" key={v.id + v.quality}>
          <span>Video {v.id} · <b>{v.quality}</b></span>
          <button className="btn btn-green" onClick={() => download(v)}>Download</button>
        </div>
      ))}
      <p className="status">{status}</p>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState("home");
  const [settings, setSettings] = useState({ volumeEnabled: true });

  useEffect(() => {
    chrome.storage.local.get({ volumeEnabled: true }, setSettings);
  }, []);

  const toggle = (key) => {
    const value = !settings[key];
    setSettings((s) => ({ ...s, [key]: value }));
    chrome.storage.local.set({ [key]: value });
  };

  if (view === "messages") return <MessageTools onBack={() => setView("home")} />;
  if (view === "videos") return <Videos onBack={() => setView("home")} />;

  return (
    <div className="app">
      <h1>HyperFacebook</h1>
      <div className="list">
        <button className="row" onClick={() => setView("videos")}>
          <span>Find videos</span>
          <span className="chev">›</span>
        </button>
        <button className="row" onClick={() => setView("messages")}>
          <span>Message tools</span>
          <span className="chev">›</span>
        </button>
        {FEATURES.map(({ key, label }) => (
          <button className="row" key={key} role="switch" aria-checked={!!settings[key]} onClick={() => toggle(key)}>
            <span>{label}</span>
            <span className={"switch" + (settings[key] ? " on" : "")} aria-hidden />
          </button>
        ))}
      </div>
    </div>
  );
}
