import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { MessageCircle, X, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ReactMarkdown from 'react-markdown';

export default function AIAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const messagesEndRef = useRef(null);
  const [position, setPosition] = useState({ bottom: 24, right: 24 });
  const dragRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, initialBottom: 24, initialRight: 24 });

  useEffect(() => {
    const initializeConversation = async () => {
      try {
        const conv = await base44.agents.createConversation({
          agent_name: 'appAssistant',
          metadata: {
            name: 'App Assistant',
            description: 'Help with app navigation and questions'
          }
        });
        setConversation(conv);
        setInitialized(true);
      } catch (error) {
        console.error('Failed to initialize assistant:', error);
        setInitialized(true);
      }
    };

    if (!initialized) {
      initializeConversation();
    }
  }, [initialized]);

  useEffect(() => {
    if (conversation) {
      const unsubscribe = base44.agents.subscribeToConversation(conversation.id, (data) => {
        setMessages(data.messages || []);
      });
      return unsubscribe;
    }
  }, [conversation?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleMouseDown = (e) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      initialBottom: position.bottom,
      initialRight: position.right
    };
  };

  const handleTouchStart = (e) => {
    const touch = e.touches[0];
    setIsDragging(true);
    dragStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      initialBottom: position.bottom,
      initialRight: position.right
    };
  };

  const handleTouchMove = (e) => {
    if (!isDragging) return;
    e.preventDefault();
    const touch = e.touches[0];
    const deltaX = touch.clientX - dragStartRef.current.x;
    const deltaY = touch.clientY - dragStartRef.current.y;
    setPosition({
      bottom: Math.max(0, dragStartRef.current.initialBottom - deltaY),
      right: Math.max(0, dragStartRef.current.initialRight - deltaX)
    });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const deltaX = e.clientX - dragStartRef.current.x;
    const deltaY = e.clientY - dragStartRef.current.y;
    setPosition({
      bottom: Math.max(0, dragStartRef.current.initialBottom - deltaY),
      right: Math.max(0, dragStartRef.current.initialRight - deltaX)
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchmove', handleTouchMove, { passive: false });
      document.addEventListener('touchend', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleMouseUp);
      };
    }
  }, [isDragging, position]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || !conversation || loading) return;

    const userMessage = input.trim();
    setInput('');
    setLoading(true);

    try {
      await base44.agents.addMessage(conversation, {
        role: 'user',
        content: userMessage
      });
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!initialized) {
    return null;
  }

  return (
    <>
      {/* Chat Button */}
      <button
        ref={dragRef}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onClick={() => !isDragging && setIsOpen(!isOpen)}
        style={{
          position: 'fixed',
          bottom: `${position.bottom}px`,
          right: `${position.right}px`,
          cursor: isDragging ? 'grabbing' : 'grab'
        }}
        className="w-14 h-14 rounded-full bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] flex items-center justify-center shadow-lg transition-all duration-200 z-40"
        title="Open AI Assistant (drag to move)"
        aria-label="Open AI Assistant"
      >
        {isOpen ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div style={{
          position: 'fixed',
          bottom: `${position.bottom + 72}px`,
          right: `${position.right}px`
        }} className="w-96 max-w-[calc(100vw-24px)] h-[500px] bg-[#141f3d] border border-[rgba(212,168,67,0.3)] rounded-xl shadow-2xl flex flex-col z-40">
          {/* Header */}
          <div className="bg-[#0a1128] border-b border-[rgba(212,168,67,0.2)] px-4 py-3 flex items-center justify-between rounded-t-xl">
            <div>
              <h3 className="text-[#d4a843] font-semibold text-sm">App Assistant</h3>
              <p className="text-xs text-slate-400">Ask questions about the app</p>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-white transition-colors"
              aria-label="Close assistant"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-[#0a1128]/50">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <MessageCircle className="w-8 h-8 text-slate-600 mb-2" />
                <p className="text-xs text-slate-500">Hi! How can I help you navigate Shepherd Shield?</p>
              </div>
            ) : (
              <>
                {messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg px-3 py-2 text-xs ${
                        msg.role === 'user'
                          ? 'bg-[#d4a843] text-[#0a1128]'
                          : 'bg-[#1a2744] text-slate-200'
                      }`}
                    >
                      {msg.role === 'user' ? (
                        <p>{msg.content}</p>
                      ) : (
                        <ReactMarkdown className="prose prose-sm prose-invert max-w-none text-xs [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:m-0 [&_ul]:my-1 [&_li]:my-0.5">
                          {msg.content}
                        </ReactMarkdown>
                      )}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-[#1a2744] rounded-lg px-3 py-2 flex items-center gap-2">
                      <Loader2 className="w-3 h-3 text-[#d4a843] animate-spin" />
                      <span className="text-xs text-slate-400">Thinking...</span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Input */}
          <form
            onSubmit={handleSendMessage}
            className="bg-[#0a1128] border-t border-[rgba(212,168,67,0.2)] px-3 py-3 flex gap-2 rounded-b-xl"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything..."
              disabled={loading}
              className="flex-1 bg-[#141f3d] border-slate-700 text-white placeholder:text-slate-500 text-xs h-8"
            />
            <Button
              type="submit"
              disabled={!input.trim() || loading}
              size="icon"
              className="bg-[#d4a843] hover:bg-[#e0bb5e] text-[#0a1128] shrink-0 h-8 w-8"
            >
              <Send className="w-3 h-3" />
            </Button>
          </form>
        </div>
      )}
    </>
  );
}