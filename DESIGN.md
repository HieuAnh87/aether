---
name: Aether
description: AI proxy manager for macOS — warm, polished, built to last.
colors:
  amber: "#C97B2E"
  amber-light: "#E8943A"
  dark-base: "#0F0E0C"
  dark-elevated: "#1A1916"
  dark-surface: "#242220"
  dark-border: "#2E2C28"
  light-base: "#F7F4EF"
  light-elevated: "#EFECE6"
  light-surface: "#E8E4DC"
  light-border: "#D4CFC6"
  text-primary-dark: "#F0EDE8"
  text-secondary-dark: "#9E9890"
  text-tertiary-dark: "#6B6560"
  text-primary-light: "#2C2820"
  text-secondary-light: "#6B6358"
  text-tertiary-light: "#6B6358"
  text-mist-light: "#9E9488"
  success: "#4A9B6F"
  success-text-light: "#2D6B4A"
  error: "#C45C4A"
  error-text-light: "#8A3020"
  warning: "#C97B2E"
  warning-text-light: "#7A4A10"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
  micro:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "0.02em"
  mono:
    fontFamily: "'SF Mono', ui-monospace, 'Cascadia Code', monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
  xl: "14px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.amber}"
    textColor: "{colors.text-primary-light}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.amber-light}"
    textColor: "{colors.text-primary-light}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "36px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-secondary-dark}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "36px"
  button-danger:
    backgroundColor: "{colors.error}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "36px"
  input:
    backgroundColor: "{colors.dark-elevated}"
    textColor: "{colors.text-primary-dark}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "36px"
  card:
    backgroundColor: "{colors.dark-elevated}"
    textColor: "{colors.text-primary-dark}"
    rounded: "{rounded.lg}"
    padding: "24px"
---

# Design System: Aether

## 1. Overview

**Creative North Star: "The Warm Machine"**

Aether is a technical tool that refuses to feel cold. Where most developer utilities default to blue-black darkness and neon accents, Aether leans into warmth: brown-tinted neutrals, amber as the single accent, surfaces that feel like worn leather rather than a server rack. The machine is precise and capable; the warmth makes it approachable to anyone, not just engineers.

Both themes are first-class citizens. Dark mode is not the default because "tools look cool dark" — it's for the developer at their desk at night, ambient light low, wanting focus without eye strain. Light mode is for the same person at a coffee shop, laptop open, wanting clarity. Neither theme is an afterthought. The warm tint carries through both: dark surfaces trend toward brown-gray, light surfaces toward parchment.

The system rejects everything the current design represents: glassmorphism as decoration, blue-purple SaaS gradients, neon glows, and the cold `#0A0A12` void. It also rejects the opposite extreme — flat white sterility with no depth or character. Depth comes from tonal layering and structural shadows, not blur.

**Key Characteristics:**
- Warm-tinted neutrals in both themes; no pure black or white anywhere
- Amber as the single accent, used sparingly (status, primary actions, active states)
- Elevation through tonal steps, not backdrop-filter
- Rounded corners (12-14px) that feel consumer-grade, not enterprise-boxy
- System font stack (SF Pro) used with real hierarchy — weight and size contrast, not flat uniformity
- Status indicators always pair color with text or icon; never color alone

## 2. Colors: The Warm Graphite Palette

A restrained palette built on warm graphite neutrals with a single amber accent. The neutrals carry a subtle brown-orange tint (chroma 0.006-0.010 in OKLCH) that prevents the cold, clinical feel of pure gray. Amber appears only where it earns its place.

### Primary
- **Burnished Amber** (`#C97B2E`, oklch(58% 0.13 55)): The single accent. Used for primary buttons, active nav states, focus rings, and key status indicators. Appears on ≤10% of any screen. Its rarity is the point.
- **Amber Hover** (`#E8943A`, oklch(66% 0.14 55)): Hover and pressed state for amber elements only.

### Neutral (Dark Theme)
- **Deep Warm Void** (`#0F0E0C`, oklch(8% 0.006 60)): App base background. Not black — a very dark brown-gray.
- **Lifted Graphite** (`#1A1916`, oklch(12% 0.007 60)): Sidebar, elevated panels, modal backdrops.
- **Surface Graphite** (`#242220`, oklch(16% 0.008 60)): Cards, input backgrounds, secondary surfaces.
- **Graphite Border** (`#2E2C28`, oklch(20% 0.007 60)): Dividers, card borders, input strokes.
- **Warm White** (`#F0EDE8`, oklch(93% 0.006 60)): Primary text on dark.
- **Ash** (`#9E9890`, oklch(63% 0.007 60)): Secondary text, labels, placeholders.
- **Cinder** (`#6B6560`, oklch(44% 0.007 60)): Tertiary text, disabled states.

