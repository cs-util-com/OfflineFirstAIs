/**
 * TTS (Text-to-Speech) components using kokoro-js library
 * Provides modular TTS functionality for web applications
 */

// Helper function to load kokoro-js library
async function getKokoro(injectedLib = null) {
  if (injectedLib) {
    return injectedLib;
  }
  
  // Dynamic import for browser usage - use the documented API
  const module = await import("https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.js");
  // Return the KokoroTTS class directly
  return module.KokoroTTS;
}

/**
 * Text-to-Speech Engine using kokoro-js library
 * Provides both standard and streaming TTS functionality
 */
export class TTSEngine {
  constructor(voice = 'af_heart') {
    this.kokoroInstance = null;
    this.streamingInstance = null;
    this.kokoroLib = null;
    this.isInitialized = false;
    this.isLoading = false;
    this.isGenerating = false;
    this.currentVoice = voice;
    this.streamingMode = false;
    this.availableVoices = [];
  }

  /**
   * Initialize the TTS engine
   * @param {Function} progressCallback - Called with progress updates
   * @param {Function} errorCallback - Called with errors
   * @param {Object} kokoroLib - Optional injected library for testing
   */
  async initialize(progressCallback = () => {}, errorCallback = () => {}, kokoroLib = null) {
    if (this.isInitialized) {
      return;
    }

    this.isLoading = true;
    
    try {
      progressCallback({ 
        status: 'loading', 
        message: 'Loading kokoro-js library...' 
      });

      // Use injected library or load from CDN
      const KokoroTTS = kokoroLib || await getKokoro();
      
      // Store the library reference for later use
      this.kokoroLib = KokoroTTS;
      
      progressCallback({ 
        status: 'loading', 
        message: 'Initializing TTS engine...' 
      });

      // Use the documented API from tts.md
      const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
      
      // Detect WebGPU support and choose backend
      let backend = { device: 'wasm', dtype: 'q8' }; // default fallback
      
      if ('gpu' in navigator) {
        try {
          const adapter = await navigator.gpu.requestAdapter();
          if (adapter) {
            backend = { device: 'webgpu', dtype: 'fp32' };
          }
        } catch (e) {
          // Fall back to WASM
        }
      }

      progressCallback({ 
        status: 'loading', 
        message: `Loading model with ${backend.device}...` 
      });

      // Initialize using the proper API
      try {
        this.kokoroInstance = await KokoroTTS.from_pretrained(MODEL_ID, backend);
      } catch (err) {
        // If WebGPU fails, fall back to WASM
        if (backend.device === 'webgpu') {
          progressCallback({ 
            status: 'loading', 
            message: 'WebGPU failed, falling back to WASM...' 
          });
          this.kokoroInstance = await KokoroTTS.from_pretrained(MODEL_ID, { device: 'wasm', dtype: 'q8' });
        } else {
          throw err;
        }
      }

      // Load available voices
      this.availableVoices = await this.kokoroInstance.list_voices();
      
      this.isInitialized = true;
      
      progressCallback({ 
        status: 'success', 
        message: 'TTS engine initialized successfully!' 
      });

    } catch (error) {
      errorCallback(`Failed to initialize TTS engine: ${error.message}`);
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Generate speech from text
   * @param {string} text - Text to convert to speech
   * @returns {Object} Result object with success status and audio URL or error
   */
  async generateSpeech(text) {
    if (!this.isInitialized) {
      return { success: false, error: 'TTS engine not initialized' };
    }

    if (!text || text.trim() === '') {
      return { success: false, error: 'Text cannot be empty' };
    }

    if (this.isGenerating) {
      return { success: false, error: 'Speech generation already in progress' };
    }

    this.isGenerating = true;

    try {
      // Generate audio using the documented API
      const audio = await this.kokoroInstance.generate(text, { 
        voice: this.currentVoice, 
        speed: 1.0 
      });
      
      // Convert to blob using the documented method
      const blob = await audio.toBlob();
      const audioUrl = URL.createObjectURL(blob);
      
      return { success: true, audioUrl };

    } catch (error) {
      return { success: false, error: error.message };
    } finally {
      this.isGenerating = false;
    }
  }

  /**
   * Stream speech generation (for real-time TTS)
   * @param {string} text - Text to convert to speech
   * @param {Function} onChunk - Called for each audio chunk
   * @param {Function} onComplete - Called when streaming is complete
   * @param {Function} onError - Called on error
   */
  async streamSpeech(text, onChunk, onComplete, onError) {
    onError('Streaming mode not currently supported with the new kokoro-js API');
    return;
  }

  /**
   * Change the current voice
   * @param {string} voiceId - Voice ID to switch to
   * @returns {Object} Result object with success status
   */
  async changeVoice(voiceId) {
    if (!this.isInitialized) {
      return { success: false, error: 'TTS engine not initialized' };
    }

    try {
      this.currentVoice = voiceId;
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get available voices
   * @returns {Array} Array of voice objects
   */
  getAvailableVoices() {
    if (!this.isInitialized) {
      return [];
    }
    
    // Return voices in the format expected by the UI
    return this.availableVoices.map(voice => ({
      id: voice,
      name: voice
    }));
  }

  /**
   * Clean up resources
   */
  cleanup() {
    this.kokoroInstance = null;
    this.streamingInstance = null;
    this.isInitialized = false;
  }
}

/**
 * TTS UI Helper Class
 * Provides UI components and event handling for TTS functionality
 */
export class TTSUI {
  constructor(ttsEngine) {
    this.tts = ttsEngine;
    this.container = null;
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    // Set up TTS event handlers if they exist
    if (this.tts) {
      if (typeof this.tts.onProgress === 'undefined') this.tts.onProgress = null;
      if (typeof this.tts.onReady === 'undefined') this.tts.onReady = null;
      if (typeof this.tts.onError === 'undefined') this.tts.onError = null;
      if (typeof this.tts.onVoicesLoaded === 'undefined') this.tts.onVoicesLoaded = null;
    }
  }

  /**
   * Render the TTS interface
   * @param {HTMLElement} container - Container element to render into
   */
  render(container) {
    this.container = container;

    const voices = this.tts ? this.tts.getAvailableVoices() : [];

    // If the container already has the expected DOM (e.g., from pages/tts.html), reuse it.
    const existingTextarea = container.querySelector('#tts-text');
    const existingSelect = container.querySelector('#voice-select');
    const existingButton = container.querySelector('#generate-speech');
    const existingStatus = container.querySelector('#tts-status');
    if (!(existingTextarea && existingSelect && existingButton && existingStatus)) {
      console.warn('TTSUI.render: expected TTS DOM to exist in container; aborting render.');
      return;
    }

    // Populate voices into existing select element
    existingSelect.innerHTML = '';
    if (Array.isArray(voices) && voices.length > 0) {
      voices.forEach(voice => {
        const option = document.createElement('option');
        option.value = voice.id;
        option.textContent = voice.name;
        if (voice.id === (this.tts?.currentVoice || 'af')) option.selected = true;
        existingSelect.appendChild(option);
      });
    }

    // Ensure container is visible (in case it was hidden)
    container.style.display = '';

    this.setupEventListeners();
  }

  /**
   * Set up event listeners for the UI elements
   */
  setupEventListeners() {
    if (!this.container) return;

    const textArea = this.container.querySelector('#tts-text');
    const generateBtn = this.container.querySelector('#generate-speech');
    const voiceSelect = this.container.querySelector('#voice-select');

    if (generateBtn) {
      generateBtn.addEventListener('click', async () => {
        const text = textArea?.value?.trim();
        
        if (!text) {
          this.updateStatus('Please enter some text', 'error');
          return;
        }

        if (!this.tts?.isInitialized) {
          this.updateStatus('TTS engine not initialized', 'error');
          return;
        }

        this.updateButtonState(true);
        this.updateStatus('Generating speech...', 'loading');

        try {
          const result = await this.tts.generateSpeech(text);
          
          if (result.success) {
            this.updateStatus('Speech generated successfully!', 'success');
            
            // Play the audio
            const audio = new Audio(result.audioUrl);
            await audio.play();
          } else {
            this.updateStatus(`Error: ${result.error}`, 'error');
          }
        } catch (error) {
          this.updateStatus(`Error: ${error.message}`, 'error');
        } finally {
          this.updateButtonState(false);
        }
      });
    }

    if (voiceSelect) {
      voiceSelect.addEventListener('change', async (e) => {
        const voiceId = e.target.value;
        if (this.tts && voiceId) {
          const result = await this.tts.changeVoice(voiceId);
          if (result.success) {
            this.updateStatus(`Voice changed to ${voiceId}`, 'success');
          } else {
            this.updateStatus(`Failed to change voice: ${result.error}`, 'error');
          }
        }
      });
    }
  }

  /**
   * Update status message
   * @param {string} message - Status message
   * @param {string} type - Message type (success, error, loading)
   */
  updateStatus(message, type = 'info') {
    const statusEl = this.container?.querySelector('#tts-status');
    if (!statusEl) return;

    statusEl.textContent = message;
    
    // Remove existing status classes
    statusEl.className = statusEl.className.replace(/text-(red|green|blue|gray)-600/g, '');
    
    // Add appropriate color class
    switch (type) {
      case 'success':
        statusEl.classList.add('text-green-600');
        break;
      case 'error':
        statusEl.classList.add('text-red-600');
        break;
      case 'loading':
        statusEl.classList.add('text-blue-600');
        break;
      default:
        statusEl.classList.add('text-gray-600');
    }
  }

  /**
   * Update button state
   * @param {boolean} loading - Whether button should show loading state
   */
  updateButtonState(loading) {
    const button = this.container?.querySelector('#generate-speech');
    if (!button) return;

    button.disabled = loading;
    button.textContent = loading ? 'Generating...' : 'Generate Speech';
  }
}
