/**
 * TTS (Text-to-Speech) Component
 * Provides local TTS functionality using kokoro-js with WebGPU and WASM fallback
 */

// Default import for browser usage
let kokoroModule = null;

// Function to set kokoro module (for testing)
export function setKokoroModule(module) {
  kokoroModule = module;
}

// Function to get kokoro module
async function getKokoro() {
  if (kokoroModule) {
    return kokoroModule;
  }
  
  // Dynamic import for browser usage
  const module = await import("https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.js");
  return module;
}

export class TTSEngine {
  constructor(options = {}) {
    this.options = {
      modelId: "onnx-community/Kokoro-82M-v1.0-ONNX",
      defaultVoice: "af_heart",
      defaultSpeed: 1.0,
      ...options
    };

    this.tts = null;
    this.voices = [];
    this.backend = { device: 'wasm', dtype: 'q8' }; // default fallback
    this.isLoading = false;
    this.isGenerating = false;
    
    // Event callbacks
    this.onProgress = null;
    this.onReady = null;
    this.onError = null;
    this.onVoicesLoaded = null;
    this.onAudioGenerated = null;
  }

  /**
   * Detect WebGPU availability
   */
  async detectWebGPU() {
    if (!('gpu' in navigator)) return false;
    try {
      const adapter = await navigator.gpu.requestAdapter();
      return !!adapter;
    } catch {
      return false;
    }
  }

  /**
   * Initialize the TTS engine
   */
  async initialize() {
    if (this.tts) return this.tts;
    
    this.isLoading = true;
    
    try {
      const { KokoroTTS } = await getKokoro();
      
      if (this.onProgress) {
        this.onProgress({ status: 'detecting', message: 'Checking WebGPU availability...' });
      }

      // Detect and choose backend
      const canWebGPU = await this.detectWebGPU();
      this.backend = canWebGPU 
        ? { device: 'webgpu', dtype: 'fp32' } 
        : { device: 'wasm', dtype: 'q8' };

      if (this.onProgress) {
        this.onProgress({ 
          status: 'loading', 
          message: `Loading model (${this.backend.device}/${this.backend.dtype})...`,
          backend: this.backend
        });
      }

      try {
        this.tts = await KokoroTTS.from_pretrained(this.options.modelId, this.backend);
      } catch (err) {
        // If WebGPU path fails, fall back to WASM automatically
        if (this.backend.device === 'webgpu') {
          if (this.onProgress) {
            this.onProgress({ 
              status: 'fallback', 
              message: 'WebGPU failed, falling back to WASM...',
              error: err.message
            });
          }
          
          this.tts = await KokoroTTS.from_pretrained(this.options.modelId, { device: 'wasm', dtype: 'q8' });
          this.backend = { device: 'wasm', dtype: 'q8' };
        } else {
          throw err;
        }
      }

      // Load available voices
      if (this.onProgress) {
        this.onProgress({ status: 'voices', message: 'Loading voices...' });
      }

      this.voices = await this.tts.list_voices();

      this.isLoading = false;
      
      if (this.onVoicesLoaded) {
        this.onVoicesLoaded(this.voices);
      }
      
      if (this.onReady) {
        this.onReady({ backend: this.backend, voices: this.voices });
      }
      
      return this.tts;
    } catch (error) {
      this.isLoading = false;
      
      if (this.onError) {
        this.onError(error);
      }
      
      throw error;
    }
  }

  /**
   * Generate speech from text
   */
  async generateSpeech(text, options = {}) {
    if (!text.trim()) return null;
    if (!this.tts) {
      throw new Error("TTS engine not initialized. Call initialize() first.");
    }
    if (this.isGenerating) {
      throw new Error("Already generating speech. Please wait.");
    }

    this.isGenerating = true;
    
    const config = {
      voice: options.voice || this.options.defaultVoice,
      speed: options.speed || this.options.defaultSpeed,
      ...options
    };

    try {
      if (this.onProgress) {
        this.onProgress({ 
          status: 'generating', 
          message: `Generating speech with voice "${config.voice}"...`,
          config
        });
      }

      const audio = await this.tts.generate(text, config);
      const blob = await audio.toBlob(); // Convert to WAV Blob
      const url = URL.createObjectURL(blob);

      this.isGenerating = false;

      const result = {
        audio,
        blob,
        url,
        text,
        config,
        size: blob.size
      };

      if (this.onAudioGenerated) {
        this.onAudioGenerated(result);
      }

      return result;
      
    } catch (error) {
      this.isGenerating = false;
      
      if (this.onError) {
        this.onError(error);
      }
      
      throw error;
    }
  }

