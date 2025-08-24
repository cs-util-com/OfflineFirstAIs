/**
 * TTS (Text-to-Speech) components using kokoro-js library
 * Provides modular TTS functionality for web applications
 */

// Helper function to load kokoro-js library
async function getKokoro(injectedLib = null) {
  if (injectedLib) {
    return injectedLib;
  }
  
  // Dynamic import for browser usage
  const module = await import("https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.js");
  return module;
}

/**
 * Text-to-Speech Engine using kokoro-js library
 * Provides both standard and streaming TTS functionality
 */
export class TTSEngine {
  constructor(voice = 'af') {
    this.kokoroInstance = null;
    this.streamingInstance = null;
    this.kokoroLib = null;
    this.isInitialized = false;
    this.isLoading = false;
    this.isGenerating = false;
    this.currentVoice = voice;
    this.streamingMode = false;
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
      const kokoro = kokoroLib || await getKokoro();
      
      // Store the library reference for later use
      this.kokoroLib = kokoro;
      
      progressCallback({ 
        status: 'loading', 
        message: 'Initializing TTS engine...' 
      });

      // Initialize standard TTS
      this.kokoroInstance = new kokoro.KokoroText2Speech();
      await this.kokoroInstance.ready();
      await this.kokoroInstance.loadVoice(this.currentVoice);

      // Initialize streaming TTS if requested
      if (this.streamingMode) {
        this.streamingInstance = new kokoro.KokoroStreamingTTS();
        await this.streamingInstance.ready();
        await this.streamingInstance.loadVoice(this.currentVoice);
      }

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
      // Generate audio data
      const audioData = await this.kokoroInstance.tts(text);
      
      // Create WAV file - use the library that was originally injected
      const kokoro = this.kokoroLib || await getKokoro();
      const header = kokoro.writeWAVHeader(audioData.length, 24000);
      const wavData = kokoro.writeWAVData(audioData, 24000);
      
      // Create blob and URL
      const blob = new Blob([header, wavData], { type: 'audio/wav' });
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
    if (!this.streamingMode) {
      onError('Streaming mode not enabled');
      return;
    }

    if (!this.isInitialized) {
      onError('TTS engine not initialized');
      return;
    }

    try {
      const generator = this.streamingInstance.streamTTS(text);
      
      for (const chunk of generator) {
        onChunk(chunk);
      }
      
      onComplete();
    } catch (error) {
      onError(error.message);
    }
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
      await this.kokoroInstance.loadVoice(voiceId);
      
      if (this.streamingInstance) {
        await this.streamingInstance.loadVoice(voiceId);
      }
      
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
    if (!this.isInitialized || !this.kokoroInstance) {
      return [];
    }
    
    return this.kokoroInstance.voices || [];
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
    
    container.innerHTML = `
      <div class="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-lg">
        <h2 class="text-2xl font-bold mb-6 text-center text-gray-800">Text-to-Speech Demo</h2>
        
        <div class="space-y-4">
          <!-- Text Input -->
          <div>
            <label for="tts-text" class="block text-sm font-medium text-gray-700 mb-2">
              Enter text to convert to speech:
            </label>
            <textarea 
              id="tts-text" 
              class="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows="4"
              placeholder="Type or paste your text here..."
            ></textarea>
          </div>

          <!-- Voice Selection -->
          <div>
            <label for="voice-select" class="block text-sm font-medium text-gray-700 mb-2">
              Select Voice:
            </label>
            <select 
              id="voice-select"
              class="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            >
              ${voices.map(voice => 
                `<option value="${voice.id}" ${voice.id === (this.tts?.currentVoice || 'af') ? 'selected' : ''}>
                  ${voice.name}
                </option>`
              ).join('')}
            </select>
          </div>

          <!-- Generate Button -->
          <button 
            id="generate-speech"
            class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-md transition duration-300"
          >
            Generate Speech
          </button>

          <!-- Status Display -->
          <div id="tts-status" class="text-center text-sm"></div>
        </div>
      </div>
    `;

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
