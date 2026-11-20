function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

/**
 * Keyboard & pointer controls with Pointer Lock (hidden cursor 360 free-look + pitch + scroll zoom)
 * and drag-orbit fallback.
 * - WASD / Arrows: Move
 * - Space: Jump
 * - Shift: Dash
 * - E (or F/Enter): Interact / Deposit into lantern
 * - Q (or X): Radiant Pulse
 * - C: Toggle Pointer Lock (hide/show cursor camera mode)
 * - Esc / P: Pause toggle
 * - M: Mute toggle
 */
export class InputController {
  constructor(
    domElement,
    {
      onMuteToggle,
      onPauseToggle,
      onPointerLockChange,
      onPointerLockModeToggle,
      mouseSensitivity = 1.0,
      pointerLockEnabled = true
    } = {}
  ) {
    this.domElement = domElement;
    this.onMuteToggle = onMuteToggle;
    this.onPauseToggle = onPauseToggle;
    this.onPointerLockChange = onPointerLockChange;
    this.onPointerLockModeToggle = onPointerLockModeToggle;

    this.mouseSensitivity = mouseSensitivity;
    this.pointerLockEnabled = pointerLockEnabled;
    this.isPointerLocked = false;
    this._ignoreNextUnlockPause = false;

    this.keys = new Set();
    this.pendingJump = false;
    this.pendingInteract = false;
    this.pendingPulse = false;
    this.pendingDash = false;

    this.camYawDeg = 180; // Look along +Z initially (matches Mây facing +Z)
    this.camPitchDeg = 24;
    this.camDist = 10.5;

    this.isDragging = false;
    this.lastPointerX = 0;
    this.lastPointerY = 0;

    this._onKeyDown = this._handleKeyDown.bind(this);
    this._onKeyUp = this._handleKeyUp.bind(this);
    this._onPointerDown = this._handlePointerDown.bind(this);
    this._onPointerMove = this._handlePointerMove.bind(this);
    this._onMouseMoveLocked = this._handleMouseMoveLocked.bind(this);
    this._onPointerUp = this._handlePointerUp.bind(this);
    this._onWheel = this._handleWheel.bind(this);
    this._onPointerLockChange = this._handlePointerLockChange.bind(this);
    this._onBlur = this._handleBlur.bind(this);

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    domElement.addEventListener('pointerdown', this._onPointerDown);
    domElement.addEventListener('wheel', this._onWheel, { passive: false });
    window.addEventListener('pointermove', this._onPointerMove);
    document.addEventListener('mousemove', this._onMouseMoveLocked);
    window.addEventListener('pointerup', this._onPointerUp);
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
  }

  setMouseSensitivity(val) {
    this.mouseSensitivity = val;
  }

  setPointerLockEnabled(enabled) {
    this.pointerLockEnabled = Boolean(enabled);
    if (!this.pointerLockEnabled && this.isPointerLocked) {
      this.exitPointerLock();
    }
  }

  requestPointerLock() {
    if (!this.pointerLockEnabled || !this.domElement.requestPointerLock) return;
    if (document.pointerLockElement === this.domElement) return;
    try {
      const res = this.domElement.requestPointerLock();
      if (res && typeof res.catch === 'function') {
        res.catch(() => {});
      }
    } catch {
      // Browser may reject without active user gesture; canvas click handles retry cleanly
    }
  }

  exitPointerLock() {
    if (document.pointerLockElement === this.domElement && document.exitPointerLock) {
      this._ignoreNextUnlockPause = true;
      document.exitPointerLock();
    }
  }

  resetCameraForNight() {
    this.camYawDeg = 180;
    this.camPitchDeg = 24;
    this.camDist = 10.5;
  }

  _handlePointerLockChange() {
    const locked = document.pointerLockElement === this.domElement;
    this.isPointerLocked = locked;
    if (locked) {
      this.isDragging = false;
    }
    const userExited = !locked && !this._ignoreNextUnlockPause;
    this._ignoreNextUnlockPause = false;
    this.onPointerLockChange?.(locked, { userExited });
  }

