// Page-world script: drops outgoing "seen" / "typing" / "story seen" signals.
// Also patches Workers, because Instagram/Messenger open their chat socket there.
(() => {
  function core(g, isWorker, init) {
    const state = Object.assign({ blockSeen: false, blockTyping: false, blockStory: false, debug: false }, init);
    const bc = new BroadcastChannel("hyperfb-state");
    bc.onmessage = (e) => Object.assign(state, e.data);
    if (!isWorker) {
      g.addEventListener("message", (e) => {
        if (e.source === g && e.data?.__hyperfb) {
          Object.assign(state, e.data.__hyperfb);
          bc.postMessage(e.data.__hyperfb);
        }
      });
    }

    const SEEN = /change_read_status|mark_?(thread_?)?(as_?)?read|ThreadSeen|last_read_watermark|read_receipt|direct_v2\/threads\/[^?]*\/(items\/[^?]*\/)?seen|(?<!reel)\/seen\/?(\?|$)/i;
    const TYPING = /typ\.php|indicate_activity|SendTyping|TypingIndicator|is_typing|typing_status|"typing"/i;
    const STORY = /reel\/seen|stories?_?[a-z_]*seen|seen_?state|stor(y|ies)[a-z_]*seen[a-z_]*mutation|story_seen|bucket_seen|mark_story/i;

    const dec = new TextDecoder("latin1");
    const bodyText = (b) => {
      try {
        if (b == null) return "";
        if (typeof b === "string") return b;
        if (b instanceof URLSearchParams) return b.toString();
        if (b instanceof ArrayBuffer) return dec.decode(b);
        if (ArrayBuffer.isView(b)) return dec.decode(b);
        if (typeof FormData !== "undefined" && b instanceof FormData)
          return [...b.entries()].map(([k, v]) => `${k}=${typeof v === "string" ? v : ""}`).join("&");
      } catch {}
      return "";
    };

    const log = (kind, text, hit) => {
      if (state.debug) console.log(`[HyperFacebook] ${hit ? "BLOCKED" : "sent"} ${kind}:`, text.length > 600 ? text.slice(0, 200) + " … " + (text.match(/fb_api_req_friendly_name=[^&]*|doc_id=\d+/g) || []).join(" ") + " … " + text.slice(-300) : text);
    };
    const blocked = (kind, text) => {
      const hit =
        (state.blockStory && STORY.test(text)) ||
        (state.blockSeen && SEEN.test(text)) ||
        (state.blockTyping && TYPING.test(text));
      log(kind, text, hit);
      return hit;
    };

    if (g.fetch) {
      const orig = g.fetch;
      g.fetch = function (input, init) {
        const url = typeof input === "string" ? input : input?.url || String(input);
        if (blocked("fetch", url + " " + bodyText(init?.body))) {
          return Promise.resolve(new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));
        }
        return orig.apply(this, arguments);
      };
    }

    if (g.XMLHttpRequest) {
      const P = g.XMLHttpRequest.prototype, open = P.open, send = P.send;
      P.open = function (m, url) { this.__hfbUrl = String(url); return open.apply(this, arguments); };
      P.send = function (body) {
        if (blocked("xhr", (this.__hfbUrl || "") + " " + bodyText(body))) return;
        return send.apply(this, arguments);
      };
    }

    if (g.navigator?.sendBeacon) {
      const orig = g.navigator.sendBeacon.bind(g.navigator);
      g.navigator.sendBeacon = (url, data) => (blocked("beacon", String(url) + " " + bodyText(data)) ? true : orig(url, data));
    }

    if (g.WebSocket) {
      const send = g.WebSocket.prototype.send;
      g.WebSocket.prototype.send = function (data) {
        const isBlob = typeof Blob !== "undefined" && data instanceof Blob;
        // Blobs can only be read asynchronously; keep frame order by chaining sends.
        if (isBlob || this.__hfbPending) {
          this.__hfbPending = (this.__hfbPending || 0) + 1;
          const ready = isBlob ? data.arrayBuffer().then((b) => dec.decode(b), () => "") : Promise.resolve(bodyText(data));
          const prev = this.__hfbQ || Promise.resolve();
          this.__hfbQ = prev.then(() => ready).then((text) => {
            try { if (!blocked("ws", text)) send.call(this, data); } catch {}
            this.__hfbPending--;
          });
          return;
        }
        if (blocked("ws", bodyText(data))) return;
        return send.apply(this, arguments);
      };
    }
    return state;
  }

  const pageState = core(window, false);

  // Run the same patch inside classic workers created by the page.
  const wrap = (Ctor) => {
    const W = function (url, opts) {
      try {
        if (!opts || opts.type !== "module") {
          const abs = new URL(String(url), location.href).href;
          const src = `(${core})(self,true,${JSON.stringify(pageState)});importScripts(${JSON.stringify(abs)});`;
          url = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
        }
      } catch {}
      return new Ctor(url, opts);
    };
    W.prototype = Ctor.prototype;
    return W;
  };
  if (window.Worker) window.Worker = wrap(window.Worker);
  if (window.SharedWorker) window.SharedWorker = wrap(window.SharedWorker);
})();
