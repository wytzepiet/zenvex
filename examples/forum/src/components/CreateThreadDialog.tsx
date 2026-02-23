import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useCurrentUser } from "../lib/user";
import { useNavigation } from "../lib/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import { useState } from "react";

export function CreateThreadDialog({
  open,
  onOpenChange,
  categoryId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryId: Id<"categories">;
}) {
  const { currentUserId } = useCurrentUser();
  const { navigate } = useNavigation();
  const createThread = useMutation(api.mutations.createThread);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!currentUserId) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setSubmitting(true);
    const threadId = await createThread({
      title: title.trim(),
      categoryId,
      authorId: currentUserId,
      body: body.trim(),
    });
    setTitle("");
    setBody("");
    setSubmitting(false);
    onOpenChange(false);
    navigate({ page: "thread", id: threadId as Id<"threads"> });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Thread</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            placeholder="Thread title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Textarea
            placeholder="What's on your mind?"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
          />
          <div className="flex justify-end">
            <Button type="submit" disabled={!title.trim() || !body.trim() || submitting}>
              Create Thread
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
