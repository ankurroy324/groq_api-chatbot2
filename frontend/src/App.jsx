import { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

const STORAGE_KEY = 'groq-chatbot-history';

/* ── helpers ── */

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(conversation) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversation));
  } catch { /* silent */ }
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/* ── components ── */

function TypingDots() {
  return (
    <span className="typing-dots" aria-label="Thinking">
      <span /><span /><span />
    </span>
  );
}

function Avatar({ role }) {
  const isUser = role === 'user';
  return (
    <div className={`avatar ${isUser ? 'avatar-user' : 'avatar-ai'}`} aria-hidden="true">
      {isUser ? 'you' : 'ai'}
    </div>
  );
}

function MessageBubble({ role, content, isStreaming, isTyping, timestamp }) {
  const isUser = role === 'user';
  return (
    <div className={`message-row ${role}`}>
      {!isUser && <Avatar role={role} />}
      <div className="bubble-wrapper">
        <div className={`bubble ${isUser ? 'bubble-user' : 'bubble-ai'} ${isStreaming ? 'cursor' : ''}`}>
          {isTyping ? <TypingDots /> : content}
        </div>
        {timestamp && !isTyping && (
          <span className="bubble-meta">{formatTime(timestamp)}</span>
        )}
      </div>
      {isUser && <Avatar role={role} />}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <p className="empty-eyebrow">Groq Chat</p>
      <h2>What's on<br />your mind?</h2>
      <p>Ask anything. Powered by Groq's fast inference — responses stream in as they're generated.</p>
      <div className="empty-divider" />
      <div className="empty-hints">
        <span className="hint-chip">Summarize a long article</span>
        <span className="hint-chip">Debug code or explain an error</span>
        <span className="hint-chip">Brainstorm ideas or draft text</span>
      </div>
    </div>
  );
}

function ErrorBanner({ message, onDismiss }) {
  if (!message) return null;
  return (
    <div className="error-banner" role="alert">
      <span className="error-text">{message}</span>
      <button className="dismiss-btn" onClick={onDismiss} aria-label="Dismiss error">×</button>
    </div>
  );
}

/* ── main app ── */

export default function App() {
  const [conversation, setConversation] = useState(loadHistory);
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState('');
  const [input, setInput] = useState('');

  const chatWindowRef = useRef(null);
  const textareaRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    saveHistory(conversation);
  }, [conversation]);

  const scrollToBottom = useCallback(() => {
    const el = chatWindowRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [conversation, streamingText, scrollToBottom]);

  function handleInputChange(e) {
    setInput(e.target.value);
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = `${ta.scrollHeight}px`;
    }
  }

  function handleClear() {
    if (isStreaming) return;
    setConversation([]);
    setStreamingText('');
    setError('');
    saveHistory([]);
  }

  async function handleSend(e) {
    if (e) e.preventDefault();

    const text = input.trim();
    if (!text || isStreaming) return;

    setError('');
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    const userMsg = { role: 'user', content: text, ts: Date.now() };
    const updatedConversation = [...conversation, userMsg];
    setConversation(updatedConversation);

    setIsTyping(true);
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    // Strip ts field before sending to API
    const apiMessages = updatedConversation.map(({ role, content }) => ({ role, content }));

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || `Server error (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      setIsTyping(false);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        fullText += chunk;
        setStreamingText(fullText);
      }

      if (!fullText.trim()) {
        throw new Error('Received an empty response. Please try again.');
      }

      setConversation(prev => [...prev, { role: 'assistant', content: fullText, ts: Date.now() }]);
      setStreamingText('');
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Something went wrong. Please try again.');
      }
      setStreamingText('');
    } finally {
      setIsStreaming(false);
      setIsTyping(false);
      abortRef.current = null;
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const showStreamBubble = isTyping || streamingText;

  return (
    <div className="app">
      {/* header */}
      <header className="header">
        <div className="header-title">
          <div className="header-logo" aria-hidden="true">
            <div className="logo-mark">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 1L11 6L6 11L1 6L6 1Z" fill="white" />
              </svg>
            </div>
          </div>
          <div>
            <h1>Groq Chat</h1>
          </div>
          <span className="header-subtitle">— fast inference</span>
        </div>
        <button
          className="clear-btn"
          onClick={handleClear}
          disabled={isStreaming || conversation.length === 0}
          title="Clear conversation"
          id="clear-chat-btn"
        >
          New chat
        </button>
      </header>

      {/* chat window */}
      <main className="chat-window" ref={chatWindowRef} id="chat-window">
        {conversation.length === 0 && !showStreamBubble && <EmptyState />}

        {conversation.map((msg, i) => (
          <MessageBubble
            key={i}
            role={msg.role}
            content={msg.content}
            timestamp={msg.ts}
          />
        ))}

        {showStreamBubble && (
          <MessageBubble
            role="assistant"
            content={streamingText}
            isStreaming={!!streamingText}
            isTyping={isTyping}
          />
        )}
      </main>

      {/* error */}
      <ErrorBanner message={error} onDismiss={() => setError('')} />

      {/* input */}
      <footer className="input-area">
        <form className="chat-form" onSubmit={handleSend} id="chat-form">
          <textarea
            ref={textareaRef}
            className="message-input"
            placeholder="Message..."
            rows={1}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
            autoComplete="off"
            id="message-input"
          />
          <button
            type="submit"
            className="send-btn"
            disabled={isStreaming || !input.trim()}
            aria-label="Send message"
            id="send-btn"
          >
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none">
              <path d="M2 8h12M8 2l6 6-6 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </form>
        <p className="input-hint">
          Enter to send · Shift+Enter for newline
        </p>
      </footer>
    </div>
  );
}
