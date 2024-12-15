declare global {
  interface Window {
    fs: {
      readFile: (path: string) => Promise<ArrayBuffer>;
    }
  }
}

export function setupFileSystem() {
  if (typeof window !== 'undefined') {
    window.fs = {
      readFile: async (path: string) => {
        const response = await fetch(path);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.arrayBuffer();
      }
    };
  }
} 