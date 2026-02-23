import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "./ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./ui/alert-dialog";
import { Database, RefreshCw } from "lucide-react";

export function SeedButton() {
  const users = useQuery(api.queries.listUsers);
  const seed = useMutation(api.mutations.seedData);
  const clear = useMutation(api.mutations.clearData);

  const hasData = users !== undefined && users.length > 0;

  const handleSeed = async () => {
    if (hasData) {
      await clear();
    }
    await seed();
  };

  if (!hasData) {
    return (
      <Button variant="outline" size="sm" onClick={handleSeed} className="gap-2">
        <Database className="h-4 w-4" />
        Seed Demo Data
      </Button>
    );
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Reset Data
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reset all data?</AlertDialogTitle>
          <AlertDialogDescription>
            This will delete all existing data and re-seed with fresh demo data. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleSeed}>Reset</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
