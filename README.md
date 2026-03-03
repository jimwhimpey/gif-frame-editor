# GIF Frame Editor

A browser-based frame-by-frame GIF editor. Upload a GIF, adjust timing, remove frames, preview changes, and export a new infinitely looping GIF.

## Features

- **Upload** — drag & drop or click to upload any GIF
- **Frame timeline** — visual grid of all frames with per-frame delay editing
- **Preview** — play/pause animated preview with frame counter
- **Selection** — click to select, shift+click for range select, plus Select All / None / Invert
- **Bulk timing** — set delay on all selected frames at once (minimum 7ms)
- **Bulk remove** — delete selected frames
- **Undo** — up to 30 levels, via toolbar button or Cmd+Z / Ctrl+Z
- **Export** — encodes a new GIF89a with infinite looping and downloads it

## Setup

```
npm install
```

## Development

```
npm run dev
```

Opens a local dev server with hot module replacement.

## Production Build

```
npm run build
```

Outputs optimized static files to `dist/`.

To preview the production build locally:

```
npm run preview
```

## Tech

- **TypeScript** + **Vite**
- [gifuct-js](https://github.com/matt-way/gifuct-js) for GIF decoding
- Custom GIF89a encoder with LZW compression (no encoding dependencies)
