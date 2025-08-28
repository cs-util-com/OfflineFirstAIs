/**
 * Test suite for TTS (Text-to-Speech) components
 * Tests both TTSEngine core functionality and TTSUI helper class
 */

import { TTSEngine, TTSUI } from './tts.js';

// Mock kokoro-js library for testing
const mockKokoroJS = {
  KokoroText2Speech: jest.fn().mockImplementation(() => ({
    ready: jest.fn().mockResolvedValue(true),
    tts: jest.fn().mockResolvedValue(new Float32Array(1024)),
    loadVoice: jest.fn().mockResolvedValue(true),
    voices: [
      { id: 'af', name: 'Bella' },
      { id: 'af_bella', name: 'Bella (Variant)' }
    ]
  })),
  writeWAVHeader: jest.fn().mockReturnValue(new ArrayBuffer(44)),
  writeWAVData: jest.fn().mockReturnValue(new ArrayBuffer(2048)),
  KokoroStreamingTTS: jest.fn().mockImplementation(() => ({
    ready: jest.fn().mockResolvedValue(true),
    loadVoice: jest.fn().mockResolvedValue(true),
    streamTTS: jest.fn().mockImplementation(function* () {
      yield new Float32Array(512);
      yield new Float32Array(512);
    }),
    voices: [
      { id: 'af', name: 'Bella' },
      { id: 'af_bella', name: 'Bella (Variant)' }
    ]
  }))
};

// Mock Audio API
global.Audio = jest.fn().mockImplementation(() => ({
  play: jest.fn().mockResolvedValue(undefined),
  pause: jest.fn(),
  currentTime: 0,
  duration: 0,
  volume: 1,
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  src: '',
  load: jest.fn()
}));

// Mock URL.createObjectURL and revokeObjectURL
global.URL = {
  createObjectURL: jest.fn().mockReturnValue('blob:mock-url'),
  revokeObjectURL: jest.fn()
};

// Mock Blob
global.Blob = jest.fn().mockImplementation((data, options) => ({
  data,
  options,
  size: data ? data.reduce((acc, item) => acc + (item.byteLength || item.length || 0), 0) : 0,
  type: options?.type || ''
}));

