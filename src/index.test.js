import { initializeLLM, askLLM } from './index.js';
import { LLMChat } from './components/llm.js';

// Mock the LLMChat component
jest.mock('./components/llm.js');

describe('Index', () => {
  beforeEach(() => {
    // Clear the global LLM instance before each test
    window.appLLM = null;
    jest.clearAllMocks();
    
    // Mock console.log to avoid noise in test output
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('initializeLLM', () => {
    it('should create a new LLM instance when none exists', async () => {
      const mockLLMInstance = {
        initialize: jest.fn().mockResolvedValue(),
        onProgress: null,
        onReady: null,
        onError: null
      };
      
      LLMChat.mockImplementation(() => mockLLMInstance);

      const result = await initializeLLM();

      expect(LLMChat).toHaveBeenCalledWith({
        systemPrompt: "You are a helpful assistant for a web application.",
        maxNewTokens: 128
      });
      expect(mockLLMInstance.initialize).toHaveBeenCalled();
      expect(window.appLLM).toBe(mockLLMInstance);
      expect(result).toBe(mockLLMInstance);
    });

    it('should return existing LLM instance if already initialized', async () => {
      const existingLLM = { test: 'existing' };
      window.appLLM = existingLLM;

      const result = await initializeLLM();

      expect(LLMChat).not.toHaveBeenCalled();
      expect(result).toBe(existingLLM);
    });

    it('should set up event handlers on the LLM instance', async () => {
      const mockLLMInstance = {
        initialize: jest.fn().mockResolvedValue(),
        onProgress: null,
        onReady: null,
        onError: null
      };
      
      LLMChat.mockImplementation(() => mockLLMInstance);

      await initializeLLM();

      expect(typeof mockLLMInstance.onProgress).toBe('function');
      expect(typeof mockLLMInstance.onReady).toBe('function');
      expect(typeof mockLLMInstance.onError).toBe('function');
    });

    it('should handle progress events', async () => {
      const mockLLMInstance = {
        initialize: jest.fn().mockResolvedValue(),
        onProgress: null,
        onReady: null,
        onError: null
      };
      
      LLMChat.mockImplementation(() => mockLLMInstance);

      await initializeLLM();

      const progressData = { status: 'loading' };
      mockLLMInstance.onProgress(progressData);

      expect(console.log).toHaveBeenCalledWith('App LLM Progress:', progressData);
    });

    it('should handle ready events', async () => {
      const mockLLMInstance = {
        initialize: jest.fn().mockResolvedValue(),
        onProgress: null,
        onReady: null,
        onError: null
      };
      
      LLMChat.mockImplementation(() => mockLLMInstance);

      await initializeLLM();

      const readyInfo = { model: 'test-model' };
      mockLLMInstance.onReady(readyInfo);

      expect(console.log).toHaveBeenCalledWith('App LLM Ready:', readyInfo);
    });

    it('should handle error events', async () => {
      const mockLLMInstance = {
        initialize: jest.fn().mockResolvedValue(),
        onProgress: null,
        onReady: null,
        onError: null
      };
      
      LLMChat.mockImplementation(() => mockLLMInstance);

      await initializeLLM();

      const error = new Error('Test error');
      mockLLMInstance.onError(error);

      expect(console.error).toHaveBeenCalledWith('App LLM Error:', error);
    });
  });

  describe('askLLM', () => {
    it('should use existing LLM instance if available', async () => {
      const mockLLM = {
        sendMessage: jest.fn().mockResolvedValue('response')
      };
      window.appLLM = mockLLM;

      const result = await askLLM('test message');

      expect(mockLLM.sendMessage).toHaveBeenCalledWith('test message');
      expect(result).toBe('response');
    });

    it('should initialize LLM if not available', async () => {
      const mockLLMInstance = {
        initialize: jest.fn().mockResolvedValue(),
        sendMessage: jest.fn().mockResolvedValue('response'),
        onProgress: null,
        onReady: null,
        onError: null
      };
      
      LLMChat.mockImplementation(() => mockLLMInstance);

      const result = await askLLM('test message');

      expect(LLMChat).toHaveBeenCalled();
      expect(mockLLMInstance.initialize).toHaveBeenCalled();
      expect(mockLLMInstance.sendMessage).toHaveBeenCalledWith('test message');
      expect(result).toBe('response');
    });
  });
});
