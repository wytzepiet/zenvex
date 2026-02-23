import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useNavigation } from "../lib/navigation";
import { useCurrentUser } from "../lib/user";
import { timeAgo } from "../lib/time";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Badge } from "./ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

import { Skeleton } from "./ui/skeleton";
import { ChevronLeft, MessageSquare, Users, UserPlus, UserMinus } from "lucide-react";

export function UserPage({ userId }: { userId: Id<"users"> }) {
  const user = useQuery(api.queries.getUser, { id: userId });
  const userThreads = useQuery(api.queries.getUserThreads, { userId });
  const { currentUserId } = useCurrentUser();
  const isFollowing = useQuery(
    api.queries.isFollowing,
    currentUserId && currentUserId !== userId
      ? { followerId: currentUserId, followeeId: userId }
      : "skip",
  );
  const toggleFollow = useMutation(api.mutations.toggleFollow);
  const { navigate, goHome } = useNavigation();

  if (user === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!user) {
    return <p className="text-muted-foreground">User not found</p>;
  }

  return (
    <div className="space-y-4">
      <button
        onClick={goHome}
        className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
      >
        <ChevronLeft className="h-3 w-3" /> Back
      </button>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarFallback className="text-2xl">{user.name[0]}</AvatarFallback>
              </Avatar>
              <div>
                <h1 className="text-xl font-bold">{user.name}</h1>
                <p className="text-sm text-muted-foreground">{user.email}</p>
              </div>
            </div>
            {currentUserId && currentUserId !== userId && (
              <Button
                variant={isFollowing ? "outline" : "default"}
                size="sm"
                className="gap-1"
                onClick={() =>
                  toggleFollow({ followerId: currentUserId, followeeId: userId })
                }
              >
                {isFollowing ? (
                  <>
                    <UserMinus className="h-4 w-4" /> Unfollow
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4" /> Follow
                  </>
                )}
              </Button>
            )}
          </div>
          <div className="flex gap-6 mt-4 text-sm">
            <div className="flex items-center gap-1">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{user.threadCount}</span>
              <span className="text-muted-foreground">threads</span>
            </div>
            <div className="flex items-center gap-1">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{user.postCount}</span>
              <span className="text-muted-foreground">posts</span>
            </div>
            <div className="flex items-center gap-1">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{user.followerCount}</span>
              <span className="text-muted-foreground">followers</span>
            </div>
            <div className="flex items-center gap-1">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{user.followingCount}</span>
              <span className="text-muted-foreground">following</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="threads">
        <TabsList>
          <TabsTrigger value="threads">Threads</TabsTrigger>
        </TabsList>
        <TabsContent value="threads" className="mt-4">
          {userThreads === undefined ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : userThreads.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No threads yet</p>
          ) : (
            <div className="space-y-2">
              {userThreads.map((thread) => (
                <button
                  key={thread._id}
                  onClick={() => navigate({ page: "thread", id: thread._id })}
                  className="w-full text-left p-3 rounded-lg border hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium">{thread.title}</h3>
                      <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                        {thread.category && (
                          <Badge variant="outline" className="text-xs">
                            {thread.category.name}
                          </Badge>
                        )}
                        <span>{timeAgo(thread.createdAt)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <MessageSquare className="h-3.5 w-3.5" />
                      {thread.postCount}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
