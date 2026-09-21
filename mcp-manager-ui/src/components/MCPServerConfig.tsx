import { useEffect, useRef, useState } from 'react';
import { MCPServersConfig, MCPServerConfig } from '../types/mcp-types';
import { importCursorConfig, exportCursorConfig } from '../utils/mcp-storage';
import { IconClose, IconDownload, IconPlus, IconUpload } from './Icons';

interface MCPServerConfigProps {
    config: MCPServersConfig;
    onConfigChange: (config: MCPServersConfig) => void;
    onClose: () => void;
}

export default function MCPServerConfigPanel({
    config,
    onConfigChange,
    onClose,
}: MCPServerConfigProps) {
    const [editMode, setEditMode] = useState<'form' | 'json'>('form');
    const [jsonInput, setJsonInput] = useState(exportCursorConfig(config));
    const [jsonError, setJsonError] = useState<string | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const panelRef = useRef<HTMLDivElement>(null);

    // Form state for adding servers
    const [formData, setFormData] = useState<{
        name: string;
        command: string;
        args: string;
        env: string;
    }>({
        name: '',
        command: '',
        args: '',
        env: '',
    });

    // Escape closes the dialog, as in every other modal the operator meets.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        panelRef.current?.focus();
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    // Transient confirmations replace the old alert() calls, which blocked the
    // page and — on the browser-automation path — froze the whole session.
    useEffect(() => {
        if (!notice) return;
        const t = window.setTimeout(() => setNotice(null), 2600);
        return () => window.clearTimeout(t);
    }, [notice]);

    const handleAddServer = () => {
        if (!formData.name.trim() || !formData.command.trim()) {
            setFormError('Server name and command are both required.');
            return;
        }

        let env: Record<string, string> | undefined;
        if (formData.env.trim()) {
            try {
                env = JSON.parse(formData.env);
            } catch {
                setFormError('Environment variables must be a valid JSON object.');
                return;
            }
        }

        const newConfig: MCPServersConfig = {
            ...config,
            mcpServers: { ...config.mcpServers },
        };
        const serverConfig: MCPServerConfig = {
            command: formData.command.trim(),
            args: formData.args.split('\n').filter((a) => a.trim()),
            env,
        };

        newConfig.mcpServers[formData.name.trim()] = serverConfig;
        onConfigChange(newConfig);

        setFormError(null);
        setNotice(`Added ${formData.name.trim()}.`);
        setFormData({ name: '', command: '', args: '', env: '' });
    };

    const handleDeleteServer = (serverName: string) => {
        const newConfig: MCPServersConfig = {
            ...config,
            mcpServers: { ...config.mcpServers },
        };
        delete newConfig.mcpServers[serverName];
        onConfigChange(newConfig);
        setNotice(`Removed ${serverName}.`);
    };

    const handleImportJSON = () => {
        const imported = importCursorConfig(jsonInput);
        if (imported) {
            onConfigChange(imported);
            setJsonError(null);
            setEditMode('form');
            setNotice('Configuration applied.');
        } else {
            setJsonError('That is not a valid mcpServers configuration.');
        }
    };

    const handleExportJSON = async () => {
        const json = exportCursorConfig(config);
        try {
            await navigator.clipboard.writeText(json);
            setNotice('Configuration copied to clipboard.');
        } catch {
            // Clipboard access is refused without a user gesture in some
            // browsers, and over plain HTTP. Show the JSON so it can be copied
            // by hand rather than failing silently.
            setJsonInput(json);
            setEditMode('json');
            setNotice('Clipboard unavailable — copy the JSON below.');
        }
    };

    const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target?.result as string;
            const imported = importCursorConfig(content);
            if (imported) {
                onConfigChange(imported);
                setJsonInput(exportCursorConfig(imported));
                setJsonError(null);
                setNotice(`Imported ${file.name}.`);
            } else {
                setJsonError(`${file.name} is not a valid configuration file.`);
                setEditMode('json');
            }
        };
        reader.readAsText(file);
        // Allow the same file to be picked twice in a row.
        event.target.value = '';
    };

    const serverEntries = Object.entries(config.mcpServers);

    return (
        <div
            className="modal-scrim"
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div
                className="modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="mcp-config-title"
                ref={panelRef}
                tabIndex={-1}
            >
                <div className="modal-head">
                    <h2 id="mcp-config-title">Server configuration</h2>
                    <button type="button" className="tb-icon" onClick={onClose} aria-label="Close">
                        <IconClose />
                    </button>
                </div>

                <div className="modal-toolbar">
                    <div className="segmented" role="tablist" aria-label="Editor mode">
                        <button
                            type="button"
                            role="tab"
                            aria-selected={editMode === 'form'}
                            className={`segment${editMode === 'form' ? ' is-active' : ''}`}
                            onClick={() => setEditMode('form')}
                        >
                            Form
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={editMode === 'json'}
                            className={`segment${editMode === 'json' ? ' is-active' : ''}`}
                            onClick={() => setEditMode('json')}
                        >
                            JSON
                        </button>
                    </div>

                    <div className="spacer" />

                    <button type="button" className="btn" onClick={handleExportJSON}>
                        <IconDownload />
                        Export
                    </button>
                    <label className="btn">
                        <IconUpload />
                        Import
                        <input
                            type="file"
                            accept=".json,application/json"
                            onChange={handleFileImport}
                            className="sr-only"
                        />
                    </label>
                </div>

                <div className="modal-body">
                    {notice && (
                        <p className="field-note" role="status" style={{ marginBottom: 14 }}>
                            {notice}
                        </p>
                    )}

                    {editMode === 'form' ? (
                        <>
                            <section className="modal-section">
                                <h3>Configured servers</h3>
                                {serverEntries.length === 0 ? (
                                    <p className="empty">Nothing configured yet.</p>
                                ) : (
                                    <div className="server-rows">
                                        {serverEntries.map(([name, serverConfig]) => (
                                            <div key={name} className="server-row">
                                                <div className="server-row-text">
                                                    <b>{name}</b>
                                                    <code>
                                                        {serverConfig.command} {serverConfig.args.join(' ')}
                                                    </code>
                                                </div>
                                                <button
                                                    type="button"
                                                    className="row-remove"
                                                    onClick={() => handleDeleteServer(name)}
                                                    aria-label={`Remove ${name}`}
                                                    title={`Remove ${name}`}
                                                >
                                                    <IconClose />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </section>

                            <section className="modal-section">
                                <h3>Add a server</h3>

                                <div className="field">
                                    <label htmlFor="srv-name">
                                        Server name <span className="req">*</span>
                                    </label>
                                    <input
                                        id="srv-name"
                                        type="text"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        placeholder="MQTT MCP (Python)"
                                    />
                                </div>

                                <div className="field">
                                    <label htmlFor="srv-command">
                                        Command <span className="req">*</span>
                                    </label>
                                    <input
                                        id="srv-command"
                                        type="text"
                                        value={formData.command}
                                        onChange={(e) => setFormData({ ...formData, command: e.target.value })}
                                        placeholder="uv"
                                    />
                                </div>

                                <div className="field">
                                    <label htmlFor="srv-args">Arguments — one per line</label>
                                    <textarea
                                        id="srv-args"
                                        value={formData.args}
                                        onChange={(e) => setFormData({ ...formData, args: e.target.value })}
                                        placeholder={'--directory\n/path/to/project\nrun\nmqtt-mcp'}
                                        rows={4}
                                    />
                                </div>

                                <div className="field">
                                    <label htmlFor="srv-env">Environment variables — JSON object</label>
                                    <textarea
                                        id="srv-env"
                                        value={formData.env}
                                        onChange={(e) => setFormData({ ...formData, env: e.target.value })}
                                        placeholder='{"MQTT_BROKER_URL": "mqtt://127.0.0.1:1883"}'
                                        rows={3}
                                    />
                                </div>

                                {formError && (
                                    <p className="field-error" role="alert" style={{ marginBottom: 12 }}>
                                        {formError}
                                    </p>
                                )}

                                <button type="button" className="btn is-primary" onClick={handleAddServer}>
                                    <IconPlus />
                                    Add server
                                </button>
                            </section>
                        </>
                    ) : (
                        <section className="modal-section">
                            <h3>mcpServers JSON — Cursor format</h3>
                            <div className="field">
                                <label htmlFor="srv-json" className="sr-only">
                                    JSON configuration
                                </label>
                                <textarea
                                    id="srv-json"
                                    value={jsonInput}
                                    onChange={(e) => {
                                        setJsonInput(e.target.value);
                                        setJsonError(null);
                                    }}
                                    rows={18}
                                    spellCheck={false}
                                />
                                {jsonError && (
                                    <p className="field-error" role="alert">
                                        {jsonError}
                                    </p>
                                )}
                                <p className="field-note">
                                    Applying replaces the whole server list.
                                </p>
                            </div>
                            <button type="button" className="btn is-primary" onClick={handleImportJSON}>
                                Apply configuration
                            </button>
                        </section>
                    )}
                </div>
            </div>
        </div>
    );
}
