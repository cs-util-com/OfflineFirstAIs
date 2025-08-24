/**
 * Unit tests for LLM component
 */

import { LLMChat, LLMChatUI, setTransformersModule } from './llm.js';

// Mock navigator.gpu for testing
Object.defineProperty(global.navigator, 'gpu', {
  writable: true,
  value: undefined
});

describe('LLMChat', () => {
  let llmChat;
  let mockPipeline;
  let mockTextStreamer;
  let mockEnv;
  let mockGenerator;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create mock generator
    mockGenerator = {
      tokenizer: {
        decode: jest.fn()
      }
    };

    // Create mock pipeline
    mockPipeline = jest.fn().mockResolvedValue(mockGenerator);
    
    // Create mock TextStreamer
    mockTextStreamer = jest.fn().mockImplementation((tokenizer, options) => {
      // Simulate streaming behavior
      setTimeout(() => {
        if (options.callback_function) {
          options.callback_function('Mock ');
          options.callback_function('response');
        }
      }, 10);
      return { tokenizer };
    });

    // Create mock env
    mockEnv = {
      allowLocalModels: false
    };

    // Set up the mock transformers module
    setTransformersModule({
      pipeline: mockPipeline,
      TextStreamer: mockTextStreamer,
      env: mockEnv
    });

    // Create LLMChat instance
    llmChat = new LLMChat({
      systemPrompt: "You are a test assistant.",
      maxNewTokens: 50
    });
  });

  afterEach(() => {
    // Reset the transformers module
    setTransformersModule(null);
  });

  test('should initialize with default options', () => {
    expect(llmChat.options.systemPrompt).toBe("You are a test assistant.");
    expect(llmChat.options.maxNewTokens).toBe(50);
    expect(llmChat.options.modelId).toBe("onnx-community/gemma-3-270m-it-ONNX");
    expect(llmChat.options.doSample).toBe(false);
  });

  test('should start with system message in history', () => {
    const history = llmChat.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].role).toBe("system");
    expect(history[0].content).toBe("You are a test assistant.");
  });

  test('should not be ready before initialization', () => {
    expect(llmChat.isReady()).toBe(false);
    expect(llmChat.isBusy()).toBe(false);
  });

  test('should be busy during loading', () => {
    llmChat.isLoading = true;
    expect(llmChat.isBusy()).toBe(true);
  });

  test('should be busy during generation', () => {
    llmChat.isGenerating = true;
    expect(llmChat.isBusy()).toBe(true);
  });

  test('should clear history correctly', () => {
    llmChat.messages.push({ role: "user", content: "test" });
    llmChat.messages.push({ role: "assistant", content: "response" });
    
    llmChat.clearHistory();
    
    const history = llmChat.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].role).toBe("system");
  });

  test('should throw error when sending message before initialization', async () => {
    await expect(llmChat.sendMessage("test")).rejects.toThrow("Model not initialized");
  });

  test('should return null for empty message', async () => {
    await llmChat.initialize();
    const result = await llmChat.sendMessage("");
    expect(result).toBeNull();
  });

  test('should throw error when generating while already generating', async () => {
    await llmChat.initialize();
    llmChat.isGenerating = true;
    
    await expect(llmChat.sendMessage("test")).rejects.toThrow("Already generating a response");
  });

  test('should initialize successfully', async () => {
    const onProgressSpy = jest.fn();
    const onReadySpy = jest.fn();
    
    llmChat.onProgress = onProgressSpy;
    llmChat.onReady = onReadySpy;

    const result = await llmChat.initialize();
    
    expect(result).toBe(mockGenerator);
    expect(llmChat.generator).toBe(mockGenerator);
    expect(llmChat.isLoading).toBe(false);
    expect(llmChat.isReady()).toBe(true);
    expect(mockPipeline).toHaveBeenCalledWith(
      "text-generation",
      "onnx-community/gemma-3-270m-it-ONNX",
      expect.objectContaining({
        device: "wasm", // no navigator.gpu in test
        dtype: "q4",
        progress_callback: expect.any(Function)
      })
    );
    expect(onReadySpy).toHaveBeenCalledWith({ device: "wasm", dtype: "q4" });
  });

  test('should use WebGPU when available', async () => {
    // Mock navigator.gpu
    global.navigator.gpu = {};
    
    await llmChat.initialize();
    
    expect(mockPipeline).toHaveBeenCalledWith(
      "text-generation",
      "onnx-community/gemma-3-270m-it-ONNX",
      expect.objectContaining({
        device: "webgpu",
        dtype: "fp16"
      })
    );

    // Cleanup
    global.navigator.gpu = undefined;
  });

  test('should return existing generator on second initialization', async () => {
    const firstResult = await llmChat.initialize();
    const secondResult = await llmChat.initialize();
    
    expect(firstResult).toBe(secondResult);
    expect(mockPipeline).toHaveBeenCalledTimes(1);
  });

  test('should handle initialization error', async () => {
    const error = new Error("Initialization failed");
    mockPipeline.mockRejectedValue(error);
    
    const onErrorSpy = jest.fn();
    llmChat.onError = onErrorSpy;

    await expect(llmChat.initialize()).rejects.toThrow("Initialization failed");
    expect(llmChat.isLoading).toBe(false);
    expect(onErrorSpy).toHaveBeenCalledWith(error);
  });

  test('should call progress callback during initialization', async () => {
    const onProgressSpy = jest.fn();
    llmChat.onProgress = onProgressSpy;

    await llmChat.initialize();
    
    // Get the progress callback and test it
    const progressCallback = mockPipeline.mock.calls[0][2].progress_callback;
    const mockProgress = { status: 'downloading', loaded: 50, total: 100 };
    
    progressCallback(mockProgress);
    expect(onProgressSpy).toHaveBeenCalledWith(mockProgress);
  });

  test('should send message successfully', async () => {
    // Mock the generator as a function
    const mockGeneratorFunction = jest.fn().mockResolvedValue([{
      generated_text: [
        { role: "system", content: "System message" },
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" }
      ]
    }]);

    const onMessageStartSpy = jest.fn();
    const onMessageUpdateSpy = jest.fn();
    const onMessageCompleteSpy = jest.fn();

    llmChat.onMessageStart = onMessageStartSpy;
    llmChat.onMessageUpdate = onMessageUpdateSpy;
    llmChat.onMessageComplete = onMessageCompleteSpy;

    await llmChat.initialize();
    
    // Replace the generator with our mock function
    llmChat.generator = mockGeneratorFunction;
    llmChat.generator.tokenizer = { decode: jest.fn() };

    const response = await llmChat.sendMessage("Hello");

    expect(response).toBe("Hi there!");
    expect(llmChat.messages).toHaveLength(3); // system + user + assistant
    expect(llmChat.messages[1]).toEqual({ role: "user", content: "Hello" });
    expect(llmChat.messages[2]).toEqual({ role: "assistant", content: "Hi there!" });
    
    expect(onMessageStartSpy).toHaveBeenCalledWith("user", "Hello");
    expect(onMessageStartSpy).toHaveBeenCalledWith("assistant", "");
    expect(onMessageCompleteSpy).toHaveBeenCalledWith("assistant", "Hi there!");
  });

  test('should handle message generation error', async () => {
    const error = new Error("Generation failed");
    const mockGeneratorFunction = jest.fn().mockRejectedValue(error);

    const onErrorSpy = jest.fn();
    llmChat.onError = onErrorSpy;

    await llmChat.initialize();
    
    // Replace the generator with our mock function that throws
    llmChat.generator = mockGeneratorFunction;
    llmChat.generator.tokenizer = { decode: jest.fn() };
    
    await expect(llmChat.sendMessage("Hello")).rejects.toThrow("Generation failed");
    expect(llmChat.isGenerating).toBe(false);
    expect(onErrorSpy).toHaveBeenCalledWith(error);
  });

  test('should handle message with fallback response', async () => {
    // Test case where output doesn't have expected structure
    const mockGeneratorFunction = jest.fn().mockResolvedValue([{
      generated_text: []
    }]);

    await llmChat.initialize();
    llmChat.generator = mockGeneratorFunction;
    llmChat.generator.tokenizer = { decode: jest.fn() };

    const response = await llmChat.sendMessage("Hello");
    
    // Should fallback to empty string when no final message found
    expect(response).toBe("");
    expect(llmChat.messages).toHaveLength(3);
  });

  test('should not call callbacks when not set', async () => {
    // Test that missing callbacks don't cause errors
    llmChat.onProgress = null;
    llmChat.onReady = null;
    llmChat.onError = null;
    llmChat.onMessageStart = null;
    llmChat.onMessageUpdate = null;
    llmChat.onMessageComplete = null;

    await llmChat.initialize();
    
    // Should not throw errors
    expect(llmChat.isReady()).toBe(true);
  });

  test('should fall back to dynamic import when no module set', async () => {
    // Reset the transformers module to test dynamic import path
    setTransformersModule(null);
    
    const newLlmChat = new LLMChat();
    
    // Mock the dynamic import to fail (since we can't actually import in test)
    await expect(newLlmChat.initialize()).rejects.toThrow();
    
    // Restore the mock module
    setTransformersModule({
      pipeline: mockPipeline,
      TextStreamer: mockTextStreamer,
      env: mockEnv
    });
  });
});

