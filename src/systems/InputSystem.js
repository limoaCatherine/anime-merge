// 输入系统：平台层 (WebPlatform: Pointer Events + 键盘；DouyinPlatform: tt.onTouch*) 把输入交给这里，
// 统一换算成逻辑坐标后通过事件总线派发。只跟踪一根手指/一个指针 (多点触摸时忽略其他手指)。
export class InputSystem {
  constructor(game) {
    this.game = game;
    this.platform = game.platform;
    this.pointer = { x: game.width / 2, y: game.height / 2, down: false };
    this.activePointerId = null;

    this.platform.bindInput({
      down: (p) => this._down(p),
      move: (p) => this._move(p),
      up: (p) => this._up(p),
      cancel: (p) => this._cancel(p),
      key: (e) => game.events.emit('input:key', e),
      blur: () => {
        // 失去焦点 / 切到后台：松开所有按键/指针 (避免回来后"按住"状态残留)
        if (this.activePointerId !== null) { this.activePointerId = null; this.pointer.down = false; game.events.emit('input:cancel'); }
        game.events.emit('app:blur');
      },
    });
  }

  /** 窗口 client 坐标 → 逻辑坐标 (调试/测试用) */
  toLogical(e) {
    const c = this.platform.clientToCanvas(e.clientX, e.clientY);
    return { ...this.game.toLogical(c.x, c.y), type: e.pointerType };
  }

  _logical(p) {
    return { ...this.game.toLogical(p.x, p.y), type: p.type };
  }

  /** @returns {boolean} 是否接受这个指针 (浏览器据此 setPointerCapture) */
  _down(p) {
    if (this.activePointerId !== null && this.activePointerId !== p.id) return false; // 只处理单指
    this.activePointerId = p.id;
    const l = this._logical(p);
    Object.assign(this.pointer, l, { down: true });
    this.game.events.emit('input:down', l);
    return true;
  }

  _move(p) {
    if (this.activePointerId !== null && this.activePointerId !== p.id) return;
    const l = this._logical(p);
    Object.assign(this.pointer, l);
    this.game.events.emit('input:move', l);
  }

  _cancel(p) {
    if (this.activePointerId !== p.id) return;
    this.activePointerId = null;
    this.pointer.down = false;
    this.game.events.emit('input:cancel');
  }

  _up(p) {
    if (this.activePointerId !== p.id) return;
    this.activePointerId = null;
    const l = this._logical(p);
    Object.assign(this.pointer, l, { down: false });
    this.game.events.emit('input:up', l);
  }
}