describe('TTSEngine', () => {
  let ttsEngine;
  let mockProgressCallback;
  let mockErrorCallback;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Create fresh callbacks
    mockProgressCallback = jest.fn();
    mockErrorCallback = jest.fn();
    
    // Create new TTSEngine instance
    ttsEngine = new TTSEngine();
  });

  describe('Constructor', () => {
    test('should create TTSEngine with default values', () => {
      expect(ttsEngine.isInitialized).toBe(false);
      expect(ttsEngine.isLoading).toBe(false);
      expect(ttsEngine.isGenerating).toBe(false);
      expect(ttsEngine.currentVoice).toBe('af');
      expect(ttsEngine.streamingMode).toBe(false);
      expect(ttsEngine.kokoroInstance).toBeNull();
    });

    test('should accept custom voice in constructor', () => {
      const customEngine = new TTSEngine('af_bella');
      expect(customEngine.currentVoice).toBe('af_bella');
    });
  });

  describe('initialize', () => {
    test('should initialize with default library loading', async () => {
      // Mock the default library loading to use our mock
      const originalGetKokoro = jest.requireActual('./tts.js');
      jest.doMock('./tts.js', () => ({
        ...originalGetKokoro,
        default: async () => mockKokoroJS
      }));
      
      // For this test, we'll mock the library loading internally
      const mockEngine = new TTSEngine();
      mockEngine.kokoroLib = mockKokoroJS;
      
      await mockEngine.initialize(mockProgressCallback, mockErrorCallback, mockKokoroJS);
      
      expect(mockEngine.isInitialized).toBe(true);
      expect(mockEngine.isLoading).toBe(false);
      expect(mockProgressCallback).toHaveBeenCalledWith(expect.objectContaining({
        status: 'success',
        message: 'TTS engine initialized successfully!'
      }));
    });

    test('should use injected library for testing', async () => {
      await ttsEngine.initialize(mockProgressCallback, mockErrorCallback, mockKokoroJS);
      
      expect(ttsEngine.isInitialized).toBe(true);
      expect(mockKokoroJS.KokoroText2Speech).toHaveBeenCalled();
    });

    test('should handle initialization progress updates', async () => {
      await ttsEngine.initialize(mockProgressCallback, mockErrorCallback, mockKokoroJS);
      
      expect(mockProgressCallback).toHaveBeenCalledWith(expect.objectContaining({
        status: 'loading',
        message: 'Loading kokoro-js library...'
      }));
      expect(mockProgressCallback).toHaveBeenCalledWith(expect.objectContaining({
        status: 'loading',
        message: 'Initializing TTS engine...'
      }));
      expect(mockProgressCallback).toHaveBeenCalledWith(expect.objectContaining({
        status: 'success',
        message: 'TTS engine initialized successfully!'
      }));
    });

    test('should not reinitialize if already initialized', async () => {
      await ttsEngine.initialize(mockProgressCallback, mockErrorCallback, mockKokoroJS);
      mockProgressCallback.mockClear();
      
      await ttsEngine.initialize(mockProgressCallback, mockErrorCallback, mockKokoroJS);
      
      expect(mockProgressCallback).not.toHaveBeenCalled();
    });

    test('should handle library loading errors', async () => {
      const mockFailingLibrary = {
        KokoroText2Speech: jest.fn().mockImplementation(() => {
          throw new Error('Failed to initialize');
        })
      };

      await ttsEngine.initialize(mockProgressCallback, mockErrorCallback, mockFailingLibrary);
      
      expect(mockErrorCallback).toHaveBeenCalledWith(
        'Failed to initialize TTS engine: Failed to initialize'
      );
      expect(ttsEngine.isInitialized).toBe(false);
    });

    test('should handle engine ready() failure', async () => {
      const mockFailingEngine = {
        KokoroText2Speech: jest.fn().mockImplementation(() => ({
          ready: jest.fn().mockRejectedValue(new Error('Engine not ready')),
          loadVoice: jest.fn(),
          voices: []
        }))
      };

      await ttsEngine.initialize(mockProgressCallback, mockErrorCallback, mockFailingEngine);
      
      expect(mockErrorCallback).toHaveBeenCalledWith(
        'Failed to initialize TTS engine: Engine not ready'
      );
    });
  });

  describe('generateSpeech', () => {
    beforeEach(async () => {
      await ttsEngine.initialize(mockProgressCallback, mockErrorCallback, mockKokoroJS);
    });

    test('should generate speech from text', async () => {
      const result = await ttsEngine.generateSpeech('Hello world');
      
      expect(result).toEqual(expect.objectContaining({
        success: true,
        audioUrl: 'blob:mock-url'
      }));
      expect(ttsEngine.kokoroInstance.tts).toHaveBeenCalledWith('Hello world');
    });

    test('should handle empty text', async () => {
      const result = await ttsEngine.generateSpeech('');
      
      expect(result).toEqual(expect.objectContaining({
        success: false,
        error: 'Text cannot be empty'
      }));
    });

    test('should prevent multiple simultaneous generations', async () => {
      const promise1 = ttsEngine.generateSpeech('First text');
      const promise2 = ttsEngine.generateSpeech('Second text');
      
      const [result1, result2] = await Promise.all([promise1, promise2]);
      
      expect(result1.success).toBe(true);
      expect(result2).toEqual(expect.objectContaining({
        success: false,
        error: 'Speech generation already in progress'
      }));
    });

    test('should require initialization', async () => {
      const uninitializedEngine = new TTSEngine();
      const result = await uninitializedEngine.generateSpeech('Hello');
      
      expect(result).toEqual(expect.objectContaining({
        success: false,
        error: 'TTS engine not initialized'
      }));
    });

    test('should handle TTS generation errors', async () => {
      ttsEngine.kokoroInstance.tts.mockRejectedValue(new Error('TTS failed'));
      
      const result = await ttsEngine.generateSpeech('Hello world');
      
      expect(result).toEqual(expect.objectContaining({
        success: false,
        error: 'TTS failed'
      }));
    });

    test('should create audio blob correctly', async () => {
      const mockAudioData = new Float32Array([0.1, 0.2, 0.3]);
      ttsEngine.kokoroInstance.tts.mockResolvedValue(mockAudioData);
      
      await ttsEngine.generateSpeech('Test');
      
      expect(mockKokoroJS.writeWAVHeader).toHaveBeenCalledWith(mockAudioData.length, 24000);
      expect(mockKokoroJS.writeWAVData).toHaveBeenCalledWith(mockAudioData, 24000);
      expect(global.Blob).toHaveBeenCalledWith(
        [expect.any(ArrayBuffer), expect.any(ArrayBuffer)],
        { type: 'audio/wav' }
      );
    });
  });

  describe('streamSpeech', () => {
    beforeEach(async () => {
      ttsEngine.streamingMode = true;
      await ttsEngine.initialize(mockProgressCallback, mockErrorCallback, mockKokoroJS);
    });

    test('should stream speech from text', async () => {
      const chunks = [];
      const onChunk = jest.fn((chunk) => chunks.push(chunk));
      const onComplete = jest.fn();
      const onError = jest.fn();
      
      await ttsEngine.streamSpeech('Hello world', onChunk, onComplete, onError);
      
      expect(chunks).toHaveLength(2);
      expect(onComplete).toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
    });

    test('should require streaming mode', async () => {
      ttsEngine.streamingMode = false;
      const onError = jest.fn();
      
      await ttsEngine.streamSpeech('Hello', jest.fn(), jest.fn(), onError);
      
      expect(onError).toHaveBeenCalledWith('Streaming mode not enabled');
    });

    test('should handle streaming errors', async () => {
      ttsEngine.streamingInstance.streamTTS.mockImplementation(function* () {
        yield new Float32Array(256); // Need a yield for generator function
        throw new Error('Streaming failed');
      });
      
      const onError = jest.fn();
      await ttsEngine.streamSpeech('Hello', jest.fn(), jest.fn(), onError);
      
      expect(onError).toHaveBeenCalledWith('Streaming failed');
    });
  });

  describe('changeVoice', () => {
    beforeEach(async () => {
      await ttsEngine.initialize(mockProgressCallback, mockErrorCallback, mockKokoroJS);
    });

    test('should change voice successfully', async () => {
      const result = await ttsEngine.changeVoice('af_bella');
      
      expect(result.success).toBe(true);
      expect(ttsEngine.currentVoice).toBe('af_bella');
      expect(ttsEngine.kokoroInstance.loadVoice).toHaveBeenCalledWith('af_bella');
    });

    test('should handle voice loading errors', async () => {
      ttsEngine.kokoroInstance.loadVoice.mockRejectedValue(new Error('Voice not found'));
      
      const result = await ttsEngine.changeVoice('invalid_voice');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Voice not found');
    });

    test('should require initialization', async () => {
      const uninitializedEngine = new TTSEngine();
      const result = await uninitializedEngine.changeVoice('af');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('TTS engine not initialized');
    });
  });

  describe('getAvailableVoices', () => {
    test('should return empty array when not initialized', () => {
      const voices = ttsEngine.getAvailableVoices();
      expect(voices).toEqual([]);
    });

    test('should return voices after initialization', async () => {
      await ttsEngine.initialize(mockProgressCallback, mockErrorCallback, mockKokoroJS);
      const voices = ttsEngine.getAvailableVoices();
      
      expect(voices).toEqual([
        { id: 'af', name: 'Bella' },
        { id: 'af_bella', name: 'Bella (Variant)' }
      ]);
    });
  });

  describe('cleanup', () => {
    test('should cleanup resources', () => {
      ttsEngine.cleanup();
      
      expect(ttsEngine.kokoroInstance).toBeNull();
      expect(ttsEngine.streamingInstance).toBeNull();
      expect(ttsEngine.isInitialized).toBe(false);
    });
  });
});

