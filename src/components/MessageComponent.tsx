import React, { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChevronDown, ChevronUp, Bell } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export interface ChatMessage {
  role: 'user' | 'model' | 'system_notification';
  text: string;
  isLive?: boolean;
  agentName?: string;
  isAction?: boolean;
}

export function MessageComponent({ message, userInitials = 'U', userName = 'You', isGenerating = false, agentName = 'Fusion' }: { message: ChatMessage, userInitials?: string, userName?: string, isGenerating?: boolean, agentName?: string }) {
  if (message.role === 'system_notification') {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-center py-4 my-2"
      >
        <div className="flex items-center gap-2 bg-[var(--bg-surface)] text-[var(--text-secondary)] text-[12px] font-medium px-4 py-2 rounded-full border border-[var(--border-light)] shadow-sm text-center">
          <Bell size={14} className="text-blue-400" />
          <span>{message.text}</span>
        </div>
      </motion.div>
    );
  }

  if (message.isAction) {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex w-full mt-2 mb-4"
      >
        <div className="flex items-center gap-2 text-[var(--text-muted-dark)] text-[13px] italic bg-[var(--bg-surface)]/40 px-3 py-1.5 rounded-full border border-[var(--border-light)]/50 mr-auto ml-12">
          <span className="font-semibold text-[var(--text-muted)] not-italic">{message.agentName || agentName}</span>
          <span>{message.text}</span>
        </div>
      </motion.div>
    );
  }


  const isUser = message.role === 'user';
  
  // Parse the thinking blocks out of the text
  const { thinking, content, isThinkingIncomplete } = useMemo(() => {
    let raw = message.text;
    let thinking = "";
    let content = "";
    let isThinkingIncomplete = false;

    const thinkStart = raw.indexOf("<think>");
    if (thinkStart !== -1) {
       const thinkEnd = raw.indexOf("</think>", thinkStart);
       if (thinkEnd !== -1) {
         thinking = raw.substring(thinkStart + 7, thinkEnd).trim();
         content = (raw.substring(0, thinkStart) + raw.substring(thinkEnd + 8)).trim();
       } else {
         // Still streaming the thinking part
         thinking = raw.substring(thinkStart + 7).trim();
         content = raw.substring(0, thinkStart).trim();
         isThinkingIncomplete = true;
       }
    } else {
       content = raw.trim();
    }
    return { thinking, content, isThinkingIncomplete };
  }, [message.text]);

  const [thinkExpanded, setThinkExpanded] = useState(false);

  // Dynamically extract steps from the thinking log
  const stepsToRender = useMemo(() => {
    const foundSteps: string[] = [];
    const regex = /\[(.*?)\]/g;
    let match;
    while ((match = regex.exec(thinking)) !== null) {
      if (!foundSteps.includes(match[1])) {
        foundSteps.push(match[1]);
      }
    }
    
    if (foundSteps.length === 0 && isThinkingIncomplete) {
      foundSteps.push('Initializing');
    }

    return foundSteps.map((step, index) => {
      const isLast = index === foundSteps.length - 1;
      let status: 'complete' | 'active' | 'queued' = 'complete';
      if (isLast && isThinkingIncomplete) {
        status = 'active';
      }
      return { name: step, status };
    });
  }, [thinking, isThinkingIncomplete]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col w-full py-6 pb-8"
    >
      <div className="flex items-center gap-3 mb-5">
        {isUser ? (
          <div className="w-5 h-5 rounded-full bg-[var(--bg-inverse)]/10 text-[var(--text-primary)] flex items-center justify-center text-[9px] font-sans font-medium uppercase tracking-wider">{userInitials}</div>
        ) : (
          <div className="w-5 h-5 flex relative items-center justify-center">
            <div className="absolute w-2.5 h-2.5 border border-white/60 rounded-[2px] rotate-45 transform origin-center"></div>
            <div className="absolute w-2.5 h-2.5 border-t border-r border-[#4ca1af] rounded-[2px] -rotate-12"></div>
          </div>
        )}
        <span className="text-[13px] font-sans font-medium text-[var(--text-primary)] tracking-wide opacity-90">
          {isUser ? userName : ((message.agentName || agentName) === 'Fusion' ? 'Fusion' : `Fusion - ${message.agentName || agentName}`)}
        </span>
        {!isUser && message.isLive && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/20 text-[10px] text-[var(--accent-primary)] font-medium tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] animate-pulse" />
            LIVE
          </div>
        )}
      </div>
      
      <div className={cn(
        "flex flex-col min-w-0 flex-1 w-full",
        isUser ? "pl-8" : ""
      )}>
        {!isUser && (thinking || isThinkingIncomplete) && (
          <div className="mb-6 w-full">
            <div className="flex items-center gap-3 text-[10px] uppercase text-[var(--text-muted)] mb-4 font-mono">
              <span className="tracking-widest">Reasoning</span>
              <div className="flex-1 h-[1px] bg-[var(--bg-overlay-05)]"></div>
              <button 
                onClick={() => setThinkExpanded(!thinkExpanded)} 
                className={cn(
                  "hover:text-[var(--text-primary)] flex items-center gap-1.5 transition-colors",
                  isThinkingIncomplete ? "text-[var(--text-secondary)]" : ""
                )}
              >
                {thinkExpanded || isThinkingIncomplete ? 'Hide Log' : 'View Log'} 
                <ChevronDown size={12} className={cn("transition-transform opacity-70", (thinkExpanded || isThinkingIncomplete) && "rotate-180")} />
              </button>
            </div>

            <AnimatePresence>
              {(thinkExpanded || isThinkingIncomplete) && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4 mt-2">
                    {stepsToRender.map((step, idx) => (
                      <div 
                        key={idx} 
                        className={cn(
                          "border rounded-[8px] p-3 transition-all relative overflow-hidden backdrop-blur-sm",
                          step.status === 'active' 
                            ? "bg-[var(--bg-overlay-03)] border-[var(--border-medium)] shadow-inner" 
                            : "bg-[var(--bg-inverse)]/[0.01] border-[var(--border-light)]",
                          stepsToRender.length === 1 ? "md:col-span-3" : ""
                        )}
                      >
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-[10px] text-[var(--text-primary)] uppercase tracking-wider font-mono opacity-80">{step.name}</span>
                          {step.status === 'complete' ? (
                            <span className="text-[9px] text-[var(--text-primary)] opacity-30 font-mono">Complete</span>
                          ) : step.status === 'active' ? (
                            <span className="text-[9px] text-[var(--text-primary)] font-mono">Active</span>
                          ) : (
                            <span className="text-[9px] text-[var(--text-muted-dark)] font-mono">Queued</span>
                          )}
                        </div>
                        <div className="h-[1px] w-full bg-[var(--bg-overlay-05)] rounded-full overflow-hidden">
                          {step.status === 'complete' ? (
                            <div className="h-full w-full bg-[var(--bg-inverse)]/[0.2]" />
                          ) : step.status === 'active' ? (
                            <motion.div className="h-full bg-[var(--bg-inverse)]/[0.6]" animate={{ x: ["-100%", "100%"] }} transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }} />
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>

                  {(thinkExpanded || isThinkingIncomplete) && thinking.length > 0 && (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-[12px] leading-relaxed font-mono text-[var(--text-muted)] p-4 bg-[var(--bg-inverse)]/[0.01] border border-[var(--border-medium)] rounded-[12px] whitespace-pre-wrap max-h-80 overflow-y-auto mb-4 backdrop-blur-md"
                    >
                      {thinking}
                      {isThinkingIncomplete && <span className="inline-block w-1 h-3 bg-[var(--bg-inverse)]/40 animate-pulse ml-1 align-middle" />}
                    </motion.div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
        
        {(content || (isGenerating && !isThinkingIncomplete)) && (
          <div className={cn(
            "w-full transition-all flex flex-col items-start",
            isUser 
              ? "text-[15px] leading-relaxed text-[var(--text-primary)]" 
              : "text-[var(--text-secondary)]"
          )}>
            {!isUser ? (
              <div className={cn(
                "prose prose-sm md:prose-base break-words max-w-none prose-p:leading-relaxed prose-pre:backdrop-blur-md prose-headings:font-serif prose-headings:font-normal prose-headings:tracking-wide",
                isGenerating && !isThinkingIncomplete && content && "[&>*:last-child]:after:content-[''] [&>*:last-child]:after:inline-block [&>*:last-child]:after:w-[5px] [&>*:last-child]:after:h-[1em] [&>*:last-child]:after:bg-[var(--accent-primary)] [&>*:last-child]:after:ml-1 [&>*:last-child]:after:animate-pulse [&>*:last-child]:after:-translate-y-[2px] [&>*:last-child]:after:align-middle [&>*:last-child]:after:rounded-sm [&>*:last-child]:after:opacity-80"
              )}>
                {content ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {content}
                  </ReactMarkdown>
                ) : (
                  isGenerating && !isThinkingIncomplete && (
                    <div className="flex items-center gap-1.5 mt-2 h-6 px-1">
                      <motion.div 
                        className="w-1.5 h-1.5 bg-[var(--text-secondary)] rounded-full opacity-60"
                        animate={{ y: [0, -4, 0] }}
                        transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
                      />
                      <motion.div 
                        className="w-1.5 h-1.5 bg-[var(--text-secondary)] rounded-full opacity-60"
                        animate={{ y: [0, -4, 0] }}
                        transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
                      />
                      <motion.div 
                        className="w-1.5 h-1.5 bg-[var(--text-secondary)] rounded-full opacity-60"
                        animate={{ y: [0, -4, 0] }}
                        transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
                      />
                    </div>
                  )
                )}
              </div>
            ) : (
               <div className="whitespace-pre-wrap break-words opacity-90">
                 {content}
               </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