  /**
   * Get available voices
   */
  getVoices() {
    return [...this.voices];
  }

  /**
   * Check if engine is ready
   */
  isReady() {
    return !!this.tts && !this.isLoading;
  }

  /**
   * Check if currently busy
   */
  isBusy() {
    return this.isLoading || this.isGenerating;
  }

  /**
   * Get current backend info
   */
  getBackend() {
    return { ...this.backend };
  }
}

/**
 * UI Helper class for creating TTS interfaces
 */
export class TTSUI {
  constructor(containerElement, ttsEngine) {
    this.container = containerElement;
    this.tts = ttsEngine;
    this.elements = {};
    this.currentAudio = null;
    
    this.setupEventHandlers();
    this.render();
  }

  setupEventHandlers() {
    // Set up TTS event handlers
    this.tts.onProgress = (progress) => this.handleProgress(progress);
    this.tts.onReady = (info) => this.handleReady(info);
    this.tts.onError = (error) => this.handleError(error);
    this.tts.onVoicesLoaded = (voices) => this.handleVoicesLoaded(voices);
    this.tts.onAudioGenerated = (result) => this.handleAudioGenerated(result);
  }

  render() {
    this.container.innerHTML = `
      <div class="max-w-4xl mx-auto p-4 bg-gradient-to-br from-purple-900 to-blue-900 text-white rounded-lg">
        <h2 class="text-xl font-semibold mb-3 text-white">Local Text-to-Speech</h2>
        
        <div class="flex gap-2 items-center mb-4">
          <button id="load-btn" class="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors">
            ① Load TTS Engine
          </button>
          <span id="status" class="text-sm text-purple-200"></span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label for="voice-select" class="block text-sm font-medium mb-1">Voice</label>
            <select id="voice-select" disabled class="w-full p-2 rounded-lg border border-purple-600 bg-purple-800 text-white disabled:opacity-60">
              <option>Loading voices...</option>
            </select>
          </div>
          <div>
            <label for="speed-input" class="block text-sm font-medium mb-1">Speed</label>
            <input id="speed-input" type="number" value="1.0" min="0.5" max="2.0" step="0.1" 
                   class="w-full p-2 rounded-lg border border-purple-600 bg-purple-800 text-white">
          </div>
        </div>

        <div class="mb-4">
          <label for="text-input" class="block text-sm font-medium mb-1">Text to Speak</label>
          <textarea id="text-input" placeholder="Enter text to convert to speech..." 
                    class="w-full h-24 p-3 rounded-lg border border-purple-600 bg-purple-800 text-white placeholder-purple-300 resize-none">Life is like a box of chocolates. You never know what you're gonna get.</textarea>
        </div>

        <div class="flex gap-2 items-center mb-4">
          <button id="speak-btn" disabled class="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors">
            ② Generate & Play
          </button>
          <a id="download-link" download="speech.wav" style="display: none;" class="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-decoration-none transition-colors">
            Download WAV
          </a>
        </div>

        <div class="mb-4">
          <audio id="audio-player" controls class="w-full"></audio>
        </div>

        <div id="progress-container" class="mb-4" style="display: none;">
          <div class="w-full bg-purple-700 rounded-full h-2 mb-2">
            <div id="progress-bar" class="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all duration-300" style="width: 0%;"></div>
          </div>
          <div id="progress-text" class="text-xs text-purple-200"></div>
        </div>

        <div class="bg-purple-800 rounded-lg p-3">
          <h3 class="text-sm font-medium mb-2">Log</h3>
          <div id="log" class="text-xs text-purple-200 max-h-32 overflow-y-auto whitespace-pre-wrap"></div>
        </div>
      </div>
    `;

    // Get element references
    this.elements = {
      loadBtn: this.container.querySelector('#load-btn'),
      speakBtn: this.container.querySelector('#speak-btn'),
      status: this.container.querySelector('#status'),
      voiceSelect: this.container.querySelector('#voice-select'),
      speedInput: this.container.querySelector('#speed-input'),
      textInput: this.container.querySelector('#text-input'),
      audioPlayer: this.container.querySelector('#audio-player'),
      downloadLink: this.container.querySelector('#download-link'),
      progressContainer: this.container.querySelector('#progress-container'),
      progressBar: this.container.querySelector('#progress-bar'),
      progressText: this.container.querySelector('#progress-text'),
      log: this.container.querySelector('#log')
    };

    // Set up UI event listeners
    this.elements.loadBtn.addEventListener('click', () => this.handleLoad());
    this.elements.speakBtn.addEventListener('click', () => this.handleSpeak());
  }

