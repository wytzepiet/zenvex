import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useNavigation } from "../lib/navigation";
import { useCurrentUser } from "../lib/user";
import { timeAgo } from "../lib/time";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Separator } from "./ui/separator";
import { Skeleton } from "./ui/skeleton";
import { CreateThreadDialog } from "./CreateThreadDialog";
import { ChevronLeft, Loader2, MessageSquare, Plus } from "lucide-react";
import { useState } from "react";

function ThreadCard({ thread, navigate }: { thread: any; navigate: (p: any) => void }) {
  return (
    <button
      onClick={() => navigate({ page: "thread", id: thread._id })}
      className="w-full text-left p-4 rounded-lg border hover:bg-accent/50 transition-colors"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="font-medium truncate">{thread.title}</h3>
          <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
            <Avatar className="h-4 w-4">
              <AvatarFallback className="text-[8px]">
                {thread.author?.name[0]}
              </AvatarFallback>
            </Avatar>
            <span
              className="hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                if (thread.author) navigate({ page: "user", id: thread.author._id });
              }}
            >
              {thread.author?.name}
            </span>
            <span>&middot;</span>
            <span>{timeAgo(thread.createdAt)}</span>
          </div>
          {thread.tags && thread.tags.length > 0 && (
            <div className="flex gap-1 mt-2">
              {thread.tags.map((tag: { _id: string; name: string }) => (
                <Badge key={tag._id} variant="secondary" className="text-xs">
                  {tag.name}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 text-sm text-muted-foreground shrink-0">
          <MessageSquare className="h-3.5 w-3.5" />
          {thread.postCount}
        </div>
      </div>
    </button>
  );
}

function ThreadPage({
  categoryId,
  cursor,
  onLoadMore,
}: {
  categoryId: Id<"categories">;
  cursor: string | null;
  onLoadMore: (cursor: string) => void;
}) {
  const result = useQuery(api.queries.listThreads, { categoryId, cursor });
  const { navigate } = useNavigation();

  if (result === undefined) {
    return (
      <>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </>
    );
  }

  return (
    <>
      {result.page.map((thread) => (
        <ThreadCard key={thread._id} thread={thread} navigate={navigate} />
      ))}
      {!result.isDone && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onLoadMore(result.continueCursor)}
          >
            Load more threads
          </Button>
        </div>
      )}
    </>
  );
}

export function CategoryPage({ categoryId }: { categoryId: Id<"categories"> }) {
  const category = useQuery(api.queries.getCategory, { id: categoryId });
  const { goHome } = useNavigation();
  const { currentUserId } = useCurrentUser();
  const [showCreate, setShowCreate] = useState(false);
  const [cursors, setCursors] = useState<(string | null)[]>([null]);

  if (category === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
        <div className="space-y-3 mt-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      </div>
    );
  }

  if (!category) {
    return <p className="text-muted-foreground">Category not found</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <button
            onClick={goHome}
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-2"
          >
            <ChevronLeft className="h-3 w-3" /> Categories
          </button>
          <h1 className="text-2xl font-bold">{category.name}</h1>
          <p className="text-muted-foreground">{category.description}</p>
        </div>
        {currentUserId && (
          <Button size="sm" className="gap-1" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" /> New Thread
          </Button>
        )}
      </div>

      <Separator />

      <div className="space-y-2">
        {cursors.map((cursor, i) => (
          <ThreadPage
            key={cursor ?? "first"}
            categoryId={categoryId}
            cursor={cursor}
            onLoadMore={(nextCursor) => {
              setCursors((prev) => {
                if (prev.length === i + 1) return [...prev, nextCursor];
                return prev;
              });
            }}
          />
        ))}
      </div>

      <CreateThreadDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        categoryId={categoryId}
      />
    </div>
  );
}