  _handleKeyDown(e) {
    if (e.code === 'Space' || e.code.startsWith('Arrow')) {
      e.preventDefault();
    }
    if (!e.repeat) {
      if (e.code === 'Space') this.pendingJump = true;
      if (e.code === 'KeyE' || e.code === 'KeyF' || e.code === 'Enter') {
        this.pendingInteract = true;
      }
      if (e.code === 'KeyQ' || e.code === 'KeyX') {
        this.pendingPulse = true;
      }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        this.pendingDash = true;
      }
      if (e.code === 'KeyC') {
        this.setPointerLockEnabled(!this.pointerLockEnabled);
        this.onPointerLockModeToggle?.(this.pointerLockEnabled);
      }
      if ((e.code === 'Escape' || e.code === 'KeyP') && this.onPauseToggle) {
        this.onPauseToggle();
      }
      if (e.code === 'KeyM' && this.onMuteToggle) {
        this.onMuteToggle();
      }
    }
    this.keys.add(e.code);
  }

  _handleKeyUp(e) {
    this.keys.delete(e.code);
  }

  _handlePointerDown(e) {
    if (e.button !== 0) return;
    if (this.pointerLockEnabled) {
      if (!this.isPointerLocked) {
        this.requestPointerLock();
      }
      return;
    }
    this.isDragging = true;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
  }

  _handleMouseMoveLocked(e) {
    if (!this.isPointerLocked) return;
    const mx = e.movementX || 0;
    const my = e.movementY || 0;
    if (Math.abs(mx) > 350 || Math.abs(my) > 350) return;
    this.camYawDeg -= mx * 0.18 * this.mouseSensitivity;
    this.camPitchDeg = clamp(this.camPitchDeg + my * 0.14 * this.mouseSensitivity, 10, 62);
  }

  _handlePointerMove(e) {
    if (!this.isDragging || this.isPointerLocked) return;
    const dx = e.clientX - this.lastPointerX;
    const dy = e.clientY - this.lastPointerY;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
    this.camYawDeg -= dx * 0.32 * this.mouseSensitivity;
    this.camPitchDeg = clamp(this.camPitchDeg + dy * 0.22 * this.mouseSensitivity, 10, 62);
  }

  _handlePointerUp() {
    this.isDragging = false;
  }

  _handleWheel(e) {
    e.preventDefault();
    this.camDist = clamp(this.camDist + e.deltaY * 0.008, 6.5, 16.5);
  }

  _handleBlur() {
    this.keys.clear();
    this.isDragging = false;
  }

  getCameraState() {
    return {
      yawDeg: this.camYawDeg,
      pitchDeg: this.camPitchDeg,
      dist: this.camDist
    };
  }

  sampleTickInput(dt) {
    if (this.keys.has('BracketLeft')) this.camYawDeg += 95 * dt;
    if (this.keys.has('BracketRight')) this.camYawDeg -= 95 * dt;

    let x = 0;
    let z = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) z -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) z += 1;

    const heldJump = this.keys.has('Space');
    const heldInteract = this.keys.has('KeyE') || this.keys.has('KeyF') || this.keys.has('Enter');
    const heldPulse = this.keys.has('KeyQ') || this.keys.has('KeyX');
    const heldDash = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');

    const input = {
      move: [x, z],
      cam_yaw_deg: this.camYawDeg,
      jump: heldJump || this.pendingJump,
      interact: heldInteract || this.pendingInteract,
      pulse: heldPulse || this.pendingPulse,
      dash: heldDash || this.pendingDash
    };

    this.pendingJump = false;
    this.pendingInteract = false;
    this.pendingPulse = false;
    this.pendingDash = false;

    return input;
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    this.domElement.removeEventListener('pointerdown', this._onPointerDown);
    this.domElement.removeEventListener('wheel', this._onWheel);
    window.removeEventListener('pointermove', this._onPointerMove);
    document.removeEventListener('mousemove', this._onMouseMoveLocked);
    window.removeEventListener('pointerup', this._onPointerUp);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
  }
}