describe('LLMChatUI', () => {
  let container;
  let llmChat;
  let chatUI;

  beforeEach(() => {
    // Set up DOM
    container = document.createElement('div');
    document.body.appendChild(container);
    
    // Create a simple mock LLM
    llmChat = {
      options: { systemPrompt: "Test prompt" },
      messages: [{ role: "system", content: "Test prompt" }],
      initialize: jest.fn().mockResolvedValue({}),
      sendMessage: jest.fn().mockResolvedValue("Mock response"),
      clearHistory: jest.fn(),
      getHistory: jest.fn().mockReturnValue([{ role: "system", content: "Test prompt" }]),
      isReady: jest.fn().mockReturnValue(true),
      isBusy: jest.fn().mockReturnValue(false),
      onProgress: null,
      onReady: null,
      onError: null,
      onMessageStart: null,
      onMessageUpdate: null,
      onMessageComplete: null
    };

    chatUI = new LLMChatUI(container, llmChat);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  test('should render UI elements', () => {
    expect(container.querySelector('#chat')).toBeTruthy();
    expect(container.querySelector('#prompt')).toBeTruthy();
    expect(container.querySelector('#send')).toBeTruthy();
    expect(container.querySelector('#clear')).toBeTruthy();
    expect(container.querySelector('#status')).toBeTruthy();
    expect(container.querySelector('#progress-container')).toBeTruthy();
  });

  test('should handle clear button click', () => {
    const clearBtn = container.querySelector('#clear');
    clearBtn.click();
    
    expect(llmChat.clearHistory).toHaveBeenCalled();
    expect(container.querySelector('#chat').innerHTML).toBe('');
  });

  test('should handle send button click', async () => {
    const sendBtn = container.querySelector('#send');
    const prompt = container.querySelector('#prompt');
    
    prompt.value = 'Test message';
    sendBtn.click();
    
    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 10));
    
    expect(llmChat.sendMessage).toHaveBeenCalledWith('Test message');
  });

  test('should handle enter key with ctrl', () => {
    const prompt = container.querySelector('#prompt');
    const handleSendSpy = jest.spyOn(chatUI, 'handleSend');
    
    prompt.value = 'Test message';
    
    const event = new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true });
    prompt.dispatchEvent(event);
    
    expect(handleSendSpy).toHaveBeenCalled();
  });

  test('should add chat bubble correctly', () => {
    const bubble = chatUI.addChatBubble('user', 'Test message');
    
    expect(bubble.textContent).toBe('Test message');
    expect(container.querySelector('#chat').children.length).toBe(1);
  });

  test('should handle progress updates', () => {
    const progress = {
      status: 'downloading',
      loaded: 50,
      total: 100,
      file: 'test.onnx'
    };
    
    chatUI.handleProgress(progress);
    
    const progressContainer = container.querySelector('#progress-container');
    const progressBar = container.querySelector('#progress-bar');
    const progressText = container.querySelector('#progress-text');
    
    expect(progressContainer.style.display).toBe('block');
    expect(progressBar.style.width).toBe('50%');
    expect(progressText.textContent).toContain('50%');
  });

  test('should handle ready state', () => {
    chatUI.handleReady({ device: 'wasm', dtype: 'q4' });
    
    const status = container.querySelector('#status');
    const progressContainer = container.querySelector('#progress-container');
    
    expect(status.textContent).toBe('Ready');
    expect(progressContainer.style.display).toBe('none');
  });

  test('should handle errors', () => {
    const error = new Error('Test error');
    chatUI.handleError(error);
    
    const status = container.querySelector('#status');
    const progressContainer = container.querySelector('#progress-container');
    
    expect(status.textContent).toBe('Error loading model');
    expect(progressContainer.style.display).toBe('none');
  });

  test('should handle message start', () => {
    chatUI.handleMessageStart('user', 'Hello');
    
    expect(container.querySelector('#chat').children.length).toBe(1);
  });

  test('should handle message updates', () => {
    chatUI.currentAssistantBubble = chatUI.addChatBubble('assistant', '');
    chatUI.handleMessageUpdate('assistant', 'Updated text');
    
    expect(chatUI.currentAssistantBubble.textContent).toBe('Updated text');
  });

  test('should handle message completion', () => {
    const sendBtn = container.querySelector('#send');
    const prompt = container.querySelector('#prompt');
    const status = container.querySelector('#status');
    
    sendBtn.disabled = true;
    prompt.value = 'test';
    status.textContent = 'Generating...';
    
    chatUI.currentAssistantBubble = chatUI.addChatBubble('assistant', '');
    const initialBubble = chatUI.currentAssistantBubble;
    
    chatUI.handleMessageComplete('assistant', 'Final response');
    
    expect(initialBubble.textContent).toBe('Final response');
    expect(chatUI.currentAssistantBubble).toBeNull();
    expect(sendBtn.disabled).toBe(false);
    expect(status.textContent).toBe('');
    expect(prompt.value).toBe('');
  });

  test('should handle progress with different statuses', () => {
    // Test loading status
    chatUI.handleProgress({ status: 'loading', file: 'model.onnx' });
    expect(container.querySelector('#progress-text').textContent).toContain('Loading model.onnx');

    // Test initiate status
    chatUI.handleProgress({ status: 'initiate', name: 'tokenizer' });
    expect(container.querySelector('#progress-text').textContent).toContain('Loading tokenizer');

    // Test done status
    chatUI.handleProgress({ status: 'done', file: 'model.onnx' });
    expect(container.querySelector('#progress-text').textContent).toContain('Finalizing model.onnx');

    // Test unknown status
    chatUI.handleProgress({ status: 'unknown' });
    expect(container.querySelector('#progress-text').textContent).toContain('unknown');
  });

  test('should handle progress without file info', () => {
    chatUI.handleProgress({ status: 'downloading' });
    expect(container.querySelector('#progress-text').textContent).toContain('Downloading model files');
  });

  test('should not send empty message', async () => {
    const prompt = container.querySelector('#prompt');
    prompt.value = '   '; // whitespace only
    
    await chatUI.handleSend();
    
    expect(llmChat.sendMessage).not.toHaveBeenCalled();
  });

  test('should not send when model not ready', async () => {
    llmChat.isReady.mockReturnValue(false);
    
    const prompt = container.querySelector('#prompt');
    prompt.value = 'test message';
    
    await chatUI.handleSend();
    
    expect(llmChat.sendMessage).not.toHaveBeenCalled();
  });

  test('should handle send with error', async () => {
    const error = new Error('Send failed');
    llmChat.sendMessage.mockRejectedValue(error);
    
    const sendBtn = container.querySelector('#send');
    const prompt = container.querySelector('#prompt');
    
    prompt.value = 'Test message';
    
    await chatUI.handleSend();
    
    expect(sendBtn.disabled).toBe(false); // Should re-enable button on error
  });

  test('should handle initialization error in UI', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('Init failed');
    llmChat.initialize.mockRejectedValue(error);
    
    // Create a new UI instance to trigger initialization
    const newContainer = document.createElement('div');
    document.body.appendChild(newContainer);
    
    new LLMChatUI(newContainer, llmChat);
    
    // Wait for async initialization
    await new Promise(resolve => setTimeout(resolve, 10));
    
    expect(consoleSpy).toHaveBeenCalledWith('Failed to initialize model:', error);
    
    document.body.removeChild(newContainer);
    consoleSpy.mockRestore();
  });
});
