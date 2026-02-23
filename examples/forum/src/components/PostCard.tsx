import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useNavigation } from "../lib/navigation";
import { useCurrentUser } from "../lib/user";
import { timeAgo } from "../lib/time";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Button } from "./ui/button";
import { ReplyForm } from "./ReplyForm";
import { Trash2, Reply } from "lucide-react";
import { useState } from "react";

type PostData = {
  _id: Id<"posts">;
  _creationTime: number;
  body: string;
  authorId: Id<"users">;
  parentId?: Id<"posts"> | null;
  author?: { _id: Id<"users">; name: string; email: string; _creationTime: number } | null;
};

export function PostCard({
  post,
  threadId,
  isReply = false,
}: {
  post: PostData;
  threadId: Id<"threads">;
  isReply?: boolean;
}) {
  const { navigate } = useNavigation();
  const { currentUserId } = useCurrentUser();
  const deletePost = useMutation(api.mutations.deletePost);
  const [showReply, setShowReply] = useState(false);

  const canDelete = currentUserId === post.authorId;

  return (
    <div className={`rounded-lg border p-4 ${isReply ? "bg-muted/30" : "bg-card"}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 text-sm">
          <Avatar className="h-6 w-6">
            <AvatarFallback className="text-[10px]">
              {post.author?.name[0] ?? "?"}
            </AvatarFallback>
          </Avatar>
          {post.author ? (
            <button
              className="font-medium hover:underline"
              onClick={() => navigate({ page: "user", id: post.author!._id })}
            >
              {post.author.name}
            </button>
          ) : (
            <span className="text-muted-foreground">Unknown</span>
          )}
          <span className="text-muted-foreground">&middot;</span>
          <span className="text-muted-foreground">{timeAgo(post._creationTime)}</span>
        </div>
        <div className="flex items-center gap-1">
          {currentUserId && !isReply && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-muted-foreground"
              onClick={() => setShowReply(!showReply)}
            >
              <Reply className="h-3.5 w-3.5" />
            </Button>
          )}
          {canDelete && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-destructive"
              onClick={() => deletePost({ id: post._id })}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
      <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap">{post.body}</p>
      {showReply && (
        <div className="mt-3">
          <ReplyForm threadId={threadId} parentId={post._id} onDone={() => setShowReply(false)} />
        </div>
      )}
    </div>
  );
}
