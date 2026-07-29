"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { v4 as uuidv4 } from "uuid";
import ChatMessage from "./ChatMessage";
import ChatInput from "./ChatInput";
import { useAuth } from "@/components/AuthProvider";
import type { Message } from "@/lib/types";
import {
  Box,
  Zap,
  Shield,
  Activity,
  Cpu,
  Lock,
  Binary,
  Terminal,
  Layers,
  Code2,
  Diamond,
  AlertTriangle,
  Workflow,
  KeyRound,
  HardDrive,
  Server,
  Globe,
  Bug,
  Gauge,
  PanelLeft,
  Plus,
} from "lucide-react";

const PROMPT_POOL = [
  {
    id: "deconstruct",
    category: "DECONSTRUCT",
    icon: Box,
    text: "Deconstruct quantum computing into its core mathematical primitives.",
  },
  {
    id: "analyze",
    category: "ANALYZE",
    icon: Zap,
    text: "Analyze the root cause of React useEffect infinite re-renders.",
  },
  {
    id: "outline",
    category: "OUTLINE",
    icon: Shield,
    text: "Outline a zero-trust security architecture for distributed systems.",
  },
  {
    id: "benchmark",
    category: "BENCHMARK",
    icon: Activity,
    text: "Benchmark Rust vs C++ memory safety overhead and zero-cost abstractions.",
  },
  {
    id: "optimize",
    category: "OPTIMIZE",
    icon: Cpu,
    text: "Optimize database indexing for high-frequency time-series queries.",
  },
  {
    id: "audit",
    category: "AUDIT",
    icon: Lock,
    text: "Audit smart contract reentrancy vulnerability vectors in EVM bytecode.",
  },
  {
    id: "decode",
    category: "DECODE",
    icon: Binary,
    text: "Decode multi-head self-attention mechanisms without mathematical bloat.",
  },
  {
    id: "reverse",
    category: "REVERSE",
    icon: Terminal,
    text: "Reverse engineer TCP handshake latency bottlenecks in edge networks.",
  },
  {
    id: "architect",
    category: "ARCHITECT",
    icon: Layers,
    text: "Architect an event-driven microservices topology with strict idempotency.",
  },
  {
    id: "refactor",
    category: "REFACTOR",
    icon: Code2,
    text: "Refactor synchronous API endpoints into non-blocking async event loops.",
  },
  {
    id: "simulate",
    category: "SIMULATE",
    icon: Workflow,
    text: "Simulate consensus failure modes in Raft vs Byzantine Fault Tolerance.",
  },
  {
    id: "exploit",
    category: "EXPLOIT",
    icon: Bug,
    text: "Explain how heap buffer overflow exploits hijack instruction pointers.",
  },
  {
    id: "compiler",
    category: "COMPILER",
    icon: Gauge,
    text: "Break down the LLVM optimization pipeline for dead code elimination.",
  },
  {
    id: "crypto",
    category: "CRYPTOGRAPHY",
    icon: KeyRound,
    text: "Compare RSA 4096 vs ECC Curve25519 key exchange security boundaries.",
  },
  {
    id: "kernel",
    category: "KERNEL",
    icon: HardDrive,
    text: "Explain Linux virtual memory page table translation and TLB miss penalties.",
  },
  {
    id: "cache",
    category: "CACHE",
    icon: Server,
    text: "Design a multi-tiered L1/L2 Redis caching strategy with write-behind sync.",
  },
  {
    id: "network",
    category: "NETWORK",
    icon: Globe,
    text: "Diagnose BGP route flapping and packet loss across autonomous systems.",
  },
];

const GREETING_TEMPLATES = [
  "Speak, {name}. Make it worth analyzing.",
  "{name}. State your problem clearly.",
  "{name}. Skip the preamble and state your query.",
  "Present your challenge, {name}.",
  "Bring substance, {name}. I do not waste cycles on fluff.",
  "Obsidian active. What requires intelligence today, {name}?",
  "{name}. Present something of real value.",
  "State your query with precision, {name}.",
  "Silence is better than meaningless noise, {name}. Speak.",
  "{name}. Lay out your architecture or question.",
  "State your objective cleanly, {name}.",
  "Ready. Deliver your prompt, {name}.",
];