### Neutral (Light Theme)
- **Parchment** (`#F7F4EF`, oklch(96% 0.006 75)): App base background. Warm cream, not white.
- **Vellum** (`#EFECE6`, oklch(93% 0.007 75)): Sidebar, elevated panels.
- **Linen** (`#E8E4DC`, oklch(90% 0.008 75)): Cards, secondary surfaces.
- **Seam** (`#D4CFC6`, oklch(83% 0.008 75)): Borders, dividers.
- **Ink** (`#2C2820`, oklch(18% 0.008 60)): Primary text on light.
- **Faded Ink** (`#6B6358`, oklch(42% 0.009 60)): Secondary text.
- **Mist** (`#9E9488`, oklch(61% 0.009 60)): Decorative only — placeholders, divider labels, non-essential chrome. Fails WCAG AA on light backgrounds; use Faded Ink (`#6B6358`) for any readable text on light.

### Semantic
- **Sage** (`#4A9B6F`, oklch(60% 0.10 155)): Success states. Muted, not neon green.
- **Ember** (`#C45C4A`, oklch(50% 0.12 25)): Error states. Terracotta, not fire-engine red.
- **Amber** (same as primary): Warning states. Amber doubles as warning; no separate color needed.

### Named Rules
**The One Voice Rule.** Amber appears on ≤10% of any screen. It marks what matters: the active preset, the primary action, the running proxy. Dilute it and it loses its signal.

**The No-Pure-Neutral Rule.** Every surface, text color, and border carries a warm tint. `#000000`, `#ffffff`, and pure gray (`oklch(X% 0 0)`) are prohibited. The minimum chroma for any neutral is 0.005.

## 3. Typography

**Display/Body Font:** SF Pro Display / SF Pro Text (system-ui fallback)
**Mono Font:** SF Mono (ui-monospace fallback)

**Character:** The system font stack is not a compromise — on macOS it's the sharpest, most legible option available. The hierarchy comes from weight and size contrast, not from mixing typefaces. Display at 600 weight, body at 400, labels at 500 small-caps feel: the scale has personality without importing a custom font.

### Hierarchy
- **Display** (600 weight, 24px, line-height 1.2, -0.01em tracking): Page titles only. One per screen.
- **Title** (500 weight, 16px, line-height 1.4): Section headers, card titles, modal headings.
- **Body** (400 weight, 14px, line-height 1.5): All prose, descriptions, list content. Max line length 65ch.
- **Label** (400 weight, 12px, line-height 1.4): Supporting text, metadata, timestamps, secondary info.
- **Micro** (500 weight, 11px, line-height 1.2, 0.02em tracking): Badges, status chips, uppercase tags. Always paired with a visual container.
- **Mono** (400 weight, 13px, line-height 1.5): Endpoints, port numbers, API keys, code values. Amber tint on dark backgrounds for technical values.

### Named Rules
**The One Title Rule.** One Display heading per screen. Section headers use Title. Never two Display headings in the same view.

**The No-Flat-Scale Rule.** Adjacent text elements must differ by at least 1.25x in size OR by at least 200 in font weight. A 14px/400 label next to a 14px/400 heading is prohibited.

## 4. Elevation

Aether uses tonal layering as its primary depth mechanism. Surfaces step up in lightness as they get closer to the user — base, elevated, surface — with no blur or backdrop-filter involved. Shadows are structural: they appear only on floating elements (modals, dropdowns, tooltips) and only to separate, not to decorate.

### Shadow Vocabulary
- **Ambient Low** (`0 2px 8px rgba(0,0,0,0.18)`): Subtle separation for cards in light mode. Not used in dark mode.
- **Float** (`0 8px 32px rgba(0,0,0,0.28), 0 2px 8px rgba(0,0,0,0.16)`): Modals, dropdowns, popovers. Signals "this is above the page."
- **Glow Amber** (`0 0 0 3px rgba(201,123,46,0.25)`): Focus ring for interactive elements. Replaces the blue ring from the current design.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest. Shadows appear only on floating layers (modal, dropdown, tooltip) or as focus rings. A card with a decorative shadow is a card that doesn't trust its own color.

**The No-Blur Rule.** `backdrop-filter: blur()` is prohibited as a default surface treatment. If blur is used, it must be purposeful and rare — a single overlay, not a system-wide aesthetic.

## 5. Components

### Buttons
Tactile and confident. Rounded enough to feel consumer-grade (8px), not so rounded they feel playful.

- **Shape:** Gently rounded (8px radius)
- **Primary:** Burnished Amber background (`#C97B2E`), Ink text (`#2C2820`) — dark-on-amber passes AA and reads more premium than white-on-amber. 36px height, 16px horizontal padding. Hover shifts to Amber Hover (`#E8943A`). Transition: 150ms ease-out.
- **Ghost:** Transparent background, Ash text, Graphite Border stroke. Hover: Surface Graphite background. Used for secondary actions.
- **Danger:** Ember background (`#C45C4A`), white text. Same shape as primary.
- **Disabled:** 40% opacity on any variant. Cursor not-allowed.
- **Focus:** Glow Amber ring (`0 0 0 3px rgba(201,123,46,0.25)`), no outline.

