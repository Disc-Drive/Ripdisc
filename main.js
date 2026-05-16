const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let mainWindow;
const configPath = path.join(__dirname, 'config.json');

function getConfig() {
  if (!fs.existsSync(configPath)) return { nas: { enabled: false, paths: [] } };
  return JSON.parse(fs.readFileSync(configPath));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    title: "Ripdisc",
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {

  const menu = [
    { label: "File", submenu: [{ role: "quit" }] },
    {
      label: "Edit",
      submenu: [
        { role: "undo" }, { role: "redo" },
        { type: "separator" },
        { role: "cut" }, { role: "copy" }, { role: "paste" }
      ]
    },
    {
      label: "View",
      submenu: [
        {
          label: "Show Activity",
          type: "checkbox",
          checked: true,
          click: (item) => {
            mainWindow.webContents.send('toggle-activity', item.checked);
          }
        },
        { type: "separator" },
        { role: "reload" },
        { role: "toggledevtools" }
      ]
    },
    {
      label: "Settings",
      submenu: [
        {
          label: "NAS Configuration",
          click: () => {
            const win = new BrowserWindow({
              width: 400,
              height: 350,
              webPreferences: {
                preload: path.join(__dirname, 'preload.js')
              }
            });
            win.loadFile('settings.html');
          }
        }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(menu));
  createWindow();
});

ipcMain.handle('detect-discs', async () => {
  return new Promise((resolve) => {
    const ps = spawn("powershell.exe", [
      "-Command",
      `
      Get-CimInstance Win32_LogicalDisk |
      Where-Object { $_.DriveType -eq 5 -and $_.VolumeName } |
      Select DeviceID, VolumeName |
      ConvertTo-Json
      `
    ]);

    let output = "";

    ps.stdout.on('data', d => output += d.toString());

    ps.on('close', () => {
      if (!output.trim()) return resolve([]);

      let parsed = JSON.parse(output);
      if (!Array.isArray(parsed)) parsed = [parsed];

      resolve(parsed.map(d => ({
        letter: d.DeviceID.replace(':', ''),
        label: d.VolumeName
      })));
    });
  });
});

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('get-config', async () => getConfig());

ipcMain.handle('save-config', async (_, cfg) => {
  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
  mainWindow.webContents.send('config-updated');
});

ipcMain.on('start-rip', (event, args) => {

  const scriptPath = app.isPackaged
    ? path.join(process.resourcesPath, 'Ripdisc.ps1')
    : path.join(__dirname, 'Ripdisc.ps1');

  const cfg = getConfig();
  const driveToUse = cfg.driveLetter || args.driveLetter;

  const ps = spawn("powershell.exe", [
    "-ExecutionPolicy", "Bypass",
    "-File", scriptPath,
    "-discName", args.discName,
    "-driveLetter", driveToUse,
    "-destinationType", args.destinationType,
    "-localPath", args.localPath || "",
    "-nasPath", args.nasPath || ""
  ]);

  ps.stdout.on('data', d => {
    event.sender.send('log', d.toString());
  });

  ps.stderr.on('data', d => {
    event.sender.send('log', d.toString());
  });
});