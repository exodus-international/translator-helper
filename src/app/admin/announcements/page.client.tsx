'use client';

import { useState } from 'react';
import { AnnouncementType, type Announcement } from '@prisma/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Edit, EyeOff, Megaphone, MessageSquare } from 'lucide-react';
import { AdminListPage, DeleteConfirmDialog } from '@/components/admin-list-page';
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
  const [editing, setEditing] = useState<AnnouncementWithCount | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState<AnnouncementType>('BANNER');
  const [ctaLabel, setCtaLabel] = useState('');
  const [ctaUrl, setCtaUrl] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [loading, setLoading] = useState(false);

  const resetForm = () => {
    setEditing(null);
    setTitle('');
    setBody('');
    setType('BANNER');
    setCtaLabel('');
    setCtaUrl('');
    setExpiresAt('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const input = {
      title,
      body,
      type,
      ctaLabel: ctaLabel || null,
      ctaUrl: ctaUrl || null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      isActive: editing?.isActive ?? false,
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
        toast.success('Announcement created (inactive — activate it to publish)');
      }

      setDialogOpen(false);
      resetForm();
    } catch (error: any) {
      console.error('Error saving announcement:', error);
      toast.error(error.message || 'Failed to save announcement');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (announcement: AnnouncementWithCount) => {
    setEditing(announcement);
    setTitle(announcement.title);
    setBody(announcement.body);
    setType(announcement.type);
    setCtaLabel(announcement.ctaLabel || '');
    setCtaUrl(announcement.ctaUrl || '');
    setExpiresAt(toDatetimeLocalValue(announcement.expiresAt));
    setDialogOpen(true);
  };

  const handleToggleActive = async (announcement: AnnouncementWithCount) => {
    try {
      const updated = await toggleAnnouncementActiveAction(announcement.id, !announcement.isActive);
      setAnnouncements(
        announcements.map((a) => (a.id === updated.id ? { ...updated, _count: a._count } : a)),
      );
      toast.success(updated.isActive ? 'Announcement activated' : 'Announcement deactivated');
    } catch (error: any) {
      console.error('Error toggling announcement:', error);
      toast.error(error.message || 'Failed to update announcement');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteAnnouncementAction(id);
      setAnnouncements(announcements.filter((a) => a.id !== id));
      toast.success('Announcement deleted');
    } catch (error: any) {
      console.error('Error deleting announcement:', error);
      toast.error(error.message || 'Failed to delete announcement');
    }
  };

  const isExpired = (announcement: AnnouncementWithCount) =>
    announcement.expiresAt !== null && new Date(announcement.expiresAt).getTime() <= Date.now();

  return (
    <AdminListPage
      title="Announcements"
      description="Notify users about new functionality or ask for their input"
      addLabel="Add Announcement"
      dialogOpen={dialogOpen}
      onDialogOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) resetForm();
      }}
      dialogTitle={editing ? 'Edit Announcement' : 'Add Announcement'}
      onSubmit={handleSubmit}
      loading={loading}
      formFields={
        <>
          <div>
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., New review workflow is live"
              required
            />
          </div>
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
          <div>
            <Label htmlFor="type">Display as *</Label>
            <Select value={type} onValueChange={(value) => setType(value as AnnouncementType)}>
              <SelectTrigger id="type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BANNER">Banner (top of dashboard)</SelectItem>
                <SelectItem value="MODAL">Modal (dialog on dashboard load)</SelectItem>
              </SelectContent>
            </Select>
          </div>
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
        </>
      }
    >
      {announcements.length === 0 && (
        <p className="text-sm text-gray-500">No announcements yet. Create one to notify users.</p>
      )}
      {announcements.map((announcement) => (
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
                {announcement.isActive && !isExpired(announcement) && <Badge>Active</Badge>}
                {announcement.isActive && isExpired(announcement) && <Badge variant="secondary">Expired</Badge>}
                {!announcement.isActive && <Badge variant="secondary">Inactive</Badge>}
              </div>
              <p className="text-sm text-gray-600 mt-1 line-clamp-2 whitespace-pre-line">{announcement.body}</p>
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
    </AdminListPage>
  );
}
