# Product

## Register

product

## Users

Anyone who wants to manage and route AI model requests through a local proxy — from developers running multiple AI tools to non-technical users who just want to switch between models without touching config files. They open Aether to check proxy status, switch presets, and occasionally debug requests. The app sits alongside their daily workflow; it should never feel intimidating.

## Product Purpose

Aether is a macOS desktop app that manages a local AI proxy sidecar. It lets users create presets (model + provider configurations), store API keys securely, monitor live requests, and control the proxy lifecycle — all through a GUI instead of YAML files. Success means a non-technical user can set it up and switch models in under two minutes without reading docs.

## Brand Personality

Polished, warm, approachable. Like a premium consumer app that happens to do something technical. It should feel closer to Arc Browser or a well-crafted macOS utility than to a developer dashboard or SaaS product.

Three words: **refined, friendly, confident.**

## Anti-references

- Dark glassmorphism: blur-heavy cards, neon glows, `rgba` everything — the current design
- Neon AI startup: purple/pink gradients, cyberpunk palette, "AI" clichés
- Enterprise dashboard: dense green/teal data grids, corporate feel
- Flat white minimal: no depth, no personality, sterile

## Design Principles

1. **Consumer-grade polish** — every interaction should feel as considered as a first-party macOS app. Rounded, smooth, intentional.
2. **Depth through structure, not blur** — elevation and layering via color and shadow, never backdrop-filter as a default.
3. **Non-tech first** — labels, empty states, and status indicators should be readable by someone who has never used a proxy before.
4. **Both themes are first-class** — dark mode is warm and rich, not cold and gloomy. Light mode has character, not just white backgrounds.
5. **Restraint with personality** — premium means knowing what to leave out. One strong accent, generous whitespace, no decorative noise.

## Accessibility & Inclusion

WCAG AA minimum. Both themes must meet contrast requirements independently. Reduced motion respected for animations. Status indicators must never rely on color alone (pair with text or icon).
