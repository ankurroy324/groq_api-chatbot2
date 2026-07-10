import { useState, useEffect, useRef, useCallback } from 'react';

const STORAGE_KEY = 'groq-chatbot-history';

/* ──────────────────────── helpers ──────────────────────── */

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
  } catch {
    /* localStorage can fail in private browsing — not critical */
  }
}

/* ──────────────────────── components ──────────────────────── */

function TypingDots() {
  return (
    <span className="typing-dots">
      <span /><span /><span />
    </span>
  );
}

function Avatar({ role }) {
  const isUser = role === 'user';
  return (
    <div className={`avatar ${isUser ? 'avatar-user' : 'avatar-ai'}`}>
      {isUser ? 'U' : 'AI'}
    </div>
  );
}

function MessageBubble({ role, content, isStreaming, isTyping }) {
  return (
    <div className={`message-row ${role}`}>
      <Avatar role={role} />
      <div className={`bubble ${role === 'user' ? 'bubble-user' : 'bubble-ai'} ${isStreaming ? 'cursor' : ''}`}>
        {isTyping ? <TypingDots /> : content}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <div className="empty-icon">✦</div>
      <h2>Welcome to Groq Chat</h2>
      <p>Lightning-fast AI responses powered by Groq. Start a conversation below.</p>
    </div>
  );
}

function ErrorBanner({ message, onDismiss }) {
  if (!message) return null;
  return (
    <div className="error-banner">
      <span className="error-text">{message}</span>
      <button className="dismiss-btn" onClick={onDismiss} aria-label="Dismiss error">×</button>
    </div>
  );
}

/* ──────────────────────── main app ──────────────────────── */

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

  /* ── persist on every conversation change ── */
  useEffect(() => {
    saveHistory(conversation);
  }, [conversation]);

  /* ── auto-scroll ── */
  const scrollToBottom = useCallback(() => {
    const el = chatWindowRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [conversation, streamingText, scrollToBottom]);

  /* ── textarea auto-grow ── */
  function handleInputChange(e) {
    setInput(e.target.value);
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = `${ta.scrollHeight}px`;
    }
  }

  /* ── clear conversation ── */
  function handleClear() {
    if (isStreaming) return;
    setConversation([]);
    setStreamingText('');
    setError('');
    saveHistory([]);
  }

  /* ── send message + stream response ── */
  async function handleSend(e) {
    if (e) e.preventDefault();

    const text = input.trim();
    if (!text || isStreaming) return;

    setError('');
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    /* optimistic update — add user message */
    const updatedConversation = [...conversation, { role: 'user', content: text }];
    setConversation(updatedConversation);

    setIsTyping(true);
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedConversation }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || `Server error (${response.status})`);
      }

      /* ── read the stream ── */
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
        throw new Error('Received an empty response from the AI. Please try again.');
      }

      /* save completed reply */
      setConversation(prev => [...prev, { role: 'assistant', content: fullText }]);
      setStreamingText('');
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Something went wrong. Please try again.');
        /* roll back: remove the user message we optimistically added if there's no prior assistant reply */
      }
      setStreamingText('');
    } finally {
      setIsStreaming(false);
      setIsTyping(false);
      abortRef.current = null;
    }
  }

  /* ── keyboard: Enter sends, Shift+Enter newline ── */
  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  /* ── determine if we should show the streaming bubble ── */
  const showStreamBubble = isTyping || streamingText;

  return (
    <div className="app">
      {/* background orbs */}
      <div className="bg-orbs" aria-hidden="true">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
      </div>

      {/* header */}
      <header className="header">
        <div className="header-title">
          <div className="header-logo">
            <span className="logo-spark">⚡</span>
          </div>
          <div>
            <h1>Groq Chat</h1>
            <span className="header-subtitle">Lightning-fast AI</span>
          </div>
        </div>
        <button
          className="clear-btn"
          onClick={handleClear}
          disabled={isStreaming || conversation.length === 0}
          title="Clear conversation"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
          </svg>
          Clear
        </button>
      </header>

      {/* chat window */}
      <main className="chat-window" ref={chatWindowRef}>
        {conversation.length === 0 && !showStreamBubble && <EmptyState />}

        {conversation.map((msg, i) => (
          <MessageBubble key={i} role={msg.role} content={msg.content} />
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

      {/* error banner */}
      <ErrorBanner message={error} onDismiss={() => setError('')} />

      {/* input */}
      <footer className="input-area">
        <form className="chat-form" onSubmit={handleSend}>
          <textarea
            ref={textareaRef}
            className="message-input"
            placeholder="Type a message..."
            rows={1}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
            autoComplete="off"
          />
          <button
            type="submit"
            className="send-btn"
            disabled={isStreaming || !input.trim()}
            aria-label="Send message"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
              <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </form>
        <p className="input-hint">
          Press <kbd>Enter</kbd> to send · <kbd>Shift + Enter</kbd> for new line
        </p>
      </footer>
    </div>
  );
}
