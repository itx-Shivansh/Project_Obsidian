"use client";

import { useCallback, useMemo, useState } from "react";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import {
  Circle,
  RefreshCw,
  Copy as CopyIcon,
  Check as CheckIcon,
  AlertTriangle,
} from "lucide-react";
import type { Message } from "@/lib/types";

interface ChatMessageProps {
  message: Message;
  isFirstInSequence?: boolean;
  isError?: boolean;
  canRegenerate?: boolean;
  onRetry?: () => void;
  onRegenerate?: () => void;
}

function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-1 align-middle ml-0.5 w-[26px] h-[20px] flex-shrink-0">
      <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: "0ms" }} />
      <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: "150ms" }} />
      <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: "300ms" }} />
    </span>
  );
}

function StreamingCursor() {
  return (
    <span className="inline-block w-2 h-5 ml-0.5 bg-accent animate-pulse align-middle" />
  );
}

function useCopyRevert(delayMs = 2000): [boolean, () => void] {
  const [copied, setCopied] = useState(false);
  const trigger = useCallback(() => {
    setCopied(true);
    window.setTimeout(() => setCopied(false), delayMs);
  }, [delayMs]);
  return [copied, trigger];
}

function CopyButton({
  value,
  size = "sm",
  label,
}: {
  value: string;
  size?: "sm" | "xs";
  label?: string;
}) {
  const [copied, trigger] = useCopyRevert(2000);
  const dims = size === "xs" ? "w-3.5 h-3.5" : "w-4 h-4";
  const pad = size === "xs" ? "px-2 py-1 text-[11px]" : "px-2.5 py-1.5 text-xs";

  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          trigger();
        } catch (err) {
          console.error("Copy failed:", err);
        }
      }}
      className={`inline-flex items-center gap-1.5 rounded-md border border-border bg-background-secondary/60 text-foreground-muted hover:text-foreground hover:border-accent/40 hover:bg-background-secondary transition-all ${pad} font-medium focus:outline-none focus:ring-2 focus:ring-accent/60 focus:border-accent/50`}
      title="Copy to clipboard"
    >
      {copied ? (
        <>
          <CheckIcon className={`${dims} text-green-400`} />
          <span className="text-green-400">{label ? `Copied` : ""}</span>
        </>
      ) : (
        <>
          <CopyIcon className={dims} />
          {label ? <span>{label}</span> : null}
        </>
      )}
    </button>
  );
}

function CodeBlock({
  inline,
  className,
  children,
}: {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  const text = useMemo(() => {
    if (typeof children === "string") return children;
    if (Array.isArray(children)) {
      return children
        .map((c) => (typeof c === "string" ? c : ""))
        .join("");
    }
    return "";
  }, [children]);

  if (inline) {
    return (
      <code
        className={`${
          className ?? ""
        } rounded-md bg-background-secondary px-1.5 py-0.5 text-[0.85em] text-accent-light font-mono border border-border/70 whitespace-pre-wrap break-all`}
      >
        {children}
      </code>
    );
  }

  const langMatch = /language-(\S+)/.exec(className ?? "");
  const detectedLang = langMatch ? langMatch[1] : "";

  return (
    <div className="relative my-5 rounded-xl border border-border overflow-hidden shadow-md bg-[#0e0e10] not-prose">
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-border bg-background-secondary/80">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5 mr-2">
            <div className="w-3 h-3 rounded-full bg-red-500/70" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
            <div className="w-3 h-3 rounded-full bg-green-500/70" />
          </div>
          <span className="text-xs font-medium font-mono text-foreground-muted tracking-wide uppercase">
            {detectedLang || "code"}
          </span>
        </div>
        <CopyButton value={text} size="xs" label="Copy" />
      </div>
      <pre className="overflow-x-auto scrollbar-chat">
        <code className={`${className ?? ""} block p-4 text-[13.5px] leading-relaxed font-mono`}>
          {children}
        </code>
      </pre>
    </div>
  );
}

function StreamingWrap({
  isThinking,
  isStreaming,
  children,
}: {
  isThinking: boolean;
  isStreaming: boolean;
  children: React.ReactNode;
}) {
  if (!isThinking && !isStreaming) {
    return <>{children}</>;
  }
  return (
    <span className="markdown-streaming-wrap">
      {children}
      <span className="inline-flex align-middle h-[20px] flex-shrink-0">
        {isThinking ? <ThinkingDots /> : <StreamingCursor />}
      </span>
    </span>
  );
}

function IncompleteBanner({
  showRetry,
  onRetry,
}: {
  showRetry: boolean;
  onRetry?: () => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/5 text-amber-300 text-xs">
      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
      <span className="flex-1 min-w-0">
        Response may be incomplete — the connection was interrupted before streaming finished.
      </span>
      {showRetry && onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/15 hover:text-white hover:border-amber-500/50 transition-colors font-medium focus:outline-none focus:ring-2 focus:ring-accent/60"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry
        </button>
      )}
    </div>
  );
}

