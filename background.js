chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-decorator") {
    chrome.storage.local.get(["decoratorEnabled"], (result) => {
      const newStatus = !result.decoratorEnabled;
      chrome.storage.local.set({ decoratorEnabled: newStatus }, () => {
        chrome.tabs.query({ url: ["*://elaws.e-gov.go.jp/*", "*://laws.e-gov.go.jp/*"] }, (tabs) => {
          tabs.forEach((tab) => {
            chrome.tabs.sendMessage(tab.id, { action: "toggle-decorator" });
          });
        });
      });
    });
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ decoratorEnabled: true });
});
