// Toolbar button state, per tab:
//   not a Clarity tab            -> button disabled (grey icon), no badge
//   Clarity tab, fix applied     -> blue icon, green "ON"
//   Clarity tab, paused by user  -> blue icon, grey "OFF"
//
// Clicking the button on a Clarity tab pauses / resumes the fix for THAT tab only and
// reloads it. The pause flag is stored in the tab's own sessionStorage (read by patch.js
// at document_start), so it lasts until the tab is closed.

const CLARITY_ORIGIN = 'https://clarity.microsoft.com/';
const MATCHES = ['https://clarity.microsoft.com/*'];
const PAUSE_KEY = '__clarityReplayFixPaused';

const isClarity = url => typeof url === 'string' && url.startsWith(CLARITY_ORIGIN);

async function readPaused(tabId) {
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      func: key => { try { return sessionStorage.getItem(key) === '1'; } catch (e) { return false; } },
      args: [PAUSE_KEY]
    });
    return !!(res && res.result);
  } catch (e) {
    return false; // page not ready yet; treat as active (the default)
  }
}

async function showState(tabId, url) {
  try {
    if (!isClarity(url)) {
      await chrome.action.disable(tabId);
      await chrome.action.setBadgeText({ tabId, text: '' });
      await chrome.action.setTitle({ tabId, title: 'Clarity Replay Fix: only works on clarity.microsoft.com' });
      return;
    }
    const paused = await readPaused(tabId);
    await chrome.action.enable(tabId);
    await chrome.action.setBadgeText({ tabId, text: paused ? 'OFF' : 'ON' });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: paused ? '#8a8886' : '#107c10' });
    await chrome.action.setTitle({
      tabId,
      title: paused
        ? 'Clarity Replay Fix: OFF in this tab (click to turn on)'
        : 'Clarity Replay Fix: ON in this tab (click to pause for this tab)'
    });
  } catch (e) {
    // Tab was closed while we were updating it; nothing to do.
  }
}

async function refreshAllTabs() {
  await chrome.action.disable(); // global default: grey, unclickable
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map(tab => showState(tab.id, tab.url)));
}

chrome.runtime.onInstalled.addListener(async () => {
  // Pages opened before install/update don't have the current patch; reload them.
  const tabs = await chrome.tabs.query({ url: MATCHES });
  await Promise.all(tabs.map(tab => chrome.tabs.reload(tab.id).catch(() => {})));
  await refreshAllTabs();
});

chrome.runtime.onStartup.addListener(refreshAllTabs);

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // tab.url is only visible for Clarity tabs (our host permission); for any other site it is
  // undefined, which correctly shows the disabled state.
  if (changeInfo.url !== undefined || changeInfo.status === 'loading' || changeInfo.status === 'complete') {
    showState(tabId, tab.url);
  }
});

chrome.action.onClicked.addListener(async tab => {
  if (!isClarity(tab.url)) return;
  const paused = await readPaused(tab.id);
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (key, pause) => {
      try { pause ? sessionStorage.setItem(key, '1') : sessionStorage.removeItem(key); } catch (e) {}
    },
    args: [PAUSE_KEY, !paused]
  });
  await chrome.tabs.reload(tab.id);
});
