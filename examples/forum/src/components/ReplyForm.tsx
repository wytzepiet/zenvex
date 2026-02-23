import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useCurrentUser } from "../lib/user";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import { Send } from "lucide-react";
import { useState } from "react";

export function ReplyForm({
  threadId,
  parentId,
  onDone,
}: {
  threadId: Id<"threads">;
  parentId?: Id<"posts">;
  onDone?: () => void;
}) {
  const { currentUserId } = useCurrentUser();
  const createPost = useMutation(api.mutations.createPost);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!currentUserId) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setSubmitting(true);
    await createPost({
      body: body.trim(),
      threadId,
      authorId: currentUserId,
      parentId,
    });
    setBody("");
    setSubmitting(false);
    onDone?.();
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={parentId ? "Write a reply..." : "Add a comment..."}
        className="min-h-[60px] resize-none"
        rows={2}
      />
      <Button type="submit" size="sm" disabled={!body.trim() || submitting} className="self-end">
        <Send className="h-4 w-4" />
      </Button>
    </form>
  );
}
