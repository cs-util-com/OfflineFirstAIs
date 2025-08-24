/**
 * LLM Chat Component
 * Provides local LLM functionality using Transformers.js with Gemma 3 270M model
 */

// Default import for browser usage
let transformersModule = null;

// Function to set transformers module (for testing)
export function setTransformersModule(module) {
  transformersModule = module;
}

// Function to get transformers module
async function getTransformers() {
  if (transformersModule) {
    return transformersModule;
  }
  
  // Dynamic import for browser usage
  const module = await import("https://cdn.jsdelivr.net/npm/@huggingface/transformers");
  return module;
}

export class LLMChat {
  constructor(options = {}) {
    this.options = {
      modelId: "onnx-community/gemma-3-270m-it-ONNX",
      systemPrompt: "You are a helpful, concise assistant.",
      maxNewTokens: 256,
      doSample: false,
      ...options
    };

    this.generator = null;
    this.messages = [
      { role: "system", content: this.options.systemPrompt }
    ];
    this.isLoading = false;
    this.isGenerating = false;
    
    // Event callbacks
    this.onProgress = null;
    this.onReady = null;
    this.onError = null;
    this.onMessageStart = null;
    this.onMessageUpdate = null;
    this.onMessageComplete = null;
  }

  /**
   * Initialize the LLM model
   */
  async initialize() {
    if (this.generator) return this.generator;
    
    this.isLoading = true;
    
    try {
      const { pipeline, env } = await getTransformers();
      
      // Keep downloads remote and cached by the browser
      env.allowLocalModels = false;

      // Prefer WebGPU (faster). Fall back to WASM.
      const device = (navigator.gpu) ? "webgpu" : "wasm";
      const dtype = (device === "webgpu") ? "fp16" : "q4";

      this.generator = await pipeline(
        "text-generation",
        this.options.modelId,
        { 
          device, 
          dtype, 
          progress_callback: (progress) => {
            if (this.onProgress) {
              this.onProgress(progress);
            }
          }
        }
      );

      this.isLoading = false;
      
      if (this.onReady) {
        this.onReady({ device, dtype });
      }
      
      return this.generator;
    } catch (error) {
      this.isLoading = false;
      
      if (this.onError) {
        this.onError(error);
      }
      
      throw error;
    }
  }

  /**
   * Send a message and get streaming response
   */
  async sendMessage(userText) {
    if (!userText.trim()) return null;
    if (!this.generator) {
      throw new Error("Model not initialized. Call initialize() first.");
    }
    if (this.isGenerating) {
      throw new Error("Already generating a response. Please wait.");
    }

    this.isGenerating = true;
    
    // Add user message to history
    this.messages.push({ role: "user", content: userText });
    
    if (this.onMessageStart) {
      this.onMessageStart("user", userText);
    }

    let assistantResponse = "";
    
    if (this.onMessageStart) {
      this.onMessageStart("assistant", "");
    }

    try {
      const { TextStreamer } = await getTransformers();
      
      // Create streamer for real-time output
      const streamer = new TextStreamer(this.generator.tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
        callback_function: (text) => {
          assistantResponse += text;
          if (this.onMessageUpdate) {
            this.onMessageUpdate("assistant", assistantResponse);
          }
        }
      });

      const output = await this.generator(this.messages, {
        max_new_tokens: this.options.maxNewTokens,
        do_sample: this.options.doSample,
        streamer
      });

      // Get final message from output
      const finalMsg = output[0].generated_text.at(-1)?.content ?? assistantResponse;
      
      // Add assistant response to history
      this.messages.push({ role: "assistant", content: finalMsg });
      
      if (this.onMessageComplete) {
        this.onMessageComplete("assistant", finalMsg);
      }

      this.isGenerating = false;
      return finalMsg;
      
    } catch (error) {
      this.isGenerating = false;
      
      if (this.onError) {
        this.onError(error);
      }
      
      throw error;
    }
  }

  /**
   * Clear chat history (keeps system message)
   */
  clearHistory() {
    this.messages = [
      { role: "system", content: this.options.systemPrompt }
    ];
  }

  /**
   * Get current chat history
   */
  getHistory() {
    return [...this.messages];
  }

  /**
   * Check if model is ready
   */
  isReady() {
    return !!this.generator && !this.isLoading;
  }

  /**
   * Check if currently generating
   */
  isBusy() {
    return this.isLoading || this.isGenerating;
  }
}

/**
 * UI Helper class for creating chat interfaces
 */
export class LLMChatUI {
  constructor(containerElement, llmChat) {
    this.container = containerElement;
    this.llm = llmChat;
    this.elements = {};
    
    this.setupEventHandlers();
    this.render();
  }

  setupEventHandlers() {
    // Set up LLM event handlers
    this.llm.onProgress = (progress) => this.handleProgress(progress);
    this.llm.onReady = (info) => this.handleReady(info);
    this.llm.onError = (error) => this.handleError(error);
    this.llm.onMessageStart = (role, text) => this.handleMessageStart(role, text);
    this.llm.onMessageUpdate = (role, text) => this.handleMessageUpdate(role, text);
    this.llm.onMessageComplete = (role, text) => this.handleMessageComplete(role, text);
  }

