# Agent-Oriented Knowledge Base for Script Compliance Analysis

This folder contains **agent-ready documentation** to study or implement a **smart AI agent** that performs script compliance analysis against GCAM (ضوابط المحتوى الإعلامي). The goal is to move from a single general-purpose model to an **agent with custom skills and memory** that combines:

1. **Legal precision** — Understanding regulations and articles down to the smallest detail.
2. **Film industry & scenario writing** — Understanding scripts, scenes, dramatic context, and narrative intent.
3. **Arabic & English narration** — Understanding dialogue, tone, and cultural nuance in both languages.

The documents below are designed so that:
- An agent (or agent framework) can be given these as **skills** or **knowledge**.
- A team can **study** how the current system works and design an agent-based replacement.
- Prompts and pipeline are **fully specified** so they can be replicated or extended.

---

## Document Index

| File | Purpose |
|------|--------|
| **AGENT_01_ANALYSIS_PIPELINE.md** | How the analysis works: stages, data flow, chunking, Router → Judge → Auditor → Aggregation. Technical reference for the full pipeline. |
| **AGENT_02_PROMPTS_REFERENCE.md** | All prompts sent to the AI: Router, Judge (single + Multi-Pass), Deep Auditor, Rationale-only, Revisit Spotter. Full text for replication or agent skills. |
| **AGENT_03_ARTICLES_AND_ATOMS_DETAILED.md** | Every GCAM article and atom with detailed "what to find," legal nuance, film/narration context, and Arabic/English considerations. The law + film + language skill base. |

---

## Suggested Use for an Agent Implementation

1. **Load pipeline doc** — So the agent knows the sequence: chunk → lexicon → router → multi-pass judge → auditor → rationale (if needed) → aggregation → report gate → words to revisit.
2. **Load prompts** — As system instructions or tools the agent can invoke (or as templates for a backend that still uses OpenAI under the hood).
3. **Load articles/atoms doc** — As the agent’s "policy knowledge": what each article and atom means and what to look for in script text (legal detail, film context, language).
4. **Memory** — The agent can maintain notes, story summaries, and per-script context (e.g. character arcs, tone) to improve consistency and rationale quality across chunks.

---

## Current vs. Agent Vision

| Aspect | Current system | Agent vision |
|--------|----------------|---------------|
| **Model** | Single OpenAI model(s) per step | Same model(s) at first, but orchestrated by an agent |
| **Knowledge** | In prompts only, stateless | Custom skills (docs above) + **persistent memory** (notes, narrations) |
| **Expertise** | Generic LLM | Agent trained/configured as "legal + film + language" expert |
| **Context** | Per-chunk only | Agent can hold script-level narrative and prior findings |

These docs are the first step: **capture what we do today** in a form an agent can use, then iterate on design and implementation.
