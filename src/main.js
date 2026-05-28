import './styles.css';

import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';

import { AppState } from './core/AppState.js';
import { WebXRHitTestManager } from './webxr/WebXRHitTestManager.js';
import { createCamera, createDesktopGrid, createRenderer, createReticle, createScene } from './render/SceneFactory.js';
import { DebugPageRenderer } from './render/DebugPageRenderer.js';
import { DebugPanel } from './ui/DebugPanel.js';
import { StoryRuntime } from './phase4/StoryRuntime.js';

class ARStorytellingOptionAApp {
  constructor() {
    this.container = document.querySelector('#app');
    this.uiRoot = document.querySelector('#ui-root');

    this.state = new AppState();
    this.scene = createScene();
    this.camera = createCamera();
    this.renderer = createRenderer(this.container);
    this.clock = new THREE.Clock();

    this.reticle = createReticle();
    this.scene.add(this.reticle);

    this.desktopGrid = createDesktopGrid();
    this.scene.add(this.desktopGrid);

    this.debugPageRenderer = new DebugPageRenderer(this.scene);
    this.storyRuntime = new StoryRuntime({ scene: this.scene, appState: this.state });

    this.hitTestManager = new WebXRHitTestManager({
      renderer: this.renderer,
      reticle: this.reticle,
      onHitPose: (matrix, visible) => this.state.setHitPose(matrix, visible),
      onSessionChange: (active) => {
        this.state.setXRActive(active);
        document.body.classList.toggle('xr-session-active', active);
        this.desktopGrid.visible = !active;
        this.hitTestManager.setSurfaceLocked(this.state.pageLocked);
      },
      onError: (error) => console.error('WebXR hit test setup failed:', error)
    });

    this.controller = this.renderer.xr.getController(0);
    this.controller.addEventListener('select', () => this.placePage());
    this.scene.add(this.controller);

    this.setupARButton();
    this.setupUI();
    this.setupEvents();
    this.renderer.setAnimationLoop((timestamp, frame) => this.animate(timestamp, frame));
  }

  setupARButton() {
    const button = ARButton.createButton(this.renderer, {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay', 'anchors', 'plane-detection'],
      domOverlay: { root: document.body }
    });

    document.body.appendChild(button);
  }

  setupUI() {
    this.panel = new DebugPanel({
      root: this.uiRoot,
      appState: this.state,
      getPhase4Status: () => this.storyRuntime.getStatus(),
      actions: {
        placePage: () => this.placePage(),
        placeMockPage: () => this.placeMockPage(),
        resetPage: () => this.resetPage(),
        resizePage: (args) => this.state.resizePage(args),
        moveActor: (dx, dz) => this.state.moveActorLocal(dx, dz),
        randomClamp: () => this.state.sendActorOutsideThenClamp(),
        loadSampleStory: () => this.storyRuntime.loadStory(),
        playStory: () => this.storyRuntime.play(),
        pauseStory: () => this.storyRuntime.pause(),
        restartStory: () => this.storyRuntime.restart(),
        stopStory: () => this.storyRuntime.stop()
      }
    });
  }

  setupEvents() {
    window.addEventListener('resize', () => this.onResize());
    this.state.addEventListener('change', () => this.updateDebugRenderers());
    this.storyRuntime.addEventListener('change', () => {
      this.updateDebugRenderers();
      this.panel?.render();
    });
  }

  placePage() {
    const placed = this.state.placePageFromCurrentHit();

    if (placed) {
      this.hitTestManager.setSurfaceLocked(true);
      return;
    }

    if (this.state.pageLocked) {
      console.warn('Page is already locked. Press Reset page before placing another plane.');
      return;
    }

    console.warn('Cannot place page yet. Wait until the WebXR reticle appears or use mock mode.');
  }

  resetPage() {
    this.state.resetPage();
    this.hitTestManager.setSurfaceLocked(false);
  }

  placeMockPage() {
    if (this.renderer.xr.isPresenting) {
      console.warn('Mock page is intended for non-AR desktop testing. Use the real reticle while in AR.');
      return;
    }

    const placed = this.state.placeMockPage();
    if (placed) {
      this.hitTestManager.setSurfaceLocked(true);
    }
  }

  updateDebugRenderers() {
    this.debugPageRenderer.update({
      pageAnchor: this.state.pageAnchor,
      boundaryClamp: this.state.boundaryClamp,
      actorLocalPosition: this.state.actorLocalPosition,
      footprintRadiusMeters: this.state.footprintRadiusMeters,
      showDebugActor: !this.storyRuntime.hasLoadedCharacters()
    });
  }

  animate(_timestamp, frame) {
    const deltaSeconds = Math.min(this.clock.getDelta(), 0.05);

    if (frame) {
      this.hitTestManager.update(frame);
    }

    this.storyRuntime.update(deltaSeconds);
    this.renderer.render(this.scene, this.camera);
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

new ARStorytellingOptionAApp();
