import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import {
  loadChatBackend, saveChatBackend, loadCloudLLMConfig, saveCloudLLMConfig,
  loadOllamaConfig, saveOllamaConfig,
} from '../src/utils/storage';

const values = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
  removeItem: (key: string) => values.delete(key),
}, configurable: true });
beforeEach(() => values.clear());

test('model preferences survive save/reload while keys remain memory-only', () => {
  saveChatBackend('cloud-llm');
  saveCloudLLMConfig({ provider: 'openai', model: 'custom-model', baseUrl: 'http://local.invalid/v1', apiKey: 'secret-never-save' });
  assert.equal(loadChatBackend(), 'cloud-llm');
  assert.deepEqual(loadCloudLLMConfig(), { provider: 'openai', model: 'custom-model', baseUrl: 'http://local.invalid/v1' });
  assert.doesNotMatch(values.get('cloud_llm_config')!, /secret|apiKey/);
  // Repeated lazy reads (React StrictMode) must not overwrite the preference.
  assert.equal(loadCloudLLMConfig()?.model, 'custom-model');
});

test('legacy persisted keys are removed rather than restored into UI state', () => {
  values.set('cloud_llm_config', JSON.stringify({ provider: 'anthropic', model: 'saved-model', apiKey: 'old-secret' }));
  assert.deepEqual(loadCloudLLMConfig(), { provider: 'anthropic', model: 'saved-model' });
  assert.doesNotMatch(values.get('cloud_llm_config')!, /old-secret|apiKey/);
});

for (const config of [null, [], {}, { provider: 'unknown', model: 'model' }, { provider: 'openai', model: 5 },
  { provider: 'openai', model: ' ' }, { provider: 'openai', model: 'model', baseUrl: {} }]) {
  test(`invalid cloud preference is discarded: ${JSON.stringify(config)}`, () => {
    values.set('cloud_llm_config', JSON.stringify(config));
    assert.equal(loadCloudLLMConfig(), null);
    assert.equal(values.has('cloud_llm_config'), false);
  });
}

test('broken JSON preferences fall back safely', () => {
  values.set('cloud_llm_config', '{');
  values.set('ollama_config', '{');
  values.set('chat_backend', 'unsupported');
  assert.equal(loadCloudLLMConfig(), null);
  assert.equal(loadOllamaConfig(), null);
  assert.equal(loadChatBackend(), 'cloud-llm');
});

test('Ollama settings and backend survive reload', () => {
  saveChatBackend('ollama');
  saveOllamaConfig({ model: 'local-model', baseUrl: 'http://localhost:11434' });
  assert.equal(loadChatBackend(), 'ollama');
  assert.deepEqual(loadOllamaConfig(), { model: 'local-model', baseUrl: 'http://localhost:11434' });
});
for (const config of [[], {}, { model: 1, baseUrl: 'url' }, { model: 'valid', baseUrl: 1 }, { model: ' ', baseUrl: 'url' }]) {
  test(`invalid Ollama preference is discarded: ${JSON.stringify(config)}`, () => {
    values.set('ollama_config', JSON.stringify(config));
    assert.equal(loadOllamaConfig(), null);
  });
}
