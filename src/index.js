console.log("Hello from index.js!");

// Example of using the LLM component programmatically
import { LLMChat } from './components/llm.js';

// Global LLM instance for the app
window.appLLM = null;

// Function to initialize LLM for use throughout the app
export async function initializeLLM() {
  if (window.appLLM) return window.appLLM;
  
  const llm = new LLMChat({
    systemPrompt: "You are a helpful assistant for a web application.",
    maxNewTokens: 128
  });

  // Set up event handlers
  llm.onProgress = (progress) => {
    console.log('App LLM Progress:', progress);
  };
  
  llm.onReady = (info) => {
    console.log('App LLM Ready:', info);
  };
  
  llm.onError = (error) => {
    console.error('App LLM Error:', error);
  };

  await llm.initialize();
  window.appLLM = llm;
  return llm;
}

// Function to send a message using the global LLM instance
export async function askLLM(message) {
  if (!window.appLLM) {
    await initializeLLM();
  }
  
  return await window.appLLM.sendMessage(message);
}

// Example usage in other parts of the app:
// import { askLLM } from './index.js';
// const response = await askLLM("Hello, how are you?");
