/** Any screen can ask the app shell to open the sign-in picker (passkey or wallet). */
export const CONNECT_EVENT = "blindlaunch:connect";

export function openConnect(): void {
  window.dispatchEvent(new Event(CONNECT_EVENT));
}
