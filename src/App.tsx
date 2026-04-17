import React, { useState, useEffect, useRef } from 'react';
import { GigiAvatar } from './components/GigiAvatar';
import { GigiService } from './lib/gigi-service';
import { VoiceService, ListeningService } from './lib/voice-service';
import { db, type ChatSession, type Message, type Memory } from './lib/db';
import { MessageCircle, Settings, Brain, History, Mic, MicOff, Send, X, Trash2, Heart, Volume2, VolumeX } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isGigiTalking, setIsGigiTalking] = useState(false);
  const [currentExpression, setCurrentExpression] = useState('Idle Smirk');
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [continuousMode, setContinuousMode] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showMemories, setShowMemories] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadSessions();
    loadMemories();
  }, []);

  useEffect(() => {
    if (currentSessionId) {
      loadMessages(currentSessionId);
    }
  }, [currentSessionId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const loadSessions = async () => {
    const s = await GigiService.getSessions();
    setSessions(s);
  };

  const loadMemories = async () => {
    const m = await GigiService.getMemories();
    setMemories(m);
  };

  const loadMessages = async (id: number) => {
    const m = await GigiService.getMessages(id);
    setMessages(m);
  };

  const startNewSession = async () => {
    const id = await GigiService.createSession();
    setCurrentSessionId(id);
    setMessages([]);
    setShowHistory(false);
    loadSessions();
  };

  const [selectedVoice, setSelectedVoice] = useState('Justin');

  const handleSendMessage = async (text?: string) => {
    const content = text || inputText;
    if (!content.trim() || !currentSessionId || isLoading) return;

    setIsLoading(true);
    setInputText('');
    
    await GigiService.addMessage(currentSessionId, 'user', content);
    loadMessages(currentSessionId);
    loadSessions(); // Potential title update

    try {
      const reply = await GigiService.generateReply(currentSessionId);
      
      // Parse expression
      const expressionMatch = reply.match(/\[FACIAL_EXPRESSION:(.*?)\]/);
      if (expressionMatch) {
        setCurrentExpression(expressionMatch[1]);
      }

      if (voiceEnabled) {
        await VoiceService.speak(
          reply, 
          selectedVoice, 
          () => setIsGigiTalking(true), 
          () => {
            setIsGigiTalking(false);
            if (continuousMode) {
              startListening();
            }
          }
        );
      } else {
        if (continuousMode) {
          startListening();
        }
      }

      loadMessages(currentSessionId);
      loadMemories();
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const startListening = () => {
    ListeningService.start((text) => {
      handleSendMessage(text);
    }, () => {
      // recognition end
    });
  };

  const toggleContinuousMode = () => {
    if (!continuousMode) {
      startListening();
    } else {
      ListeningService.stop();
    }
    setContinuousMode(!continuousMode);
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden immersive-bg text-white font-sans selection:bg-[var(--primary)] selection:text-white">
      {/* Top Section: Gigi 3D Viewer */}
      <div className="relative h-[55vh] w-full flex-shrink-0 flex items-center justify-center">
        <GigiAvatar expression={currentExpression} isTalking={isGigiTalking} />
        
        {/* Character Tag */}
        <div className="absolute top-8 left-8 px-4 py-2 rounded-full glass-panel flex items-center gap-3">
          <span className="text-[var(--primary)] text-xl leading-none">🎀</span>
          <div className="flex flex-col">
            <span className="text-[10px] font-black tracking-[2px] uppercase text-white">GIGI</span>
            <span className="text-[8px] text-[var(--accent)] font-bold uppercase tracking-tighter opacity-70">Llama 3.3 70B</span>
          </div>
        </div>

        {/* Expression Status */}
        <div className="absolute top-8 right-8 text-right">
          <div className="text-[10px] text-[var(--text-dim)] uppercase tracking-[1px] mb-0.5 font-bold">Current Mood</div>
          <div className="text-xl font-black text-[var(--primary)] drop-shadow-[0_0_12px_var(--primary-glow)] uppercase tracking-tight">
            {currentExpression}
          </div>
        </div>

        {/* Continuous Mode Indicator */}
        <div className="absolute bottom-6 w-full text-center">
           <div className={cn(
             "text-[10px] tracking-[4px] uppercase font-bold transition-all duration-500",
             continuousMode ? "text-[var(--accent)] animate-pulse" : "text-white/20"
           )}>
             Continuous Voice Mode: {continuousMode ? "ACTIVE" : "OFF"}
           </div>
        </div>

        {/* Mobile Actions: Only show when sidebars are hidden (mobile) */}
        <div className="lg:hidden absolute top-20 right-6 flex flex-col gap-2">
           <button onClick={() => setShowHistory(true)} className="p-3 rounded-full btn-glass">
             <History size={18} />
           </button>
           <button onClick={() => setShowMemories(true)} className="p-3 rounded-full btn-glass">
             <Brain size={18} />
           </button>
           <button onClick={() => setShowSettings(true)} className="p-3 rounded-full btn-glass">
             <Settings size={18} />
           </button>
        </div>
      </div>

      {/* Bottom Section: Immersive Chat Interface */}
      <div className="flex-1 bg-black/40 backdrop-blur-3xl border-t border-white/10 p-6 grid grid-cols-1 lg:grid-cols-[260px_1fr_260px] gap-6 overflow-hidden">
        
        {/* Left Panel: Memory (Desktop Only) */}
        <div className="hidden lg:flex flex-col glass-panel rounded-2xl p-5 overflow-hidden">
           <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-2">
             <span className="text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-widest">🧠 Memories</span>
             <span className="text-[10px] font-bold text-[var(--accent)]">{memories.length} Active</span>
           </div>
           <div className="flex-1 overflow-y-auto space-y-3 pr-1">
             {memories.map(m => (
               <div key={m.id} className="p-3 rounded-xl bg-white/5 border-l-2 border-[var(--accent)] text-xs leading-relaxed group relative">
                 {m.fact}
                 <button 
                  onClick={() => GigiService.deleteMemory(m.id!)}
                  className="absolute top-2 right-2 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                 >
                   <X size={12} />
                 </button>
               </div>
             ))}
             {memories.length === 0 && (
               <div className="text-[10px] text-white/20 italic text-center py-4">No memories yet...</div>
             )}
           </div>
           
           <div className="mt-6 pt-4 border-t border-white/5">
              <span className="text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-widest block mb-2">🗣️ Voice Output</span>
              <select 
                value={selectedVoice}
                onChange={(e) => setSelectedVoice(e.target.value)}
                className="w-full bg-transparent border border-white/10 rounded-lg text-[10px] p-2 focus:outline-none focus:border-[var(--primary)]"
              >
                <option value="Justin">Justin (Neural) — Default</option>
                <option value="Ivy">Ivy (Neural)</option>
                <option value="Joanna">Joanna (Neural)</option>
                <option value="Kendra">Kendra (Neural)</option>
                <option value="Salli">Salli (Neural)</option>
                <option value="Amy">Amy (UK)</option>
                <option value="Brian">Brian (UK)</option>
              </select>
           </div>
        </div>

        {/* Center: Main Chat */}
        <div className="flex flex-col h-full overflow-hidden">
          {!currentSessionId ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
               <motion.div 
                 initial={{ scale: 0.8, opacity: 0 }}
                 animate={{ scale: 1, opacity: 1 }}
                 className="p-8 rounded-[40px] glass-panel mb-6"
               >
                 <MessageCircle className="w-12 h-12 text-[var(--primary)] mb-4 mx-auto" strokeWidth={1.5} />
                 <h1 className="text-4xl font-black mb-2 tracking-tighter">GIGI AI</h1>
                 <p className="text-[var(--text-dim)] text-sm max-w-[200px]">Like, are you actually gonna talk to me? Ugh, whatever.</p>
               </motion.div>
               <button 
                onClick={startNewSession}
                className="px-10 py-4 btn-primary rounded-full font-black text-xs uppercase tracking-[3px] transition-transform active:scale-95"
               >
                 Initiate Link
               </button>
            </div>
          ) : (
            <>
              <div 
                ref={scrollRef}
                className="flex-1 overflow-y-auto space-y-4 pr-2 scroll-smooth"
              >
                {messages.map((m) => (
                  <div 
                    key={m.id} 
                    className={cn(
                      "flex flex-col group",
                      m.role === 'user' ? "items-end" : "items-start"
                    )}
                  >
                    <div 
                      className={cn(
                        "px-5 py-3 rounded-[20px] text-sm leading-relaxed max-w-[90%]",
                        m.role === 'user' 
                          ? "glass-panel bg-white/5 border-white/20 rounded-br-none" 
                          : "bg-gradient-to-br from-[#FF69B415] to-[#FF149315] border border-[var(--primary)]/30 text-white rounded-bl-none shadow-[0_4px_15px_rgba(255,105,180,0.05)]"
                      )}
                    >
                      {m.content.replace(/\[FACIAL_EXPRESSION:.*?\]/g, '')}
                    </div>
                    <span className="text-[9px] text-white/20 mt-1.5 uppercase font-bold tracking-widest px-1">
                      {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex items-center gap-2 p-3 px-5 rounded-full glass-panel w-fit animate-pulse border-[var(--primary)]/20">
                    <div className="w-1 h-1 bg-[var(--primary)] rounded-full animate-bounce" />
                    <div className="w-1 h-1 bg-[var(--primary)] rounded-full animate-bounce [animation-delay:0.2s]" />
                    <div className="w-1 h-1 bg-[var(--primary)] rounded-full animate-bounce [animation-delay:0.4s]" />
                  </div>
                )}
              </div>

              {/* Controls */}
              <div className="mt-4 flex gap-3 items-center">
                 <button 
                  onClick={toggleContinuousMode}
                  className={cn(
                    "w-12 h-12 rounded-full flex items-center justify-center transition-all",
                    continuousMode ? "btn-primary" : "btn-glass text-[var(--primary)]"
                  )}
                 >
                   <Mic size={18} />
                 </button>
                 <div className="flex-1 relative">
                   <input 
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Type a message to Gigi..."
                    className="w-full glass-panel rounded-full px-6 py-3.5 text-sm focus:outline-none focus:border-[var(--primary)] transition-all placeholder:text-white/20"
                   />
                 </div>
                 <button 
                  onClick={() => handleSendMessage()}
                  disabled={!inputText.trim() || isLoading}
                  className="w-12 h-12 rounded-full glass-panel flex items-center justify-center text-[var(--accent)] hover:text-white disabled:opacity-30 disabled:pointer-events-none"
                 >
                   <Send size={18} />
                 </button>
              </div>
            </>
          )}
        </div>

        {/* Right Panel: Sessions (Desktop Only) */}
        <div className="hidden lg:flex flex-col glass-panel rounded-2xl p-5 overflow-hidden">
           <div className="text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-widest mb-4 border-b border-white/5 pb-2">💬 Conversations</div>
           <div className="flex-1 overflow-y-auto space-y-3 pr-1">
             {sessions.map(s => (
               <button 
                key={s.id}
                onClick={() => setCurrentSessionId(s.id!)}
                className={cn(
                  "w-full text-left p-4 rounded-xl transition-all border",
                  currentSessionId === s.id 
                    ? "bg-[var(--primary)] text-white border-white/10 shadow-[0_0_15px_var(--primary-glow)]" 
                    : "btn-glass border-transparent"
                )}
               >
                 <div className="font-bold text-xs truncate mb-1">{s.title}</div>
                 <div className="text-[9px] opacity-70 uppercase font-black tracking-widest">{new Date(s.createdAt).toLocaleDateString()}</div>
               </button>
             ))}
           </div>
           
           <div className="mt-6 pt-4 border-t border-white/5">
              <div className="text-[10px] text-[var(--text-dim)] uppercase font-black tracking-widest">Device Status</div>
              <div className="text-[10px] text-[var(--accent)] mt-1 font-medium">Mali-G615 GPU • 60 FPS</div>
           </div>
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showHistory && (
          <Modal title="History" onClose={() => setShowHistory(false)}>
            <div className="space-y-2">
              <button 
                onClick={startNewSession}
                className="w-full flex items-center justify-center gap-2 p-4 rounded-2xl bg-pink-500/10 border border-pink-500/20 text-pink-400 font-bold mb-4"
              >
                <MessageCircle size={18} /> New Chat
              </button>
              {sessions.map(s => (
                <div 
                  key={s.id}
                  className="flex items-center gap-2 group"
                >
                  <button 
                    onClick={() => { setCurrentSessionId(s.id!); setShowHistory(false); }}
                    className="flex-1 text-left p-4 rounded-2xl bg-neutral-800 border border-neutral-700 hover:border-pink-500/50 transition-all"
                  >
                    <div className="font-bold text-sm truncate">{s.title}</div>
                    <div className="text-[10px] text-neutral-500 mt-1">{new Date(s.createdAt).toLocaleDateString()}</div>
                  </button>
                  <button 
                    onClick={async () => { await db.sessions.delete(s.id!); loadSessions(); if(currentSessionId === s.id) setCurrentSessionId(null); }}
                    className="p-4 rounded-2xl bg-red-500/10 text-red-400 border border-red-500/20 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
            </div>
          </Modal>
        )}

        {showMemories && (
          <Modal title="Gigi's Memory" onClose={() => setShowMemories(false)}>
            <div className="space-y-4">
              <div className="mb-4">
                 <input 
                  type="text" 
                  placeholder="Tell me something directly..." 
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-2 text-sm"
                  onKeyPress={async (e) => {
                    if(e.key === 'Enter') {
                      await GigiService.addMemory((e.target as any).value);
                      (e.target as any).value = '';
                      loadMemories();
                    }
                  }}
                 />
              </div>
              <div className="space-y-2">
                {memories.map(m => (
                  <div key={m.id} className="flex items-center gap-2 group">
                    <div className="flex-1 p-4 rounded-2xl bg-neutral-800 border border-neutral-700 text-sm">
                      {m.fact}
                    </div>
                    <button 
                      onClick={async () => { await GigiService.deleteMemory(m.id!); loadMemories(); }}
                      className="p-4 rounded-2xl bg-red-500/10 text-red-400 border border-red-500/20 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </Modal>
        )}

        {showSettings && (
          <Modal title="Settings" onClose={() => setShowSettings(false)}>
            <div className="space-y-6">
               <div className="flex items-center justify-between p-4 rounded-2xl bg-neutral-800 border border-neutral-700">
                  <div className="flex items-center gap-3">
                    <Volume2 size={18} className="text-pink-400" />
                    <span className="text-sm font-medium">Neural Voice (AWS)</span>
                  </div>
                  <select 
                    className="bg-neutral-900 border border-neutral-700 rounded-lg text-xs p-1"
                    value={selectedVoice}
                    onChange={(e) => setSelectedVoice(e.target.value)}
                  >
                    <option value="Justin">Justin (US Male)</option>
                    <option value="Ivy">Ivy (US Female)</option>
                    <option value="Joanna">Joanna (US Female)</option>
                    <option value="Kendra">Kendra (US Female)</option>
                    <option value="Salli">Salli (US Female)</option>
                    <option value="Amy">Amy (UK Female)</option>
                    <option value="Brian">Brian (UK Male)</option>
                  </select>
               </div>
               <div className="p-4 rounded-2xl bg-neutral-800 border border-neutral-700">
                  <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-4">About Gigi</h3>
                  <p className="text-xs leading-relaxed text-neutral-400 italic">
                    "I'm Gigi. Like, don't make it weird or anything. I'm just here because I have to be. Whatever!"
                  </p>
               </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string, children: React.ReactNode, onClose: () => void }) {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 bg-[#0a0a0c]/80 backdrop-blur-md flex items-end"
    >
      <motion.div 
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        className="w-full h-[80vh] bg-[#121214] rounded-t-[40px] border-t border-white/10 flex flex-col overflow-hidden"
      >
        <div className="p-6 flex items-center justify-between border-b border-white/5">
          <h2 className="text-xl font-black text-white uppercase tracking-widest">{title}</h2>
          <button onClick={onClose} className="p-2 rounded-full glass-panel hover:bg-white/10 transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
          {children}
        </div>
      </motion.div>
    </motion.div>
  );
}