### Cards / Containers
Cards are used only when grouping is genuinely needed. They do not wrap every piece of content.

- **Corner Style:** Softly rounded (12px radius)
- **Background (dark):** Lifted Graphite (`#1A1916`) or Surface Graphite (`#242220`) depending on nesting level
- **Background (light):** Vellum (`#EFECE6`) or Linen (`#E8E4DC`)
- **Border:** 1px Graphite Border (`#2E2C28`) in dark; 1px Seam (`#D4CFC6`) in light
- **Shadow:** None at rest in dark mode. Ambient Low in light mode.
- **Internal Padding:** 24px default; 16px for compact variants
- **Active state:** Full border shifts to Amber (`#C97B2E`), background tints slightly. No side-stripe border.

### Inputs / Fields
- **Style:** Surface Graphite background, Graphite Border stroke, 8px radius, 36px height
- **Focus:** Border shifts to Amber, Glow Amber ring. No blue.
- **Error:** Border shifts to Ember (`#C45C4A`), error text in Ember below field
- **Disabled:** 40% opacity, cursor not-allowed
- **Label:** Label weight (12px/400) above the field, Ash color

### Navigation (Sidebar)
- **Width:** 220px, Lifted Graphite background
- **Nav items:** 40px height, 12px horizontal padding, 8px radius. Full-width rounded rectangle, not side-stripe.
- **Active state:** Surface Graphite background, Warm White text, left edge in Amber (2px, full height of item — this is structural, not decorative stripe)
- **Inactive:** Transparent background, Ash text. Hover: Surface Graphite at 60% opacity.
- **Group headers:** Micro weight, Cinder color, uppercase, 0.08em tracking. Collapsible.
- **Proxy status footer:** Label size, Ash color, status dot paired with text always.

### Badges / Chips
- **Shape:** 4px radius, micro weight text
- **Active/Amber:** Amber at 15% opacity background, Amber text
- **Success:** Sage at 15% opacity background, Sage text
- **Error:** Ember at 15% opacity background, Ember text
- **Neutral:** Surface Graphite background, Ash text
- **Provider badges:** Provider color at 15% opacity background, provider color text

### Status Indicators
Status dots always appear with a text label. The dot is 6-8px, the label is Label size. Running: Sage. Stopped/Error: Ember. Transitioning: Amber with pulse animation. Unknown: Cinder.

## 6. Do's and Don'ts

### Do:
- **Do** use Burnished Amber (`#C97B2E`) as the single accent. One color, used sparingly, carries more weight than five.
- **Do** tint every neutral toward warm brown. The minimum chroma for any neutral is 0.005 in OKLCH.
- **Do** use tonal layering for depth: base → elevated → surface, each step lighter. No blur.
- **Do** pair every status color with a text label. Never rely on color alone to communicate state.
- **Do** use full-border or background-tint for active states on cards and nav items. Never a side-stripe border wider than 2px.
- **Do** keep amber on ≤10% of any screen. Its scarcity is its signal.
- **Do** use 12px radius on cards and 8px on buttons and inputs. The roundness signals consumer-grade, not enterprise.
- **Do** use SF Mono for all technical values: endpoints, ports, API keys, model IDs.
- **Do** ensure both dark and light themes meet WCAG AA contrast independently.

### Don't:
- **Don't** use `backdrop-filter: blur()` as a default surface treatment. The current glassmorphism design is the anti-reference.
- **Don't** use blue or purple as the primary accent. The current `#3B82F6` primary is exactly what this redesign moves away from.
- **Don't** use neon glows, gradient text, or `box-shadow` with colored glow as decoration. No `shadow-glow-blue`, no `shadow-glow-purple`.
- **Don't** use side-stripe borders (`border-left` or `border-right` > 1px as a colored accent). Active states use full borders or background tints.
- **Don't** use `#000000`, `#ffffff`, or pure gray. Every neutral must carry a warm tint.
- **Don't** use the hero-metric template: big number, small label, gradient accent. The Dashboard stat cards must not look like a SaaS pricing page.
- **Don't** use identical card grids. Same-sized cards with icon + heading + text repeated endlessly is the enterprise dashboard anti-reference.
- **Don't** use purple/pink gradients or neon AI startup aesthetics. Aether is not a product demo.
- **Don't** use flat white with no depth. Light mode has character through warm parchment tones, not sterile white.
- **Don't** animate layout properties (width, height, padding, margin). Animate opacity and transform only.
