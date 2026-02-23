import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useNavigation } from "../lib/navigation";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "./ui/card";
import { MessageSquare, Folder } from "lucide-react";
import { Skeleton } from "./ui/skeleton";

export function HomePage() {
  const categories = useQuery(api.queries.listCategories);
  const { navigate } = useNavigation();

  if (categories === undefined) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Categories</h1>
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (categories.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Folder className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p className="text-lg">No categories yet</p>
        <p className="text-sm">Click "Seed Demo Data" to get started</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Categories</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {categories.map((cat) => (
          <Card
            key={cat._id}
            className="cursor-pointer hover:bg-accent/50 transition-colors"
            onClick={() => navigate({ page: "category", id: cat._id })}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Folder className="h-4 w-4 text-muted-foreground" />
                {cat.name}
              </CardTitle>
              <CardDescription>{cat.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <MessageSquare className="h-3.5 w-3.5" />
                {cat.threadCount} thread{cat.threadCount !== 1 ? "s" : ""}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