describe('TTSUI', () => {
  let container;
  let mockTTSEngine;
  let ttsUI;

  beforeEach(() => {
    // Setup DOM container
    container = document.createElement('div');
    container.id = 'tts-container';
    document.body.appendChild(container);

    // Mock TTSEngine
    mockTTSEngine = {
      initialize: jest.fn().mockResolvedValue(true),
      generateSpeech: jest.fn().mockResolvedValue({
        success: true,
        audioUrl: 'blob:mock-url'
      }),
      changeVoice: jest.fn().mockResolvedValue({ success: true }),
      getAvailableVoices: jest.fn().mockReturnValue([
        { id: 'af', name: 'Bella' },
        { id: 'af_bella', name: 'Bella (Variant)' }
      ]),
      isInitialized: false,
      isLoading: false,
      isGenerating: false,
      currentVoice: 'af'
    };

    ttsUI = new TTSUI(mockTTSEngine);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('render', () => {
    test('should render TTS interface', () => {
      ttsUI.render(container);
      
      expect(container.querySelector('textarea')).toBeTruthy();
      expect(container.querySelector('button')).toBeTruthy();
      expect(container.querySelector('select')).toBeTruthy();
      expect(container.querySelector('#tts-status')).toBeTruthy();
    });

    test('should populate voice selector', () => {
      ttsUI.render(container);
      
      const select = container.querySelector('select');
      expect(select.children).toHaveLength(2);
      expect(select.children[0].value).toBe('af');
      expect(select.children[1].value).toBe('af_bella');
    });

    test('should handle missing voices gracefully', () => {
      mockTTSEngine.getAvailableVoices.mockReturnValue([]);
      ttsUI.render(container);
      
      const select = container.querySelector('select');
      expect(select.children).toHaveLength(0);
    });
  });

  describe('setupEventListeners', () => {
    beforeEach(() => {
      ttsUI.render(container);
      mockTTSEngine.isInitialized = true;
    });

    test('should handle generate button click', async () => {
      const textarea = container.querySelector('textarea');
      const button = container.querySelector('button');
      
      textarea.value = 'Hello world';
      button.click();
      
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(mockTTSEngine.generateSpeech).toHaveBeenCalledWith('Hello world');
    });

    test('should prevent generation with empty text', async () => {
      const textarea = container.querySelector('textarea');
      const button = container.querySelector('button');
      
      textarea.value = '';
      button.click();
      
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(mockTTSEngine.generateSpeech).not.toHaveBeenCalled();
    });

    test('should handle voice change', async () => {
      const select = container.querySelector('select');
      
      select.value = 'af_bella';
      select.dispatchEvent(new Event('change'));
      
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(mockTTSEngine.changeVoice).toHaveBeenCalledWith('af_bella');
    });

    test('should handle engine not initialized', async () => {
      mockTTSEngine.isInitialized = false;
      const textarea = container.querySelector('textarea');
      const button = container.querySelector('button');
      
      textarea.value = 'Hello world';
      button.click();
      
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(mockTTSEngine.generateSpeech).not.toHaveBeenCalled();
    });

    test('should play audio after successful generation', async () => {
      const textarea = container.querySelector('textarea');
      const button = container.querySelector('button');
      
      textarea.value = 'Hello world';
      button.click();
      
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(global.Audio).toHaveBeenCalledWith('blob:mock-url');
    });

    test('should handle generation errors', async () => {
      mockTTSEngine.generateSpeech.mockResolvedValue({
        success: false,
        error: 'Generation failed'
      });
      
      const textarea = container.querySelector('textarea');
      const button = container.querySelector('button');
      
      textarea.value = 'Hello world';
      button.click();
      
      await new Promise(resolve => setTimeout(resolve, 0));
      
      const status = container.querySelector('#tts-status');
      expect(status.textContent).toBe('Error: Generation failed');
    });
  });

  describe('updateStatus', () => {
    beforeEach(() => {
      ttsUI.render(container);
    });

    test('should update status message', () => {
      ttsUI.updateStatus('Test message', 'success');
      
      const status = container.querySelector('#tts-status');
      expect(status.textContent).toBe('Test message');
      expect(status.className).toContain('text-green-600');
    });

    test('should handle different status types', () => {
      const status = container.querySelector('#tts-status');
      
      ttsUI.updateStatus('Loading...', 'loading');
      expect(status.className).toContain('text-blue-600');
      
      ttsUI.updateStatus('Error occurred', 'error');
      expect(status.className).toContain('text-red-600');
      
      ttsUI.updateStatus('Success!', 'success');
      expect(status.className).toContain('text-green-600');
    });
  });

  describe('updateButtonState', () => {
    beforeEach(() => {
      ttsUI.render(container);
    });

    test('should disable button when loading', () => {
      ttsUI.updateButtonState(true);
      
      const button = container.querySelector('button');
      expect(button.disabled).toBe(true);
      expect(button.textContent).toBe('Generating...');
    });

    test('should enable button when not loading', () => {
      ttsUI.updateButtonState(false);
      
      const button = container.querySelector('button');
      expect(button.disabled).toBe(false);
      expect(button.textContent).toBe('Generate Speech');
    });
  });
});

describe('Integration Tests', () => {
  test('should integrate TTSEngine and TTSUI', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    
    const engine = new TTSEngine();
    await engine.initialize(jest.fn(), jest.fn(), mockKokoroJS);
    
    const ui = new TTSUI(engine);
    ui.render(container);
    
    const textarea = container.querySelector('textarea');
    const button = container.querySelector('button');
    
    textarea.value = 'Integration test';
    button.click();
    
    await new Promise(resolve => setTimeout(resolve, 0));
    
    expect(engine.kokoroInstance.tts).toHaveBeenCalledWith('Integration test');
    
    document.body.removeChild(container);
  });
});
