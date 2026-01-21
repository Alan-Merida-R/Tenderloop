import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Brain, Bot, User, Sparkles, RefreshCw, AlertCircle } from 'lucide-react';
import { generateThinkingResponse } from '../../services/aiService';

interface Props {
  opportunityContext?: string;
  onClose: () => void;
}

export const AIThinkingModal: React.FC<Props> = ({ opportunityContext, onClose }) => {
  const [messages, setMessages] = useState<{ role: 'user' | 'ai'; text: string }[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    
    const userText = input.trim();
    setInput('');
    setError(null);
    setMessages(prev => [...prev, { role: 'user', text: userText }]);
    setLoading(true);

    try {
      const response = await generateThinkingResponse(userText, opportunityContext);
      setMessages(prev => [...prev, { role: 'ai', text: response || 'No response generated.' }]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
      <div className="bg-white w-full max-w-3xl h-[85vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-slide-in-right">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-[#3DCD58]/5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#3DCD58] rounded-xl shadow-lg shadow-emerald-500/20">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="font-black text-gray-900 leading-tight">AI Thinking Mode</h3>
              <p className="text-[10px] font-bold text-[#3DCD58] uppercase tracking-widest">Powered by Gemini 3 Pro</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-colors"><X className="w-6 h-6 text-gray-400" /></button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50/30">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-50">
              <Sparkles className="w-12 h-12 text-[#3DCD58]" />
              <div className="max-w-xs">
                <p className="font-bold text-gray-800">Ask a complex question</p>
                <p className="text-xs text-gray-500">I have full visibility of this opportunity's details, commercial targets, and history.</p>
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex gap-3 max-w-[85%] ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${m.role === 'user' ? 'bg-gray-800' : 'bg-[#3DCD58]'}`}>
                  {m.role === 'user' ? <User className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-white" />}
                </div>
                <div className={`p-4 rounded-2xl text-sm leading-relaxed shadow-sm ${m.role === 'user' ? 'bg-gray-800 text-white rounded-tr-none' : 'bg-white text-gray-800 border border-gray-100 rounded-tl-none'}`}>
                  {m.text}
                </div>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="flex gap-3 items-center">
                <div className="w-8 h-8 rounded-lg bg-[#3DCD58] flex items-center justify-center animate-pulse">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <div className="flex items-center gap-2 text-xs font-bold text-[#3DCD58] italic">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  AI is thinking deeply...
                </div>
              </div>
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-xs font-medium">
              <AlertCircle className="w-4 h-4" /> {error}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-100 bg-white">
          <div className="relative">
            <textarea 
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Deep analysis or complex query..."
              className="w-full pl-4 pr-14 py-4 bg-gray-50 border-none rounded-2xl text-sm focus:ring-1 focus:ring-[#3DCD58] resize-none"
              rows={2}
            />
            <button 
              onClick={handleSend}
              disabled={!input.trim() || loading}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-3 bg-[#3DCD58] text-white rounded-xl shadow-lg shadow-emerald-500/20 disabled:opacity-30 disabled:shadow-none transition-all active:scale-95"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
