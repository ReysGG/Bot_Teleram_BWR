import { useSyncExternalStore } from "react";
const subscribe = (callback: () => void) => { window.addEventListener("popstate", callback); return () => window.removeEventListener("popstate", callback); };
export const usePathname = () => useSyncExternalStore(subscribe, () => location.pathname);
export function navigate(path: string) { history.pushState(null, "", path); window.dispatchEvent(new PopStateEvent("popstate")); }
export const useRouter = () => ({ push: navigate, replace: navigate, refresh: () => {} });
