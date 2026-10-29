for (const key of Object.keys(process.env)) { if (key.startsWith('GIT_')) delete process.env[key]; }
if (!globalThis.localStorage) {
  class TestStorage {
    getItem(key: string) { return Object.hasOwn(this, key) ? (this as unknown as Record<string,string>)[key] : null; }
    setItem(key: string, value: string) { Object.defineProperty(this, key, { configurable: true, enumerable: true, writable: true, value: String(value) }); }
    removeItem(key: string) { delete (this as unknown as Record<string,string>)[key]; }
    clear() { for (const key of Object.keys(this)) this.removeItem(key); }
    key(index: number) { return Object.keys(this)[index] ?? null; }
    get length() { return Object.keys(this).length; }
  }
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: new TestStorage() });
}
