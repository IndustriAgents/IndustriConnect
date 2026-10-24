import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChatMessage } from '../types';
import { MCPServer, MCPToolCallResult } from '../types/mcp-types';
import { format } from 'date-fns';
import { useTheme } from './ThemeProvider';
import {
  IconChip,
  IconClose,
  IconHelp,
  IconLogs,
  IconMenu,
  IconMoon,
  IconPlus,
  IconSend,
  IconServer,
  IconSettings,
  IconSun,
  IconTerminal,
  IconUser,
} from './Icons';

/** Width at which the sidebar stops being a grid column — keep in step with
 *  the `max-width: 900px` drawer block in src/styles/app.css. */
const DRAWER_BREAKPOINT = 900;

interface IndustrialUIProps {
  messages: ChatMessage[];
  onSendMessage: (content: string) => Promise<void>;
  isLoading: boolean;
  mcpServers: MCPServer[];
  onMCPConnect: (serverId: string) => void;
  onMCPDisconnect: (serverId: string) => void;
  onOpenSettings: () => void;
  /** "Provider · model", or null when no model has been chosen. */
  modelLabel: string | null;
  isModelReady: boolean;
  onOpenModelSettings: () => void;
}

const statusDot = (status: MCPServer['status']) => {
  if (status === 'connected') return 'dot ok';
  if (status === 'connecting') return 'dot warn';
  if (status === 'error') return 'dot alert';
  return 'dot';
};

const statusLabel = (status: MCPServer['status']) => {
  if (status === 'connected') return 'connected — click to disconnect';
  if (status === 'connecting') return 'connecting';
  if (status === 'error') return 'error — click to retry';
  return 'disconnected — click to connect';
};

/** A tool result as an operator reads it: each text item on its own and JSON
 *  pretty-printed, rather than the MCP envelope stringified with its escapes. */
const formatToolOutput = (result: MCPToolCallResult | undefined): string | null => {
  if (!result) return null;
  const texts = (result.content || [])
    .map((item) => item.text)
    .filter((text): text is string => Boolean(text));
  if (texts.length === 0) {
    if (result.error) return result.error;
    return result.result === undefined ? null : JSON.stringify(result.result, null, 2);
  }
  return texts
    .map((text) => {
      try {
        return JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        return text;
      }
    })
    .join('\n\n');
};

const isFailedCall = (result: MCPToolCallResult | undefined) =>
  Boolean(result?.isError || result?.success === false);

