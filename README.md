# Hafijur Rahman Bhuiyan — Portfolio

A single-page personal portfolio site. Plain HTML, CSS and JavaScript —
no build step, no dependencies, no framework. Open `index.html` in a
browser and it works.

## Structure

```
.
├── index.html        → all markup/content (edit text here)
├── css/style.css      → design system (colors, layout, components)
├── js/script.js       → theme toggle, mobile nav, scroll reveal, active-nav highlight
├── assets/
│   ├── profile.jpg    → hero photo
│   └── resume.pdf      → downloadable resume (linked from the "Resume" button)
└── README.md
```

## Editing content

Everything — name, summary, skills, experience, projects, education,
contact details — lives directly in `index.html` as plain text inside
each `<section>`. Search for the section `id` (`#about`, `#skills`,
`#experience`, `#projects`, `#education`, `#contact`) and edit the
text in place.

To swap the photo or resume, just replace `assets/profile.jpg` /
`assets/resume.pdf` with new files of the same name (or update the
`src`/`href` in `index.html` if you rename them).

## Design tokens

Colors, fonts and spacing are CSS custom properties at the top of
`css/style.css` (`:root { --bg, --accent, --text, ... }`), with a
separate light-theme override block. Change a value there and it
updates everywhere.

## Features

- Dark theme by default, with a light-mode toggle (persisted in
  `localStorage`, respects the OS `prefers-color-scheme` on first visit)
- Responsive layout (mobile nav drawer, stacked grid on small screens)
- Scroll-reveal animations and active-section nav highlighting
  (IntersectionObserver), with `prefers-reduced-motion` respected
- No external JS framework or icon library — icons are inline SVG
- Semantic landmarks, skip link, and Open Graph/Twitter meta tags for
  SEO and link previews

## Running locally

No build tools needed. Either:

- Open `index.html` directly in a browser, or
- Serve it locally so relative asset paths behave exactly like in
  production:

  ```bash
  python3 -m http.server 8080
  # then visit http://localhost:8080
  ```

## Deploying

This is a static site, so any static host works:

- **GitHub Pages**: push this folder to a repo, then enable Pages
  (Settings → Pages → Deploy from branch → `main` / root).
- **Vercel / Netlify**: import the repo, framework preset "Other",
  no build command, output directory `/`.

## Pushing to GitHub

```bash
git init
git add .
git commit -m "Initial portfolio site"
git branch -M main
git remote add origin https://github.com/HafijurRahmanBhuiyan/<your-repo-name>.git
git push -u origin main
```
