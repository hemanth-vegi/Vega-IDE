/**
 * Vega IDE Deep Theme Purge Module
 * 
 * Purges blue accents and injects Deep Black & Sunsetting Red design language.
 */

const fs = require('fs');
const path = require('path');
const config = require('./vega.config.js');

const VEGA_THEME_COLORS = {
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
};

function deepThemePurge(options = {}) {
  const verbose = options.verbose !== false;
  if (verbose) console.log('=== PHASE: DEEP THEME PURGE & BLUE ERADICATION ===');

  // 1. Purge all blue accents from built-in theme JSONs across all active app dirs
  const appDirs = config.getActiveAppDirs();
  const themeFileNames = ['dark_modern.json', 'dark_plus.json', 'dark_vs.json'];

  for (const app of appDirs) {
    for (const tfName of themeFileNames) {
      const themePath = path.join(app.themesDir, tfName);
      if (fs.existsSync(themePath)) {
        try {
          const theme = JSON.parse(fs.readFileSync(themePath, 'utf8'));
          if (!theme.colors) theme.colors = {};
          Object.assign(theme.colors, VEGA_THEME_COLORS);
          fs.writeFileSync(themePath, JSON.stringify(theme, null, '\t'), 'utf8');
          if (verbose) console.log(`[THEME PURGED] ${themePath}`);
        } catch (err) {
          throw new Error(`Failed patching theme file ${themePath}: ${err.message}`, { cause: err });
        }
      }
    }
  }

  // 2. Comprehensive settings.json injection across all profiles
  const settingsDirs = [
    path.join(config.APPDATA, 'vega', 'User'),
    path.join(config.APPDATA, 'Vega IDE', 'User'),
    path.join(config.APPDATA, '.vega', 'User'),
    path.join(config.USER_HOME, '.vega', 'User'),
    path.join(config.VEGA_DATA_DIR, 'User')
  ];

  settingsDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const sFile = path.join(dir, 'settings.json');
    let settings = {};
    if (fs.existsSync(sFile)) {
      try {
        const content = fs.readFileSync(sFile, 'utf8').trim();
        if (content) settings = JSON.parse(content);
      } catch (e) {
        throw new Error(`Could not parse settings file ${sFile}: ${e.message}`, { cause: e });
      }
    }

    settings["workbench.colorTheme"] = "Default Dark Modern";
    settings["workbench.colorCustomizations"] = Object.assign(
      settings["workbench.colorCustomizations"] || {},
      VEGA_THEME_COLORS
    );

    fs.writeFileSync(sFile, JSON.stringify(settings, null, 2), 'utf8');
    if (verbose) console.log(`[THEME INJECTED] ${sFile}`);
  });

  if (verbose) console.log('=== DEEP THEME PURGE COMPLETE ===');
  return { success: true };
}

if (require.main === module) {
  try {
    deepThemePurge();
  } catch (err) {
    console.error('[ERROR] deepThemePurge failed:', err);
    process.exit(1);
  }
}

module.exports = { deepThemePurge, VEGA_THEME_COLORS };
