/**
 * Captures keyboard & pointer orbit controls and samples edge-latched 60Hz input
 * aligned with Test Contract v1.0 movement yaw coordinates.
 */
export class InputController {
  constructor(domElement, { onMuteToggle } = {}) {
    this.domElement = domElement;
    this.onMuteToggle = onMuteToggle;

    this.keys = new Set();
    this.pendingJump = false;
    this.pendingInteract = false;
    this.pendingPulse = false;

    this.camYawDeg = 0;
    this.isDragging = false;
    this.lastPointerX = 0;

    this._onKeyDown = this._handleKeyDown.bind(this);
    this._onKeyUp = this._handleKeyUp.bind(this);
    this._onPointerDown = this._handlePointerDown.bind(this);
    this._onPointerMove = this._handlePointerMove.bind(this);
    this._onPointerUp = this._handlePointerUp.bind(this);
    this._onBlur = this._handleBlur.bind(this);

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    domElement.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);
  }

  _handleKeyDown(e) {
    if (e.code === 'Space' || e.code.startsWith('Arrow')) {
      e.preventDefault();
    }
    if (!e.repeat) {
      if (e.code === 'Space') this.pendingJump = true;
      if (e.code === 'KeyF' || e.code === 'Enter') this.pendingInteract = true;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyX') {
        this.pendingPulse = true;
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
    this.isDragging = true;
    this.lastPointerX = e.clientX;
  }

  _handlePointerMove(e) {
    if (!this.isDragging) return;
    const dx = e.clientX - this.lastPointerX;
    this.lastPointerX = e.clientX;
    this.camYawDeg -= dx * 0.35;
  }

  _handlePointerUp() {
    this.isDragging = false;
  }

  _handleBlur() {
    this.keys.clear();
    this.isDragging = false;
  }

  sampleTickInput(dt) {
    if (this.keys.has('KeyQ')) this.camYawDeg += 95 * dt;
    if (this.keys.has('KeyE')) this.camYawDeg -= 95 * dt;

    let x = 0;
    let z = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) z -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) z += 1;

    const heldJump = this.keys.has('Space');
    const heldInteract = this.keys.has('KeyF') || this.keys.has('Enter');
    const heldPulse =
      this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.keys.has('KeyX');

    const input = {
      move: [x, z],
      cam_yaw_deg: this.camYawDeg,
      jump: heldJump || this.pendingJump,
      interact: heldInteract || this.pendingInteract,
      pulse: heldPulse || this.pendingPulse
    };

    this.pendingJump = false;
    this.pendingInteract = false;
    this.pendingPulse = false;

    return input;
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    this.domElement.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
  }
}
