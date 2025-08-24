/**
 * Unit tests for LLM component
 */

import { LLMChat, LLMChatUI } from './llm.js';

describe('LLMChat', () => {
  let llmChat;

  beforeEach(() => {
    llmChat = new LLMChat({
      systemPrompt: "You are a test assistant.",
      maxNewTokens: 50
    });
  });

  test('should initialize with default options', () => {
    expect(llmChat.options.systemPrompt).toBe("You are a test assistant.");
    expect(llmChat.options.maxNewTokens).toBe(50);
    expect(llmChat.options.modelId).toBe("onnx-community/gemma-3-270m-it-ONNX");
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
});

describe('LLMChatUI', () => {
  let container;
  let llmChat;
  let chatUI;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    
    llmChat = new LLMChat();
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
  });

  test('should handle clear button click', () => {
    const clearBtn = container.querySelector('#clear');
    const chatDiv = container.querySelector('#chat');
    
    // Add some content
    chatDiv.innerHTML = '<div>test message</div>';
    llmChat.messages.push({ role: "user", content: "test" });
    
    clearBtn.click();
    
    expect(chatDiv.innerHTML).toBe('');
    expect(llmChat.getHistory()).toHaveLength(1); // Only system message
  });
});
