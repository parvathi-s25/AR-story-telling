export class DebugPanel {
  constructor({ root, appState, getPhase4Status, actions }) {
    this.root = root;
    this.appState = appState;
    this.getPhase4Status = getPhase4Status;
    this.actions = actions;
    this.forceDebugOpenInAR = false;

    this.container = document.createElement('section');
    this.container.className = 'debug-panel';
    this.root.appendChild(this.container);

    this.arHud = document.createElement('section');
    this.arHud.className = 'ar-hud';
    this.root.appendChild(this.arHud);

    this.appState.addEventListener('change', () => this.render());
    this.render();
  }

  render() {
    const contracts = this.appState.getContracts();
    const phase4 = this.getPhase4Status?.() ?? null;
    const confidence = contracts.trackingConfidence;
    const hasPage = Boolean(contracts.pageBoundary);
    const locked = Boolean(contracts.pageLocked);
    const canPlace = Boolean(this.appState.lastHitMatrix) && !locked;
    const xrActive = Boolean(contracts.xrActive);
    const shouldHidePanelInAR = xrActive && !this.forceDebugOpenInAR;

    this.container.classList.toggle('is-hidden-in-ar', shouldHidePanelInAR);
    this.renderFullPanel({ contracts, phase4, confidence, hasPage, locked, canPlace, xrActive });
    this.renderARHud({ contracts, phase4, confidence, hasPage, locked, canPlace, xrActive });
  }

  renderFullPanel({ contracts, phase4, confidence, hasPage, locked, canPlace, xrActive }) {
    const arPanelControls = xrActive
      ? `
        <div class="ar-panel-warning">
          <strong>AR session is active.</strong>
          <span>The full debug panel is covering the camera view.</span>
          <button data-action="hidePanel" class="secondary">Hide debug panel</button>
        </div>
      `
      : '';

    const storyLoaded = Boolean(phase4?.loaded);
    const storyLoading = Boolean(phase4?.loading);
    const storyReadyToPlay = storyLoaded && locked;
    const phase4Contracts = phase4 ? JSON.stringify(phase4, null, 2) : '{}';

    this.container.innerHTML = `
      <h1>AR Storytelling — Phase 2/3/4 MVP</h1>
      <p>
        Option A: WebXR hit-test placement + locked page-local clamp. Phase 4 adds GLB/GLTF loading and timeline sync on the locked page anchor.
      </p>

      ${arPanelControls}

      <div class="status-grid">
        <div class="status-card">
          <span>XR session</span>
          <strong>${contracts.xrActive ? 'active' : 'not active'}</strong>
        </div>
        <div class="status-card">
          <span>Hit test</span>
          <strong>${contracts.latestHit?.visible ? 'visible' : contracts.latestHit ? 'last pose saved' : 'not ready'}</strong>
        </div>
        <div class="status-card">
          <span>Page</span>
          <strong>${hasPage ? (locked ? 'locked' : 'placed') : 'not placed'}</strong>
        </div>
        <div class="status-card">
          <span>Overall</span>
          <strong>${confidence.overall.state} (${confidence.overall.confidence})</strong>
        </div>
      </div>

      <div class="button-row">
        <button data-action="place" ${canPlace ? '' : 'disabled'}>${locked ? 'Page locked' : 'Lock page from reticle'}</button>
        <button data-action="mock" class="secondary" ${xrActive ? 'disabled' : ''}>Mock place page</button>
        <button data-action="reset" class="danger" ${hasPage ? '' : 'disabled'}>Reset page</button>
      </div>

      <p class="footer-note">
        Real AR: press START AR, scan a flat book/table until the reticle appears, then tap once to lock the page plane. Press Reset page to scan again.
      </p>

      <div class="button-row">
        <button data-action="widthMinus" ${hasPage ? '' : 'disabled'}>Width −</button>
        <button data-action="widthPlus" ${hasPage ? '' : 'disabled'}>Width +</button>
        <button data-action="heightMinus" ${hasPage ? '' : 'disabled'}>Height −</button>
        <button data-action="heightPlus" ${hasPage ? '' : 'disabled'}>Height +</button>
      </div>

      <section class="phase4-panel">
        <h2>Phase 4 — Story character runtime</h2>
        <p>
          Load the sample story, lock a page, then press Play. The character is parented to the locked page anchor and its root is clamped inside the page boundary.
        </p>
        <div class="status-grid compact">
          <div class="status-card">
            <span>Story</span>
            <strong>${storyLoading ? 'loading' : storyLoaded ? 'loaded' : 'not loaded'}</strong>
          </div>
          <div class="status-card">
            <span>Playback</span>
            <strong>${phase4?.playing ? 'playing' : 'paused'}</strong>
          </div>
          <div class="status-card">
            <span>Time</span>
            <strong>${phase4 ? Math.round(phase4.currentTimeMs) : 0} / ${phase4 ? Math.round(phase4.durationMs) : 0} ms</strong>
          </div>
          <div class="status-card">
            <span>Characters</span>
            <strong>${phase4?.characters?.length ?? 0}</strong>
          </div>
        </div>
        <div class="button-row">
          <button data-action="loadSampleStory" ${storyLoading ? 'disabled' : ''}>Load sample story</button>
          <button data-action="playStory" ${storyReadyToPlay ? '' : 'disabled'}>Play</button>
          <button data-action="pauseStory" ${storyLoaded ? '' : 'disabled'} class="secondary">Pause</button>
          <button data-action="restartStory" ${storyReadyToPlay ? '' : 'disabled'} class="secondary">Restart</button>
          <button data-action="stopStory" ${storyLoaded ? '' : 'disabled'} class="secondary">Stop</button>
        </div>
        ${!locked ? '<p class="warning-note">Lock the page first before playing the character on the page.</p>' : ''}
        ${phase4?.lastError ? `<p class="warning-note">${escapeHtml(phase4.lastError)}</p>` : ''}
      </section>

      <div class="control-grid">
        <button data-action="moveLeft" ${hasPage ? '' : 'disabled'}>← X</button>
        <button data-action="moveForward" ${hasPage ? '' : 'disabled'}>↑ Z</button>
        <button data-action="moveBackward" ${hasPage ? '' : 'disabled'}>↓ Z</button>
        <button data-action="moveRight" ${hasPage ? '' : 'disabled'}>X →</button>
      </div>

      <div class="button-row">
        <button data-action="randomClamp" ${hasPage ? '' : 'disabled'}>Send outside + clamp</button>
        <button data-action="copyJson" class="secondary">Copy JSON</button>
      </div>

      <details class="json-details" open>
        <summary>Phase 2/3 contracts</summary>
        <pre class="json-box">${escapeHtml(JSON.stringify(contracts, null, 2))}</pre>
      </details>

      <details class="json-details">
        <summary>Phase 4 runtime contract</summary>
        <pre class="json-box">${escapeHtml(phase4Contracts)}</pre>
      </details>
    `;

    this.container.querySelectorAll('button[data-action]').forEach((button) => {
      button.addEventListener('click', () => this.handleAction(button.dataset.action));
    });
  }

  renderARHud({ contracts, phase4, confidence, hasPage, locked, canPlace, xrActive }) {
    this.arHud.classList.toggle('is-visible', xrActive && !this.forceDebugOpenInAR);

    if (!xrActive || this.forceDebugOpenInAR) {
      this.arHud.innerHTML = '';
      return;
    }

    const hitLabel = locked ? 'plane locked' : contracts.latestHit?.visible ? 'hit visible' : 'scan surface';
    const pageLabel = hasPage ? (locked ? 'page locked' : 'page placed') : 'page not placed';
    const storyLabel = phase4?.loaded ? (phase4.playing ? 'story playing' : 'story ready') : 'story not loaded';
    const canPlayStory = Boolean(phase4?.loaded && locked);

    this.arHud.innerHTML = `
      <div class="ar-hud__text">
        <strong>AR active</strong>
        <span>${hitLabel} · ${pageLabel} · ${storyLabel} · ${confidence.overall.state}</span>
      </div>
      <div class="ar-hud__actions">
        <button data-ar-action="place" ${canPlace ? '' : 'disabled'}>${locked ? 'Locked' : 'Lock page'}</button>
        <button data-ar-action="storyToggle" ${canPlayStory ? '' : 'disabled'}>${phase4?.playing ? 'Pause' : 'Play'}</button>
        <button data-ar-action="reset" class="secondary" ${hasPage ? '' : 'disabled'}>Reset</button>
        <button data-ar-action="showDebug" class="secondary">Debug</button>
      </div>
    `;

    this.arHud.querySelectorAll('button[data-ar-action]').forEach((button) => {
      button.addEventListener('click', () => this.handleARHudAction(button.dataset.arAction));
    });
  }

  async handleAction(action) {
    switch (action) {
      case 'place':
        this.actions.placePage();
        break;
      case 'mock':
        this.actions.placeMockPage();
        break;
      case 'reset':
        this.actions.resetPage();
        break;
      case 'widthMinus':
        this.actions.resizePage({ deltaWidth: -0.02 });
        break;
      case 'widthPlus':
        this.actions.resizePage({ deltaWidth: 0.02 });
        break;
      case 'heightMinus':
        this.actions.resizePage({ deltaHeight: -0.02 });
        break;
      case 'heightPlus':
        this.actions.resizePage({ deltaHeight: 0.02 });
        break;
      case 'moveLeft':
        this.actions.moveActor(-0.025, 0);
        break;
      case 'moveRight':
        this.actions.moveActor(0.025, 0);
        break;
      case 'moveForward':
        this.actions.moveActor(0, -0.025);
        break;
      case 'moveBackward':
        this.actions.moveActor(0, 0.025);
        break;
      case 'randomClamp':
        this.actions.randomClamp();
        break;
      case 'loadSampleStory':
        await this.actions.loadSampleStory();
        break;
      case 'playStory':
        this.actions.playStory();
        break;
      case 'pauseStory':
        this.actions.pauseStory();
        break;
      case 'restartStory':
        this.actions.restartStory();
        break;
      case 'stopStory':
        this.actions.stopStory();
        break;
      case 'copyJson':
        await this.copyContracts();
        break;
      case 'hidePanel':
        this.forceDebugOpenInAR = false;
        this.render();
        break;
      default:
        break;
    }
  }

  handleARHudAction(action) {
    switch (action) {
      case 'place':
        this.actions.placePage();
        break;
      case 'reset':
        this.actions.resetPage();
        break;
      case 'storyToggle': {
        const phase4 = this.getPhase4Status?.();
        if (phase4?.playing) this.actions.pauseStory();
        else this.actions.playStory();
        break;
      }
      case 'showDebug':
        this.forceDebugOpenInAR = true;
        this.render();
        break;
      default:
        break;
    }
  }

  async copyContracts() {
    const payload = {
      phase23: this.appState.getContracts(),
      phase4: this.getPhase4Status?.() ?? null
    };
    const text = JSON.stringify(payload, null, 2);

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      console.warn('Clipboard copy failed. This usually requires HTTPS or user gesture support.');
    }
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
