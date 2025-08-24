Below is a **CDN-only, single-file** demo that runs fully in the browser using **Transformers.js** (which uses **onnxruntime-web** under the hood). The snippets follow the usage shown on the model page and the vanilla-JS tutorial from the Transformers.js docs. ([Hugging Face][1])

## 1) Create `index.html`

> Uses a minimal chat UI, streams the response token-by-token, and falls back to WASM when WebGPU isn’t available. Imports Transformers.js from a CDN per the docs, and calls the model exactly as shown on the model card (messages array + `TextStreamer`). ([Hugging Face][2])

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Gemma 3 270M (ONNX) – Vanilla JS Demo</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root { font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, sans-serif; }
      body { margin: 0; background: #0b0b0c; color: #e7e7ea; }
      .wrap { max-width: 880px; margin: 32px auto; padding: 0 16px; }
      h1 { font-size: 20px; font-weight: 600; margin: 0 0 12px; }
      .bar { display: flex; gap: 8px; margin: 12px 0 16px; }
      textarea { width: 100%; min-height: 80px; padding: 10px; border-radius: 8px; border: 1px solid #2a2a2d; background:#131316; color:#e7e7ea; }
      button { padding: 10px 14px; border-radius: 8px; border: 1px solid #2a2a2d; background:#1b1b1f; color:#e7e7ea; cursor:pointer; }
      button[disabled] { opacity:.6; cursor:not-allowed; }
      .row { display:flex; gap:10px; align-items:flex-start; margin: 10px 0; }
      .role { flex: 0 0 88px; opacity:.7; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; }
      .bubble { flex: 1 1 auto; white-space: pre-wrap; line-height: 1.45; background:#111114; border:1px solid #242428; border-radius:12px; padding:12px; }
      .muted { opacity:.7; }
      .status { margin-top: 6px; font-size:12px; opacity:.7; }
      .footer { margin-top: 14px; display:flex; gap:8px; align-items:center; }
      .tiny { font-size: 12px; opacity:.7; }
      a { color:#9ecbff; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <h1>Gemma 3 270M (ONNX) – Vanilla JS</h1>

      <div id="chat"></div>

      <div class="bar">
        <textarea id="prompt" placeholder="Ask something…"></textarea>
        <button id="send">Send</button>
      </div>
      <div class="footer">
        <button id="clear">Clear</button>
        <span class="tiny" id="status"></span>
      </div>
    </div>

    <script type="module">
      import { pipeline, TextStreamer, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers";

      // Keep downloads remote and cached by the browser (recommended for a quick demo)
      env.allowLocalModels = false; // per vanilla-JS tutorial setup. :contentReference[oaicite:2]{index=2}
      // Optional: customize cache dir if using a Service Worker or Node (not required in simple CDN demo). :contentReference[oaicite:3]{index=3}
      // env.cacheDir = '/.cache';

      const statusEl = document.getElementById("status");
      const sendBtn  = document.getElementById("send");
      const clearBtn = document.getElementById("clear");
      const promptEl = document.getElementById("prompt");
      const chatEl   = document.getElementById("chat");

      // Basic chat history (system + turns)
      const messages = [
        { role: "system", content: "You are a helpful, concise assistant." }
      ];

      // Helper to add chat bubbles
      function addBubble(role, text, isMuted = false) {
        const row = document.createElement("div"); row.className = "row";
        const r = document.createElement("div"); r.className = "role"; r.textContent = role;
        const b = document.createElement("div"); b.className = "bubble"; if (isMuted) b.classList.add("muted");
        b.textContent = text;
        row.append(r, b); chatEl.appendChild(row);
        return b;
      }

      // Prefer WebGPU (faster). Fall back to WASM.
      const device = (navigator.gpu) ? "webgpu" : "wasm";

      // Choose dtype that exists in the repo:
      //   - fp16 available (faster on WebGPU)
      //   - q4 available (smaller & better for WASM)
      // (See model files list on the Hub.) :contentReference[oaicite:4]{index=4}
      const dtype = (device === "webgpu") ? "fp16" : "q4";

      statusEl.textContent = `Loading model (device: ${device}, dtype: ${dtype})…`;

      // Create a text-generation pipeline with the ONNX model id from the model card. :contentReference[oaicite:5]{index=5}
      const generator = await pipeline(
        "text-generation",
        "onnx-community/gemma-3-270m-it-ONNX",
        { device, dtype }
      );

      statusEl.textContent = "Ready";

      async function generate() {
        const userText = promptEl.value.trim();
        if (!userText) return;

        // Show the user message in the chat and remember it
        addBubble("User", userText);
        messages.push({ role: "user", content: userText });

        // Assistant bubble for streaming output
        const outBubble = addBubble("Assistant", "");

        sendBtn.disabled = true;
        statusEl.textContent = "Generating…";

        // Stream tokens into the assistant bubble
        const streamer = new TextStreamer(generator.tokenizer, {
          skip_prompt: true,
          skip_special_tokens: true,
          callback_function: (text) => { outBubble.textContent += text; }
        });

        try {
          const output = await generator(messages, {
            max_new_tokens: 256,
            do_sample: false,          // deterministic; flip to true + set temperature/top_p for variety
            streamer
          });

          // The final assistant message is returned in the messages array; keep it for conversation context.
          const finalMsg = output[0].generated_text.at(-1)?.content ?? outBubble.textContent;
          // Ensure our local bubble reflects the final text (in case streamer skipped special tokens differently)
          outBubble.textContent = finalMsg;

          // Persist assistant reply to messages for the next turn
          messages.push({ role: "assistant", content: finalMsg });
        } catch (err) {
          outBubble.textContent = `❌ Error: ${err?.message || err}`;
          console.error(err);
        } finally {
          sendBtn.disabled = false;
          statusEl.textContent = "";
          promptEl.value = "";
          promptEl.focus();
        }
      }

      sendBtn.addEventListener("click", generate);
      promptEl.addEventListener("keydown", (e) => (e.key === "Enter" && (e.ctrlKey || e.metaKey)) ? generate() : null );
      clearBtn.addEventListener("click", () => { chatEl.innerHTML = ""; messages.splice(1); });

    </script>
  </body>
</html>
```

### Why this works

* The model page shows **Transformers.js** usage for `onnx-community/gemma-3-270m-it-ONNX` via the **`pipeline("text-generation", …)`** API and **`TextStreamer`**, and it expects a **messages** array (chat template). The demo mirrors that pattern. ([Hugging Face][1])
* The vanilla-JS tutorial demonstrates importing Transformers.js directly via a CDN in a `<script type="module">`, and setting `env.allowLocalModels = false` for remote Hub downloads in simple demos. ([Hugging Face][2])
* Transformers.js uses **onnxruntime-web** behind the scenes and supports **WebGPU** (faster) and **WASM** (fallback). The ONNX Web getting-started page documents device support. ([Hugging Face][3], [onnxruntime.ai][4])

## 2) Serve the file locally

Open `index.html` via a tiny dev server (do **not** use `file://`):

```bash
# Python
python -m http.server 8000

# Or Node's "serve" if installed
npx serve .
```

A simple HTTP server is recommended in the vanilla-JS tutorial. ([Hugging Face][2])

Visit `http://localhost:8000`, type a prompt, and press **Send** (or **Ctrl/Cmd+Enter**).

## 3) Notes on performance, size & devices

* **WebGPU vs WASM**
  The script prefers `device: "webgpu"` if `navigator.gpu` exists, which can significantly speed up generation; otherwise it falls back to WASM. ONNX Runtime’s Web docs show WebGPU/CPU support per browser. ([onnxruntime.ai][4])

* **Model variants (dtype)**
  This repository provides multiple ONNX variants; the demo chooses **`fp16`** for WebGPU and **`q4`** for WASM because those files are present in the repo:
  `onnx/model_fp16.onnx(_data)`, `onnx/model_q4.onnx(_data)` (as well as `model.onnx` and `model_q4f16.onnx`). File sizes are visible on the Files tab (e.g., \~570 MB for `model_fp16.onnx_data`, \~801 MB for `model_q4.onnx_data`, \~426 MB for `model_q4f16.onnx_data`, \~1.14 GB for full fp32). Adjust `dtype` if a different trade-off is desired. ([Hugging Face][5])

* **First-load time & caching**
  The first run will download tokenizer + ONNX weights from the Hugging Face Hub; subsequent runs should be faster thanks to browser caching. (Transformers.js exposes `env.useBrowserCache`, enabled by default.) ([Hugging Face][6])

## 4) Optional: Host the model locally (no Hub downloads)

To avoid large public downloads each load, serve the model files yourself:

1. Create `./models/onnx-community/gemma-3-270m-it-ONNX/` and download this repo’s **top-level files** (tokenizer/config) and the **`onnx/`** folder into it. ([Hugging Face][7])
2. Before creating the pipeline, set:

   ```js
   env.allowRemoteModels = false;
   env.allowLocalModels  = true;
   env.localModelPath    = "./models/"; // base; library will append the model id path
   ```

   These environment flags are part of the public API. ([Hugging Face][6])
3. Keep the same `pipeline("text-generation", "onnx-community/gemma-3-270m-it-ONNX", …)` call; it resolves to the local folder.

> If the Hub ever gates downloads for license acceptance and a **403** appears, hosting locally (or using a server-side downloader) is the recommended browser-safe approach. Transformers.js intentionally **does not** support passing HF tokens in the browser for private/gated models (to avoid leaking secrets). ([Hugging Face][8])

## 5) Troubleshooting

* **Blank output / very slow generation**
  Ensure WebGPU is available (Chrome/Edge recent) or expect slower WASM performance. The ONNX Web matrix lists browser support. ([onnxruntime.ai][4])

* **“Unsupported model type” in older Transformers.js**
  Early 2025 discussions showed Gemma-3 support was still landing; the public model card now documents working Transformers.js usage. Use a recent version via CDN (the demo does). ([GitHub][9], [Hugging Face][1])

* **Large downloads**
  Switch `dtype` to `fp16` (WebGPU) or consider `q4f16` if experimenting (this repo ships `model_q4f16.onnx(_data)`), noting download sizes on the Files tab. ([Hugging Face][5])

* **Need a working live example?**
  A public Hugging Face Space demonstrates Gemma-3-270M-IT ONNX running fully in-browser (Gradio Lite). It’s a good sanity check that the model can run client-side. ([Hugging Face][10])

---

# Devil’s Advocate: Potential pitfalls & alternatives

* **Payload size for a “simple page” is still big.** Even the smaller variants are hundreds of MB; on typical networks this affects UX. Consider server-side inference, WebGPU with `fp16`, or a tinier model for demos until assets are cached. File sizes on the Hub confirm this. ([Hugging Face][5])
* **Browser support variance.** WebGPU isn’t universal. WASM works but can be slow; multi-threaded WASM may require specific headers (COOP/COEP) depending on the runtime config. If consistent performance is required, a Node/Edge Function proxy or an Inference Endpoint may be more reliable. ([onnxruntime.ai][4])
* **Licensing/gating surprises.** If the repo becomes gated, tokens can’t be safely used client-side. Plan for a server-side download/mirroring flow and local hosting to avoid 403s. ([Hugging Face][8])
* **API surface changes.** Transformers.js evolves quickly; pin the CDN version (e.g., `@3.x`) to avoid breakage and test regularly with the model’s chat template. The model card shows the intended messages format; deviating can reduce quality. ([Hugging Face][1])

If a single-file demo is required with **no** external network after first load, prefer the **local hosting** option above and set `env.allowRemoteModels = false`.
