import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useCurrentUser } from "../lib/user";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";
import { Avatar, AvatarFallback } from "./ui/avatar";
import {
  SidebarMenuButton,
} from "./ui/sidebar";
import { ChevronsUpDown, User, LogOut } from "lucide-react";

export function UserPicker() {
  const users = useQuery(api.queries.listUsers);
  const { currentUserId, setCurrentUserId } = useCurrentUser();

  const currentUser = users?.find((u) => u._id === currentUserId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          size="lg"
          className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
        >
          <Avatar className="h-8 w-8 rounded-lg">
            <AvatarFallback className="rounded-lg">
              {currentUser ? currentUser.name[0] : <User className="size-4" />}
            </AvatarFallback>
          </Avatar>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-semibold">
              {currentUser?.name ?? "Sign in"}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {currentUser?.email ?? "Select a user"}
            </span>
          </div>
          <ChevronsUpDown className="ml-auto size-4" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
        side="top"
        align="start"
        sideOffset={4}
      >
        {users?.map((user) => (
          <DropdownMenuItem
            key={user._id}
            onClick={() => setCurrentUserId(user._id)}
            className={user._id === currentUserId ? "bg-accent" : ""}
          >
            <Avatar className="h-6 w-6 rounded-md mr-2">
              <AvatarFallback className="rounded-md text-[10px]">
                {user.name[0]}
              </AvatarFallback>
            </Avatar>
            <div className="grid text-sm leading-tight">
              <span className="font-medium">{user.name}</span>
              <span className="text-xs text-muted-foreground">{user.email}</span>
            </div>
          </DropdownMenuItem>
        ))}
        {currentUserId && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setCurrentUserId(null)}>
              <LogOut className="h-4 w-4 mr-2" />
              Sign out
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
