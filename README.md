# AR Storytelling — Option A WebXR-first MVP

This project implements **Option A** from the design plan:

> WebXR-first MVP using native hit testing / surface placement and a page boundary rectangle.

It does **not** implement OpenCV/Canny visual page detection yet. That belongs to Option B/D. This MVP creates a stable WebXR hit-test placement, builds a page-local coordinate system on an X-Z plane, and exposes clamp limits for later Three.js/GLB character placement.

## What is included

- WebXR `immersive-ar` startup through Three.js `ARButton`
- WebXR hit-test reticle
- Tap/select to place a page anchor on a real surface
- Page coordinate system:
  - local X = page width
  - local Z = page height/depth
  - local Y = normal out of the page
- Page boundary rectangle visualization
- Boundary clamp for future characters
- Debug actor that cannot leave the page boundary
- Data-contract JSON panel for Phase 4 integration
- Desktop mock mode for development without AR hardware

## Requirements

For real AR:

- Android phone with ARCore support
- Chrome / Chromium browser with WebXR AR support
- HTTPS hosting

For desktop mock testing:

- Node.js 18+
- npm

## Install

```bash
npm install
```

## Run for desktop mock mode

```bash
npm run dev
```

Open:

```text
http://localhost:5173
```

Click **Mock place page** to test page coordinates and clamp behavior without AR.

## Run for real mobile AR

WebXR AR requires HTTPS. Recommended options:

### Option 1: Deploy to HTTPS hosting

Deploy the project to Netlify, Vercel, GitHub Pages, or another HTTPS host. Open the deployed URL on an ARCore-compatible Android phone.

### Option 2: Local HTTPS test

```bash
npm run dev:https
```

Then open the HTTPS local-network URL on your Android phone. Depending on browser/device certificate rules, self-signed HTTPS may still be blocked. If that happens, deploy to an HTTPS host or use a trusted tunnel such as ngrok/cloudflared.

## Real AR flow

1. Open the app on Android Chrome.
2. Press **START AR**.
3. Move the phone slowly over a book/table until the reticle appears.
4. Tap the screen or press **Place / update page from reticle**.
5. Adjust width/height if needed.
6. Use arrow controls to move the debug actor.
7. The actor is clamped inside the page rectangle.

## Why this is Option A

This implementation uses WebXR hit testing as the primary source of real-world surface placement. It intentionally avoids heavy browser SLAM and OpenCV page detection. It gives a stable MVP base for Phase 2/3 before adding Phase 4 GLB/GLTF character rendering.

## Next milestone after this

After this is stable, the next milestone can be:

- Add GLB/GLTF character loading inside the page boundary, or
- Upgrade to Option D by adding OpenCV.js quadrilateral page boundary detection.

## Update: AR UI overlay behavior

When a real `immersive-ar` session starts, the large debug panel now hides automatically so it does not block the camera view. A small AR HUD remains near the bottom with:

- current AR/hit/page status
- a `Place page` / `Update page` button
- a `Debug` button to temporarily reopen the full panel

You can also tap the AR view to place/update the page from the current reticle.

## v3 update — locked page plane

This version freezes the page plane after the first successful placement:

1. Start AR.
2. Scan a flat book/table surface until the reticle is visible.
3. Tap once or press **Lock page**.
4. The reticle is hidden and hit-test updates are paused.
5. The green page rectangle stays on the same captured pose until **Reset** is pressed.

This is required before Phase 4 so animated GLB/GLTF characters have a stable parent transform. If the physical AR tracking system itself drifts slightly, that is device/ARCore tracking drift; the app no longer replaces the page plane every frame or on repeated taps after lock.

## v4 update — Phase 4 GLB/GLTF character runtime

This version adds the first Phase 4 implementation on top of the locked Phase 2/3 page anchor.

### What was added

- `StoryRuntime` for Phase 4 orchestration.
- GLB/GLTF loading using Three.js `GLTFLoader`.
- A sample story JSON at `public/story/sample-story.json`.
- A tiny placeholder character model at `public/assets/characters/sample-character.gltf`.
- Character transform parenting under the locked page anchor.
- Timeline-based movement, rotation, visibility, and optional GLTF animation clip playback.
- Page-local root clamping so the character stays inside the boundary.
- Phase 4 runtime JSON contract in the debug panel.

### Phase 4 test flow

Desktop mock test:

```text
Mock place page
→ Load sample story
→ Play
→ the sample character should move on the locked page rectangle
```

Real WebXR test:

```text
START AR
→ scan book/table
→ tap once to lock page
→ open Debug if needed
→ Load sample story
→ Play
→ the GLTF character should move on the locked page anchor
```

### Replacing the sample character

Put your own model in:

```text
public/assets/characters/
```

Then update `public/story/sample-story.json`:

```json
{
  "characters": {
    "hero": {
      "assetUrl": "/assets/characters/your-character.glb",
      "scale": 0.08,
      "footprintRadiusMeters": 0.025
    }
  }
}
```

Keep the model small and optimized for mobile AR. Start with one character first. Large GLB files, heavy textures, and many skeletal animations can cause dropped frames on phones.
