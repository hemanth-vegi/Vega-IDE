const fs = require('fs');
const path = require('path');
const os = require('os');

const colorTheme = "Default Dark Modern";
const colorCustomizations = {
  "activityBar.background": "#000000",
  "activityBar.foreground": "#f43f5e",
  "activityBarBadge.background": "#e11d48",
  "sideBar.background": "#09090b",
  "sideBar.border": "#e11d4840",
  "sideBarTitle.foreground": "#f43f5e",
  "editor.background": "#000000",
  "editor.foreground": "#fafafa",
  "editorGroupHeader.tabsBackground": "#000000",
  "tab.activeBackground": "#09090b",
  "tab.inactiveBackground": "#000000",
  "tab.activeBorderTop": "#ff4d4d",
  "terminal.background": "#000000",
  "focusBorder": "#e11d48",
  "button.background": "#e11d48",
  "button.hoverBackground": "#f43f5e",
  "list.activeSelectionBackground": "#e11d4840",
  "list.hoverBackground": "#f43f5e1a",
  "titleBar.activeBackground": "#000000",
  "statusBar.background": "#09090b",
  "statusBar.foreground": "#f43f5e"
};

const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const userProfile = process.env.USERPROFILE || os.homedir();

const targetDirs = [
  path.join(appData, 'vega', 'User'),
  path.join(appData, '.vega', 'User'),
  path.join(userProfile, '.vega', 'User'),
  'C:/CloudLab/Vega-IDE-Build/vega-data/User'
];

targetDirs.forEach((userDir) => {
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }

  const settingsFile = path.join(userDir, 'settings.json');
  let settings = {};

  if (fs.existsSync(settingsFile)) {
    try {
      const content = fs.readFileSync(settingsFile, 'utf8').trim();
      if (content) {
        settings = JSON.parse(content);
      }
    } catch (e) {
      console.warn(`Could not parse JSON from ${settingsFile}, starting fresh: ${e.message}`);
    }
  }

  settings["workbench.colorTheme"] = colorTheme;
  settings["workbench.colorCustomizations"] = Object.assign(
    settings["workbench.colorCustomizations"] || {},
    colorCustomizations
  );

  fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2), 'utf8');
  console.log(`Injected Black & Sunsetting Red theme into: ${settingsFile}`);
});
