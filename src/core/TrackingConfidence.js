import { round } from '../utils/math.js';

export class TrackingConfidence {
  constructor() {
    this.lastHitMs = 0;
    this.hitVisible = false;
    this.pagePlaced = false;
  }

  update({ hitVisible, pagePlaced }) {
    const now = performance.now();
    this.hitVisible = Boolean(hitVisible);
    this.pagePlaced = Boolean(pagePlaced);

    if (this.hitVisible) {
      this.lastHitMs = now;
    }
  }

  getJSON() {
    const now = performance.now();
    const msSinceHit = this.lastHitMs > 0 ? now - this.lastHitMs : Infinity;
    const webxrConfidence = this.hitVisible ? 0.82 : msSinceHit < 1000 ? 0.5 : 0.15;
    const planeConfidence = this.hitVisible ? 0.78 : this.pagePlaced ? 0.55 : 0.1;
    const pageConfidence = this.pagePlaced ? 0.72 : 0.0;
    const overall = Math.min(1, (webxrConfidence + planeConfidence + pageConfidence) / 3);

    return {
      type: 'TrackingConfidence',
      timestampMs: round(now, 2),
      webxrTracking: {
        state: this.hitVisible ? 'tracking' : msSinceHit < 1000 ? 'recently-visible' : 'not-visible',
        confidence: round(webxrConfidence, 2)
      },
      planeTracking: {
        state: this.hitVisible ? 'surface-hit-visible' : this.pagePlaced ? 'using-last-placed-anchor' : 'not-ready',
        confidence: round(planeConfidence, 2)
      },
      pageDetection: {
        state: this.pagePlaced ? 'placed-rectangle' : 'not-placed',
        confidence: round(pageConfidence, 2),
        jitterPx: null
      },
      overall: {
        state: overall >= 0.65 ? 'usable' : overall >= 0.35 ? 'limited' : 'not-ready',
        confidence: round(overall, 2)
      }
    };
  }
}
