# Hafijur Rahman Bhuiyan — Personal Portfolio

A production-grade, single-page developer portfolio built as a **static site with zero runtime dependencies**. Semantic HTML, a custom CSS design system, and a single vanilla JavaScript IIFE — no framework, no bundler, no build step.

The site is a résumé in browser form: an ambient Web Audio soundscape, an animated canvas particle field, filterable skills and project grids, 3D card inspection modals, and a full light/dark theme system.

---

## Live Link: https://hafijurrahmanbhuiyan.github.io/Portfolio

## Table of Contents

- [Highlights](#highlights)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Feature Tour](#feature-tour)
- [Design System](#design-system)
- [Audio Engine](#audio-engine)
- [Local Development](#local-development)
- [Deployment](#deployment)
- [Customization Guide](#customization-guide)
- [Browser Support](#browser-support)
- [Accessibility](#accessibility)
- [Performance](#performance)
- [Known Limitations](#known-limitations)

---

## Highlights

| | |
|---|---|
| **Zero dependencies** | The deployed site ships no JS or CSS libraries — every icon is inline SVG, every visual is hand-authored CSS or Canvas |
| **No build step** | Edit a file, refresh the browser. There is no compile, bundle, or transpile stage to wait on |
| **18 feature modules** | One organized IIFE in `js/script.js`, each module in its own numbered, commented section |
| **Synthesized audio** | A generative ambient soundscape built live with the Web Audio API — no audio files to download |
| **Dual theme** | Obsidian-dark default and a full light theme, driven by CSS custom properties and persisted to `localStorage` |
| **Themeable in one place** | ~40 design tokens in `:root` control the entire visual language |

---

## Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Markup | HTML5 | Semantic landmarks (`header`/`nav`/`main`/`section`/`footer`), ARIA attributes |
| Styling | CSS3 | Custom properties, Grid, Flexbox, `clamp()` fluid type, keyframe animations |
| Behavior | Vanilla JavaScript (ES5-compatible syntax) | Web Audio API, Canvas 2D, IntersectionObserver, `matchMedia` |
| Icons | Inline SVG | Zero icon-font requests, inherits `currentColor`, styleable via CSS |
| Fonts | Sora / Inter / JetBrains Mono | Self-hosted path via Google Fonts with `preconnect` |
| Server (dev only) | Node.js + Express | 22-line static file server; Express is the project's only dependency |
| Media index | `metadata.json` | Lightweight capability descriptor for search/agent indexing |

---

## Project Structure

```
.
├── index.html              # 682 lines — all markup and content
├── css/
│   └── style.css           # 1519 lines — design system + all component styles
├── js/
│   └── script.js           # 1156 lines — all behavior, one commented IIFE
├── assets/
│   ├── favicon/            # 14 files — .ico, .svg, 16→512px PNGs, apple-touch-icons
│   ├── logos/              # 5 project card screenshots (ai-career-agent, servico, …)
│   ├── profile.jpg         # hero portrait
│   └── resume.pdf          # downloadable CV
├── server.js               # 22 lines — Express static server for local dev
├── package.json            # scripts + the single express dependency
├── metadata.json           # name / description / capabilities descriptor
└── README.md
```

---

## Feature Tour

### 1. Ambient background music (Web Audio API)

A generative soundscape in D Dorian — layered sine/triangle oscillator pads with chorus detuning, a resonant low-pass filter, and a feedback delay for space. Occasional Rhodes-style bell chimes land on pentatonic notes. Master gain fades in over 1.8s and out over 1.2s. Toggled from the speaker button in the nav; the icon animates into a 3-bar EQ visualizer while playing. See [Audio Engine](#audio-engine).

### 2. Dual theme system

Dark (obsidian) and light themes, toggled from the nav. An inline blocking script in `<head>` applies the stored preference before first paint, eliminating the flash-of-wrong-theme. Persisted under `localStorage['hrb-theme']`.

### 3. Animated canvas background

A Canvas 2D particle field with drifting nodes and connecting proximity lines, layered over a CSS cyber-grid and three floating gradient orbs.

### 4. Cursor spotlight

A radial glow follows the pointer via `pointermove`, driven by CSS custom properties for zero-reflow tracking.

### 5. Hero role typewriter + live clock

Four roles cycle with a type/delete animation, alongside a live Dhaka (Asia/Dhaka) clock.

### 6. Interactive developer terminal

A tabbed faux terminal (`about` / `skills` / `terminal` panes) with syntax-colored output — a compact, skimmable summary of the résumé.

### 7. Filterable skills grid

Six discipline filters — All, Languages, Frontend, Backend & APIs, Databases, Tools & DevOps, AI/ML — filtering the skill cards by `data-category`.

### 8. Filterable project grid

Six projects filterable by AI & Automation, Full-Stack Systems, and Trading & Web via `data-pcat`.

### 9. 3D magnetic hover engine

Cards tilt toward the cursor with perspective transforms and a subtle magnetic pull, disabled automatically for touch devices and reduced-motion users.

### 10. Project inspection modal

Clicking a project opens a detail modal with a 3D flip between the project overview and its technical detail pane, drag-to-rotate on touch, background scroll lock, and `Escape` to dismiss.

### 11. Scroll orchestration

Scroll-progress beam, floating scroll-depth pill, back-to-top button, active-section nav highlighting (IntersectionObserver), and bidirectional reveal-on-scroll animations.

### 12. Toast feedback system

An `aria-live` toast region announces every interaction — theme switches, filters, audio toggles, resume downloads.

### 13. Mobile navigation

A slide-in drawer with hamburger toggle, outside-click dismissal, `Escape` to close, and link-click auto-close.

### 14. SEO & social metadata

Open Graph and Twitter card tags, a canonical description, a skip link, and a complete favicon/apple-touch-icon set across 14 sizes.

---

## Design System

All visual decisions live in CSS custom properties at the top of `css/style.css`, in two blocks: the dark defaults on `:root` and the light overrides on `:root[data-theme="light"]`.

```css
:root{
  --bg: #030712;            /* page background      */
  --surface: #0B132B;       /* raised surfaces      */
  --text: #F8FAFC;          /* primary text         */
  --accent: #3B82F6;        /* primary accent       */
  --accent-cyan: #00F0FF;   /* secondary accent     */
  --accent-gradient: linear-gradient(135deg, #00F0FF 0%, #3B82F6 45%, #8B5CF6 100%);
  --shadow-lg: 0 25px 60px -15px rgba(0,0,0,.85);
  --mono: 'JetBrains Mono', ui-monospace, monospace;
  --head: 'Sora', sans-serif;
  --body: 'Inter', sans-serif;
}
```

Changing a token re-themes the entire site in both modes. Additional conventions:

- **Fluid type** — `clamp()` for all responsive headings and spacing
- **Glass surfaces** — translucent cards with `backdrop-filter` and 1px hairline borders
- **Reduced motion** — a `prefers-reduced-motion: reduce` block disables animation globally

---

## Audio Engine

`js/script.js` section 2 is a self-contained generative music engine. No audio files ship with the site.

**Signal chain**

```
oscillator pairs (sine + detuned triangle)
        │
        ▼
   voiceGain  ── 0.016 / voiceIndex, equal-power attack/release
        │
        ▼
  lowpass BiquadFilter  ── 520 Hz, Q 1.2
        │
        ▼
  musicMasterGain  ── master volume, 1.8s fade-in / 1.2s fade-out
        │
        ├──► delayNode ⇄ delayGain (0.38s, 0.28 feedback)  ── wet echo
        ▼
  audioCtx.destination
```

**Musical design**

- **Progression** — a four-chord loop in D Dorian: Dm9 → B♭maj7 → Gm7 → Am7
- **Pad voices** — five oscillators per chord, each a detuned sine/triangle pair, each level scaled by `1 / (i + 1)` so the chord builds from bass upward
- **Bell chimes** — pentatonic hits (D4–E5) at 1.2s, 3.8s and 5.6s into each 7.5s chord
- **Voice hygiene** — the voice list is capped and trimmed so long sessions cannot leak oscillators

**Key parameters**

| Parameter | Value | Location |
|---|---|---|
| Master volume | `0.6` | `js/script.js:145` |
| Pad voice level | `0.016 / (i + 1)` | `js/script.js:71` |
| Bell chime peak | `0.026` | `js/script.js:103` |
| Delay feedback | `0.28` @ 0.38s | `js/script.js:157` |
| UI sound effects | `0.025`–`0.035` | `js/script.js:238`–`241` |

> **Browser autoplay policy:** all modern browsers block audio until the user interacts with the page. The soundscape therefore begins when the user presses the speaker button, by design.

---

## Local Development

The site is fully static, so any static server works.

**Option A — no install (fastest)**

```bash
python3 -m http.server 8080
# visit http://localhost:8080
```

**Option B — Node (matches production serving)**

```bash
npm install     # installs express, the only dependency
npm run dev     # http://localhost:3000
```

| Script | Purpose |
|---|---|
| `npm run dev` | Start the Express static server on port 3000 |
| `npm start` | Alias of `dev` |
| `npm run build` | No-op — nothing to compile |

Set `PORT` to override the default: `PORT=8080 npm run dev`.

> VS Code Live Server (port 5500) works as well.

---

## Deployment

The site is pure static output — any static host will serve it as-is.

**GitHub Pages**

1. Push the repository to GitHub
2. **Settings → Pages → Deploy from a branch**
3. Select `main` branch, `/ (root)` directory

**Vercel / Netlify / Cloudflare Pages**

- Framework preset: **Other**
- Build command: *(leave empty)*
- Output directory: `/`

No environment variables, no server runtime, no build artifacts required.

---

## Customization Guide

**Content** — all copy lives directly in `index.html` as plain text inside each `<section>`. Sections are anchored as `#home`, `#about`, `#skills`, `#experience`, `#projects`, `#education`, `#contact`.

**Colors, fonts, spacing** — edit the `:root` tokens at the top of `css/style.css`, then mirror any change into the `:root[data-theme="light"]` override block.

**Photo and résumé** — replace `assets/profile.jpg` and `assets/resume.pdf` in place, or update the `src`/`href` in `index.html`. If the image fails to load, a built-in fallback handler substitutes a monogram (section 14 of `js/script.js`).

**Adding a project card** — copy an existing `<article class="pcard">` in `#projects`, set its `data-pcat` to one of the filter categories, and add the modal detail markup. Both the filter and the modal read from these attributes.

**Audio tuning** — adjust master volume at `js/script.js:145`; voice balance at `js/script.js:71`; chime density in `ambientStep()`.

---

## Browser Support

| Browser | Support |
|---|---|
| Chrome / Edge (Chromium) | Full |
| Firefox | Full |
| Safari / iOS Safari | Full, including `backdrop-filter` and Web Audio |
| Legacy Edge (EdgeHTML) | Not supported |

The layout is responsive from 320px upward, with a dedicated mobile navigation drawer and stacked grids on small screens.

---

## Accessibility

- Skip-to-content link as the first focusable element
- Semantic landmarks and a logical heading hierarchy
- `aria-label` and `aria-expanded` on interactive controls, with state exposed through accessible names
- Visible `:focus-visible` focus rings across the UI
- Toast region is `aria-live="polite"`, so announcements never interrupt
- Decorative layers (canvas, grid, orbs, cursor glow) are `aria-hidden="true"`
- Full `prefers-reduced-motion` support — animations and transitions collapse to ~0ms, card transforms are disabled, and the ambient canvas is removed from the render tree entirely
- Color tokens are checked for contrast in both themes

---

## Performance

- **Zero runtime dependencies** — nothing to download but the site's own three text assets
- Single CSS file, single JS file; no render-blocking framework payload
- Fonts loaded with `preconnect` + `display=swap`
- Animations use `transform` and `opacity` (compositor-friendly), avoiding layout thrash
- Scroll and reveal effects use IntersectionObserver rather than scroll-event handlers
- Audio nodes are explicitly disconnected after use, so long sessions stay stable

---

## Known Limitations

- **Audio requires a user gesture.** Browsers block unsolicited audio; the soundscape starts on the speaker-button click.
- **UI sound effects bypass the music master gain.** They connect directly to `audioCtx.destination`, so music volume changes do not affect click/flip/modal sounds.
- **Theme preference only.** Nothing else is persisted — audio state and filter selections reset on reload.
- **`node_modules` is not gitignored.** Run `npm install` locally and add it to `.gitignore` before committing, or dependency folders will appear as untracked files.

---

## Author

**Hafijur Rahman Bhuiyan** — Software Engineer & Full-Stack Developer
React · TypeScript · Node.js · Django · PostgreSQL · AI/ML

- GitHub: [github.com/HafijurRahmanBhuiyan](https://github.com/HafijurRahmanBhuiyan)
- LinkedIn: [linkedin.com/in/hafijur-rahman-bhuiyan](https://www.linkedin.com/in/hafijur-rahman-bhuiyan)

---

## License

Released for personal portfolio use. All rights reserved.