  render() {
    this.container.innerHTML = `
      <div class="max-w-4xl mx-auto p-4 bg-gray-900 text-gray-200 rounded-lg">
        <h2 class="text-xl font-semibold mb-3 text-gray-200">Local LLM Chat</h2>
        
        <div id="chat" class="mb-4"></div>
        
        <div class="flex gap-2 my-4">
          <textarea id="prompt" placeholder="Ask something…" class="flex-1 min-h-20 p-3 rounded-lg border border-gray-600 bg-gray-800 text-gray-200 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"></textarea>
          <button id="send" class="px-4 py-3 rounded-lg border border-gray-600 bg-gray-700 text-gray-200 hover:bg-gray-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors">Send</button>
        </div>
        
        <div class="flex gap-2 items-center mt-4">
          <button id="clear" class="px-4 py-2 rounded-lg border border-gray-600 bg-gray-700 text-gray-200 hover:bg-gray-600 transition-colors">Clear</button>
          <span id="status" class="text-xs text-gray-400"></span>
        </div>
        
        <div id="progress-container" class="w-full bg-gray-600 rounded my-2 overflow-hidden" style="display: none;">
          <div id="progress-bar" class="h-2 bg-blue-500 rounded transition-all duration-300 ease-out" style="width: 0%;"></div>
          <div id="progress-text" class="text-xs text-gray-400 mt-1"></div>
        </div>
      </div>
    `;

    // Get element references
    this.elements = {
      chat: this.container.querySelector('#chat'),
      prompt: this.container.querySelector('#prompt'),
      sendBtn: this.container.querySelector('#send'),
      clearBtn: this.container.querySelector('#clear'),
      status: this.container.querySelector('#status'),
      progressContainer: this.container.querySelector('#progress-container'),
      progressBar: this.container.querySelector('#progress-bar'),
      progressText: this.container.querySelector('#progress-text')
    };

    // Set up UI event listeners
    this.elements.sendBtn.addEventListener('click', () => this.handleSend());
    this.elements.prompt.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        this.handleSend();
      }
    });
    this.elements.clearBtn.addEventListener('click', () => this.handleClear());

    // Initialize the model
    this.initializeModel();
  }

  async initializeModel() {
    this.elements.status.textContent = 'Initializing model...';
    this.elements.progressContainer.style.display = 'block';
    this.elements.progressText.textContent = 'Initializing model download...';
    
    try {
      await this.llm.initialize();
    } catch (error) {
      console.error('Failed to initialize model:', error);
    }
  }

  handleProgress(progress) {
    console.log('Progress update:', progress);
    
    this.elements.progressContainer.style.display = 'block';
    
    if (progress.status === 'downloading' || progress.status === 'progress') {
      if (progress.loaded && progress.total) {
        const percentage = Math.round((progress.loaded / progress.total) * 100);
        this.elements.progressBar.style.width = `${percentage}%`;
        const loadedMB = (progress.loaded / 1024 / 1024).toFixed(1);
        const totalMB = (progress.total / 1024 / 1024).toFixed(1);
        const fileName = progress.file || progress.name || 'model file';
        this.elements.progressText.textContent = `Downloading ${fileName}: ${percentage}% (${loadedMB}MB / ${totalMB}MB)`;
      } else {
        this.elements.progressText.textContent = `Downloading ${progress.file || progress.name || 'model files'}...`;
      }
    } else if (progress.status === 'loading' || progress.status === 'initiate') {
      this.elements.progressText.textContent = `Loading ${progress.file || progress.name || 'model'}...`;
    } else if (progress.status === 'done' || progress.status === 'ready') {
      this.elements.progressText.textContent = `Finalizing ${progress.file || progress.name || 'model'}...`;
    } else {
      this.elements.progressText.textContent = `${progress.status || 'Loading'}...`;
    }
  }

  handleReady(info) {
    this.elements.status.textContent = 'Ready';
    this.elements.progressContainer.style.display = 'none';
    this.elements.prompt.focus();
  }

  handleError(error) {
    this.elements.status.textContent = 'Error loading model';
    this.elements.progressContainer.style.display = 'none';
    this.elements.progressText.textContent = `Error: ${error.message}`;
    console.error('LLM Error:', error);
  }

  handleMessageStart(role, text) {
    if (role === 'user') {
      this.addChatBubble(role, text);
    } else if (role === 'assistant') {
      this.currentAssistantBubble = this.addChatBubble(role, '');
    }
  }

  handleMessageUpdate(role, text) {
    if (role === 'assistant' && this.currentAssistantBubble) {
      this.currentAssistantBubble.textContent = text;
    }
  }

  handleMessageComplete(role, text) {
    if (role === 'assistant' && this.currentAssistantBubble) {
      this.currentAssistantBubble.textContent = text;
      this.currentAssistantBubble = null;
    }
    
    this.elements.sendBtn.disabled = false;
    this.elements.status.textContent = '';
    this.elements.prompt.value = '';
    this.elements.prompt.focus();
  }

  addChatBubble(role, text) {
    const row = document.createElement('div');
    row.className = 'flex gap-3 items-start my-3';
    
    const roleEl = document.createElement('div');
    roleEl.className = 'flex-none w-20 text-xs uppercase tracking-wide opacity-70';
    roleEl.textContent = role;
    
    const bubble = document.createElement('div');
    bubble.className = 'flex-1 whitespace-pre-wrap leading-relaxed bg-gray-800 border border-gray-600 rounded-xl p-3';
    bubble.textContent = text;
    
    row.append(roleEl, bubble);
    this.elements.chat.appendChild(row);
    
    return bubble;
  }

  async handleSend() {
    const userText = this.elements.prompt.value.trim();
    if (!userText || !this.llm.isReady()) return;

    this.elements.sendBtn.disabled = true;
    this.elements.status.textContent = 'Generating…';

    try {
      await this.llm.sendMessage(userText);
    } catch (error) {
      this.handleError(error);
      this.elements.sendBtn.disabled = false;
    }
  }

  handleClear() {
    this.elements.chat.innerHTML = '';
    this.llm.clearHistory();
  }
}
