// IndexedDB accommodates image collections without localStorage's small quota.
(() => {
  let database;
  function open() {
    if (!database) database = new Promise((resolve, reject) => {
      const request = indexedDB.open('capstone-client-drafts', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('drafts');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Draft storage is blocked. Close older workspace tabs and retry.'));
    });
    return database;
  }
  window.clientDraftStore = {
    async load(key) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const request = db.transaction('drafts').objectStore('drafts').get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    },
    async save(key, draft) {
      const snapshot = structuredClone(draft);
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('drafts', 'readwrite');
        tx.objectStore('drafts').put(snapshot, key);
        tx.oncomplete = () => resolve();
        tx.onabort = tx.onerror = () => reject(tx.error || new Error('Draft could not be saved.'));
      });
    },
  };
})();
