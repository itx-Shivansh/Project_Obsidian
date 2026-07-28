"use client";

import { v4 as uuidv4 } from "uuid";
import type { Conversation } from "@/lib/types";

const STORAGE_KEY = "obsidian-conversations";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function getConversations(): Conversation[] {
  if (!isBrowser()) return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    const valid: Conversation[] = [];
    for (const item of parsed) {
      if (
        item &&
        typeof item === "object" &&
        typeof (item as Conversation).id === "string" &&
        typeof (item as Conversation).title === "string" &&
        Array.isArray((item as Conversation).messages) &&
        typeof (item as Conversation).createdAt === "number" &&
        typeof (item as Conversation).updatedAt === "number"
      ) {
        valid.push(item as Conversation);
      }
    }

    return valid;
  } catch (err) {
    console.error("[Storage] Failed to parse conversations:", err);
    return [];
  }
}

export function saveConversations(conversations: Conversation[]): void {
  if (!isBrowser()) return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  } catch (err) {
    console.error("[Storage] Failed to save conversations:", err);
  }
}

export function createConversation(): Conversation {
  const now = Date.now();
  return {
    id: uuidv4(),
    title: "New Chat",
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}
