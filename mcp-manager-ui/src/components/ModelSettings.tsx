import { useCallback, useEffect, useRef, useState } from 'react';
import { ChatBackend, CloudLLMConfig, CloudProvider, OllamaConfig } from '../types';
import {
  CLOUD_MODEL_SUGGESTIONS,
  CLOUD_PROVIDER_LABELS,
  DEFAULT_OLLAMA_URL,
  hasEnvApiKey,
  listOllamaModels,
} from '../utils/llm';
import { IconClose } from './Icons';

interface ModelSettingsProps {
  chatBackend: ChatBackend;
  cloudLLMConfig: CloudLLMConfig | null;
  ollamaConfig: OllamaConfig | null;
  onApply: (
    backend: ChatBackend,
    cloudLLMConfig: CloudLLMConfig | null,
    ollamaConfig: OllamaConfig | null,
  ) => void;
  onClose: () => void;
}

const PROVIDERS: CloudProvider[] = ['openai', 'gemini', 'anthropic'];

const ENV_KEY_NAMES: Record<CloudProvider, string> = {
  openai: 'VITE_OPENAI_API_KEY',
  gemini: 'VITE_GEMINI_API_KEY',
  anthropic: 'VITE_ANTHROPIC_API_KEY',
};

export default function ModelSettings({
  chatBackend,
  cloudLLMConfig,
  ollamaConfig,
  onApply,
  onClose,
}: ModelSettingsProps) {
  const [backend, setBackend] = useState<ChatBackend>(chatBackend);
  const [provider, setProvider] = useState<CloudProvider>(
    cloudLLMConfig?.provider || 'openai',
  );
  // One draft per provider, so flicking between them does not lose a model id
  // or a key typed for another one.
  const [models, setModels] = useState<Record<CloudProvider, string>>(() => ({
    openai: CLOUD_MODEL_SUGGESTIONS.openai[0],
    gemini: CLOUD_MODEL_SUGGESTIONS.gemini[0],
    anthropic: CLOUD_MODEL_SUGGESTIONS.anthropic[0],
    ...(cloudLLMConfig?.model ? { [cloudLLMConfig.provider]: cloudLLMConfig.model } : {}),
  }));
  const [apiKeys, setApiKeys] = useState<Record<CloudProvider, string>>(() => ({
    openai: '',
    gemini: '',
    anthropic: '',
    ...(cloudLLMConfig?.apiKey ? { [cloudLLMConfig.provider]: cloudLLMConfig.apiKey } : {}),
  }));
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState(
    cloudLLMConfig?.provider === 'openai' ? cloudLLMConfig.baseUrl || '' : '',
  );

  const [ollamaUrl, setOllamaUrl] = useState(ollamaConfig?.baseUrl || DEFAULT_OLLAMA_URL);
  const [ollamaModel, setOllamaModel] = useState(ollamaConfig?.model || '');
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaLoading, setOllamaLoading] = useState(false);
  const [ollamaError, setOllamaError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const panelRef = useRef<HTMLFormElement>(null);
  const latestOllamaRequest = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const refreshOllamaModels = useCallback(async (url: string) => {
    const request = ++latestOllamaRequest.current;
    setOllamaLoading(true);
    setOllamaError(null);
    try {
      const names = await listOllamaModels(url || DEFAULT_OLLAMA_URL);
      if (request !== latestOllamaRequest.current) return;
      setOllamaModels(names);
      setOllamaModel((current) => current || names[0] || '');
      if (names.length === 0) {
        setOllamaError('This Ollama server has no models yet. Pull one with `ollama pull <model>`.');
      }
    } catch (error) {
      if (request !== latestOllamaRequest.current) return;
      setOllamaModels([]);
      setOllamaError(
        `Could not reach Ollama at ${url || DEFAULT_OLLAMA_URL}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      if (request === latestOllamaRequest.current) setOllamaLoading(false);
    }
  }, []);

  // List the local models as soon as Ollama is the chosen backend; the URL is
  // re-read on Refresh rather than on every keystroke.
  useEffect(() => {
    if (backend === 'ollama') refreshOllamaModels(ollamaUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend, refreshOllamaModels]);

  const envKey = hasEnvApiKey(provider);

  const apply = (e: React.FormEvent) => {
    e.preventDefault();

    if (backend === 'ollama') {
      const model = ollamaModel.trim();
      if (!model) {
        setFormError('Choose an Ollama model.');
        return;
      }
      onApply(backend, cloudLLMConfig, {
        baseUrl: ollamaUrl.trim() || DEFAULT_OLLAMA_URL,
        model,
      });
      return;
    }

    const model = models[provider].trim();
    const apiKey = apiKeys[provider].trim();
    if (!model) {
      setFormError(`Enter a ${CLOUD_PROVIDER_LABELS[provider]} model id.`);
      return;
    }
    if (!apiKey && !envKey) {
      setFormError(
        `Enter a ${CLOUD_PROVIDER_LABELS[provider]} API key, or set ${ENV_KEY_NAMES[provider]} in .env.`,
      );
      return;
    }
    onApply(
      backend,
      {
        provider,
        model,
        apiKey: apiKey || undefined,
        baseUrl: provider === 'openai' ? openaiBaseUrl.trim() || undefined : undefined,
      },
      ollamaConfig,
    );
  };

  const ollamaHasList = ollamaModels.length > 0;

  return (
    <div
      className="modal-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        className="modal is-narrow"
        role="dialog"
        aria-modal="true"
        aria-labelledby="model-settings-title"
        ref={panelRef}
        tabIndex={-1}
        onSubmit={apply}
      >
        <div className="modal-head">
          <h2 id="model-settings-title">Model</h2>
          <button type="button" className="tb-icon" onClick={onClose} aria-label="Close">
            <IconClose />
          </button>
        </div>

        <div className="modal-toolbar">
          <div className="segmented" role="tablist" aria-label="Where the model runs">
            <button
              type="button"
              role="tab"
              aria-selected={backend === 'cloud-llm'}
              className={`segment${backend === 'cloud-llm' ? ' is-active' : ''}`}
              onClick={() => {
                setBackend('cloud-llm');
                setFormError(null);
              }}
            >
              Cloud
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={backend === 'ollama'}
              className={`segment${backend === 'ollama' ? ' is-active' : ''}`}
              onClick={() => {
                setBackend('ollama');
                setFormError(null);
              }}
            >
              Local · Ollama
            </button>
          </div>
        </div>

        <div className="modal-body">
          {backend === 'cloud-llm' ? (
            <>
              <div className="field">
                <label id="model-provider-label">Provider</label>
                <div className="segmented" role="radiogroup" aria-labelledby="model-provider-label">
                  {PROVIDERS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      role="radio"
                      aria-checked={provider === p}
                      className={`segment${provider === p ? ' is-active' : ''}`}
                      onClick={() => {
                        setProvider(p);
                        setFormError(null);
                      }}
                    >
                      {CLOUD_PROVIDER_LABELS[p]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="field">
                <label htmlFor="model-id">Model</label>
                <input
                  id="model-id"
                  type="text"
                  list="model-id-suggestions"
                  value={models[provider]}
                  onChange={(e) => setModels({ ...models, [provider]: e.target.value })}
                  spellCheck={false}
                  autoComplete="off"
                />
                <datalist id="model-id-suggestions">
                  {CLOUD_MODEL_SUGGESTIONS[provider].map((id) => (
                    <option key={id} value={id} />
                  ))}
                </datalist>
                <p className="field-note">Any model id the provider serves.</p>
              </div>

              <div className="field">
                <label htmlFor="model-api-key">API key</label>
                <input
                  id="model-api-key"
                  type="password"
                  value={apiKeys[provider]}
                  onChange={(e) => setApiKeys({ ...apiKeys, [provider]: e.target.value })}
                  placeholder={envKey ? `Using ${ENV_KEY_NAMES[provider]} from .env` : ''}
                  autoComplete="off"
                />
                <p className="field-note">
                  Kept in memory for this tab only, never saved to the browser. Requests go
                  straight from this page to {CLOUD_PROVIDER_LABELS[provider]}.
                </p>
              </div>

              {provider === 'openai' && (
                <div className="field">
                  <label htmlFor="model-base-url">Base URL — optional</label>
                  <input
                    id="model-base-url"
                    type="text"
                    value={openaiBaseUrl}
                    onChange={(e) => setOpenaiBaseUrl(e.target.value)}
                    placeholder="https://api.openai.com/v1"
                    spellCheck={false}
                  />
                  <p className="field-note">For any server that speaks the OpenAI chat API.</p>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="field">
                <label htmlFor="ollama-url">Ollama URL</label>
                <div className="field-row">
                  <input
                    id="ollama-url"
                    type="text"
                    value={ollamaUrl}
                    onChange={(e) => setOllamaUrl(e.target.value)}
                    placeholder={DEFAULT_OLLAMA_URL}
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    className="btn"
                    onClick={() => refreshOllamaModels(ollamaUrl)}
                    disabled={ollamaLoading}
                  >
                    {ollamaLoading ? 'Loading…' : 'Refresh'}
                  </button>
                </div>
              </div>

              <div className="field">
                <label htmlFor="ollama-model">Model</label>
                {ollamaHasList ? (
                  <select
                    id="ollama-model"
                    value={ollamaModel}
                    onChange={(e) => setOllamaModel(e.target.value)}
                  >
                    {!ollamaModels.includes(ollamaModel) && ollamaModel && (
                      <option value={ollamaModel}>{ollamaModel} (not on this server)</option>
                    )}
                    {ollamaModels.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id="ollama-model"
                    type="text"
                    value={ollamaModel}
                    onChange={(e) => setOllamaModel(e.target.value)}
                    placeholder="qwen3"
                    spellCheck={false}
                  />
                )}
                {ollamaError && <p className="field-error">{ollamaError}</p>}
                <p className="field-note">
                  Tool calling needs a model that supports tools, and enough context for every
                  tool the connected servers offer. A small default context window can cut the
                  tool list short.
                </p>
              </div>
            </>
          )}

          {formError && (
            <p className="field-error" role="alert">
              {formError}
            </p>
          )}
        </div>

        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn is-primary">
            Use this model
          </button>
        </div>
      </form>
    </div>
  );
}
