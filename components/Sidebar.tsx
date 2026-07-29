"use client";

import { useState } from "react";
import Image from "next/image";
import {
  Plus,
  Trash2,
  PanelLeftClose,
  PanelLeft,
  LogOut,
  Diamond,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import type { Conversation } from "@/lib/types";

function relativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHrs = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHrs / 24);

  if (diffDays >= 1) return `${diffDays}d ago`;
  if (diffHrs >= 1) return `${diffHrs}h ago`;
  if (diffMin >= 1) return `${diffMin}m ago`;
  return "Just now";
}

function initialsFromName(name: string | null | undefined): string {
  if (!name) return "?";
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

interface SidebarProps {
  conversations: Conversation[];
  activeConversationId: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

export default function Sidebar({
  conversations,
  activeConversationId,
  onSelect,
  onCreate,
  onDelete,
  isOpen,
  onToggle,
}: SidebarProps) {
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const { user, signOut } = useAuth();
  const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);

  const displayName =
    user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || "Signed in";
  const displayEmail = user?.email ?? "";
  const avatarInitials = initialsFromName(
    user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email
  );
  const avatarUrl =
    (user?.user_metadata?.avatar_url as string | undefined) ?? null;

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/70 z-30 lg:hidden backdrop-blur-sm transition-opacity"
          onClick={onToggle}
        />
      )}

      {/* Main Sidebar Container */}
      <aside
        className={`fixed lg:relative inset-y-0 left-0 z-40 flex flex-col h-full bg-[#0d0c14] border-r border-purple-950/40 transition-all duration-300 ease-in-out overflow-hidden flex-shrink-0 ${
          isOpen
            ? "w-[260px] translate-x-0 opacity-100 shadow-2xl lg:shadow-none"
            : "w-[260px] -translate-x-full lg:translate-x-0 lg:w-0 lg:opacity-0 lg:border-r-0 pointer-events-none"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-purple-950/30 h-14 flex-shrink-0 bg-[#0d0c14]">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-7 h-7 rounded-lg bg-purple-950/60 border border-purple-500/40 flex items-center justify-center shadow-[0_0_12px_rgba(168,85,247,0.4)] flex-shrink-0">
              <Image
                src="/obsidian-gem-small.png"
                alt="Obsidian"
                width={64}
                height={95}
                className="w-4 h-5 object-contain filter drop-shadow-[0_0_6px_rgba(168,85,247,0.8)]"
              />
            </div>
            <h2 className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-200 via-purple-400 to-purple-500 tracking-widest uppercase text-sm font-mono">
              OBSIDIAN
            </h2>
          </div>
          <button
            onClick={onToggle}
            className="p-1.5 rounded-lg text-foreground-muted hover:text-foreground hover:bg-purple-950/30 transition-colors focus:outline-none flex-shrink-0"
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
          >
            <PanelLeftClose className="w-4 h-4 text-foreground-muted/70 hover:text-foreground" />
          </button>
        </div>

        {/* New Chat Action */}
        <div className="p-3 flex-shrink-0 bg-[#0d0c14]">
          <button
            onClick={onCreate}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-purple-600/40 bg-purple-950/20 hover:bg-purple-900/30 hover:border-purple-500/70 text-foreground transition-all duration-200 text-sm font-medium shadow-[0_0_15px_rgba(168,85,247,0.1)] focus:outline-none"
          >
            <Plus className="w-4 h-4 text-purple-400" />
            <span className="truncate">New Chat</span>
          </button>
        </div>

        {/* Recent Chats Divider Header */}
        <div className="px-4 pt-3 pb-1 flex items-center gap-2 flex-shrink-0">
          <span className="text-[10px] font-bold tracking-wider uppercase text-foreground-muted/50 font-mono">
            RECENT CHATS
          </span>
          <div className="flex-1 h-[1px] bg-purple-950/30" />
        </div>

        {/* Scrollable Conversation List */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-chat py-1 px-2 min-h-0 space-y-1">
          {sorted.length === 0 ? (
            <div className="text-center text-xs text-foreground-muted/50 px-4 py-8 select-none font-mono">
              No conversations yet.
            </div>
          ) : (
            <ul className="space-y-1">
              {sorted.map((conv) => {
                const isActive = conv.id === activeConversationId;
                const isPendingDelete = pendingDeleteId === conv.id;

                return (
                  <li key={conv.id}>
                    <div
                      className={`group flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-150 relative ${
                        isActive
                          ? "bg-purple-950/40 text-foreground border border-purple-800/40 shadow-sm"
                          : "text-foreground-muted/80 hover:text-foreground hover:bg-purple-950/20 border border-transparent"
                      }`}
                    >
                      {isActive && (
                        <div className="absolute left-0 top-2 bottom-2 w-1 bg-purple-500 rounded-r-full shadow-[0_0_8px_#a855f7]" />
                      )}
                      <button
                        onClick={() => onSelect(conv.id)}
                        className="flex-1 min-w-0 text-left focus:outline-none"
                        title={conv.title}
                      >
                        <div
                          className={`text-xs font-medium truncate ${
                            isActive
                              ? "text-foreground font-semibold"
                              : "text-foreground-muted/90 group-hover:text-foreground"
                          }`}
                        >
                          {conv.title}
                        </div>
                        <div className="text-[10px] text-foreground-muted/50 mt-0.5 font-sans">
                          {relativeTime(conv.updatedAt)}
                        </div>
                      </button>

                      {isPendingDelete ? (
                        <div
                          className="flex items-center gap-1 flex-shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => {
                              onDelete(conv.id);
                              setPendingDeleteId(null);
                            }}
                            className="px-2 py-0.5 rounded-md text-[11px] font-semibold text-white bg-red-600 hover:bg-red-500 transition-colors focus:outline-none"
                          >
                            Yes
                          </button>
                          <button
                            onClick={() => setPendingDeleteId(null)}
                            className="px-2 py-0.5 rounded-md text-[11px] font-medium text-foreground-muted hover:text-foreground transition-colors focus:outline-none"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setPendingDeleteId(conv.id);
                            window.setTimeout(() => {
                              setPendingDeleteId((cur) =>
                                cur === conv.id ? null : cur
                              );
                            }, 4000);
                          }}
                          className="chat-delete-btn opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-foreground-muted hover:text-red-400 hover:bg-red-500/10 transition-all flex-shrink-0 focus:outline-none"
                          aria-label="Delete conversation"
                          title="Delete conversation"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Permanently Anchored Bottom Profile Section */}
        <div className="flex-shrink-0 border-t border-purple-950/40 bg-[#0b0a10] p-3 mt-auto">
          <div className="flex items-center gap-2.5 p-2 rounded-xl bg-purple-950/20 border border-purple-900/30 shadow-sm overflow-hidden">
            <div className="flex-shrink-0">
              {avatarUrl ? (
                <Image
                  src={avatarUrl}
                  alt={displayName}
                  referrerPolicy="no-referrer"
                  width={32}
                  height={32}
                  unoptimized
                  className="w-8 h-8 rounded-full object-cover ring-1 ring-purple-500/40"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-purple-900/50 border border-purple-500/40 flex items-center justify-center text-xs font-bold text-purple-300">
                  {avatarInitials}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0 overflow-hidden">
              <div
                className="truncate text-xs font-semibold text-foreground"
                title={displayName}
              >
                {displayName}
              </div>
              <div
                className="truncate text-[10px] text-foreground-muted/60"
                title={displayEmail || "Signed in"}
              >
                {displayEmail || "Signed in"}
              </div>
            </div>
            <button
              type="button"
              onClick={signOut}
              className="p-1.5 rounded-lg text-foreground-muted hover:text-red-400 hover:bg-red-500/10 transition-all flex-shrink-0 focus:outline-none"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Toggle Button when Sidebar is Closed */}
      <button
        onClick={onToggle}
        className={`fixed top-3 left-3 z-30 p-2 rounded-xl border border-purple-900/40 bg-[#0d0c14]/90 backdrop-blur-md text-foreground-muted hover:text-foreground hover:border-purple-500/40 transition-all duration-200 shadow-lg focus:outline-none ${
          isOpen ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
        aria-label="Open sidebar"
        title="Open sidebar"
      >
        <PanelLeft className="w-4 h-4 text-purple-400" />
      </button>
    </>
  );
}


