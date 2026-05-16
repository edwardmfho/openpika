import React, { useState, useEffect, useRef } from 'react';
import {
    Menu, X, PanelRight, MessageSquare, Settings, Workflow,
    Send, Paperclip, Zap, ChevronRight, ChevronDown, Check,
    XCircle, Terminal, Globe, FileCode, Bot, User, Loader2,
    MoreVertical, Search, Key, Monitor, Moon, Sun, Plug2,
    Puzzle, Plus, CheckCircle2, Blocks, Database, Upload,
    Code2, Braces, Box
} from 'lucide-react';


// Mock data representing a complex conversation flow
const INITIAL_MESSAGES = [
    {
        id: 1,
        role: 'user',
        content: '/research "Latest advancements in solid-state batteries" and create a summary report.',
        timestamp: '10:00 AM'
    },
    {
        id: 2,
        role: 'agent',
        type: 'reasoning',
        content: 'Analyzing request...',
        details: '1. Intent recognized: Research task.\n2. Keywords: "solid-state batteries", "advancements", "summary report".\n3. Action plan: Search web, extract key data, format into report.',
        isExpanded: false
    },
    {
        id: 3,
        role: 'agent',
        type: 'tool',
        toolName: 'web_search',
        status: 'completed', // running, completed, requires_action
        args: { query: 'latest advancements solid state batteries 2024' },
        result: 'Found 15 relevant articles. Key trends identified: Samsung SDI timeline, QuantumScape density metrics, Toyota patents.',
    },
    {
        id: 4,
        role: 'agent',
        type: 'tool',
        toolName: 'write_file',
        status: 'requires_action',
        args: { filename: 'battery_report_v1.md', content: '# Solid State Battery Report\n\n## Key Findings\n...' },
    },
];

const SKILLS = [
    { name: 'research', description: 'Deep dive into a topic using web search and synthesis.' },
    { name: 'summarize', description: 'Condense long text or files into key bullet points.' },
    { name: 'translate', description: 'Translate text between languages.' },
    { name: 'code_review', description: 'Analyze code for bugs and stylistic issues.' }
];


const ToolCard = ({ tool, onApprove, onReject }) => {
    const [expanded, setExpanded] = useState(false);

    const getIcon = () => {
        switch (tool.toolName) {
            case 'web_search': return <Globe className="w-4 h-4" />;
            case 'write_file': return <FileCode className="w-4 h-4" />;
            default: return <Terminal className="w-4 h-4" />;
        }
    };

    return (
        <div className="my-2 border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden bg-white dark:bg-zinc-800 shadow-sm max-w-2xl">
            <div
                className="flex items-center justify-between p-3 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors"
                onClick={() => setExpanded(!expanded)}
            >
                <div className="flex items-center gap-3">
                    <div className={`p-1.5 rounded-md ${tool.status === 'running' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300'}`}>
                        {tool.status === 'running' ? <Loader2 className="w-4 h-4 animate-spin" /> : getIcon()}
                    </div>
                    <div>
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                            {tool.toolName}
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                            {tool.status === 'requires_action' ? 'Requires Approval' : tool.status === 'running' ? 'Processing...' : 'Completed successfully'}
                        </p>
                    </div>
                </div>
                {expanded ? <ChevronDown className="w-4 h-4 text-zinc-400" /> : <ChevronRight className="w-4 h-4 text-zinc-400" />}
            </div>

            {expanded && (
                <div className="p-3 bg-zinc-50 dark:bg-zinc-900/50 border-t border-zinc-200 dark:border-zinc-700 font-mono text-xs overflow-x-auto">
                    <span className="text-zinc-500">Args:</span>
                    <pre className="mt-1 text-zinc-800 dark:text-zinc-300">{JSON.stringify(tool.args, null, 2)}</pre>
                    {tool.result && (
                        <>
                            <span className="text-zinc-500 block mt-2">Result:</span>
                            <pre className="mt-1 text-green-600 dark:text-green-400">{tool.result}</pre>
                        </>
                    )}
                </div>
            )}

            {tool.status === 'requires_action' && (
                <div className="p-3 border-t border-zinc-200 dark:border-zinc-700 flex gap-2 bg-yellow-50/50 dark:bg-yellow-900/10">
                    <button
                        onClick={onApprove}
                        className="flex-1 flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100 py-1.5 rounded-md text-sm font-medium transition-colors"
                    >
                        <Check className="w-4 h-4" /> Approve
                    </button>
                    <button
                        onClick={onReject}
                        className="flex-1 flex items-center justify-center gap-2 bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 py-1.5 rounded-md text-sm font-medium transition-colors"
                    >
                        <XCircle className="w-4 h-4" /> Reject
                    </button>
                </div>
            )}
        </div>
    );
};

