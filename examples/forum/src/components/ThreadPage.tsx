import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useNavigation } from "../lib/navigation";
import { useCurrentUser } from "../lib/user";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";
import { Skeleton } from "./ui/skeleton";
import { PostCard } from "./PostCard";
import { ReplyForm } from "./ReplyForm";
import { ChevronLeft, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { timeAgo } from "../lib/time";
import { useState } from "react";

function PostsPage({
  threadId,
  cursor,
  onLoadMore,
}: {
  threadId: Id<"threads">;
  cursor: string | null;
  onLoadMore: (cursor: string) => void;
}) {
  const result = useQuery(api.queries.listPosts, { threadId, cursor });

  if (result === undefined) {
    return (
      <>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </>
    );
  }

  return (
    <>
      {result.page
        .filter((p) => !p.parentId)
        .map((post) => (
          <div key={post._id}>
            <PostCard post={post} threadId={threadId} />
            {post.replies && post.replies.length > 0 && (
              <div className="ml-8 mt-2 space-y-2 border-l-2 pl-4">
                {post.replies.map((reply: any) => (
                  <PostCard key={reply._id} post={reply} threadId={threadId} isReply />
                ))}
              </div>
            )}
          </div>
        ))}
      {!result.isDone && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onLoadMore(result.continueCursor)}
          >
            Load more posts
          </Button>
        </div>
      )}
    </>
  );
}

export function ThreadPage({ threadId }: { threadId: Id<"threads"> }) {
  const thread = useQuery(api.queries.getThread, { id: threadId });
  const { navigate } = useNavigation();
  const { currentUserId } = useCurrentUser();
  const deleteThread = useMutation(api.mutations.deleteThread);
  const [cursors, setCursors] = useState<(string | null)[]>([null]);

  if (thread === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
        <div className="space-y-4 mt-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (!thread) {
    return <p className="text-muted-foreground">Thread not found</p>;
  }

  const canDelete = currentUserId === thread.authorId;

  return (
    <div className="space-y-4">
      <div>
        {thread.category && (
          <button
            onClick={() => navigate({ page: "category", id: thread.category!._id })}
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-2"
          >
            <ChevronLeft className="h-3 w-3" /> {thread.category.name}
          </button>
        )}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{thread.title}</h1>
            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
              {thread.author && (
                <>
                  <Avatar className="h-5 w-5">
                    <AvatarFallback className="text-[10px]">
                      {thread.author.name[0]}
                    </AvatarFallback>
                  </Avatar>
                  <button
                    className="hover:underline"
                    onClick={() => navigate({ page: "user", id: thread.author!._id })}
                  >
                    {thread.author.name}
                  </button>
                  <span>&middot;</span>
                </>
              )}
              <span>{timeAgo(thread.createdAt)}</span>
            </div>
            {thread.tags && thread.tags.length > 0 && (
              <div className="flex gap-1 mt-2">
                {thread.tags.map((tag: { _id: string; name: string }) => (
                  <Badge key={tag._id} variant="secondary">
                    {tag.name}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          {canDelete && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={async () => {
                await deleteThread({ id: threadId });
                if (thread.category) {
                  navigate({ page: "category", id: thread.category._id });
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        {cursors.map((cursor, i) => (
          <PostsPage
            key={cursor ?? "first"}
            threadId={threadId}
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

      {currentUserId && (
        <>
          <Separator />
          <ReplyForm threadId={threadId} />
        </>
      )}
    </div>
  );
}
