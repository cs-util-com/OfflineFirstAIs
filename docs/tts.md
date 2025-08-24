Below is a turnkey, *single-file* demo that runs `kokoro-js` in a plain HTML page with vanilla JS. It:

* Detects WebGPU, tries it with `dtype: "fp32"`, and **falls back to WASM** (`dtype: "q8"`) if unavailable or if initialization fails.
* Loads the public ONNX model from Hugging Face, lists available voices, and plays the synthesized audio in the page.
* Requires no build tools—just open via a local HTTP server (because WebGPU needs a secure context / `localhost`).

References used for API details and options are linked inline. ([npm][1], [Hugging Face][2])

---

# 1) Prerequisites (quick)

1. Use a browser with WebGPU (Chrome/Edge 121+ desktop is ideal; Safari 18+ also supports it).
2. Serve the file from `https://` or **`http://localhost`**. Easiest options:

   * Python: `python3 -m http.server 8000`
   * Node (serve): `npx serve .`
3. First run will download model assets; allow a few hundred MB depending on quantization (WebGPU `fp32` is largest, WASM `q8` is much smaller). Voices come from the model’s card. ([Hugging Face][2])

---

# 2) Drop-in demo (single HTML file)

> Save as `index.html`, then open via `http://localhost:8000` (or similar).

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Kokoro TTS — WebGPU with WASM fallback (vanilla JS)</title>
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    :root { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; }
    body { max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
    .row { display: flex; gap: .5rem; align-items: center; flex-wrap: wrap; }
    label { font-weight: 600; }
    textarea { width: 100%; min-height: 120px; }
    select, input[type="number"] { padding: .3rem .4rem; }
    button { padding: .5rem .8rem; }
    #log { white-space: pre-wrap; background:#f6f6f6; padding:.75rem; border-radius:.5rem; }
    .muted { color: #666; font-size: .9em; }
  </style>
</head>
<body>
  <h1>Kokoro TTS — WebGPU with WASM fallback</h1>

  <p class="muted">
    First load downloads the model & caches it locally. WebGPU preferred, auto-fallback to WASM.
  </p>

  <div class="row">
    <button id="loadBtn">① Load model</button>
    <span id="status" class="muted">idle</span>
  </div>

  <div class="row" style="margin-top:.75rem">
    <label for="voice">Voice</label>
    <select id="voice" disabled>
      <option>loading…</option>
    </select>

    <label for="speed">Speed</label>
    <input id="speed" type="number" value="1" min="0.5" max="2" step="0.1" />
  </div>

  <p style="margin:.75rem 0 0"><label for="text">Text</label></p>
  <textarea id="text">Life is like a box of chocolates. You never know what you're gonna get.</textarea>

  <div class="row" style="margin-top:.75rem">
    <button id="speakBtn" disabled>② Generate & Play</button>
    <a id="downloadLink" download="kokoro.wav" style="display:none">Download WAV</a>
  </div>

  <p style="margin:.75rem 0 0"><audio id="player" controls></audio></p>

  <h3>Log</h3>
  <div id="log"></div>

  <script type="module">
    // Import ESM build directly from jsDelivr.
    // Package API shown on npm: KokoroTTS.from_pretrained(...), list_voices(), generate() etc.
    // https://www.npmjs.com/package/kokoro-js
    import { KokoroTTS } from "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.js";

    // Model: official ONNX build used by kokoro-js docs.
    // Voices list is maintained in the model card.
    // https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX
    const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";

    const els = {
      loadBtn: document.getElementById('loadBtn'),
      speakBtn: document.getElementById('speakBtn'),
      status:  document.getElementById('status'),
      voice:   document.getElementById('voice'),
      speed:   document.getElementById('speed'),
      text:    document.getElementById('text'),
      player:  document.getElementById('player'),
      log:     document.getElementById('log'),
      downloadLink: document.getElementById('downloadLink'),
    };

    let tts = null;
    let backend = { device: 'wasm', dtype: 'q8' }; // default fallback

    function log(msg) {
      console.log(msg);
      els.log.textContent += (els.log.textContent ? "\n" : "") + msg;
    }

    async function detectWebGPU() {
      if (!('gpu' in navigator)) return false;
      try {
        const adapter = await navigator.gpu.requestAdapter();
        return !!adapter;
      } catch {
        return false;
      }
    }

    async function initModel() {
      els.loadBtn.disabled = true;
      els.status.textContent = "checking WebGPU…";

      const canWebGPU = await detectWebGPU();
      backend = canWebGPU ? { device: 'webgpu', dtype: 'fp32' } : { device: 'wasm', dtype: 'q8' };

      log(`Chosen backend: ${backend.device} (dtype=${backend.dtype})`);
      els.status.textContent = `loading model (${backend.device}/${backend.dtype})… first load can take a while`;

      try {
        tts = await KokoroTTS.from_pretrained(MODEL_ID, backend);
      } catch (err) {
        // If WebGPU path fails at runtime (driver/feature issue), fall back to WASM automatically.
        if (backend.device === 'webgpu') {
          log(`WebGPU init failed -> falling back to WASM (q8). Error: ${err?.message || err}`);
          els.status.textContent = "retrying with WASM (q8)…";
          tts = await KokoroTTS.from_pretrained(MODEL_ID, { device: 'wasm', dtype: 'q8' });
          backend = { device: 'wasm', dtype: 'q8' };
        } else {
          throw err;
        }
      }

      // Populate voices
      els.status.textContent = "loading voices…";
      const voices = await tts.list_voices(); // documented on npm page
      els.voice.innerHTML = "";
      for (const v of voices) {
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = v;
        els.voice.appendChild(opt);
      }
      // Good defaults from model card: "af_heart", "af_bella", "am_michael", "bf_emma", etc.
      if (voices.includes('af_heart')) els.voice.value = 'af_heart';

      els.voice.disabled = false;
      els.speakBtn.disabled = false;
      els.status.textContent = `ready (${backend.device})`;
      log("Model ready.");
    }

    async function speakOnce() {
      if (!tts) return;

      els.speakBtn.disabled = true;
      els.status.textContent = "generating…";
      els.downloadLink.style.display = "none";

      const text  = els.text.value.trim();
      const voice = els.voice.value;
      const speed = parseFloat(els.speed.value || "1");

      // Generate audio (RawAudio from Transformers.js).
      // Use toBlob()/toWav() to play/download in browser.
      // https://huggingface.co/docs/transformers.js/en/api/utils/audio
      const audio = await tts.generate(text, { voice, speed });

      const blob = await audio.toBlob(); // WAV Blob
      const url  = URL.createObjectURL(blob);

      els.player.src = url;
      await els.player.play().catch(() => {/* autoplay may be blocked until user gesture */});

      els.downloadLink.href = url;
      els.downloadLink.style.display = "inline-block";
      els.status.textContent = "done";
      els.speakBtn.disabled = false;
      log(`Generated ${Math.round(blob.size / 1024)} KiB WAV with voice="${voice}" speed=${speed}`);
    }

    els.loadBtn.addEventListener('click', initModel);
    els.speakBtn.addEventListener('click', speakOnce);
  </script>
</body>
</html>
```

**What this demonstrates**

* **Feature detection + graceful fallback:** `navigator.gpu` is probed; WebGPU attempted first, then a catch→retry path switches to WASM. (`device: "webgpu" | "wasm"`, `dtype: "fp32" | "q8"` as documented.) ([npm][1])
* **In-browser audio handling:** Uses the `RawAudio.toBlob()` helper in Transformers.js to create a play-ready WAV without Node APIs. ([Hugging Face][3])
* **Voice population:** Reads voices via `tts.list_voices()`; voice options/quality examples are listed on the Kokoro model card. ([npm][1], [Hugging Face][4])

---

# 3) Notes & tips

* **Secure context:** WebGPU only works on secure origins; `http://localhost` counts as secure for local dev.
* **Performance vs size:** On WebGPU, `dtype: "fp32"` is recommended; on WASM, smaller quantizations like `"q8"` are faster to download and CPU-friendly. ([npm][1])
* **Caching:** Assets fetched from Hugging Face are cached by the browser (IndexedDB under the hood); first run is the heavy one. Voices/samples live in the model card. ([Hugging Face][2])
* **Optional (WASM threads):** For maximum WASM performance (SIMD + threads), serve with **COOP/COEP** headers to enable `crossOriginIsolated`. It’s not required for this demo, but helps if CPU-only. (High-level background on threads and headers provided by docs.) ([Hugging Face][5], [web.dev][6])

---

# 4) Minimal variations

* **Pin a specific voice**
  Change the default selection code to `els.voice.value = "af_bella"` (or any from the list). The card lists common voices like `af_bella`, `af_nicole`, `am_michael`, `bf_emma`, etc. ([Hugging Face][7])

* **Streaming (advanced)**
  `kokoro-js` exposes `TextSplitterStream` + `tts.stream(...)` for progressive synthesis. For a first demo, non-streamed generation is simpler; the npm README shows a streaming example when needed. ([npm][1])

---

# 5) Sources for this setup

* `kokoro-js` npm README (API, devices, dtypes, streaming): ([npm][1])
* ONNX model card + voices table: ([Hugging Face][2])
* Transformers.js `RawAudio` helpers (`toBlob`, `toWav`, `save`): ([Hugging Face][3])

---

**Primary Assistant:** The code above is a complete, copy-paste demo that prioritizes **WebGPU** and **falls back to WASM** automatically, uses the **official `kokoro-js` API**, and handles **voice selection + WAV playback** in-browser.

**Devil’s Advocate:**

* First-load size can still be large on WebGPU (`fp32`); on slow networks it may look stalled—consider adding a visible progress UI (bytes downloaded) and a toggle to force `"q8"` even on WebGPU.
* Browser/device quirks exist (driver bugs, limited WebGPU on some mobiles). A try/catch fallback helps, but consider an explicit **“Force WASM”** switch and a “Reset cache” button.
* WASM multi-threading needs **COOP/COEP**; without it, CPU performance may disappoint. If targeting CPU-only environments, set up headers early.
* The demo uses CDN and remote model hosting. For enterprise/offline scenarios, mirror weights on a first-party domain and pin exact versions to avoid supply-chain or CORS surprises.