const ReasoningBlock = ({ content, details }) => {
    const [expanded, setExpanded] = useState(false);
    return (
        <div className="my-2 max-w-2xl">
            <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-2 text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300 transition-colors"
            >
                {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                <BrainIcon className="w-3 h-3" />
                {content}
            </button>
            {expanded && (
                <div className="mt-2 p-3 pl-4 border-l-2 border-zinc-200 dark:border-zinc-700 text-sm text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap">
                    {details}
                </div>
            )}
        </div>
    );
};

const BrainIcon = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z" />
        <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z" />
    </svg>
);

const GenUITable = () => (
    <div className="my-4 border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden max-w-2xl bg-white dark:bg-zinc-800 shadow-sm">
        <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Competitor Analysis</h4>
            <button className="text-xs text-blue-600 hover:text-blue-700 font-medium">Export CSV</button>
        </div>
        <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
                <thead className="text-xs text-zinc-500 uppercase bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-700">
                    <tr>
                        <th className="px-4 py-2">Company</th>
                        <th className="px-4 py-2">Tech Type</th>
                        <th className="px-4 py-2">Target Prod Year</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
                    <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-700/50">
                        <td className="px-4 py-2 font-medium">QuantumScape</td>
                        <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">Lithium-metal</td>
                        <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">2025</td>
                    </tr>
                    <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-700/50">
                        <td className="px-4 py-2 font-medium">Solid Power</td>
                        <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">Sulfide-based</td>
                        <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">2026</td>
                    </tr>
                    <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-700/50">
                        <td className="px-4 py-2 font-medium">Toyota</td>
                        <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">Sulfide-based</td>
                        <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">2027</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
);


const ChatMessage = ({ message, onApproveTool }) => {
    if (message.type === 'tool') {
        return (
            <div className="flex gap-4 mb-6">
                <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
                </div>
                <div className="flex-1">
                    <ToolCard
                        tool={message}
                        onApprove={() => onApproveTool(message.id)}
                        onReject={() => console.log('Rejected')}
                    />
                </div>
            </div>
        );
    }

    if (message.type === 'reasoning') {
        return (
            <div className="flex gap-4 mb-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 opacity-0">
                    {/* Spacer */}
                </div>
                <div className="flex-1">
                    <ReasoningBlock content={message.content} details={message.details} />
                </div>
            </div>
        );
    }

    if (message.type === 'genui_table') {
        return (
            <div className="flex gap-4 mb-6">
                <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
                </div>
                <div className="flex-1">
                    <p className="text-zinc-800 dark:text-zinc-200 mb-2">{message.content}</p>
                    <GenUITable />
                </div>
            </div>
        );
    }

    const isUser = message.role === 'user';

    return (
        <div className={`flex gap-4 mb-6 ${isUser ? 'flex-row-reverse' : ''}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isUser ? 'bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900' : 'bg-zinc-100 dark:bg-zinc-800'}`}>
                {isUser ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />}
            </div>
            <div className={`max-w-[80%] md:max-w-2xl ${isUser ? 'bg-zinc-100 dark:bg-zinc-800 px-4 py-3 rounded-2xl rounded-tr-sm' : 'pt-1'}`}>
                <p className={`text-[15px] leading-relaxed ${isUser ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-800 dark:text-zinc-200'}`}>
                    {message.content}
                </p>
            </div>
        </div>
    );
};


