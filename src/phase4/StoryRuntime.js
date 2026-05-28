import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { round, vectorToJSON } from '../utils/math.js';

const DEFAULT_STORY_URL = '/story/sample-story.json';

/**
 * Phase 4 runtime:
 * - loads story orchestration JSON
 * - loads GLB/GLTF character assets
 * - parents characters under the locked page anchor
 * - applies timeline actions in page-local X/Z coordinates
 * - clamps character roots inside the Phase 2/3 boundary
 */
export class StoryRuntime extends EventTarget {
  constructor({ scene, appState }) {
    super();

    this.scene = scene;
    this.appState = appState;
    this.loader = new GLTFLoader();
    this.loader.setCrossOrigin('anonymous');

    this.characterLayer = new THREE.Group();
    this.characterLayer.name = 'Phase4CharacterLayer';
    this.characterLayer.matrixAutoUpdate = false;
    this.characterLayer.visible = false;
    this.scene.add(this.characterLayer);

    this.story = null;
    this.storyUrl = null;
    this.characters = new Map();
    this.isLoaded = false;
    this.isLoading = false;
    this.isPlaying = false;
    this.currentTimeMs = 0;
    this.durationMs = 0;
    this.loop = true;
    this.lastError = null;
    this.lastStatusEmitMs = 0;
  }