export default function ChatMessage({
  message,
  isFirstInSequence = false,
  isError = false,
  canRegenerate = false,
  onRetry,
  onRegenerate,
}: ChatMessageProps) {
  const isUser = message.role === "user";
  const isThinking = !!message.isStreaming && message.content.length === 0;
  const showActions =
    !isUser && !isError && !message.isStreaming && message.content.length > 0;
  const retryHandler = onRetry ?? onRegenerate;
  const incompleteBannerVisible =
    !isUser && !isError && !!message.isIncomplete && !message.isStreaming;

  return (
    <div
      className={`group/message flex w-full mb-6 sm:mb-8 animate-fade-in ${
        isUser ? "justify-end" : "justify-start"
      }`}
    >
      <div
        className={`max-w-[92%] sm:max-w-[85%] lg:max-w-[78%] ${
          isUser ? "order-2" : "order-1"
        } w-full`}
      >
        {!isUser && isFirstInSequence && (
          <div className="flex items-center gap-2 mb-2.5 ml-1 h-5">
            <div className="w-4 h-4 flex items-center justify-center">
              <Image
                src="/obsidian-gem-small.png"
                alt="Obsidian"
                width={64}
                height={95}
                className="w-3.5 h-4 object-contain filter drop-shadow-[0_0_6px_rgba(168,85,247,0.7)]"
              />
            </div>
            <span className="text-xs font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-300 to-purple-500 tracking-wider uppercase font-mono">
              {isError ? "Error" : "Obsidian"}
            </span>
          </div>
        )}

        {isUser ? (
          <div className="bg-[#14121f] border border-purple-900/30 rounded-2xl rounded-tr-sm px-4 sm:px-5 py-3 sm:py-3.5 shadow-sm ml-auto max-w-full">
            <div
              data-message-content
              className="text-foreground text-[15px] leading-relaxed whitespace-pre-wrap break-words"
            >
              {message.content}
            </div>
          </div>
        ) : isError ? (
          <div className="px-1 py-1 w-full">
            <div
              data-message-content
              className="text-[15px] leading-relaxed whitespace-pre-wrap break-words text-red-400"
            >
              {message.content || "Something went wrong."}
            </div>
            {retryHandler && (
              <button
                onClick={retryHandler}
                className="mt-3 inline-flex items-center gap-1.5 text-sm text-red-400 hover:text-red-300 transition-colors px-3 py-1.5 rounded-lg border border-red-500/30 hover:border-red-500/50 hover:bg-red-500/5 font-medium focus:outline-none focus:ring-2 focus:ring-red-500/50"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry
              </button>
            )}
          </div>
        ) : (
          <div className="px-1 py-1 w-full">
            <div data-message-content className="markdown-content text-foreground text-[15px] leading-relaxed break-words min-h-[24px]">
              <StreamingWrap
                isThinking={!!isThinking}
                isStreaming={!!message.isStreaming}
              >
                <ReactMarkdown
                  remarkPlugins={[[remarkGfm, { singleTilde: true, tableCellPadding: true }]]}
                  rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
                  components={{
                    code(props) {
                      const { inline, className, children, ...rest } = props as React.ClassAttributes<HTMLElement> &
                        React.HTMLAttributes<HTMLElement> & {
                          inline?: boolean;
                          className?: string;
                        };
                      return (
                        <CodeBlock
                          inline={inline}
                          className={className}
                          {...rest}
                        >
                          {children}
                        </CodeBlock>
                      );
                    },
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              </StreamingWrap>
            </div>

            {incompleteBannerVisible && (
              <IncompleteBanner
                showRetry={canRegenerate}
                onRetry={onRegenerate}
              />
            )}

            {showActions && (
              <div className="flex items-center gap-2 mt-3 ml-0.5 opacity-100 sm:opacity-0 sm:group-hover/message:opacity-100 focus-within:opacity-100 transition-opacity duration-200">
                {canRegenerate && onRegenerate && (
                  <button
                    onClick={onRegenerate}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-purple-900/40 bg-[#0e0d16] text-foreground-muted hover:text-foreground hover:border-purple-500/50 hover:bg-purple-950/30 transition-all focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                    title="Regenerate this response"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-purple-400" />
                    Regenerate
                  </button>
                )}
                <CopyButton value={message.content} label="Copy" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
