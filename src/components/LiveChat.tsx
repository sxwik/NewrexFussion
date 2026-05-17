import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, MicOff, Mic, Pause, PhoneOff } from 'lucide-react';

interface LiveChatProps {
  onClose: () => void;
  currentAgent?: string;
  isGroqEnabled?: boolean;
}

export const LiveChat: React.FC<LiveChatProps> = ({ onClose, currentAgent = 'Fusion', isGroqEnabled = false }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [mode, setMode] = useState<'gemini' | 'groq'>(isGroqEnabled ? 'groq' : 'gemini');
  const [statusText, setStatusText] = useState('Connecting...');
  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  
  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  // Playback queue variables
  const nextStartTimeRef = useRef<number>(0);
  
  // Animation data
  const requestAnimationFrameRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // Groq Mode Refs
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(window.speechSynthesis);
  const messageHistoryRef = useRef<any[]>([]);
  const isSpeakingRef = useRef<boolean>(false);

  useEffect(() => {
    if (mode === 'gemini') {
      connectLiveApi();
    } else {
      connectGroqApi();
    }
    return () => {
      if (mode === 'gemini') disconnectLiveApi();
      else disconnectGroqApi();
    };
  }, [mode]);

  const toggleMode = () => {
    if (mode === 'gemini') {
      disconnectLiveApi();
      setMode('groq');
    } else {
      disconnectGroqApi();
      setMode('gemini');
    }
  };

  const pcmToBase64 = (pcmData: Float32Array) => {
    // Convert Float32Array (-1.0 to +1.0) to PCM16
    const pcm16 = new Int16Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) {
        let s = Math.max(-1, Math.min(1, pcmData[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    // Convert Int16Array to Base64
    const buffer = pcm16.buffer;
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  };
  
  const base64ToPcm = (base64: string) => {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const pcm16 = new Int16Array(bytes.buffer);
    const pcmFloat = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) {
      pcmFloat[i] = pcm16[i] / (pcm16[i] >= 0 ? 32767 : 32768);
    }
    return pcmFloat;
  };

  const playAudioChunk = (base64Audio: string) => {
    if (!audioCtxRef.current) return;
    const pcmFloat = base64ToPcm(base64Audio);
    
    const audioCtx = audioCtxRef.current;
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    const audioBuffer = audioCtx.createBuffer(1, pcmFloat.length, 16000);
    audioBuffer.copyToChannel(pcmFloat, 0);

    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    
    // Connect to analyser for output visualizations
    if (analyserRef.current) {
        source.connect(analyserRef.current);
    }
    source.connect(audioCtx.destination);
    
    // Schedule for gapless playback
    const currentTime = audioCtx.currentTime;
    // If the next start time is in the past, or we're just starting, use current time + small buffer
    if (nextStartTimeRef.current < currentTime) {
      nextStartTimeRef.current = currentTime + 0.05;
    }
    
    source.start(nextStartTimeRef.current);
    nextStartTimeRef.current += audioBuffer.duration;
  };

  const disconnectGroqApi = () => {
    if (requestAnimationFrameRef.current) cancelAnimationFrame(requestAnimationFrameRef.current);
    if (recognitionRef.current) {
        recognitionRef.current.stop();
    }
    if (synthRef.current) {
        synthRef.current.cancel();
    }
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    if (audioCtxRef.current) audioCtxRef.current.close().catch(console.error);
    setIsConnected(false);
  };

  const connectGroqApi = async () => {
    try {
      setError(null);
      
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
          setError("Speech Recognition is not supported in this browser. Try Chrome.");
          return;
      }
      
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.continuous = false;
      recognition.interimResults = false;
      
      recognition.onstart = () => {
          if (!isSpeakingRef.current) setStatusText("Listening (Groq Voice)...");
      };
      
      recognition.onend = () => {
          // Restart if not speaking and still connected
          if (isConnected && !isSpeakingRef.current) {
              try { recognition.start(); } catch (e) {}
          }
      };
      
      recognition.onresult = async (event: any) => {
          const text = event.results[0][0].transcript;
          if (!text.trim()) return;
          
          setStatusText("Thinking...");
          isSpeakingRef.current = true;
          try { recognition.stop(); } catch(e){}
          
          messageHistoryRef.current.push({ role: 'user', parts: [{ text }] });
          
          try {
             const res = await fetch('/api/chat', {
                 method: 'POST',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({ contents: messageHistoryRef.current, currentAgent })
             });
             if (!res.ok) throw new Error("API Error");
             const reader = res.body?.getReader();
             const decoder = new TextDecoder();
             let accumulatedText = "";
             
             if (reader) {
                 while (true) {
                     const { done, value } = await reader.read();
                     if (done) break;
                     const chunk = decoder.decode(value, { stream: true });
                     const lines = chunk.split('\n');
                     for (let line of lines) {
                         if (line.startsWith('data: ')) {
                             const dataStr = line.slice(6);
                             if (dataStr === '[DONE]') break;
                             try {
                                 const parsed = JSON.parse(dataStr);
                                 accumulatedText += parsed.text;
                             } catch(e){}
                         }
                     }
                 }
             }
             messageHistoryRef.current.push({ role: 'model', parts: [{ text: accumulatedText }] });
             
             // Speak it
             if (synthRef.current) {
                 synthRef.current.cancel(); // clear previous
                 const utterance = new SpeechSynthesisUtterance(accumulatedText.replace(/[*_#]/g, ''));
                 // Try to pick a decent voice
                 const voices = synthRef.current.getVoices();
                 let selectedVoice = voices.find(v => v.name.includes("Google") || v.name.includes("Siri") || v.name.includes("Alex") || v.name.includes("Samantha"));
                 if (selectedVoice) utterance.voice = selectedVoice;
                 
                 utterance.onstart = () => setStatusText("Speaking...");
                 utterance.onend = () => {
                     isSpeakingRef.current = false;
                     setStatusText("Listening (Groq Voice)...");
                     try { recognitionRef.current?.start(); } catch(e){}
                 };
                 synthRef.current.speak(utterance);
             }
          } catch (e: any) {
             console.error(e);
             setStatusText("Error responding.");
             isSpeakingRef.current = false;
             setTimeout(() => { try { recognitionRef.current?.start(); } catch(e){} }, 2000);
          }
      };

      setIsConnected(true);
      setStatusText("Listening (Groq Voice)...");
      try { recognition.start(); } catch (e) {}

      // Visualization loop
      const updateAnimation = () => {
          if (analyserRef.current) {
              const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
              analyserRef.current.getByteFrequencyData(dataArray);
              let sum = 0;
              for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
              setAudioLevel(sum / dataArray.length / 255);
          }
          requestAnimationFrameRef.current = requestAnimationFrame(updateAnimation);
      };
      updateAnimation();

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Could not connect to microphone.");
    }
  };

  const connectLiveApi = async () => {
    try {
      setError(null);
      
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${location.host}/live`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      const audioCtx = new AudioContext({ sampleRate: 16000 });
      audioCtxRef.current = audioCtx;
      
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, sampleRate: 16000 } });
      streamRef.current = stream;
      
      const source = audioCtx.createMediaStreamSource(stream);
      // We use script processor for simplicity as recommended in the skill docs
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      
      source.connect(processor);
      // processor.connect(audioCtx.destination); // Don't connect input to destination to avoid feedback loop
      // Connect processor to destination but mute the gain to allow processing without feedback!
      const dummyGain = audioCtx.createGain();
      dummyGain.gain.value = 0;
      processor.connect(dummyGain);
      dummyGain.connect(audioCtx.destination);

      processor.onaudioprocess = (e) => {
        if (ws.readyState === WebSocket.OPEN) {
          const base64 = pcmToBase64(e.inputBuffer.getChannelData(0));
          ws.send(JSON.stringify({ audio: base64 }));
        }
      };

      ws.onopen = () => {
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.audio) {
            playAudioChunk(msg.audio);
        }
        if (msg.interrupted) {
            nextStartTimeRef.current = 0; // Reset queue
        }
      };

      ws.onerror = () => {
        setError("WebSocket error occurred.");
      };

      ws.onclose = () => {
        setIsConnected(false);
      };
      
      // Visualization loop
      const updateAnimation = () => {
          if (analyserRef.current) {
              const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
              analyserRef.current.getByteFrequencyData(dataArray);
              let sum = 0;
              for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
              setAudioLevel(sum / dataArray.length / 255); // value between 0 and 1
          }
          requestAnimationFrameRef.current = requestAnimationFrame(updateAnimation);
      };
      updateAnimation();

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Could not connect to microphone or Live API.");
    }
  };

  const disconnectLiveApi = () => {
    if (requestAnimationFrameRef.current) {
        cancelAnimationFrame(requestAnimationFrameRef.current);
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(console.error);
    }
    if (wsRef.current) {
      wsRef.current.close();
    }
    setIsConnected(false);
  };

  // Generate dynamic wave colors/sizes based on audio level
  const baseSize = 200;
  const activeSize = baseSize + (audioLevel * 100);

  return (
    <motion.div 
      initial={{ opacity: 0, y: "100%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: "100%" }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className="fixed inset-0 z-50 bg-black flex flex-col items-center overflow-hidden font-sans"
    >
      <div className="absolute top-8 w-full flex justify-between px-8 z-10">
        <div></div>
        <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-[var(--bg-inverse)]/[0.08] backdrop-blur-md cursor-pointer hover:bg-[var(--bg-inverse)]/[0.12] transition-colors" onClick={toggleMode} title="Click to switch engines">
           <div className={`w-2 h-2 rounded-full animate-pulse ${mode === 'groq' ? 'bg-orange-500' : 'bg-green-500'}`} />
           <span className="text-[14px] font-medium text-[var(--text-inverse)]/90">
             Live ({mode === 'groq' ? 'Groq Voice' : 'Gemini Native'})
           </span>
        </div>
      </div>

      {error ? (
        <div className="flex-1 flex flex-col items-center justify-center">
            <p className="text-red-400 mb-4">{error}</p>
            <button 
                onClick={connectLiveApi}
                className="px-6 py-2 bg-[var(--bg-inverse)]/10 rounded-full hover:bg-[var(--bg-inverse)]/20 transition-colors"
            >
                Retry Connection
            </button>
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-end w-full pb-32 relative">
            
            {/* Insane Animation (Gradient blob) */}
            <div className="absolute bottom-40 left-1/2 -translate-x-1/2 w-full max-w-xl h-64 flex items-center justify-center pointer-events-none">
                 <div className="relative w-full h-full flex items-center justify-center filter blur-3xl opacity-80">
                    <motion.div 
                        animate={{ 
                            width: activeSize,
                            height: activeSize,
                            borderRadius: ["40% 60% 70% 30%", "50% 50% 30% 70%", "30% 70% 50% 50%", "40% 60% 70% 30%"]
                        }}
                        transition={{ 
                            width: { duration: 0.1 },
                            height: { duration: 0.1 },
                            borderRadius: { duration: 8, repeat: Infinity, ease: "linear" }
                        }}
                        className="absolute bg-blue-500/60"
                    />
                    <motion.div 
                        animate={{ 
                            width: activeSize * 1.2,
                            height: activeSize * 0.8,
                            borderRadius: ["30% 70% 50% 50%", "60% 40% 30% 70%", "40% 60% 70% 30%", "30% 70% 50% 50%"]
                        }}
                        transition={{ 
                            width: { duration: 0.15 },
                            height: { duration: 0.15 },
                            borderRadius: { duration: 7, repeat: Infinity, ease: "linear" }
                        }}
                        className="absolute bg-indigo-500/50"
                    />
                    <motion.div 
                        animate={{ 
                            width: activeSize * 0.9,
                            height: activeSize * 1.1,
                            borderRadius: ["50% 50% 30% 70%", "30% 70% 50% 50%", "40% 60% 70% 30%", "50% 50% 30% 70%"]
                        }}
                        transition={{ 
                            width: { duration: 0.12 },
                            height: { duration: 0.12 },
                            borderRadius: { duration: 9, repeat: Infinity, ease: "linear" }
                        }}
                        className="absolute bg-cyan-400/50"
                    />
                 </div>
            </div>

            <div className="text-center text-[var(--text-inverse)]/50 text-[15px] font-medium mb-12 uppercase tracking-widest z-10">
                {mode === 'groq' ? statusText : (isConnected ? (audioLevel > 0.01 ? "Speaking" : "Listening") : "Connecting...")}
            </div>

            <div className="flex justify-center items-center gap-8 z-10">
                <button 
                  className="w-14 h-14 rounded-full bg-[var(--bg-inverse)]/10 flex items-center justify-center text-[var(--text-inverse)]/80 hover:bg-[var(--bg-inverse)]/20 hover:text-[var(--text-inverse)] transition-colors"
                >
                    <Pause size={24} fill="currentColor" />
                </button>
                <button 
                  onClick={onClose}
                  className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-[var(--text-inverse)] shadow-lg shadow-red-500/20 transition-all hover:scale-105 active:scale-95"
                >
                    <PhoneOff size={26} />
                </button>
            </div>
        </div>
      )}
    </motion.div>
  );
};
