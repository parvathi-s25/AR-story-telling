import * as THREE from 'three';
import { PageAnchor } from './PageAnchor.js';
import { BoundaryClamp } from './BoundaryClamp.js';
import { TrackingConfidence } from './TrackingConfidence.js';
import { matrixToArray, round, vectorToJSON } from '../utils/math.js';

export class AppState extends EventTarget {
  constructor() {
    super();

    this.defaultPageWidthMeters = 0.28;
    this.defaultPageHeightMeters = 0.38;
    this.marginMeters = 0.025;
    this.footprintRadiusMeters = 0.025;

    this.isXRActive = false;
    this.hitVisible = false;
    this.lastHitMatrix = null;
    this.lastHitTimestampMs = 0;

    this.pageAnchor = null;
    this.boundaryClamp = null;
    this.actorLocalPosition = new THREE.Vector3(0, 0.035, 0);

    this.trackingConfidence = new TrackingConfidence();
  }

  setXRActive(active) {
    this.isXRActive = active;
    this.emitChange();
  }

  setHitPose(matrix, visible) {
    this.hitVisible = visible;
    this.lastHitMatrix = visible && matrix ? matrix.clone() : this.lastHitMatrix;
    this.lastHitTimestampMs = visible ? performance.now() : this.lastHitTimestampMs;
    this.trackingConfidence.update({ hitVisible: this.hitVisible, pagePlaced: Boolean(this.pageAnchor) });
    this.emitChange();
  }

  placePageFromCurrentHit() {
    if (!this.lastHitMatrix) {
      return false;
    }

    this.pageAnchor = PageAnchor.fromPoseMatrix(this.lastHitMatrix, {
      widthMeters: this.defaultPageWidthMeters,
      heightMeters: this.defaultPageHeightMeters,
      source: 'webxr-hit-test'
    });

    this.rebuildClamp();
    this.actorLocalPosition.set(0, 0.035, 0);
    this.emitChange();
    return true;
  }

  placeMockPage() {
    const matrix = new THREE.Matrix4();
    matrix.makeTranslation(0, 0, 0);

    this.lastHitMatrix = matrix.clone();
    this.hitVisible = true;
    this.pageAnchor = PageAnchor.fromPoseMatrix(matrix, {
      widthMeters: this.defaultPageWidthMeters,
      heightMeters: this.defaultPageHeightMeters,
      source: 'desktop-mock'
    });

    this.rebuildClamp();
    this.actorLocalPosition.set(0, 0.035, 0);
    this.trackingConfidence.update({ hitVisible: true, pagePlaced: true });
    this.emitChange();
    return true;
  }

  resetPage() {
    this.pageAnchor = null;
    this.boundaryClamp = null;
    this.actorLocalPosition.set(0, 0.035, 0);
    this.trackingConfidence.update({ hitVisible: this.hitVisible, pagePlaced: false });
    this.emitChange();
  }

  resizePage({ deltaWidth = 0, deltaHeight = 0 }) {
    if (!this.pageAnchor) {
      return false;
    }

    const width = Math.max(0.08, this.pageAnchor.widthMeters + deltaWidth);
    const height = Math.max(0.08, this.pageAnchor.heightMeters + deltaHeight);
    this.pageAnchor = this.pageAnchor.cloneWithSize(width, height);
    this.defaultPageWidthMeters = width;
    this.defaultPageHeightMeters = height;

    this.rebuildClamp();
    this.actorLocalPosition = this.boundaryClamp.clampLocal(this.actorLocalPosition);
    this.emitChange();
    return true;
  }

  rebuildClamp() {
    if (!this.pageAnchor) {
      this.boundaryClamp = null;
      return;
    }

    this.boundaryClamp = new BoundaryClamp({
      pageAnchor: this.pageAnchor,
      marginMeters: this.marginMeters,
      footprintRadiusMeters: this.footprintRadiusMeters
    });
  }

  moveActorLocal(deltaX, deltaZ) {
    if (!this.boundaryClamp) {
      return false;
    }

    const next = this.actorLocalPosition.clone();
    next.x += deltaX;
    next.z += deltaZ;
    this.actorLocalPosition = this.boundaryClamp.clampLocal(next);
    this.emitChange();
    return true;
  }

  sendActorOutsideThenClamp() {
    if (!this.boundaryClamp || !this.pageAnchor) {
      return false;
    }

    const signX = Math.random() > 0.5 ? 1 : -1;
    const signZ = Math.random() > 0.5 ? 1 : -1;
    const outside = new THREE.Vector3(
      signX * this.pageAnchor.widthMeters,
      0.035,
      signZ * this.pageAnchor.heightMeters
    );

    this.actorLocalPosition = this.boundaryClamp.clampLocal(outside);
    this.emitChange();
    return true;
  }

  getActorWorldPosition() {
    if (!this.pageAnchor) {
      return null;
    }

    return this.pageAnchor.localToWorld(this.actorLocalPosition);
  }

  getContracts() {
    const confidenceJSON = this.trackingConfidence.getJSON();

    return {
      implementationDirection: 'Option A - WebXR-first MVP',
      timestampMs: round(performance.now(), 2),
      xrActive: this.isXRActive,
      latestHit: this.lastHitMatrix
        ? {
            visible: this.hitVisible,
            timestampMs: round(this.lastHitTimestampMs, 2),
            poseMatrix: matrixToArray(this.lastHitMatrix)
          }
        : null,
      detectedPlane: this.pageAnchor
        ? this.pageAnchor.toDetectedPlaneJSON({
            confidence: confidenceJSON.planeTracking.confidence,
            trackingState: confidenceJSON.planeTracking.state
          })
        : null,
      pageBoundary: this.pageAnchor
        ? this.pageAnchor.toPageBoundaryJSON({
            confidence: confidenceJSON.pageDetection.confidence,
            status: confidenceJSON.pageDetection.state
          })
        : null,
      pageCoordinateSystem: this.pageAnchor ? this.pageAnchor.toCoordinateSystemJSON() : null,
      boundaryClamp: this.boundaryClamp ? this.boundaryClamp.toJSON() : null,
      debugActor: this.pageAnchor
        ? {
            localPosition: vectorToJSON(this.actorLocalPosition),
            worldPosition: vectorToJSON(this.getActorWorldPosition()),
            footprintRadiusMeters: round(this.footprintRadiusMeters, 4)
          }
        : null,
      trackingConfidence: confidenceJSON
    };
  }

  emitChange() {
    this.dispatchEvent(new Event('change'));
  }
}
