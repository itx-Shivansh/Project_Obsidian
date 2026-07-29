"use client";

import { v4 as uuidv4 } from "uuid";
import type { Conversation } from "@/lib/types";

const BASE_STORAGE_KEY = "obsidian-conversations";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function getStorageKey(userId?: string): string {
  if (!userId) return BASE_STORAGE_KEY;
  return `${BASE_STORAGE_KEY}-${userId}`;
}

export function getConversations(userId?: string): Conversation[] {
  if (!isBrowser()) return [];

  try {
    const key = getStorageKey(userId);
    let raw = window.localStorage.getItem(key);
    
    // Migration: if user-scoped key has no data yet, check for legacy un-scoped data
    if (!raw && userId) {
      const legacyRaw = window.localStorage.getItem(BASE_STORAGE_KEY);
      if (legacyRaw) {
        raw = legacyRaw;
        // Migrate to user-scoped key and remove un-scoped legacy key
        window.localStorage.setItem(key, legacyRaw);
        window.localStorage.removeItem(BASE_STORAGE_KEY);
      }
    }

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

export function saveConversations(conversations: Conversation[], userId?: string): void {
  if (!isBrowser()) return;

  try {
    const key = getStorageKey(userId);
    window.localStorage.setItem(key, JSON.stringify(conversations));
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