  async loadStory(url = DEFAULT_STORY_URL) {
    this.isLoading = true;
    this.lastError = null;
    this.emitChange();

    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Story JSON failed to load: ${response.status} ${response.statusText}`);
      }

      const story = await response.json();
      this.validateStory(story);
      this.clearCharacters();

      this.story = story;
      this.storyUrl = url;
      this.durationMs = Number(story.durationMs ?? 0);
      this.loop = story.loop !== false;
      this.currentTimeMs = 0;
      this.isLoaded = false;
      this.isPlaying = false;

      const entries = Object.entries(story.characters ?? {});
      await Promise.all(entries.map(([characterId, config]) => this.loadCharacter(characterId, config)));

      this.isLoaded = true;
      this.isLoading = false;
      this.applyTimeline(0);
      this.emitChange();
      return true;
    } catch (error) {
      console.error('Phase 4 story load failed:', error);
      this.lastError = error.message;
      this.isLoading = false;
      this.isLoaded = false;
      this.isPlaying = false;
      this.emitChange();
      return false;
    }
  }

  validateStory(story) {
    if (!story || typeof story !== 'object') {
      throw new Error('Story JSON must be an object.');
    }

    if (!story.characters || typeof story.characters !== 'object') {
      throw new Error('Story JSON must include a characters object.');
    }

    if (!Array.isArray(story.timeline)) {
      throw new Error('Story JSON must include a timeline array.');
    }
  }

  async loadCharacter(characterId, config) {
    const wrapper = new THREE.Group();
    wrapper.name = `Character_${characterId}`;
    wrapper.visible = false;
    this.characterLayer.add(wrapper);

    const character = {
      id: characterId,
      config,
      wrapper,
      model: null,
      mixer: null,
      clips: new Map(),
      currentClipName: null,
      loadedFromAsset: false,
      loadError: null,
      baseScale: Number(config.scale ?? 1),
      footprintRadiusMeters: Number(config.footprintRadiusMeters ?? 0.025),
      localPosition: this.vectorFromJSON(config.initialLocalPosition, 0, 0, 0),
      rotationY: THREE.MathUtils.degToRad(Number(config.initialRotationYDeg ?? 0))
    };

    this.characters.set(characterId, character);

    try {
      if (!config.assetUrl) {
        throw new Error('No assetUrl configured. Using fallback debug character.');
      }

      const gltf = await this.loadGLTF(config.assetUrl);
      const model = gltf.scene;
      model.name = `${characterId}_GLTFModel`;
      model.scale.setScalar(character.baseScale);
      model.position.y = Number(config.groundOffsetMeters ?? 0);
      wrapper.add(model);

      character.model = model;
      character.loadedFromAsset = true;

      if (Array.isArray(gltf.animations) && gltf.animations.length > 0) {
        character.mixer = new THREE.AnimationMixer(model);
        gltf.animations.forEach((clip) => character.clips.set(clip.name, clip));
      }
    } catch (error) {
      console.warn(`Character ${characterId} asset fallback:`, error);
      character.loadError = error.message;
      character.model = this.createFallbackCharacter(character.baseScale);
      wrapper.add(character.model);
    }

    this.applyCharacterTransform(character, character.localPosition, character.rotationY);
  }

  loadGLTF(url) {
    return new Promise((resolve, reject) => {
      this.loader.load(url, resolve, undefined, reject);
    });
  }

  createFallbackCharacter(scale = 0.08) {
    const group = new THREE.Group();
    group.name = 'FallbackCharacter';

    const bodyGeometry = new THREE.CapsuleGeometry(0.18, 0.55, 6, 18);
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.45 });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.48;
    group.add(body);

    const headGeometry = new THREE.SphereGeometry(0.18, 20, 20);
    const headMaterial = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 0.95;
    group.add(head);

    group.scale.setScalar(scale);
    return group;
  }

  play() {
    if (!this.isLoaded) return false;
    this.isPlaying = true;
    this.emitChange();
    return true;
  }

  pause() {
    this.isPlaying = false;
    this.emitChange();
  }

  restart() {
    this.currentTimeMs = 0;
    this.applyTimeline(0);
    this.isPlaying = this.isLoaded;
    this.emitChange();
  }

  stop() {
    this.currentTimeMs = 0;
    this.isPlaying = false;
    this.applyTimeline(0);
    this.emitChange();
  }

  update(deltaSeconds) {
    this.updateLayerTransform();

    if (!this.isLoaded) {
      return;
    }

    for (const character of this.characters.values()) {
      character.mixer?.update(deltaSeconds);
    }

    if (!this.isPlaying) {
      return;
    }

    this.currentTimeMs += deltaSeconds * 1000;

    if (this.currentTimeMs > this.durationMs) {
      if (this.loop && this.durationMs > 0) {
        this.currentTimeMs = this.currentTimeMs % this.durationMs;
      } else {
        this.currentTimeMs = this.durationMs;
        this.isPlaying = false;
      }
    }

    this.applyTimeline(this.currentTimeMs);

    const now = performance.now();
    if (now - this.lastStatusEmitMs > 250) {
      this.lastStatusEmitMs = now;
      this.emitChange();
    }
  }

  updateLayerTransform() {
    if (!this.appState.pageAnchor || !this.appState.pageLocked) {
      this.characterLayer.visible = false;
      return;
    }

    this.characterLayer.visible = this.isLoaded;
    this.characterLayer.matrix.copy(this.appState.pageAnchor.matrix);
    this.characterLayer.matrixWorldNeedsUpdate = true;
  }

  applyTimeline(timeMs) {
    if (!this.story) return;

    // Start every character from its configured initial pose for deterministic replay.
    for (const character of this.characters.values()) {
      const initialPosition = this.vectorFromJSON(character.config.initialLocalPosition, 0, 0, 0);
      const initialRotation = THREE.MathUtils.degToRad(Number(character.config.initialRotationYDeg ?? 0));
      character.wrapper.visible = true;
      this.applyCharacterTransform(character, initialPosition, initialRotation);
    }

    const actionsToApply = this.story.timeline
      .filter((action) => timeMs >= Number(action.startMs ?? 0))
      .sort((a, b) => Number(a.startMs ?? 0) - Number(b.startMs ?? 0));

    for (const action of actionsToApply) {
      const character = this.characters.get(action.characterId);
      if (!character) continue;
      const isActive = timeMs <= Number(action.endMs ?? action.startMs ?? 0);
      this.applyAction(character, action, timeMs, isActive);
    }
  }

  applyAction(character, action, timeMs, isActive = true) {
    const start = Number(action.startMs ?? 0);
    const end = Number(action.endMs ?? start);
    const progress = end > start ? THREE.MathUtils.clamp((timeMs - start) / (end - start), 0, 1) : 1;

    let nextPosition = character.localPosition.clone();
    let nextRotationY = character.rotationY;

    if (action.type === 'move') {
      const from = this.vectorFromJSON(action.from, character.localPosition.x, character.localPosition.y, character.localPosition.z);
      const to = this.vectorFromJSON(action.to, character.localPosition.x, character.localPosition.y, character.localPosition.z);
      nextPosition = from.lerp(to, this.easeInOut(progress));

      if (typeof action.rotationYDeg === 'number') {
        nextRotationY = THREE.MathUtils.degToRad(action.rotationYDeg);
      }
    }

    if (action.type === 'pose') {
      nextPosition = this.vectorFromJSON(action.position, character.localPosition.x, character.localPosition.y, character.localPosition.z);

      if (typeof action.rotationYDeg === 'number') {
        nextRotationY = THREE.MathUtils.degToRad(action.rotationYDeg);
      }
    }

    if (action.type === 'rotate') {
      const from = THREE.MathUtils.degToRad(Number(action.fromRotationYDeg ?? 0));
      const to = THREE.MathUtils.degToRad(Number(action.toRotationYDeg ?? 0));
      nextRotationY = THREE.MathUtils.lerp(from, to, this.easeInOut(progress));
    }

    if (action.type === 'visibility') {
      character.wrapper.visible = Boolean(action.visible);
    }

    if (isActive && typeof action.animationClip === 'string') {
      this.playClip(character, action.animationClip);
    }

    this.applyCharacterTransform(character, nextPosition, nextRotationY);
  }

  applyCharacterTransform(character, localPosition, rotationY) {
    const clamped = this.clampCharacterLocal(character, localPosition);
    character.localPosition.copy(clamped);
    character.rotationY = rotationY;
    character.wrapper.position.copy(clamped);
    character.wrapper.rotation.set(0, rotationY, 0);
  }

  clampCharacterLocal(character, localPosition) {
    if (!this.appState.boundaryClamp) {
      return localPosition.clone();
    }

    const previousRadius = this.appState.boundaryClamp.footprintRadiusMeters;
    this.appState.boundaryClamp.footprintRadiusMeters = character.footprintRadiusMeters;
    this.appState.boundaryClamp.recompute();
    const clamped = this.appState.boundaryClamp.clampLocal(localPosition);
    this.appState.boundaryClamp.footprintRadiusMeters = previousRadius;
    this.appState.boundaryClamp.recompute();
    return clamped;
  }

  playClip(character, clipName) {
    if (!character.mixer || !character.clips.has(clipName) || character.currentClipName === clipName) {
      return;
    }

    character.mixer.stopAllAction();
    const action = character.mixer.clipAction(character.clips.get(clipName));
    action.reset().fadeIn(0.12).play();
    character.currentClipName = clipName;
  }

  vectorFromJSON(value, fallbackX = 0, fallbackY = 0, fallbackZ = 0) {
    return new THREE.Vector3(
      Number(value?.x ?? fallbackX),
      Number(value?.y ?? fallbackY),
      Number(value?.z ?? fallbackZ)
    );
  }

  easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  hasLoadedCharacters() {
    return this.isLoaded && this.characters.size > 0;
  }

  clearCharacters() {
    while (this.characterLayer.children.length > 0) {
      const child = this.characterLayer.children.pop();
      this.disposeObject(child);
    }
    this.characters.clear();
  }

  disposeObject(object) {
    object.traverse?.((child) => {
      child.geometry?.dispose?.();
      if (Array.isArray(child.material)) {
        child.material.forEach((material) => material.dispose?.());
      } else {
        child.material?.dispose?.();
      }
    });
  }

  getStatus() {
    const characterStatuses = [...this.characters.values()].map((character) => ({
      id: character.id,
      displayName: character.config.displayName ?? character.id,
      assetUrl: character.config.assetUrl ?? null,
      loadedFromAsset: character.loadedFromAsset,
      loadError: character.loadError,
      localPosition: vectorToJSON(character.localPosition),
      worldPosition: this.appState.pageAnchor
        ? vectorToJSON(this.appState.pageAnchor.localToWorld(character.localPosition))
        : null,
      rotationYDeg: round(THREE.MathUtils.radToDeg(character.rotationY), 2),
      footprintRadiusMeters: round(character.footprintRadiusMeters, 4),
      currentClipName: character.currentClipName
    }));

    return {
      type: 'Phase4StoryRuntime',
      loaded: this.isLoaded,
      loading: this.isLoading,
      playing: this.isPlaying,
      storyUrl: this.storyUrl,
      storyId: this.story?.storyId ?? null,
      title: this.story?.title ?? null,
      currentTimeMs: round(this.currentTimeMs, 2),
      durationMs: round(this.durationMs, 2),
      loop: this.loop,
      pageLockedRequired: true,
      renderLayerVisible: this.characterLayer.visible,
      characters: characterStatuses,
      lastError: this.lastError
    };
  }

  emitChange() {
    this.dispatchEvent(new Event('change'));
  }
}