const ChannelsView = () => (
    <div className="p-8 max-w-5xl mx-auto w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="mb-8">
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">Gateway & Channels</h2>
            <p className="text-zinc-500 dark:text-zinc-400 mt-1">Connect your agent to external platforms.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
            {['Telegram', 'Slack', 'Discord', 'WhatsApp (Meta)'].map((platform) => (
                <div key={platform} className="p-5 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 hover:shadow-md transition-shadow cursor-pointer flex flex-col items-start gap-4">
                    <div className="w-12 h-12 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                        <Plug2 className="w-6 h-6 text-zinc-600 dark:text-zinc-400" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-zinc-900 dark:text-white">{platform}</h3>
                        <p className="text-sm text-zinc-500 mt-1">Setup webhook & token</p>
                    </div>
                </div>
            ))}
        </div>

        <div className="mb-6">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">Active Cross-Channel Sessions</h3>
            <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden bg-white dark:bg-zinc-900">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-zinc-500 uppercase bg-zinc-50 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-800">
                        <tr>
                            <th className="px-6 py-3">User / ID</th>
                            <th className="px-6 py-3">Platform</th>
                            <th className="px-6 py-3">Status</th>
                            <th className="px-6 py-3 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                        <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                            <td className="px-6 py-4 font-medium">@alex_dev</td>
                            <td className="px-6 py-4 text-zinc-500">Telegram</td>
                            <td className="px-6 py-4"><span className="inline-flex items-center gap-1.5 py-1 px-2 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"><span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>Active</span></td>
                            <td className="px-6 py-4 text-right">
                                <button className="text-sm font-medium text-blue-600 hover:text-blue-700">Take Over</button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
);

