// 桌面外壳 (Electron 主进程)：在独立窗口中运行 dist/index.html。
// - 竖屏窗口 (按屏幕大小自适应, 保持 9:16)、无菜单栏、ready-to-show 后再显示 (无白屏闪烁)
// - 单实例：重复双击只会激活已打开的窗口
// - 打包后禁用开发者工具；外部链接用系统浏览器打开；禁止页面跳转到外部地址
// - 允许无手势自动播放 (语音/问候语)
// - 存档 (localStorage) 保存在 %APPDATA%\AnimeMerge 中，重启后保留
const { app, BrowserWindow, Menu, shell, screen } = require('electron');
const path = require('path');

const TITLE = '美少女合成';
const BG = '#ffe1f0';
const ASPECT = 9 / 16;

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// 固定用户数据目录 (ASCII 名称，避免不同版本/改名导致存档丢失)
app.setPath('userData', path.join(app.getPath('appData'), 'AnimeMerge'));
if (process.platform === 'win32') app.setAppUserModelId('com.gamel.animemerge');

let win = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
  app.whenReady().then(createWindow);
  app.on('window-all-closed', () => app.quit());
}

function createWindow() {
  Menu.setApplicationMenu(null);
  const area = screen.getPrimaryDisplay().workAreaSize;
  const height = Math.round(Math.min(960, area.height * 0.92));
  const width = Math.round(height * ASPECT);

  win = new BrowserWindow({
    width,
    height,
    minWidth: 270,
    minHeight: 480,
    useContentSize: true,
    center: true,
    show: false,
    title: TITLE,
    backgroundColor: BG,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged,
      autoplayPolicy: 'no-user-gesture-required',
      spellcheck: false,
    },
  });
  win.setAspectRatio(ASPECT);

  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });
  // 保持窗口标题固定
  win.on('page-title-updated', (e) => e.preventDefault());

  const wc = win.webContents;
  // 外部链接 -> 系统浏览器；不在应用内打开新窗口
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  wc.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) {
      e.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });
  if (app.isPackaged) {
    // 屏蔽开发者工具/刷新等快捷键
    wc.on('before-input-event', (e, input) => {
      const k = (input.key || '').toLowerCase();
      if (k === 'f12' || ((input.control || input.meta) && input.shift && k === 'i')) e.preventDefault();
      if (k === 'f5' || ((input.control || input.meta) && k === 'r')) e.preventDefault();
    });
  }

  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  win.on('closed', () => { win = null; });
}
