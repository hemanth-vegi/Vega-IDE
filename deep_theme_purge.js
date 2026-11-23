const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('=== STARTING DEEP THEME PURGE & BLUE ERADICATION ===');

// 1. Purge all blue accents and gray backgrounds from built-in theme JSONs
const themeFiles = [
  'C:/CloudLab/Vega-IDE-Build/vscode-win32-x64/dcd3ad6e36/resources/app/extensions/theme-defaults/themes/dark_modern.json',
  'C:/CloudLab/Vega-IDE-Build/vscode-win32-x64/69047191fc/resources/app/extensions/theme-defaults/themes/dark_modern.json',
  'C:/CloudLab/Vega-IDE-Build/vscode-win32-x64/dcd3ad6e36/resources/app/extensions/theme-defaults/themes/dark_plus.json',
  'C:/CloudLab/Vega-IDE-Build/vscode-win32-x64/69047191fc/resources/app/extensions/theme-defaults/themes/dark_plus.json',
  'C:/CloudLab/Vega-IDE-Build/vscode-win32-x64/dcd3ad6e36/resources/app/extensions/theme-defaults/themes/dark_vs.json',
  'C:/CloudLab/Vega-IDE-Build/vscode-win32-x64/69047191fc/resources/app/extensions/theme-defaults/themes/dark_vs.json'
];

themeFiles.forEach((file) => {
  if (fs.existsSync(file)) {
    const theme = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!theme.colors) theme.colors = {};

    // Override every blue accent and dark gray background
    Object.assign(theme.colors, {
      // Core Accents & Links
      "textLink.foreground": "#ff4d4d",
      "textLink.activeForeground": "#f43f5e",
      "progressBar.background": "#e11d48",
      "badge.background": "#e11d48",
      "badge.foreground": "#ffffff",
      "activityBarBadge.background": "#e11d48",
      "activityBarBadge.foreground": "#ffffff",
      "focusBorder": "#e11d48",
      
      // Welcome Page
      "welcomePage.tileBackground": "#09090b",
      "welcomePage.tileHoverBackground": "#0d0d11",
      "welcomePage.tileBorder": "#e11d4840",
      "welcomePage.progress.foreground": "#ff4d4d",
      "welcomePage.progress.background": "#09090b",
      "welcomePage.buttonBackground": "#e11d48",
      "welcomePage.buttonHoverBackground": "#f43f5e",
      "walkThrough.embeddedEditorBackground": "#000000",

      // Buttons
      "button.background": "#e11d48",
      "button.hoverBackground": "#f43f5e",
      "button.foreground": "#ffffff",
      "button.secondaryBackground": "#09090b",
      "button.secondaryForeground": "#f43f5e",
      "button.secondaryHoverBackground": "#0d0d11",

      // Deep Black Canvas
      "activityBar.background": "#000000",
      "activityBar.foreground": "#f43f5e",
      "activityBar.inactiveForeground": "#f43f5e66",
      "activityBar.border": "#e11d4820",
      "activityBar.activeBorder": "#ff4d4d",
      "sideBar.background": "#09090b",
      "sideBar.foreground": "#fafafa",
      "sideBar.border": "#e11d4840",
      "sideBarTitle.foreground": "#f43f5e",
      "sideBarSectionHeader.background": "#000000",
      "sideBarSectionHeader.foreground": "#f43f5e",
      "sideBarSectionHeader.border": "#e11d4820",
      "editor.background": "#000000",
      "editor.foreground": "#fafafa",
      "editorGroupHeader.tabsBackground": "#000000",
      "editorGroupHeader.tabsBorder": "#e11d4820",
      "tab.activeBackground": "#09090b",
      "tab.inactiveBackground": "#000000",
      "tab.activeForeground": "#fafafa",
      "tab.inactiveForeground": "#888888",
      "tab.activeBorder": "#ff4d4d",
      "tab.activeBorderTop": "#ff4d4d",
      "tab.border": "#e11d4820",
      "titleBar.activeBackground": "#000000",
      "titleBar.activeForeground": "#fafafa",
      "titleBar.inactiveBackground": "#000000",
      "titleBar.inactiveForeground": "#888888",
      "titleBar.border": "#e11d4820",
      "statusBar.background": "#09090b",
      "statusBar.foreground": "#f43f5e",
      "statusBar.border": "#e11d4820",
      "statusBarItem.remoteBackground": "#e11d48",
      "statusBarItem.remoteForeground": "#ffffff",
      "statusBar.debuggingBackground": "#9f1239",
      "statusBar.debuggingForeground": "#ffffff",
      "terminal.background": "#000000",
      "terminal.foreground": "#fafafa",
      "terminalCursor.foreground": "#ff4d4d",
      "editorCursor.foreground": "#ff4d4d",

      // Lists & Selections
      "list.activeSelectionBackground": "#e11d4840",
      "list.activeSelectionForeground": "#ffffff",
      "list.inactiveSelectionBackground": "#e11d4820",
      "list.inactiveSelectionForeground": "#ffffff",
      "list.hoverBackground": "#f43f5e1a",
      "list.hoverForeground": "#ffffff",
      "list.highlightForeground": "#ff4d4d",
      "list.focusHighlightForeground": "#ff4d4d",

      // Inputs & Dropdowns
      "input.background": "#09090b",
      "input.border": "#e11d4840",
      "input.foreground": "#fafafa",
      "inputOption.activeBorder": "#e11d48",
      "inputOption.activeBackground": "#e11d4840",
      "inputOption.activeForeground": "#ffffff",
      "dropdown.background": "#09090b",
      "dropdown.border": "#e11d4840",
      "dropdown.foreground": "#fafafa",
      "checkbox.background": "#09090b",
      "checkbox.border": "#e11d4840",
      "checkbox.foreground": "#f43f5e",

      // Notifications
      "notifications.background": "#09090b",
      "notifications.foreground": "#fafafa",
      "notifications.border": "#e11d4840",
      "notificationLink.foreground": "#ff4d4d",
      "notificationCenterHeader.background": "#09090b",
      "notificationCenterHeader.foreground": "#f43f5e",

      // Peeks & Suggest Widgets
      "editorSuggestWidget.background": "#09090b",
      "editorSuggestWidget.border": "#e11d4840",
      "editorSuggestWidget.foreground": "#fafafa",
      "editorSuggestWidget.highlightForeground": "#ff4d4d",
      "editorSuggestWidget.selectedBackground": "#e11d4840",
      "peekView.border": "#e11d48",
      "peekViewTitle.background": "#09090b",
      "peekViewEditor.background": "#000000",
      "peekViewResult.background": "#09090b",
      "peekViewResult.selectionBackground": "#e11d4840"
    });

    fs.writeFileSync(file, JSON.stringify(theme, null, '\t'), 'utf8');
    console.log(`Purged blue accents in theme file: ${file}`);
  }
});

