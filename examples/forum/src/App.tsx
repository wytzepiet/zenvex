import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { NavigationProvider, useNavigation } from "./lib/navigation";
import { UserProvider } from "./lib/user";
import { UserPicker } from "./components/UserPicker";
import { SeedButton } from "./components/SeedButton";
import { HomePage } from "./components/HomePage";
import { CategoryPage } from "./components/CategoryPage";
import { ThreadPage } from "./components/ThreadPage";
import { UserPage } from "./components/UserPage";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from "./components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./components/ui/collapsible";
import { Separator } from "./components/ui/separator";
import { ChevronRight, Folder, Zap } from "lucide-react";
import { timeAgo } from "./lib/time";

function AppSidebar() {
  const { navigate, current, goHome } = useNavigation();
  const categories = useQuery(api.queries.listCategories);
  const categoriesWithThreads = useQuery(api.queries.listCategoriesWithRecentThreads);

  // Build a map of category ID → recent threads from the second query
  const recentThreadsMap = new Map(
    categoriesWithThreads?.map((cat) => [cat._id, cat.threads]) ?? [],
  );

  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" onClick={goHome}>
              <div className="bg-primary text-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                <Zap className="size-4" />
              </div>
              <div className="flex flex-col gap-0.5 leading-none">
                <span className="font-semibold">Forum</span>
                <span className="text-xs text-muted-foreground">Zenvex Demo</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Categories</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {categories?.map((cat) => {
                const recentThreads = recentThreadsMap.get(cat._id) ?? [];
                return (
                  <Collapsible
                    key={cat._id}
                    asChild
                    defaultOpen={current.page === "category" && current.id === cat._id}
                    className="group/collapsible"
                  >
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton
                          tooltip={cat.name}
                          isActive={current.page === "category" && current.id === cat._id}
                          onClick={() => navigate({ page: "category", id: cat._id })}
                        >
                          <Folder className="size-4" />
                          <span className="truncate">{cat.name}</span>
                          <span className="ml-auto text-xs text-muted-foreground tabular-nums">{cat.threadCount}</span>
                          <ChevronRight className="size-4 shrink-0 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {recentThreads.map((thread) => (
                            <SidebarMenuSubItem key={thread._id}>
                              <SidebarMenuSubButton
                                onClick={() => navigate({ page: "thread", id: thread._id })}
                                isActive={current.page === "thread" && current.id === thread._id}
                              >
                                <span className="truncate">{thread.title}</span>
                                <span className="ml-auto text-[10px] text-muted-foreground shrink-0">
                                  {timeAgo(thread.createdAt)}
                                </span>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                          {cat.threadCount > 3 && (
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton
                                className="text-muted-foreground"
                                onClick={() => navigate({ page: "category", id: cat._id })}
                              >
                                <span className="text-xs">View all {cat.threadCount} threads</span>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          )}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <UserPicker />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function PageContent() {
  const { current } = useNavigation();

  switch (current.page) {
    case "home":
      return <HomePage />;
    case "category":
      return <CategoryPage categoryId={current.id} />;
    case "thread":
      return <ThreadPage threadId={current.id} />;
    case "user":
      return <UserPage userId={current.id} />;
  }
}

function AppShell() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 !h-4" />
          <div className="flex-1" />
          <SeedButton />
        </header>
        <div className="flex-1 p-6 max-w-4xl">
          <PageContent />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default function App() {
  return (
    <UserProvider>
      <NavigationProvider>
        <AppShell />
      </NavigationProvider>
    </UserProvider>
  );
}