const SettingsView = () => (
    <div className="p-8 max-w-3xl mx-auto w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="mb-8">
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">Settings</h2>
            <p className="text-zinc-500 dark:text-zinc-400 mt-1">Configure your OpenPika preferences.</p>
        </div>

        <div className="space-y-8">
            {/* Models Section */}
            <section>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-white flex items-center gap-2 mb-4">
                    <BrainIcon className="w-4 h-4" /> Default Model
                </h3>
                <select className="w-full max-w-md p-2.5 bg-white border border-zinc-200 rounded-lg text-sm focus:ring-2 focus:ring-zinc-900 outline-none dark:bg-zinc-900 dark:border-zinc-700 dark:text-white">
                    <option>GPT-4o (OpenAI)</option>
                    <option>Claude 3.5 Sonnet (Anthropic)</option>
                    <option>Gemini 1.5 Pro (Google)</option>
                    <option>Local (Ollama)</option>
                </select>
            </section>

            {/* API Keys Section */}
            <section>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-white flex items-center gap-2 mb-4">
                    <Key className="w-4 h-4" /> API Keys (Keychain-backed)
                </h3>
                <div className="space-y-3">
                    {['OpenAI', 'Anthropic', 'Tavily Search'].map((svc) => (
                        <div key={svc} className="flex items-center justify-between p-3 border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900">
                            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{svc}</span>
                            <div className="flex items-center gap-3">
                                <span className="text-xs text-zinc-400 font-mono">sk-••••••••••••</span>
                                <button className="text-xs font-medium text-blue-600 hover:text-blue-700">Update</button>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* UI Toggles */}
            <section>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-white flex items-center gap-2 mb-4">
                    <Monitor className="w-4 h-4" /> Interface
                </h3>
                <div className="space-y-4">
                    <label className="flex items-center justify-between">
                        <span className="text-sm text-zinc-700 dark:text-zinc-300">Streaming text generation</span>
                        <input type="checkbox" defaultChecked className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900" />
                    </label>
                    <label className="flex items-center justify-between">
                        <span className="text-sm text-zinc-700 dark:text-zinc-300">Dark Mode</span>
                        <input type="checkbox" defaultChecked className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900" />
                    </label>
                </div>
            </section>
        </div>
    </div>
);

const ToolsView = () => {
    const [tools, setTools] = useState([
        { id: 'web_search', name: 'Web Search', provider: 'Built-in', description: 'Search the internet for real-time information.', installed: true, icon: Globe },
        { id: 'file_sys', name: 'File System', provider: 'Built-in', description: 'Read and write to the local file system.', installed: true, icon: FileCode },
        { id: 'github', name: 'GitHub Integration', provider: 'Community', description: 'Create PRs, review code, and manage issues.', installed: false, icon: Terminal },
        { id: 'notion', name: 'Notion Workspace', provider: 'Official', description: 'Read and write to Notion pages and databases.', installed: false, icon: Blocks },
        { id: 'sql', name: 'SQL Database', provider: 'Official', description: 'Query PostgreSQL and MySQL databases securely.', installed: false, icon: Database }
    ]);

    const [showCustomModal, setShowCustomModal] = useState(false);
    const [customToolTab, setCustomToolTab] = useState('mcp'); // mcp, openapi, npm

    const toggleInstall = (id) => {
        // In a real app, this would trigger an API call to install/uninstall
        setTools(tools.map(t => t.id === id ? { ...t, installed: !t.installed } : t));
    };

    return (
        <div className="p-8 max-w-5xl mx-auto w-full animate-in fade-in slide-in-from-bottom-4 duration-500 relative">
            <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">Tools & Skills Registry</h2>
                    <p className="text-zinc-500 dark:text-zinc-400 mt-1">Browse and install new capabilities for your OpenPika agents.</p>
                </div>
                <button
                    onClick={() => setShowCustomModal(true)}
                    className="flex items-center gap-2 bg-white border border-zinc-200 text-zinc-900 hover:bg-zinc-50 dark:bg-zinc-900 dark:border-zinc-700 dark:text-white dark:hover:bg-zinc-800 px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
                >
                    <Plus className="w-4 h-4" /> Add Custom Tool
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {tools.map((tool) => {
                    const Icon = tool.icon;
                    return (
                        <div key={tool.id} className="flex flex-col border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 overflow-hidden hover:shadow-md transition-shadow">
                            <div className="p-5 flex-1">
                                <div className="flex items-start justify-between mb-3">
                                    <div className="w-10 h-10 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                                        <Icon className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
                                    </div>
                                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 rounded">
                                        {tool.provider}
                                    </span>
                                </div>
                                <h3 className="font-semibold text-zinc-900 dark:text-white mb-1">{tool.name}</h3>
                                <p className="text-sm text-zinc-500 dark:text-zinc-400 line-clamp-2">{tool.description}</p>
                            </div>
                            <div className="px-5 py-3 bg-zinc-50 dark:bg-zinc-900/50 border-t border-zinc-200 dark:border-zinc-800">
                                {tool.installed ? (
                                    <div className="flex items-center justify-between">
                                        <span className="flex items-center gap-1.5 text-sm font-medium text-green-600 dark:text-green-500">
                                            <CheckCircle2 className="w-4 h-4" /> Installed
                                        </span>
                                        <button
                                            onClick={() => toggleInstall(tool.id)}
                                            className="text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                                        >
                                            Uninstall
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => toggleInstall(tool.id)}
                                        className="w-full flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white py-1.5 rounded-md text-sm font-medium transition-colors"
                                    >
                                        <Plus className="w-4 h-4" /> Install Tool
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Add Custom Tool Modal */}
            {showCustomModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Add Custom Capability</h3>
                            <button onClick={() => setShowCustomModal(false)} className="text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="flex border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
                            <button onClick={() => setCustomToolTab('mcp')} className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center justify-center gap-2 ${customToolTab === 'mcp' ? 'border-zinc-900 text-zinc-900 dark:border-white dark:text-white bg-white dark:bg-zinc-800' : 'border-transparent text-zinc-500 hover:text-zinc-700'}`}>
                                <Box className="w-4 h-4" /> MCP Server <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full ml-1 dark:bg-blue-900/30 dark:text-blue-400">Standard</span>
                            </button>
                            <button onClick={() => setCustomToolTab('openapi')} className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center justify-center gap-2 ${customToolTab === 'openapi' ? 'border-zinc-900 text-zinc-900 dark:border-white dark:text-white bg-white dark:bg-zinc-800' : 'border-transparent text-zinc-500 hover:text-zinc-700'}`}>
                                <Braces className="w-4 h-4" /> OpenAPI Spec
                            </button>
                            <button onClick={() => setCustomToolTab('npm')} className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center justify-center gap-2 ${customToolTab === 'npm' ? 'border-zinc-900 text-zinc-900 dark:border-white dark:text-white bg-white dark:bg-zinc-800' : 'border-transparent text-zinc-500 hover:text-zinc-700'}`}>
                                <Code2 className="w-4 h-4" /> Local Script
                            </button>
                        </div>

                        <div className="p-6 bg-white dark:bg-zinc-900 min-h-[250px]">
                            {customToolTab === 'mcp' && (
                                <div className="space-y-4 animate-in fade-in">
                                    <p className="text-sm text-zinc-600 dark:text-zinc-400">Connect to a local or remote Model Context Protocol (MCP) server. OpenPika supports execution via <code className="bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded text-xs">npx</code>, <code className="bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded text-xs">uvx</code>, or Docker.</p>
                                    <div>
                                        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Server Command</label>
                                        <input type="text" placeholder="e.g. npx -y @modelcontextprotocol/server-postgres" className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:ring-2 focus:ring-zinc-900 outline-none dark:bg-zinc-950 dark:border-zinc-700 dark:text-white font-mono" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Environment Variables (Optional)</label>
                                        <textarea placeholder="DATABASE_URL=postgres://user:pass@localhost/db" rows={2} className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:ring-2 focus:ring-zinc-900 outline-none dark:bg-zinc-950 dark:border-zinc-700 dark:text-white font-mono resize-none" />
                                    </div>
                                </div>
                            )}

                            {customToolTab === 'openapi' && (
                                <div className="space-y-4 animate-in fade-in">
                                    <p className="text-sm text-zinc-600 dark:text-zinc-400">Provide an OpenAPI/Swagger schema to automatically generate tools for external REST APIs.</p>
                                    <div>
                                        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Schema URL</label>
                                        <input type="text" placeholder="https://api.example.com/openapi.json" className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:ring-2 focus:ring-zinc-900 outline-none dark:bg-zinc-950 dark:border-zinc-700 dark:text-white" />
                                    </div>
                                    <div className="relative my-4">
                                        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-zinc-200 dark:border-zinc-800"></div></div>
                                        <div className="relative flex justify-center text-sm"><span className="px-2 bg-white dark:bg-zinc-900 text-zinc-500">OR</span></div>
                                    </div>
                                    <button className="w-full border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg p-6 flex flex-col items-center justify-center text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                                        <Upload className="w-6 h-6 mb-2" />
                                        <span className="text-sm font-medium">Upload .json or .yaml schema file</span>
                                    </button>
                                </div>
                            )}

                            {customToolTab === 'npm' && (
                                <div className="space-y-4 animate-in fade-in">
                                    <p className="text-sm text-zinc-600 dark:text-zinc-400">Upload a standalone JavaScript or Python script that exposes an executable function.</p>
                                    <button className="w-full border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg p-8 flex flex-col items-center justify-center text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                                        <Code2 className="w-8 h-8 mb-3 text-zinc-400" />
                                        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-200">Drag and drop your script here</span>
                                        <span className="text-xs text-zinc-400 mt-1">Supports .js, .ts, .py</span>
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 flex justify-end gap-3">
                            <button onClick={() => setShowCustomModal(false)} className="px-4 py-2 text-sm font-medium text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white transition-colors">Cancel</button>
                            <button className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100 rounded-lg text-sm font-medium transition-colors">Connect Tool</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default function App() {
    const [activeTab, setActiveTab] = useState('chat'); // 'chat', 'channels', 'settings', 'tools'
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [rightPanelOpen, setRightPanelOpen] = useState(false);

    const [messages, setMessages] = useState(INITIAL_MESSAGES);
    const [inputValue, setInputValue] = useState('');
    const [showSlashCommands, setShowSlashCommands] = useState(false);
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        if (activeTab === 'chat') {
            scrollToBottom();
        }
    }, [messages, activeTab]);

    // Handle Slash Command Logic
    const handleInputChange = (e) => {
        const val = e.target.value;
        setInputValue(val);
        if (val.startsWith('/') && val.length < 15) {
            setShowSlashCommands(true);
        } else {
            setShowSlashCommands(false);
        }
    };

    const insertCommand = (cmd) => {
        setInputValue(`/${cmd} `);
        setShowSlashCommands(false);
        document.getElementById('chat-input').focus();
    };

    // Simulate handling a tool approval
    const handleApproveTool = (msgId) => {
        setMessages(prev => prev.map(m => {
            if (m.id === msgId) {
                return { ...m, status: 'running' };
            }
            return m;
        }));

        // Simulate tool completion and next step
        setTimeout(() => {
            setMessages(prev => prev.map(m => {
                if (m.id === msgId) {
                    return { ...m, status: 'completed', result: 'Successfully saved battery_report_v1.md' };
                }
                return m;
            }));

            setTimeout(() => {
                setMessages(prev => [...prev, {
                    id: Date.now(),
                    role: 'agent',
                    type: 'genui_table',
                    content: "I've completed the research and saved the report. Here is a summary of the competitor timelines identified:"
                }]);
            }, 800);
        }, 1500);
    };

    const handleSend = () => {
        if (!inputValue.trim()) return;
        const newMsg = {
            id: Date.now(),
            role: 'user',
            content: inputValue,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setMessages(prev => [...prev, newMsg]);
        setInputValue('');
        setShowSlashCommands(false);
    };

    return (
        <div className="flex h-screen w-full bg-zinc-50 dark:bg-zinc-950 font-sans text-zinc-900 dark:text-zinc-100 overflow-hidden transition-colors duration-200">

            {/* Left Sidebar (Navigation) */}
            <div className={`
        fixed md:relative z-20 h-full w-64 bg-zinc-100 dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 flex flex-col
        transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
                <div className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold text-lg tracking-tight">
                        <div className="w-6 h-6 bg-zinc-900 dark:bg-white rounded flex items-center justify-center">
                            <Zap className="w-4 h-4 text-white dark:text-zinc-900" />
                        </div>
                        OpenPika
                    </div>
                    <button onClick={() => setSidebarOpen(false)} className="md:hidden text-zinc-500 hover:text-zinc-800">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto py-2">
                    {/* Main Nav */}
                    <nav className="px-2 space-y-1 mb-8">
                        <button
                            onClick={() => setActiveTab('chat')}
                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'chat' ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-white' : 'text-zinc-600 hover:bg-zinc-200/50 dark:text-zinc-400 dark:hover:bg-zinc-800/50'}`}
                        >
                            <MessageSquare className="w-4 h-4" /> New Session
                        </button>
                        <button
                            onClick={() => setActiveTab('channels')}
                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'channels' ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-white' : 'text-zinc-600 hover:bg-zinc-200/50 dark:text-zinc-400 dark:hover:bg-zinc-800/50'}`}
                        >
                            <Workflow className="w-4 h-4" /> Channels
                        </button>
                        <button
                            onClick={() => setActiveTab('tools')}
                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'tools' ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-white' : 'text-zinc-600 hover:bg-zinc-200/50 dark:text-zinc-400 dark:hover:bg-zinc-800/50'}`}
                        >
                            <Puzzle className="w-4 h-4" /> Tools & Skills
                        </button>
                    </nav>

                    {/* Session History (Mock) */}
                    <div className="px-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Today</div>
                    <div className="px-2 space-y-0.5">
                        <button className="w-full text-left px-3 py-2 rounded-lg text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 truncate">
                            Battery Research Report
                        </button>
                        <button className="w-full text-left px-3 py-2 rounded-lg text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 truncate">
                            Code Review: Auth Module
                        </button>
                    </div>
                </div>

                <div className="p-4 border-t border-zinc-200 dark:border-zinc-800">
                    <button
                        onClick={() => setActiveTab('settings')}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'settings' ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-white' : 'text-zinc-600 hover:bg-zinc-200/50 dark:text-zinc-400 dark:hover:bg-zinc-800/50'}`}
                    >
                        <Settings className="w-4 h-4" /> Settings
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-[#111113]">
                {/* Top Header */}
                <header className="h-14 border-b border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between px-4">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setSidebarOpen(true)} className="md:hidden p-2 -ml-2 text-zinc-500 hover:text-zinc-900">
                            <Menu className="w-5 h-5" />
                        </button>

                        {activeTab === 'chat' && (
                            <div className="flex items-center gap-2 text-sm font-medium text-zinc-600 dark:text-zinc-300 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 px-2 py-1 rounded-md transition-colors">
                                GPT-4o <ChevronDown className="w-3 h-3" />
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        {activeTab === 'chat' && (
                            <button
                                onClick={() => setRightPanelOpen(!rightPanelOpen)}
                                className={`p-2 rounded-md transition-colors ${rightPanelOpen ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-white' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                            >
                                <PanelRight className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                </header>

                {/* Dynamic Main Content View */}
                <main className="flex-1 overflow-y-auto relative">
                    {activeTab === 'channels' && <ChannelsView />}
                    {activeTab === 'settings' && <SettingsView />}
                    {activeTab === 'tools' && <ToolsView />}

                    {/* Chat Interface */}
                    {activeTab === 'chat' && (
                        <div className="max-w-4xl mx-auto w-full px-4 py-8 pb-32">
                            {messages.map((msg) => (
                                <ChatMessage key={msg.id} message={msg} onApproveTool={handleApproveTool} />
                            ))}
                            <div ref={messagesEndRef} />
                        </div>
                    )}
                </main>

                {/* Chat Input Area */}
                {activeTab === 'chat' && (
                    <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-white via-white to-transparent dark:from-[#111113] dark:via-[#111113] pointer-events-none">
                        <div className="max-w-4xl mx-auto w-full relative pointer-events-auto">

                            {/* Slash Command Picker */}
                            {showSlashCommands && (
                                <div className="absolute bottom-full mb-2 left-0 w-64 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-lg overflow-hidden animate-in fade-in slide-in-from-bottom-2">
                                    <div className="px-3 py-2 text-xs font-semibold text-zinc-500 border-b border-zinc-100 dark:border-zinc-700">Available Skills</div>
                                    <div className="max-h-48 overflow-y-auto py-1">
                                        {SKILLS.map(skill => (
                                            <button
                                                key={skill.name}
                                                onClick={() => insertCommand(skill.name)}
                                                className="w-full text-left px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-700 flex flex-col"
                                            >
                                                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">/{skill.name}</span>
                                                <span className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{skill.description}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Input Box */}
                            <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-sm focus-within:ring-2 focus-within:ring-zinc-200 dark:focus-within:ring-zinc-700 transition-shadow">
                                {/* Pinned Toolbar (Section 2) */}
                                <div className="flex items-center gap-1 p-2 pb-0">
                                    <button onClick={() => insertCommand('research')} className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 rounded hover:bg-zinc-200 transition-colors flex items-center gap-1">
                                        <Search className="w-3 h-3" /> Research
                                    </button>
                                    <button onClick={() => insertCommand('summarize')} className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 rounded hover:bg-zinc-200 transition-colors flex items-center gap-1">
                                        <FileCode className="w-3 h-3" /> Summarize
                                    </button>
                                </div>

                                <div className="flex items-end gap-2 p-2">
                                    <button className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors rounded-lg">
                                        <Paperclip className="w-5 h-5" />
                                    </button>
                                    <textarea
                                        id="chat-input"
                                        value={inputValue}
                                        onChange={handleInputChange}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
                                        }}
                                        placeholder="Type a message or '/' for skills..."
                                        className="flex-1 max-h-32 min-h-[44px] py-3 bg-transparent border-none resize-none focus:ring-0 text-[15px] placeholder:text-zinc-400 outline-none"
                                        rows={1}
                                    />
                                    <button
                                        onClick={handleSend}
                                        disabled={!inputValue.trim()}
                                        className="p-2 mb-1 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
                                    >
                                        <Send className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            <div className="text-center mt-2 text-xs text-zinc-400">
                                OpenPika v1.0
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Right Panel (Context) */}
            {activeTab === 'chat' && rightPanelOpen && (
                <div className="w-80 border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col animate-in slide-in-from-right-4 duration-300 z-10">
                    <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                        <h3 className="font-semibold text-sm">Session Context</h3>
                        <button onClick={() => setRightPanelOpen(false)} className="text-zinc-400 hover:text-zinc-600">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="p-4 flex-1 overflow-y-auto text-sm space-y-6">
                        <div>
                            <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Active Skills</h4>
                            <div className="flex flex-wrap gap-2">
                                <span className="px-2 py-1 bg-zinc-100 dark:bg-zinc-800 rounded-md text-zinc-700 dark:text-zinc-300 text-xs font-medium">web_search</span>
                                <span className="px-2 py-1 bg-zinc-100 dark:bg-zinc-800 rounded-md text-zinc-700 dark:text-zinc-300 text-xs font-medium">write_file</span>
                            </div>
                        </div>
                        <div>
                            <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">System Instructions</h4>
                            <p className="text-zinc-600 dark:text-zinc-400 text-xs leading-relaxed bg-zinc-50 dark:bg-zinc-800/50 p-3 rounded-lg border border-zinc-200 dark:border-zinc-700/50">
                                You are a helpful research assistant. Prefer using web search to verify facts before answering. Output structured data using tables when comparing items.
                            </p>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}