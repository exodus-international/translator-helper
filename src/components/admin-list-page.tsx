'use client';

import { ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
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
} from '@/components/ui/alert-dialog';

interface AdminListPageProps {
  title: string;
  description: string;
  addLabel: string;
  dialogOpen: boolean;
  onDialogOpenChange: (open: boolean) => void;
  dialogTitle: string;
  onSubmit: (e: React.FormEvent) => void | Promise<void>;
  loading: boolean;
  formFields: ReactNode;
  children: ReactNode;
}

export function AdminListPage({
  title,
  description,
  addLabel,
  dialogOpen,
  onDialogOpenChange,
  dialogTitle,
  onSubmit,
  loading,
  formFields,
  children,
}: AdminListPageProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b bg-white">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">{title}</h1>
              <p className="text-gray-600">{description}</p>
            </div>
            <Dialog open={dialogOpen} onOpenChange={onDialogOpenChange}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  {addLabel}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{dialogTitle}</DialogTitle>
                </DialogHeader>
                <form onSubmit={onSubmit} className="space-y-4">
                  {formFields}
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => onDialogOpenChange(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={loading}>
                      {loading ? 'Saving...' : 'Save'}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-4">
        <div className="grid gap-4">{children}</div>
      </div>
    </div>
  );
}

interface DeleteConfirmDialogProps {
  title: string;
  description: ReactNode;
  onConfirm: () => void | Promise<void>;
}

export function DeleteConfirmDialog({ title, description, onConfirm }: DeleteConfirmDialogProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