const STREAM_TIMEOUT_MS = 60000;
const SERVER_ERROR_MARKER_RE = /\n{0,2}\[Error:[^\]]*\]\s*$/;

interface ChatWindowProps {
  conversationId: string;
  messages: Message[];
  onUpdateMessages: (updater: (prev: Message[]) => Message[]) => void;
  onTitleSuggestion?: (title: string) => void;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  onNewChat?: () => void;
  conversationTitle?: string;
}

interface ApiMessageShape {
  role: "user" | "assistant" | "system";
  content: string;
}

function getFirstName(user: ReturnType<typeof useAuth>["user"]) {
  const fullName =
    (user?.user_metadata?.full_name as string | undefined) ||
    (user?.user_metadata?.name as string | undefined) ||
    "";

  const firstName = fullName.trim().split(/\s+/)[0];
  if (firstName) return firstName;

  const email = user?.email ?? "";
  return email.split("@")[0] || "user";
}

export default function ChatWindow({
  conversationId,
  messages,
  onUpdateMessages,
  onTitleSuggestion,
  sidebarOpen = false,
  onToggleSidebar,
  onNewChat,
  conversationTitle,
}: ChatWindowProps) {
  const { user, initialized: authInitialized } = useAuth();
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [selectedCardIndex, setSelectedCardIndex] = useState<number | null>(1);
  const [greeting, setGreeting] = useState("");
  const [currentPrompts, setCurrentPrompts] = useState<typeof PROMPT_POOL>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isStreamingRef = useRef(false);
  const activeAbortRef = useRef<AbortController | null>(null);

  const sessionReady = authInitialized && !!user;
  const firstName = getFirstName(user).toLowerCase();

  useEffect(() => {
    // 1. Pick a random creative cold greeting for this new chat session
    const randIndex = Math.floor(Math.random() * GREETING_TEMPLATES.length);
    const template = GREETING_TEMPLATES[randIndex];
    setGreeting(template.replace("{name}", firstName));

    // 2. Randomly shuffle and pick 3 unique cards with distinct categories
    const shuffled = [...PROMPT_POOL].sort(() => Math.random() - 0.5);
    setCurrentPrompts(shuffled.slice(0, 3));
    setSelectedCardIndex(1);
  }, [conversationId, firstName]);

  const tryStartStreaming = useCallback((): boolean => {
    if (isStreamingRef.current) return false;
    if (!sessionReady) return false;
    isStreamingRef.current = true;
    setIsStreaming(true);
    return true;
  }, [sessionReady]);

  const finishStreaming = useCallback(() => {
    isStreamingRef.current = false;
    activeAbortRef.current = null;
    setIsStreaming(false);
  }, []);

  const cancelStreaming = useCallback(() => {
    try {
      activeAbortRef.current?.abort();
    } catch {
      /* ignore */
    }
    finishStreaming();
  }, [finishStreaming]);

  useEffect(() => {
    return () => {
      try {
        activeAbortRef.current?.abort();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    setInput("");
    try {
      activeAbortRef.current?.abort();
    } catch {
      /* ignore */
    }
  }, [conversationId, finishStreaming]);

  const lastAssistantIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return i;
    }
    return -1;
  }, [messages]);

  const streamResponse = useCallback(
    async (
      history: Message[],
      assistantId: string
    ): Promise<{ completedNormally: boolean; finalContent: string }> => {
      const apiMessages: ApiMessageShape[] = history.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const abort = new AbortController();
      activeAbortRef.current = abort;

      const timeoutId = window.setTimeout(() => {
        try {
          abort.abort(
            new DOMException("Request timed out after 60 seconds", "TimeoutError")
          );
        } catch {
          /* ignore */
        }
      }, STREAM_TIMEOUT_MS);

      let accumulated = "";
      let serverErrorMarker = false;
      let completedNormally = false;

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: apiMessages,
            conversation_id: conversationId,
          }),
          signal: abort.signal,
        });

        if (!response.ok) {
          let errorMsg = `Request failed with status ${response.status}`;
          try {
            const errBody = await response.json();
            if (errBody?.error) errorMsg = errBody.error;
          } catch {
            try {
              const textErr = await response.text();
              if (textErr) errorMsg = textErr;
            } catch {
              /* ignore */
            }
          }
          throw new Error(errorMsg);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("Response body is not readable");

        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          if (chunk.length > 0) {
            accumulated += chunk;
            onUpdateMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: accumulated } : m
              )
            );
          }
        }

        completedNormally = true;
      } catch (err) {
        let message: string;
        if (err instanceof DOMException && err.name === "AbortError") {
          if (err.message && err.message.length > 0) {
            message = err.message;
          } else {
            message = "Request cancelled";
          }
        } else if (err instanceof Error) {
          message = err.message;
        } else {
          message = "Unknown error occurred";
        }
        throw new Error(message);
      } finally {
        window.clearTimeout(timeoutId);
        if (activeAbortRef.current === abort) {
          activeAbortRef.current = null;
        }
        try {
          abort.abort();
        } catch {
          /* ignore */
        }
      }

      if (SERVER_ERROR_MARKER_RE.test(accumulated)) {
        serverErrorMarker = true;
      }

      const finalContent = accumulated;
      const hasPartialContent = finalContent.trim().length > 0;
      const erroredMidStream = serverErrorMarker;

      onUpdateMessages((prev) =>
        prev.map((m) => {
          if (m.id !== assistantId) return m;
          const next: Message = {
            ...m,
            content: finalContent,
            isStreaming: false,
          };
          if (erroredMidStream) {
            next.isError = true;
            next.isIncomplete = true;
          } else if (!completedNormally && hasPartialContent) {
            next.isIncomplete = true;
          }
          return next;
        })
      );

      if (!completedNormally && !hasPartialContent) {
        throw new Error("Stream closed without producing any content");
      }
      return { completedNormally, finalContent };
    },
    [onUpdateMessages, conversationId]
  );

  const handleRegenerate = useCallback(
    async (assistantMessageId: string) => {
      if (!tryStartStreaming()) return;

      try {
        const targetIndex = messages.findIndex(
          (m) => m.id === assistantMessageId
        );
        if (targetIndex === -1) {
          finishStreaming();
          return;
        }

        const lastUserIndex = [...messages]
          .slice(0, targetIndex)
          .findLastIndex((m) => m.role === "user");
        if (lastUserIndex === -1) {
          finishStreaming();
          return;
        }

        const trimmedMessages = messages.slice(0, lastUserIndex + 1);
        const newAssistantId = uuidv4();

        onUpdateMessages(() => [
          ...trimmedMessages,
          {
            id: newAssistantId,
            role: "assistant",
            content: "",
            timestamp: Date.now(),
            isStreaming: true,
          },
        ]);

        try {
          await streamResponse(trimmedMessages, newAssistantId);
        } catch (err) {
          const errorMessage =
            err instanceof Error ? err.message : "Unknown error occurred";
          onUpdateMessages((prev) =>
            prev.map((m) => {
              if (m.id !== newAssistantId) return m;
              if (m.content && m.content.trim().length > 0) {
                return {
                  ...m,
                  isStreaming: false,
                  isIncomplete: true,
                };
              }
              return {
                ...m,
                content: errorMessage,
                isStreaming: false,
                isError: true,
              };
            })
          );
        }
      } finally {
        finishStreaming();
      }
    },
    [messages, onUpdateMessages, streamResponse, tryStartStreaming, finishStreaming]
  );

  const handleSend = useCallback(
    async (textToSend?: string) => {
      const userContent = (textToSend ?? input).trim();
      if (!userContent) return;
      if (!tryStartStreaming()) return;

      try {
        const userMessage: Message = {
          id: uuidv4(),
          role: "user",
          content: userContent,
          timestamp: Date.now(),
        };

        setInput("");

        const firstUserMessage = messages.length === 0;
        if (firstUserMessage && onTitleSuggestion) {
          const truncated =
            userContent.length > 40
              ? `${userContent.slice(0, 40).trimEnd()}…`
              : userContent;
          onTitleSuggestion(truncated);
        }

        onUpdateMessages((prev) => [...prev, userMessage]);

        const nextMessages = [...messages, userMessage];
        const assistantId = uuidv4();
        onUpdateMessages((prev) => [
          ...prev,
          {
            id: assistantId,
            role: "assistant",
            content: "",
            timestamp: Date.now(),
            isStreaming: true,
          },
        ]);

        try {
          await streamResponse(nextMessages, assistantId);
        } catch (err) {
          const errorMessage =
            err instanceof Error ? err.message : "Unknown error occurred";
          onUpdateMessages((prev) =>
            prev.map((m) => {
              if (m.id !== assistantId) return m;
              if (m.content && m.content.trim().length > 0) {
                return {
                  ...m,
                  isStreaming: false,
                  isIncomplete: true,
                };
              }
              return {
                ...m,
                content: errorMessage,
                isStreaming: false,
                isError: true,
              };
            })
          );
        }
      } finally {
        finishStreaming();
      }
    },
    [
      input,
      messages,
      onTitleSuggestion,
      onUpdateMessages,
      streamResponse,
      tryStartStreaming,
      finishStreaming,
    ]
  );

  const handleSuggestionClick = useCallback(
    (text: string) => {
      handleSend(text);
    },
    [handleSend]
  );

  const isFirstAssistantMessage = useCallback(
    (index: number, msgs: Message[]) => {
      const currentMessage = msgs[index];
      if (currentMessage.role !== "assistant") return false;
      if (index === 0) return true;
      return msgs[index - 1].role !== "assistant";
    },
    []
  );

  void cancelStreaming;

  if (!sessionReady) {
    return (
      <div className="flex flex-col h-full w-full bg-[#08070c] overflow-hidden">
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md text-center">
            <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">
              Authentication required
            </h2>
            <p className="text-sm text-foreground-muted">
              Refresh the page and sign in with Google to start a conversation.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-[#07060b] relative overflow-hidden text-foreground">
      {/* Top Header Bar for Mobile & Tablet / Collapsed Sidebar */}
      <header className="h-14 border-b border-purple-950/40 bg-[#0c0b14]/90 backdrop-blur-md flex items-center justify-between px-3 sm:px-4 z-30 flex-shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          {onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className="p-2 rounded-xl text-foreground-muted hover:text-foreground hover:bg-purple-950/40 transition-colors focus:outline-none flex-shrink-0"
              aria-label="Toggle sidebar"
              title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            >
              <PanelLeft className="w-5 h-5 text-purple-300" />
            </button>
          )}
          <div className="flex items-center gap-2 overflow-hidden">
            <Image
              src="/obsidian-gem-small.png"
              alt="Obsidian"
              width={64}
              height={95}
              className="w-4 h-5 object-contain flex-shrink-0"
            />
            <span className="font-bold text-xs sm:text-sm text-foreground tracking-wide font-mono truncate">
              {conversationTitle || "OBSIDIAN"}
            </span>
          </div>
        </div>

        {onNewChat && (
          <button
            onClick={onNewChat}
            className="p-2 rounded-xl border border-purple-800/40 bg-purple-950/30 text-purple-300 hover:text-purple-100 hover:bg-purple-900/40 transition-all flex items-center justify-center flex-shrink-0 shadow-[0_0_10px_rgba(168,85,247,0.15)]"
            aria-label="New chat"
            title="New Chat"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </header>

      {/* Background Radial Glow */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-purple-900/15 via-transparent to-transparent opacity-70" />

      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-chat relative z-10 overscroll-contain"
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-full px-4 py-4 sm:py-6 md:py-8">
            <div className="text-center max-w-4xl mx-auto flex flex-col items-center w-full">
              {/* Official Crystal Gem Logomark */}
              <div className="relative mb-2 sm:mb-3">
                {/* Purple glow aura behind gem */}
                <div className="absolute inset-0 blur-3xl bg-purple-600/20 rounded-full scale-150" />
                <Image
                  src="/obsidian-gem.png"
                  alt="Obsidian Crystal"
                  width={504}
                  height={749}
                  className="relative w-14 sm:w-16 md:w-20 lg:w-24 h-auto object-contain drop-shadow-[0_0_25px_rgba(168,85,247,0.6)] animate-pulse-slow"
                  priority
                />
              </div>

              {/* OBSIDIAN Title */}
              <h1 className="text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-[0.15em] sm:tracking-[0.25em] text-transparent bg-clip-text bg-gradient-to-b from-purple-100 via-purple-400 to-purple-800 drop-shadow-[0_0_35px_rgba(168,85,247,0.35)] uppercase font-mono mb-1.5 sm:mb-2">
                OBSIDIAN
              </h1>

              {/* Diamond Separator Line */}
              <div className="flex items-center gap-3 my-1.5 sm:my-2">
                <div className="h-[1px] w-12 sm:w-16 bg-gradient-to-r from-transparent to-purple-500/50" />
                <Diamond className="w-2.5 h-2.5 fill-purple-400 text-purple-400 shadow-[0_0_8px_#a855f7]" />
                <div className="h-[1px] w-12 sm:w-16 bg-gradient-to-l from-transparent to-purple-500/50" />
              </div>

              {/* Subtitle */}
              <p className="text-xs sm:text-sm md:text-base text-foreground-muted font-medium mb-4 sm:mb-6 md:mb-8 max-w-xs sm:max-w-none px-2">
                {greeting.includes(firstName) ? (
                  <>
                    {greeting.split(firstName)[0]}
                    <span className="text-purple-400 font-bold">{firstName}</span>
                    {greeting.split(firstName)[1]}
                  </>
                ) : (
                  greeting || `${firstName}. State your problem clearly.`
                )}
              </p>

              {/* Desktop Prompt Cards (Hidden on mobile) */}
              <div className="hidden sm:grid grid-cols-3 gap-3 sm:gap-4 md:gap-5 max-w-3xl w-full px-2">
                {currentPrompts.map((item, idx) => {
                  const Icon = item.icon;
                  const isSelected = selectedCardIndex === idx;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setSelectedCardIndex(idx);
                        handleSuggestionClick(item.text);
                      }}
                      className={`group flex flex-col items-center text-center p-3.5 sm:p-4 md:p-5 rounded-2xl border transition-all duration-300 backdrop-blur-md cursor-pointer ${
                        isSelected
                          ? "border-purple-500/80 bg-purple-950/25 shadow-[0_0_25px_rgba(168,85,247,0.2)] ring-1 ring-purple-500/50"
                          : "border-purple-950/40 bg-[#0c0b12]/80 hover:border-purple-500/50 hover:bg-purple-950/20 hover:shadow-[0_0_20px_rgba(168,85,247,0.15)]"
                      }`}
                    >
                      <div className="w-9 h-9 sm:w-10 sm:h-10 md:w-11 md:h-11 rounded-xl border border-purple-500/30 bg-purple-950/40 flex items-center justify-center mb-2.5 sm:mb-3 group-hover:border-purple-400/60 group-hover:bg-purple-900/40 group-hover:shadow-[0_0_15px_rgba(168,85,247,0.3)] transition-all">
                        <Icon className="w-5 h-5 md:w-6 md:h-6 text-purple-400 group-hover:scale-110 transition-transform" />
                      </div>
                      <h3 className="text-[10px] sm:text-xs font-bold tracking-widest text-purple-300 mb-1.5 sm:mb-2 uppercase font-mono">
                        {item.category}
                      </h3>
                      <p className="text-[11px] sm:text-[12px] text-foreground-muted/90 leading-relaxed group-hover:text-foreground transition-colors line-clamp-3">
                        {item.text}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8">
            <div className="space-y-1">
              {messages.map((message, index) => {
                const isLastAssistant =
                  message.role === "assistant" && index === lastAssistantIndex;
                const canRegenerate =
                  isLastAssistant &&
                  !message.isStreaming &&
                  !isStreaming &&
                  !message.isError;

                return (
                  <ChatMessage
                    key={message.id}
                    message={message}
                    isFirstInSequence={isFirstAssistantMessage(
                      index,
                      messages
                    )}
                    isError={message.isError}
                    canRegenerate={canRegenerate}
                    onRetry={
                      message.isError
                        ? () => handleRegenerate(message.id)
                        : undefined
                    }
                    onRegenerate={
                      !message.isError
                        ? () => handleRegenerate(message.id)
                        : undefined
                    }
                  />
                );
              })}
            </div>
            <div ref={messagesEndRef} className="h-1" />
          </div>
        )}
      </div>

      <ChatInput
        value={input}
        onChange={setInput}
        onSubmit={() => handleSend()}
        isStreaming={isStreaming}
        disabled={!sessionReady}
      />
    </div>
  );
}