// 2. Comprehensive settings.json injection across all profiles
const allColorCustomizations = {
  // Primary Core & Theme Specs
  "activityBar.background": "#000000",
  "activityBar.foreground": "#f43f5e",
  "activityBar.inactiveForeground": "#f43f5e66",
  "activityBar.border": "#e11d4820",
  "activityBar.activeBorder": "#ff4d4d",
  "activityBarBadge.background": "#e11d48",
  "activityBarBadge.foreground": "#ffffff",
  "activityBarTop.foreground": "#f43f5e",
  "activityBarTop.activeBorder": "#ff4d4d",
  "sideBar.background": "#09090b",
  "sideBar.border": "#e11d4840",
  "sideBarTitle.foreground": "#f43f5e",
  "sideBarSectionHeader.background": "#000000",
  "sideBarSectionHeader.foreground": "#f43f5e",
  "sideBarSectionHeader.border": "#e11d4820",
  "editor.background": "#000000",
  "editor.foreground": "#fafafa",
  "editorGroupHeader.tabsBackground": "#000000",
  "editorGroupHeader.tabsBorder": "#e11d4820",
  "tab.activeBackground": "#09090b",
  "tab.inactiveBackground": "#000000",
  "tab.activeForeground": "#fafafa",
  "tab.inactiveForeground": "#888888",
  "tab.activeBorderTop": "#ff4d4d",
  "tab.activeBorder": "#ff4d4d",
  "tab.border": "#e11d4820",
  "terminal.background": "#000000",
  "terminal.foreground": "#fafafa",
  "terminalCursor.foreground": "#ff4d4d",
  "editorCursor.foreground": "#ff4d4d",
  "focusBorder": "#e11d48",
  "button.background": "#e11d48",
  "button.hoverBackground": "#f43f5e",
  "button.foreground": "#ffffff",
  "button.secondaryBackground": "#09090b",
  "button.secondaryForeground": "#f43f5e",
  "button.secondaryHoverBackground": "#0d0d11",
  "list.activeSelectionBackground": "#e11d4840",
  "list.activeSelectionForeground": "#ffffff",
  "list.inactiveSelectionBackground": "#e11d4820",
  "list.hoverBackground": "#f43f5e1a",
  "list.hoverForeground": "#ffffff",
  "list.highlightForeground": "#ff4d4d",
  "list.focusHighlightForeground": "#ff4d4d",
  "titleBar.activeBackground": "#000000",
  "titleBar.activeForeground": "#fafafa",
  "titleBar.inactiveBackground": "#000000",
  "titleBar.inactiveForeground": "#888888",
  "titleBar.border": "#e11d4820",
  "statusBar.background": "#09090b",
  "statusBar.foreground": "#f43f5e",
  "statusBar.border": "#e11d4820",
  "statusBarItem.remoteBackground": "#e11d48",
  "statusBarItem.remoteForeground": "#ffffff",
  "statusBar.debuggingBackground": "#9f1239",
  "statusBar.debuggingForeground": "#ffffff",

  // Eradicating all Blue Elements
  "textLink.foreground": "#ff4d4d",
  "textLink.activeForeground": "#f43f5e",
  "progressBar.background": "#e11d48",
  "badge.background": "#e11d48",
  "badge.foreground": "#ffffff",
  "welcomePage.tileBackground": "#09090b",
  "welcomePage.tileHoverBackground": "#0d0d11",
  "welcomePage.tileBorder": "#e11d4840",
  "welcomePage.progress.foreground": "#ff4d4d",
  "welcomePage.progress.background": "#09090b",
  "welcomePage.buttonBackground": "#e11d48",
  "welcomePage.buttonHoverBackground": "#f43f5e",
  "walkThrough.embeddedEditorBackground": "#000000",

  // Input & Dropdown controls
  "input.background": "#09090b",
  "input.border": "#e11d4840",
  "input.foreground": "#fafafa",
  "inputOption.activeBorder": "#e11d48",
  "inputOption.activeBackground": "#e11d4840",
  "inputOption.activeForeground": "#ffffff",
  "dropdown.background": "#09090b",
  "dropdown.border": "#e11d4840",
  "dropdown.foreground": "#fafafa",
  "checkbox.background": "#09090b",
  "checkbox.border": "#e11d4840",
  "checkbox.foreground": "#f43f5e",

  // Notifications
  "notifications.background": "#09090b",
  "notifications.foreground": "#fafafa",
  "notifications.border": "#e11d4840",
  "notificationLink.foreground": "#ff4d4d",
  "notificationCenterHeader.background": "#09090b",
  "notificationCenterHeader.foreground": "#f43f5e",

  // Peeks & Suggestions
  "editorSuggestWidget.background": "#09090b",
  "editorSuggestWidget.border": "#e11d4840",
  "editorSuggestWidget.foreground": "#fafafa",
  "editorSuggestWidget.highlightForeground": "#ff4d4d",
  "editorSuggestWidget.selectedBackground": "#e11d4840",
  "peekView.border": "#e11d48",
  "peekViewTitle.background": "#09090b",
  "peekViewEditor.background": "#000000",
  "peekViewResult.background": "#09090b",
  "peekViewResult.selectionBackground": "#e11d4840"
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
      if (content) settings = JSON.parse(content);
    } catch (e) {
      console.warn(`Could not parse JSON from ${settingsFile}: ${e.message}`);
    }
  }

  settings["workbench.colorTheme"] = "Default Dark Modern";
  settings["workbench.colorCustomizations"] = Object.assign(
    settings["workbench.colorCustomizations"] || {},
    allColorCustomizations
  );

  fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2), 'utf8');
  console.log(`Updated complete Black & Sunsetting Red palette in: ${settingsFile}`);
});

console.log('=== DEEP THEME PURGE COMPLETE ===');
