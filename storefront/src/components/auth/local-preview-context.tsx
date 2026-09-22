"use client";
import { createContext, useContext, type ReactNode } from "react";
const LocalPreviewContext = createContext(false);
export const useLocalPreview = () => useContext(LocalPreviewContext);
export function LocalPreviewProvider({ children }: { children: ReactNode }) {
  return <LocalPreviewContext.Provider value={true}>{children}</LocalPreviewContext.Provider>;
}