export default function IndustrialUI({
  messages,
  onSendMessage,
  isLoading,
  mcpServers,
  onMCPConnect,
  onMCPDisconnect,
  onOpenSettings,
  modelLabel,
  isModelReady,
  onOpenModelSettings,
}: IndustrialUIProps) {
  const [input, setInput] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const connectedCount = mcpServers.filter((s) => s.status === 'connected').length;
  const modelStatus = isModelReady
    ? `Model: ${modelLabel} — click to change`
    : modelLabel
      ? `${modelLabel} needs an API key — click to add one`
      : 'No model selected — click to choose one';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Grow the composer with its content instead of scrolling a one-line box.
  // Capped in CSS via max-height, which this measurement respects.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    menuButtonRef.current?.focus();
  }, []);

  // Escape closes the drawer, and growing past the breakpoint drops it — a
  // drawer left "open" on a rotated tablet would otherwise pin a stale scrim.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer();
    };
    const onResize = () => {
      if (window.innerWidth > DRAWER_BREAKPOINT) setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [drawerOpen, closeDrawer]);

  const send = () => {
    const content = input.trim();
    if (!content || isLoading) return;
    // Without a model there is nothing to send to; ask for one and keep the
    // draft rather than posting a message that can only come back as an error.
    if (!isModelReady) {
      onOpenModelSettings();
      return;
    }
    onSendMessage(content);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const handleServerClick = (server: MCPServer) => {
    if (server.status === 'connected') {
      onMCPDisconnect(server.id);
    } else {
      onMCPConnect(server.id);
    }
    setDrawerOpen(false);
  };

  const openSettings = () => {
    setDrawerOpen(false);
    onOpenSettings();
  };

  return (
    <div className={`app${drawerOpen ? ' is-drawer-open' : ''}`}>
      {drawerOpen && (
        <button
          type="button"
          className="sb-scrim"
          aria-label="Close navigation"
          onClick={closeDrawer}
        />
      )}

      {/* ── Sidebar / drawer ── */}
      <aside className="sidebar" id="app-sidebar" aria-label="Servers and account">
        <div className="sb-brand">
          <span className="brand-wordmark bw-sb" role="img" aria-label="IndustriAgents">
            <img className="bw-mark" src="/assets/logo-mark.svg" alt="" aria-hidden="true" />
            <span className="bw-name">
              IndustriConnect
              <small className="sb-brand-sub">MCP Manager</small>
            </span>
          </span>
          <button type="button" className="sb-close" onClick={closeDrawer} aria-label="Close navigation">
            <IconClose />
          </button>
        </div>

        <div className="sb-section">
          <span>Active nodes</span>
          <button
            type="button"
            className="sb-section-action"
            onClick={openSettings}
            aria-label="Configure servers"
            title="Configure servers"
          >
            <IconPlus />
          </button>
        </div>

        <nav className="sb-nav">
          {mcpServers.map((server) => (
            <button
              type="button"
              key={server.id}
              onClick={() => handleServerClick(server)}
              className={`sb-link${server.status === 'connected' ? ' is-active' : ''}`}
              title={`${server.name} — ${statusLabel(server.status)}`}
            >
              <IconServer className="sb-ico" />
              <span className="sb-name">{server.name}</span>
              <span className={statusDot(server.status)} />
              <span className="sr-only">{statusLabel(server.status)}</span>
            </button>
          ))}

          {mcpServers.length === 0 && (
            <button type="button" className="sb-empty" onClick={openSettings}>
              No servers configured yet — add one to start talking to a PLC.
            </button>
          )}
        </nav>

        <div className="sb-footer">
          <button type="button" className="sb-foot-link" onClick={openSettings}>
            <IconLogs />
            <span>Server configuration</span>
          </button>
          <a
            className="sb-foot-link"
            href="https://github.com/IndustriAgents/IndustriConnect#readme"
            target="_blank"
            rel="noreferrer noopener"
          >
            <IconHelp />
            <span>Documentation</span>
          </a>

          <div className="sb-user">
            <span className="sb-user-mark">
              <IconUser />
            </span>
            <span className="sb-user-text">
              <b>Operator</b>
              <small>Shift active</small>
            </span>
          </div>
        </div>
      </aside>

      {/* ── Topbar ── */}
      <header className="topbar">
        <div className="tb-left">
          <button
            type="button"
            ref={menuButtonRef}
            className="tb-menu"
            onClick={() => setDrawerOpen((open) => !open)}
            aria-label="Open navigation"
            aria-expanded={drawerOpen}
            aria-controls="app-sidebar"
          >
            <IconMenu />
          </button>
          <p className="tb-crumb">
            IndustriConnect / <b>Console</b>
          </p>
        </div>

        <div className="tb-right">
          <button
            type="button"
            className={`tb-model${isModelReady ? '' : ' is-unset'}`}
            onClick={onOpenModelSettings}
            title={modelStatus}
            aria-label={modelStatus}
          >
            <IconChip />
            <span className="tb-model-text">{modelLabel ?? 'Choose a model'}</span>
          </button>
          {/* On a phone the label is dropped for width, so the count alone is
              left on screen — the full reading has to stay reachable by tooltip
              and by assistive tech, which `display: none` would otherwise cut. */}
          <span
            className={`tb-pill${connectedCount > 0 ? ' is-live' : ''}`}
            title={`${connectedCount} of ${mcpServers.length} nodes connected`}
            aria-label={`${connectedCount} of ${mcpServers.length} nodes connected`}
          >
            <span className="live-dot" />
            <span aria-hidden="true">{connectedCount}</span>
            <span className="pill-text" aria-hidden="true">
              {connectedCount === 1 ? 'node live' : 'nodes live'}
            </span>
          </span>
          <button
            type="button"
            className="tb-icon"
            onClick={toggleTheme}
            aria-label="Toggle light / dark theme"
            title="Toggle light / dark"
          >
            {theme === 'dark' ? <IconSun /> : <IconMoon />}
          </button>
          <button
            type="button"
            className="tb-icon"
            onClick={onOpenSettings}
            aria-label="Server configuration"
            title="Server configuration"
          >
            <IconSettings />
          </button>
        </div>
      </header>

      {/* ── Console ── */}
      <main className="main">
        <div className="transcript">
          <div className="transcript-inner">
            {messages.length === 0 && !isLoading && (
              <div className="console-empty">
                <IconTerminal className="ce-mark" />
                <h2>System ready</h2>
                <p>
                  Connect a node from the sidebar, then ask for a reading, a setpoint, or a
                  status sweep in plain language.
                </p>
                {isModelReady ? (
                  <p className="ce-hint">Awaiting command</p>
                ) : (
                  <button type="button" className="btn" onClick={onOpenModelSettings}>
                    <IconChip />
                    Choose a model
                  </button>
                )}
              </div>
            )}

            {messages.map((msg) => {
              const isOperator = msg.role === 'user';
              return (
                <article
                  key={msg.id}
                  className={`turn ${isOperator ? 'turn--operator' : 'turn--system'}`}
                >
                  <header className="turn-head">
                    <span className="turn-who">{isOperator ? 'Operator' : 'Automation system'}</span>
                    <time className="turn-time" dateTime={new Date(msg.timestamp).toISOString()}>
                      {format(msg.timestamp, 'p')}
                    </time>
                  </header>

                  <div className="turn-body">{msg.content}</div>

                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <ul className="turn-calls">
                      {msg.toolCalls.map((tool) => {
                        const failed = isFailedCall(tool.result);
                        const output = formatToolOutput(tool.result);
                        return (
                          <li key={tool.id} className={failed ? 'is-error' : undefined}>
                            <div className="turn-call-head">
                              <code>{tool.serverName ? `${tool.serverName} / ` : ''}{tool.toolName}</code>
                              <span className="turn-call-outcome">
                                {failed ? 'DENIED / FAILED' : 'OK'}
                              </span>
                            </div>
                            {output && <pre className="turn-call-result">{output}</pre>}
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {msg.error && <p className="turn-error">The request did not complete.</p>}
                </article>
              );
            })}

            {isLoading && (
              <article className="turn turn--system">
                <header className="turn-head">
                  <span className="turn-who">Automation system</span>
                </header>
                <p className="turn-pending" role="status">
                  Processing…
                </p>
              </article>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* ── Composer ── */}
        <div className="composer">
          <div className="composer-inner">
            <div className="composer-field">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type an industrial command or ask for status…"
                aria-label="Command input"
                rows={1}
              />
              <button
                type="button"
                className="composer-send"
                onClick={send}
                disabled={isLoading || !input.trim()}
                aria-label="Send command"
              >
                <IconSend />
              </button>
            </div>
            <p className="composer-note">Enter to dispatch · Shift + Enter for a new line</p>
          </div>
        </div>
      </main>
    </div>
  );
}
