import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { Id } from "../../convex/_generated/dataModel";

type Page =
  | { page: "home" }
  | { page: "category"; id: Id<"categories"> }
  | { page: "thread"; id: Id<"threads"> }
  | { page: "user"; id: Id<"users"> };

type NavigationContextType = {
  current: Page;
  navigate: (page: Page) => void;
  goHome: () => void;
};

const NavigationContext = createContext<NavigationContextType | null>(null);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<Page>({ page: "home" });

  const navigate = useCallback((page: Page) => setCurrent(page), []);
  const goHome = useCallback(() => setCurrent({ page: "home" }), []);

  return (
    <NavigationContext.Provider value={{ current, navigate, goHome }}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error("useNavigation must be used within NavigationProvider");
  return ctx;
}
