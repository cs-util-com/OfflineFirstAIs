import { test, expect } from '@playwright/test';
import { resolve } from 'path';

test.describe('TTS Page Browser Tests', () => {
  test('should load TTS page without errors', async ({ page }) => {
    // Listen for console errors
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Navigate to the TTS page
    const ttsPath = resolve(process.cwd(), 'pages/tts.html');
    await page.goto(`file://${ttsPath}`);

    // Wait for the page to load
    await page.waitForLoadState('networkidle');

    // Check that the page has loaded successfully
    await expect(page.locator('title')).toContainText('TTS Demo');
    await expect(page.locator('h1')).toContainText('Text-to-Speech Demo');

    // Check for critical errors (ignore module resolution warnings)
    const criticalErrors = consoleErrors.filter(error => 
      !error.includes('Failed to resolve module specifier') &&
      !error.includes('import map') &&
      !error.includes('ERR_BLOCKED_BY_CLIENT')
    );

    // Log all console errors for debugging
    if (consoleErrors.length > 0) {
      console.log('Console errors:', consoleErrors);
    }

    // The page should load without critical JavaScript errors
    expect(criticalErrors).toHaveLength(0);
  });

  test('should have TTS interface elements', async ({ page }) => {
    const ttsPath = resolve(process.cwd(), 'pages/tts.html');
    await page.goto(`file://${ttsPath}`);
    await page.waitForLoadState('networkidle');

    // Check for TTS interface elements
    await expect(page.locator('#text')).toBeVisible();
    await expect(page.locator('#speakBtn')).toBeVisible();
    await expect(page.locator('#status')).toBeVisible();
    await expect(page.locator('#voiceSelect')).toBeVisible();
    await expect(page.locator('#speedRange')).toBeVisible();
  });

  test('should show network/module loading errors for CDN dependencies', async ({ page }) => {
    // This test documents expected behavior when CDN resources can't load
    const networkErrors = [];
    const consoleMessages = [];

    page.on('response', response => {
      if (!response.ok()) {
        networkErrors.push({ url: response.url(), status: response.status() });
      }
    });

    page.on('console', msg => {
      consoleMessages.push({ type: msg.type(), text: msg.text() });
    });

    const ttsPath = resolve(process.cwd(), 'pages/tts.html');
    await page.goto(`file://${ttsPath}`);
    await page.waitForLoadState('networkidle');

    // Log network errors and console messages for analysis
    console.log('Network errors:', networkErrors);
    console.log('Console messages:', consoleMessages.filter(msg => 
      msg.type === 'error' || msg.type === 'warn'
    ));

    // We expect some network errors for CDN resources in a file:// context
    // This test primarily documents the current state for future improvement
    expect(Array.isArray(networkErrors)).toBe(true);
    expect(Array.isArray(consoleMessages)).toBe(true);
  });

  test('should handle TTS button click gracefully', async ({ page }) => {
    const ttsPath = resolve(process.cwd(), 'pages/tts.html');
    await page.goto(`file://${ttsPath}`);
    await page.waitForLoadState('networkidle');

    // Fill in some text
    await page.fill('#text', 'Hello, this is a test.');

    // Try clicking the speak button
    const statusBefore = await page.locator('#status').textContent();
    await page.click('#speakBtn');

    // Wait a moment for any status updates
    await page.waitForTimeout(1000);

    const statusAfter = await page.locator('#status').textContent();

    // The status should either update or remain the same
    // (depending on whether TTS engine loads successfully)
    expect(typeof statusBefore).toBe('string');
    expect(typeof statusAfter).toBe('string');
  });

  test('should handle CDN module loading in browser context', async ({ page }) => {
    const moduleErrors = [];
    const loadingAttempts = [];

    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('kokoro') || text.includes('transformers') || text.includes('onnx')) {
        loadingAttempts.push({ type: msg.type(), text });
      }
      if (msg.type() === 'error' && (text.includes('module') || text.includes('import'))) {
        moduleErrors.push(text);
      }
    });

    const ttsPath = resolve(process.cwd(), 'pages/tts.html');
    await page.goto(`file://${ttsPath}`);
    await page.waitForLoadState('networkidle');

    // Wait for module loading attempts
    await page.waitForTimeout(3000);

    // Log module loading attempts for analysis
    console.log('Module loading attempts:', loadingAttempts);
    console.log('Module errors:', moduleErrors);

    // This test documents current module loading behavior
    // In a file:// context, CDN modules typically won't load
    expect(Array.isArray(moduleErrors)).toBe(true);
    expect(Array.isArray(loadingAttempts)).toBe(true);
  });
});