  log(message) {
    console.log(message);
    this.elements.log.textContent += (this.elements.log.textContent ? '\n' : '') + message;
    this.elements.log.scrollTop = this.elements.log.scrollHeight;
  }

  async handleLoad() {
    this.elements.loadBtn.disabled = true;
    this.elements.status.textContent = 'Initializing...';
    
    try {
      await this.tts.initialize();
    } catch (error) {
      console.error('Failed to initialize TTS:', error);
      this.elements.loadBtn.disabled = false;
    }
  }

  async handleSpeak() {
    const text = this.elements.textInput.value.trim();
    if (!text || !this.tts.isReady()) return;

    this.elements.speakBtn.disabled = true;
    this.elements.downloadLink.style.display = 'none';

    const options = {
      voice: this.elements.voiceSelect.value,
      speed: parseFloat(this.elements.speedInput.value) || 1.0
    };

    try {
      await this.tts.generateSpeech(text, options);
    } catch (error) {
      console.error('Speech generation failed:', error);
      this.elements.speakBtn.disabled = false;
    }
  }

  handleProgress(progress) {
    this.log(`Progress: ${progress.message}`);
    
    if (progress.status === 'detecting' || progress.status === 'loading' || progress.status === 'generating') {
      this.elements.progressContainer.style.display = 'block';
      this.elements.progressText.textContent = progress.message;
      
      if (progress.status === 'generating') {
        this.elements.progressBar.style.width = '50%';
      }
    } else if (progress.status === 'fallback') {
      this.elements.progressText.textContent = progress.message;
      this.log(`WebGPU fallback: ${progress.error}`);
    } else if (progress.status === 'voices') {
      this.elements.progressText.textContent = progress.message;
      this.elements.progressBar.style.width = '80%';
    }
  }

  handleReady(info) {
    this.elements.status.textContent = `Ready (${info.backend.device})`;
    this.elements.progressContainer.style.display = 'none';
    this.elements.speakBtn.disabled = false;
    this.log(`TTS engine ready with ${info.backend.device}/${info.backend.dtype}`);
  }

  handleError(error) {
    this.elements.status.textContent = 'Error';
    this.elements.progressContainer.style.display = 'none';
    this.elements.progressText.textContent = `Error: ${error.message}`;
    this.log(`Error: ${error.message}`);
    console.error('TTS Error:', error);
  }

  handleVoicesLoaded(voices) {
    this.elements.voiceSelect.innerHTML = '';
    
    voices.forEach(voice => {
      const option = document.createElement('option');
      option.value = voice;
      option.textContent = voice;
      this.elements.voiceSelect.appendChild(option);
    });

    // Set default voice
    if (voices.includes('af_heart')) {
      this.elements.voiceSelect.value = 'af_heart';
    }

    this.elements.voiceSelect.disabled = false;
    this.log(`Loaded ${voices.length} voices: ${voices.join(', ')}`);
  }

  handleAudioGenerated(result) {
    this.elements.progressContainer.style.display = 'none';
    this.elements.speakBtn.disabled = false;
    
    // Set up audio player
    this.elements.audioPlayer.src = result.url;
    
    // Try to play (may be blocked by autoplay policy)
    this.elements.audioPlayer.play().catch(() => {
      this.log('Autoplay blocked - click play button to hear audio');
    });

    // Set up download link
    this.elements.downloadLink.href = result.url;
    this.elements.downloadLink.style.display = 'inline-block';

    // Clean up previous audio URL
    if (this.currentAudio) {
      URL.revokeObjectURL(this.currentAudio);
    }
    this.currentAudio = result.url;

    const sizeKB = Math.round(result.size / 1024);
    this.log(`Generated ${sizeKB} KB WAV with voice "${result.config.voice}" at speed ${result.config.speed}`);
  }

  /**
   * Cleanup resources
   */
  destroy() {
    if (this.currentAudio) {
      URL.revokeObjectURL(this.currentAudio);
    }
  }
}
