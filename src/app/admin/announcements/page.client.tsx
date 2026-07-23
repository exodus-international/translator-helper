'use client';

import { useState } from 'react';
import { AnnouncementType, type Announcement } from '@prisma/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Edit, EyeOff, Megaphone, MessageSquare, Plus } from 'lucide-react';
import { DeleteConfirmDialog } from '@/components/admin-list-page';
import {
  createAnnouncementAction,
  deleteAnnouncementAction,
  toggleAnnouncementActiveAction,
  updateAnnouncementAction,
} from '@/domain/announcement/announcement.actions';
import { toast } from 'sonner';

type AnnouncementWithCount = Announcement & { _count: { dismissals: number } };

interface AnnouncementsClientProps {
  announcements: AnnouncementWithCount[];
}

function toDatetimeLocalValue(date: Date | null): string {
  if (!date) return '';
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export default function AnnouncementsClient({ announcements: initialAnnouncements }: AnnouncementsClientProps) {
  const [announcements, setAnnouncements] = useState(initialAnnouncements);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [step, setStep] = useState<'type' | 'form'>('type');
  const [editing, setEditing] = useState<AnnouncementWithCount | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState<AnnouncementType>('BANNER');
  const [ctaLabel, setCtaLabel] = useState('');
  const [ctaUrl, setCtaUrl] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [loading, setLoading] = useState(false);

  const resetForm = () => {
    setStep('type');
    setEditing(null);
    setTitle('');
    setBody('');
    setType('BANNER');
    setCtaLabel('');
    setCtaUrl('');
    setExpiresAt('');
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const handleEdit = (announcement: AnnouncementWithCount) => {
    setEditing(announcement);
    setTitle(announcement.title);
    setBody(announcement.body || '');
    setType(announcement.type);
    setCtaLabel(announcement.ctaLabel || '');
    setCtaUrl(announcement.ctaUrl || '');
    setExpiresAt(toDatetimeLocalValue(announcement.expiresAt));
    setStep('form');
    setDialogOpen(true);
  };

  const chooseType = (chosen: AnnouncementType) => {
    setType(chosen);
    setStep('form');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const input = {
      title,
      body: type === 'MODAL' ? body : null,
      type,
      ctaLabel: ctaLabel || null,
      ctaUrl: ctaUrl || null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      // New announcements go live immediately; edits keep the current state.
      isActive: editing?.isActive ?? true,
    };

    try {
      if (editing) {
        const updated = await updateAnnouncementAction(editing.id, input);
        setAnnouncements(
          announcements.map((a) => (a.id === updated.id ? { ...updated, _count: a._count } : a)),
        );
        toast.success('Announcement updated');
      } else {
        const created = await createAnnouncementAction(input);
        setAnnouncements([{ ...created, _count: { dismissals: 0 } }, ...announcements]);
        toast.success('Announcement created and live');
      }

      setDialogOpen(false);
      resetForm();
    } catch (error) {
      console.error('Error saving announcement:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save announcement');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (announcement: AnnouncementWithCount) => {
    try {
      const updated = await toggleAnnouncementActiveAction(announcement.id, !announcement.isActive);
      setAnnouncements(
        announcements.map((a) => (a.id === updated.id ? { ...updated, _count: a._count } : a)),
      );
      toast.success(updated.isActive ? 'Announcement activated' : 'Announcement deactivated');
    } catch (error) {
      console.error('Error toggling announcement:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update announcement');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteAnnouncementAction(id);
      setAnnouncements(announcements.filter((a) => a.id !== id));
      toast.success('Announcement deleted');
    } catch (error) {
      console.error('Error deleting announcement:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete announcement');
    }
  };

  const isExpired = (announcement: AnnouncementWithCount) =>
    announcement.expiresAt !== null && new Date(announcement.expiresAt).getTime() <= Date.now();

  const dialogTitle = editing
    ? `Edit ${type === 'BANNER' ? 'Banner' : 'Modal'}`
    : step === 'type'
      ? 'New Announcement'
      : `New ${type === 'BANNER' ? 'Banner' : 'Modal'}`;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b bg-white">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Announcements</h1>
              <p className="text-gray-600">Notify users about new functionality or ask for their input</p>
            </div>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Add Announcement
            </Button>
          </div>
        </div>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
          </DialogHeader>

          {step === 'type' ? (
            <div className="grid gap-3">
              <button
                type="button"
                onClick={() => chooseType('BANNER')}
                className="flex items-start gap-3 rounded-lg border p-4 text-left transition-colors hover:border-primary hover:bg-primary/5"
              >
                <Megaphone className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <span>
                  <span className="block font-semibold">Banner</span>
                  <span className="block text-sm text-gray-600">
                    One-line bar at the top of the dashboard. Shows just the title — good for short nudges.
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => chooseType('MODAL')}
                className="flex items-start gap-3 rounded-lg border p-4 text-left transition-colors hover:border-primary hover:bg-primary/5"
              >
                <MessageSquare className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <span>
                  <span className="block font-semibold">Modal</span>
                  <span className="block text-sm text-gray-600">
                    Dialog on dashboard load with a full markdown body — for bigger news that needs explanation.
                  </span>
                </span>
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={
                    type === 'BANNER'
                      ? 'e.g., New review workflow is live — check it out!'
                      : 'e.g., New review workflow'
                  }
                  required
                />
                {type === 'BANNER' && (
                  <p className="text-xs text-gray-500 mt-1">Banners show only this one line</p>
                )}
              </div>
              {type === 'MODAL' && (
                <div>
                  <Label htmlFor="body">Body (markdown) *</Label>
                  <Textarea
                    id="body"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder={'We shipped **something new**…'}
                    rows={5}
                    required
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="ctaLabel">CTA Label</Label>
                  <Input
                    id="ctaLabel"
                    value={ctaLabel}
                    onChange={(e) => setCtaLabel(e.target.value)}
                    placeholder="e.g., Fill out survey"
                  />
                </div>
                <div>
                  <Label htmlFor="ctaUrl">CTA URL</Label>
                  <Input
                    id="ctaUrl"
                    value={ctaUrl}
                    onChange={(e) => setCtaUrl(e.target.value)}
                    placeholder="https://forms.google.com/…"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="expiresAt">Expires At</Label>
                <Input
                  id="expiresAt"
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                />
                <p className="text-xs text-gray-500 mt-1">Optional — stops showing automatically after this time</p>
              </div>
              <div className="flex items-center justify-between">
                <Button type="button" variant="ghost" size="sm" onClick={() => setStep('type')}>
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Change type
                </Button>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setDialogOpen(false);
                      resetForm();
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={loading}>
                    {loading ? 'Saving...' : 'Save'}
                  </Button>
                </div>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <div className="container mx-auto px-4 py-4 space-y-6">
        {announcements.length === 0 && (
          <p className="text-sm text-gray-500">No announcements yet. Create one to notify users.</p>
        )}
        {[
          { heading: 'Active', items: announcements.filter((a) => a.isActive) },
          { heading: 'Deactivated', items: announcements.filter((a) => !a.isActive) },
        ].map(
          ({ heading, items }) =>
            items.length > 0 && (
              <section key={heading}>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-2">{heading}</h2>
                <div className="grid gap-4">
                  {items.map((announcement) => (
                    <Card key={announcement.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-lg">{announcement.title}</h3>
                    <Badge variant="outline">
                      {announcement.type === 'BANNER' ? (
                        <Megaphone className="h-3 w-3 mr-1" />
                      ) : (
                        <MessageSquare className="h-3 w-3 mr-1" />
                      )}
                      {announcement.type === 'BANNER' ? 'Banner' : 'Modal'}
                    </Badge>
                    {announcement.isActive && isExpired(announcement) && (
                      <Badge variant="secondary">Expired</Badge>
                    )}
                  </div>
                  {announcement.body && (
                    <p className="text-sm text-gray-600 mt-1 line-clamp-2 whitespace-pre-line">{announcement.body}</p>
                  )}
                  <div className="flex flex-wrap gap-3 text-xs text-gray-500 mt-2">
                    {announcement.ctaLabel && announcement.ctaUrl && <span>CTA: {announcement.ctaLabel}</span>}
                    {announcement.expiresAt && (
                      <span>Expires: {new Date(announcement.expiresAt).toLocaleString()}</span>
                    )}
                    <span>
                      <EyeOff className="inline h-3 w-3 mr-0.5" aria-hidden="true" />
                      {announcement._count.dismissals} dismissed
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleToggleActive(announcement)}>
                    {announcement.isActive ? 'Deactivate' : 'Activate'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleEdit(announcement)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                          <DeleteConfirmDialog
                            title="Delete Announcement"
                            description={`Are you sure you want to delete "${announcement.title}"? This action cannot be undone.`}
                            onConfirm={() => handleDelete(announcement.id)}
                          />
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </section>
            ),
        )}
      </div>
    </div>
  );
}
