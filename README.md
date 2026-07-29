<div align="center">

# 🔮 Project Obsidian

**A cold, razor-sharp AI assistant — built different.**

[![Next.js](https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![Supabase](https://img.shields.io/badge/Supabase-Auth-green?style=flat-square&logo=supabase)](https://supabase.com)
[![Gemini](https://img.shields.io/badge/Gemini-2.0_Flash-orange?style=flat-square&logo=google)](https://ai.google.dev)
[![Vercel](https://img.shields.io/badge/Deployed-Vercel-black?style=flat-square&logo=vercel)](https://vercel.com)

</div>

---

## What is Obsidian?

Obsidian is a **personality-driven AI chat assistant** built on top of Google's Gemini 2.0 Flash model. Unlike generic AI assistants, Obsidian has a **distinct, sharp, cold persona** — crafted to be brutally witty, concise, and unapologetically direct. It roasts lazy inputs, rewards genuine questions, and never pads its responses with filler.

Technically, it's a full-stack Next.js web app with real authentication, streaming responses, persistent per-user conversation history, cross-session memory, and sensitive context detection — deployed on Vercel with a dark, premium UI.

---

## ✨ Features

### 🤖 AI & Persona
- **Gemini 2.0 Flash** — ultra-fast streaming responses via Server-Sent Events (SSE)
- **Obsidian Persona** — cold, witty, concise. Roasts lazy messages. Expands only for technical/factual questions
- **Multi-key failover** — supports up to 10 `GEMINI_API_KEY` environment variables with automatic rotation on quota exhaustion
- **Fallback model** — Groq (`llama-3.3-70b-versatile`) as a secondary AI provider

### 🧠 Memory System
- **Cross-session memory** — Gemini summarizes past conversations to build a durable user memory stored in Supabase
- **Recent session context** — last N messages from prior sessions are injected into the system prompt for continuity
- **Sensitive context detection** — automatic keyword + regex scanner detects crisis/sensitive messages and switches Obsidian to a fully supportive, non-sarcastic mode

### 🔐 Authentication
- **Supabase Auth** — email/password sign-in with full session persistence
- **Per-user conversation isolation** — chat history scoped to `localStorage` key per `userId`; different accounts never share history
- **Auto-migration** — legacy un-scoped conversations are automatically migrated to the correct user-scoped key on first sign-in

### 💬 Chat Experience
- **Real-time streaming** — token-by-token response rendering using an async generator + ReadableStream pipeline
- **Markdown rendering** — full GFM support (tables, code blocks, blockquotes, lists) via `react-markdown` + `remark-gfm`
- **Syntax highlighting** — code blocks highlighted via `rehype-highlight` + `highlight.js`
- **Conversation sidebar** — create, rename (auto-titled by Gemini), delete, and switch between conversations
- **Incomplete message recovery** — incomplete streamed messages (on disconnect) are flagged and recoverable
- **Copy/Regenerate** — per-message actions on assistant responses

### 📱 Mobile-First Responsive Design
- **iOS safe area insets** — `env(safe-area-inset-bottom)` padding for the chat input on notched devices
- **Touch device support** — delete buttons always visible on hover-less devices; `overscroll-contain` on scroll container
- **No scrollbar on home** — home screen fits within viewport on tablet/laptop without overflow
- **Prompt cards hidden on mobile** — direct access to chat input on small screens
- **iOS zoom prevention** — `font-size: 16px` on inputs prevents auto-zoom on iOS Safari

---

## 🏗️ Architecture

```
Project_Obsidian/
├── app/
│   ├── api/
│   │   ├── chat/          # Streaming chat endpoint (Gemini SSE)
│   │   ├── memory/        # Read/write user memory (Supabase)
│   │   └── title/         # Auto-generate conversation titles
│   ├── globals.css        # Design system, animations, iOS safe area
│   ├── layout.tsx         # Root layout with viewport meta
│   └── page.tsx           # Main app shell (auth gate → chat)
│
├── components/
│   ├── AuthProvider.tsx   # Supabase session context provider
│   ├── ChatInput.tsx      # Message input with file-safe textarea
│   ├── ChatMessage.tsx    # Message bubble (user/assistant) with markdown
│   ├── ChatWindow.tsx     # Full chat view: welcome screen + message list
│   ├── Sidebar.tsx        # Conversation history panel
│   └── SignInGate.tsx     # Auth wall with Obsidian branding
│
└── lib/
    ├── gemini.ts          # Gemini API client (streaming + memory, multi-key)
    ├── groq.ts            # Groq fallback client
    ├── messageAnalysis.ts # Sensitive content detector (keywords + regex)
    ├── storage.ts         # Per-user localStorage CRUD for conversations
    ├── supabaseAdmin.ts   # Server-side Supabase admin client
    ├── supabaseClient.ts  # Browser-side Supabase singleton
    ├── supabaseServer.ts  # Server-side Supabase SSR client
    ├── systemPrompt.ts    # Obsidian persona prompt + dynamic builder
    └── types.ts           # Shared TypeScript interfaces
```

---

## 🧩 Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | [Next.js 14](https://nextjs.org) (App Router) |
| **Language** | TypeScript 5 |
| **Styling** | Tailwind CSS 3 + Vanilla CSS |
| **AI (Primary)** | Google Gemini 2.0 Flash |
| **AI (Fallback)** | Groq — `llama-3.3-70b-versatile` |
| **Auth & DB** | [Supabase](https://supabase.com) (Auth + Postgres) |
| **Markdown** | `react-markdown` + `remark-gfm` + `rehype-highlight` |
| **Icons** | `lucide-react` |
| **Deployment** | [Vercel](https://vercel.com) |

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- A [Supabase](https://supabase.com) project (free tier is fine)
- A [Google AI Studio](https://aistudio.google.com) API key (Gemini)
- Optionally a [Groq](https://console.groq.com) API key

### 1. Clone the repo

```bash
git clone https://github.com/itx-Shivansh/Project_Obsidian.git
cd Project_Obsidian
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

Copy the example file and fill in your keys:

```bash
cp .env.local.example .env.local
```

```env
# .env.local

# Google Gemini (required) — add multiple keys for failover
GEMINI_API_KEY=your_gemini_key_here
GEMINI_API_KEY_2=optional_second_key
GEMINI_API_KEYS=key1,key2,key3   # or comma-separated list

# Groq (optional fallback)
GROQ_API_KEY=your_groq_key_here

# Supabase (required for auth + memory)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## ☁️ Deployment (Vercel)

This project is configured for one-click Vercel deployment. Every push to `main` auto-deploys.

1. Push to GitHub
2. Connect the repo to [Vercel](https://vercel.com)
3. Add all environment variables in **Vercel → Project → Settings → Environment Variables**
4. Deploy — Vercel handles the rest

> ⚠️ **Important:** `.env.local` is never committed to Git. You **must** add all env vars manually in the Vercel dashboard.

---

## 🔑 Multi-Key Gemini Failover

Obsidian supports automatic API key rotation when a key hits its rate limit:

```env
# Option 1 — comma-separated list
GEMINI_API_KEYS=key_a,key_b,key_c

# Option 2 — numbered keys
GEMINI_API_KEY=key_a
GEMINI_API_KEY_2=key_b
GEMINI_API_KEY_3=key_c
```

When a key returns HTTP 429 (quota exhausted), the system transparently retries with the next available key — no downtime, no error shown to the user.

---

## 🛡️ Sensitive Context Detection

Obsidian automatically detects when a user is in distress and **completely drops its sarcastic persona** to provide clear, compassionate support.

Detection covers:
- Mental health crises (suicidal ideation, self-harm, panic attacks)
- Medical emergencies (heart attack, seizure, overdose)
- Safety crises (domestic violence, assault, stalking)
- Legal/life emergencies (arrest, court, custody)
- Grief and loss

The detector scans the last 2 user messages using keyword matching + regex patterns before each AI request.

---

## 🎨 Design System

- **Font:** Inter (Google Fonts)
- **Palette:** Deep obsidian blacks (`#0a0a0a`, `#111`, `#1a1a1a`) with crystal-violet accents (`#8b5cf6`, `#6d28d9`)
- **Glassmorphism** — `backdrop-blur` + semi-transparent surfaces throughout
- **Micro-animations** — message fade-in, typing indicator pulse, sidebar hover transitions
- **Dark mode only** — built exclusively for dark mode

---

## 📄 License

This is a private project by **Shivansh**. All rights reserved.

---

<div align="center">
  <sub>Built by Shivansh • Powered by Gemini 2.0 Flash • Deployed on Vercel</sub>
</div>
