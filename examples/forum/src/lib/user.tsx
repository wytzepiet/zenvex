import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { Id } from "../../convex/_generated/dataModel";

type UserContextType = {
  currentUserId: Id<"users"> | null;
  setCurrentUserId: (id: Id<"users"> | null) => void;
};

const UserContext = createContext<UserContextType | null>(null);

export function UserProvider({ children }: { children: ReactNode }) {
  const [currentUserId, setCurrentUserIdRaw] = useState<Id<"users"> | null>(null);

  const setCurrentUserId = useCallback((id: Id<"users"> | null) => {
    setCurrentUserIdRaw(id);
  }, []);

  return (
    <UserContext.Provider value={{ currentUserId, setCurrentUserId }}>
      {children}
    </UserContext.Provider>
  );
}

export function useCurrentUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useCurrentUser must be used within UserProvider");
  return ctx;
}
