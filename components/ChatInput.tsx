"use client";

import { useEffect, useRef } from "react";
import { Send } from "lucide-react";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isStreaming: boolean;
  disabled?: boolean;
}

export default function ChatInput({
  value,
  onChange,
  onSubmit,
  isStreaming,
  disabled = false,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    const lineHeight = parseInt(getComputedStyle(textarea).lineHeight);
    const maxHeight = lineHeight * 6 + 24;
    const newHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${newHeight}px`;
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !isStreaming && !disabled) {
        onSubmit();
      }
    }
  };

  const isDisabled = disabled || !value.trim() || isStreaming;

  return (
    <div className="border-t border-purple-950/30 bg-[#07060b]/90 backdrop-blur-md relative z-20 pb-safe">
      <div className="max-w-3xl mx-auto px-3 sm:px-6 py-2.5 sm:py-4">
        <div className="relative flex items-center gap-2 sm:gap-3 bg-[#0d0c14] border border-purple-900/40 rounded-[24px] sm:rounded-full px-3.5 sm:px-5 py-1.5 sm:py-2.5 focus-within:border-purple-500/60 focus-within:shadow-[0_0_20px_rgba(168,85,247,0.15)] transition-all">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={disabled ? "Sign in with Google to message Obsidian…" : "Message Obsidian..."}
            rows={1}
            disabled={isStreaming || disabled}
            className="flex-1 bg-transparent resize-none outline-none text-foreground text-[16px] sm:text-sm leading-relaxed placeholder:text-foreground-muted/50 max-h-[140px] sm:max-h-[160px] overflow-y-auto disabled:opacity-50 disabled:cursor-not-allowed scrollbar-thin py-1"
          />
          <button
            onClick={onSubmit}
            disabled={isDisabled}
            className={`flex-shrink-0 p-2.5 sm:p-2 rounded-full transition-all duration-200 min-w-[40px] min-h-[40px] flex items-center justify-center ${
              isDisabled
                ? "text-purple-500/20 cursor-not-allowed"
                : "text-purple-400 hover:text-purple-200 hover:bg-purple-900/30 active:scale-95 shadow-[0_0_10px_rgba(168,85,247,0.2)]"
            }`}
            aria-label="Send message"
          >
            <Send className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>
        <p className="hidden sm:block text-center text-[11px] text-foreground-muted/40 mt-2 font-mono">
          Press Enter to send, Shift+Enter for newline
        </p>
      </div>
    </div>
  );
}
