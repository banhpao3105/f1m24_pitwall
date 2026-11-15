/**
 * Minimal ambient types for the File System Access API (v0.8.1).
 *
 * TypeScript 5.9's lib.dom ships `FileSystemFileHandle` (drag-and-drop uses
 * it) but NOT the permission methods or `window.showOpenFilePicker`. Only
 * Chromium implements these today — hence every member below is optional so
 * feature detection (`typeof window.showOpenFilePicker === 'function'`)
 * typechecks without casting to `any`.
 */

interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite';
}

interface FileSystemHandle {
  queryPermission?(
    descriptor?: FileSystemHandlePermissionDescriptor,
  ): Promise<PermissionState>;
  requestPermission?(
    descriptor?: FileSystemHandlePermissionDescriptor,
  ): Promise<PermissionState>;
}

interface FilePickerAcceptType {
  description?: string;
  accept: Record<string, string[]>;
}

interface FilePickerOptions {
  types?: FilePickerAcceptType[];
  multiple?: boolean;
  excludeAcceptAllOption?: boolean;
  startIn?: string | FileSystemHandle;
}

interface Window {
  showOpenFilePicker?(options?: FilePickerOptions): Promise<FileSystemFileHandle[]>;
}
