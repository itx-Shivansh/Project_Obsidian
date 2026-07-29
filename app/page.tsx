"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import ChatWindow from "@/components/ChatWindow";
import SignInGate from "@/components/SignInGate";
import { useAuth } from "@/components/AuthProvider";
import {
  createConversation,
  getConversations,
  saveConversations,
} from "@/lib/storage";
import type { Conversation, Message } from "@/lib/types";
import { Loader2 } from "lucide-react";

export default function Home() {
  const { initialized, user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string>("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mounted, setMounted] = useState(false);

  const userId = user?.id || user?.email || "";

  useEffect(() => {
    if (!initialized || !user) return;

    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setSidebarOpen(false);
    }

    const initial = getConversations(userId);
    if (initial.length === 0) {
      const fresh = createConversation();
      saveConversations([fresh], userId);
      setConversations([fresh]);
      setActiveConversationId(fresh.id);
    } else {
      setConversations(initial);
      const sorted = [...initial].sort((a, b) => b.updatedAt - a.updatedAt);
      setActiveConversationId(sorted[0].id);
    }
    setMounted(true);
  }, [initialized, user, userId]);

  useEffect(() => {
    if (!mounted || !user) return;
    saveConversations(conversations, userId);
  }, [conversations, mounted, user, userId]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId),
    [conversations, activeConversationId]
  );

  const handleCreate = useCallback(() => {
    const fresh = createConversation();
    setConversations((prev) => [fresh, ...prev]);
    setActiveConversationId(fresh.id);
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  }, []);

  const handleSelect = useCallback((id: string) => {
    setActiveConversationId(id);
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  }, []);

  const handleDelete = useCallback(
    (id: string) => {
      setConversations((prev) => {
        const filtered = prev.filter((c) => c.id !== id);
        if (id === activeConversationId) {
          if (filtered.length === 0) {
            const fresh = createConversation();
            setActiveConversationId(fresh.id);
            return [fresh];
          }
          const sorted = [...filtered].sort(
            (a, b) => b.updatedAt - a.updatedAt
          );
          setActiveConversationId(sorted[0].id);
        }
        return filtered;
      });
    },
    [activeConversationId]
  );

  const handleUpdateMessages = useCallback(
    (
      updater: (prev: Message[]) => Message[],
      _conversationId: string = activeConversationId
    ) => {
      const targetId = _conversationId || activeConversationId;
      if (!targetId) return;

      setConversations((prev) => {
        const next: Conversation[] = [];
        for (const conv of prev) {
          if (conv.id === targetId) {
            const newMessages = updater(conv.messages);
            next.push({
              ...conv,
              messages: newMessages,
              updatedAt: Date.now(),
            });
          } else {
            next.push(conv);
          }
        }
        return next;
      });
    },
    [activeConversationId]
  );

  const handleTitleSuggestion = useCallback(
    (title: string) => {
      if (!activeConversationId) return;
      setConversations((prev) => {
        const next: Conversation[] = [];
        for (const conv of prev) {
          if (conv.id === activeConversationId && conv.title === "New Chat") {
            next.push({
              ...conv,
              title,
              updatedAt: Date.now(),
            });
          } else {
            next.push(conv);
          }
        }
        return next;
      });
    },
    [activeConversationId]
  );

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((v) => !v);
  }, []);

  const messages = activeConversation?.messages ?? [];

  if (!initialized) {
    return (
      <div className="flex items-center justify-center h-screen w-full bg-background">
        <div className="flex items-center gap-3 text-foreground-muted">
          <Loader2 className="w-5 h-5 animate-spin text-accent" />
          <span className="text-sm">Loading…</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <SignInGate />;
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background relative">
      <Sidebar
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelect={handleSelect}
        onCreate={handleCreate}
        onDelete={handleDelete}
        isOpen={sidebarOpen}
        onToggle={toggleSidebar}
      />

      <main className="flex-1 min-w-0 h-full flex flex-col relative overflow-hidden">
        {activeConversation ? (
          <ChatWindow
            key={activeConversation.id}
            conversationId={activeConversation.id}
            messages={messages}
            onUpdateMessages={(updater) =>
              handleUpdateMessages(updater, activeConversation.id)
            }
            onTitleSuggestion={handleTitleSuggestion}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={toggleSidebar}
            onNewChat={handleCreate}
            conversationTitle={activeConversation.title}
          />
        ) : null}
      </main>
    </div>
  );
}

