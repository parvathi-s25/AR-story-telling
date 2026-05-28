export class DebugPanel {
  constructor({ root, appState, actions }) {
    this.root = root;
    this.appState = appState;
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
    const confidence = contracts.trackingConfidence;
    const hasPage = Boolean(contracts.pageBoundary);
    const locked = Boolean(contracts.pageLocked);
    const canPlace = Boolean(this.appState.lastHitMatrix) && !locked;
    const xrActive = Boolean(contracts.xrActive);
    const shouldHidePanelInAR = xrActive && !this.forceDebugOpenInAR;

    this.container.classList.toggle('is-hidden-in-ar', shouldHidePanelInAR);
    this.renderFullPanel({ contracts, confidence, hasPage, locked, canPlace, xrActive });
    this.renderARHud({ contracts, confidence, hasPage, locked, canPlace, xrActive });
  }

  renderFullPanel({ contracts, confidence, hasPage, locked, canPlace, xrActive }) {
    const arPanelControls = xrActive
      ? `
        <div class="ar-panel-warning">
          <strong>AR session is active.</strong>
          <span>The full debug panel is covering the camera view.</span>
          <button data-action="hidePanel" class="secondary">Hide debug panel</button>
        </div>
      `
      : '';

    this.container.innerHTML = `
      <h1>AR Storytelling — Phase 2/3 MVP</h1>
      <p>
        Option A: WebXR hit-test placement + page-local clamp. This build intentionally avoids OpenCV/Canny auto page detection.
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

      <pre class="json-box">${escapeHtml(JSON.stringify(contracts, null, 2))}</pre>
    `;

    this.container.querySelectorAll('button[data-action]').forEach((button) => {
      button.addEventListener('click', () => this.handleAction(button.dataset.action));
    });
  }

  renderARHud({ contracts, confidence, hasPage, locked, canPlace, xrActive }) {
    this.arHud.classList.toggle('is-visible', xrActive && !this.forceDebugOpenInAR);

    if (!xrActive || this.forceDebugOpenInAR) {
      this.arHud.innerHTML = '';
      return;
    }

    const hitLabel = locked ? 'plane locked' : contracts.latestHit?.visible ? 'hit visible' : 'scan surface';
    const pageLabel = hasPage ? (locked ? 'page locked' : 'page placed') : 'page not placed';

    this.arHud.innerHTML = `
      <div class="ar-hud__text">
        <strong>AR active</strong>
        <span>${hitLabel} · ${pageLabel} · ${confidence.overall.state}</span>
      </div>
      <div class="ar-hud__actions">
        <button data-ar-action="place" ${canPlace ? '' : 'disabled'}>${locked ? 'Locked' : 'Lock page'}</button>
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
      case 'showDebug':
        this.forceDebugOpenInAR = true;
        this.render();
        break;
      default:
        break;
    }
  }

  async copyContracts() {
    const text = JSON.stringify(this.appState.getContracts(), null, 2);

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      console.warn('Clipboard copy failed. This usually requires HTTPS or user gesture support.');
    }
  }
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
