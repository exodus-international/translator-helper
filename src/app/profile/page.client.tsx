'use client';

import { AvatarUploader } from '@/components/avatar-uploader';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { updateUserProfileAction } from '@/domain/user/user.actions';
import { capture } from '@/lib/analytics';
import { authClient } from '@/lib/auth-client';
import { formatUnambiguousDate } from '@/lib/format';
import { TShirtSize } from '@/generated/prisma/enums';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

const T_SHIRT_SIZES = Object.values(TShirtSize);
const NONE_VALUE = '__none__';

interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: string;
  image: string | null;
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  country: string | null;
  tShirtSize: TShirtSize | null;
  exodus90AppId: string | null;
  onboarded: boolean;
  createdAt: Date;
  languages: Array<{
    language: { id: string; name: string; code: string };
  }>;
}

interface ProfileClientProps {
  profile: UserProfile;
  avatarUploadEnabled: boolean;
}

export default function ProfileClient({ profile, avatarUploadEnabled }: ProfileClientProps) {
  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Profile" description="Your picture, contact details and password." />

      <div className="container mx-auto max-w-3xl space-y-6 px-4 py-6">
        <IdentityCard profile={profile} avatarUploadEnabled={avatarUploadEnabled} />
        <ProfileDetailsForm profile={profile} />
        <ChangePasswordSection />
      </div>
    </div>
  );
}

/** Who you are: picture, and the things only an administrator can change. */
function IdentityCard({ profile, avatarUploadEnabled }: ProfileClientProps) {
  return (
    <Card>
      <CardContent className="space-y-5 py-3">
        <AvatarUploader name={profile.name} image={profile.image} email={profile.email} enabled={avatarUploadEnabled} />

        <Separator />

        <dl className="grid gap-4 sm:grid-cols-2">
          <Detail label="Email">
            <span className="break-all">{profile.email}</span>
          </Detail>
          <Detail label="Role">
            <Badge variant={profile.role === 'ADMIN' ? 'primary' : 'secondary'} size="sm">
              {profile.role}
            </Badge>
          </Detail>
          <Detail label="Languages">
            {profile.languages.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {profile.languages.map((ul) => (
                  <Badge key={ul.language.id} variant="outline" size="sm">
                    {ul.language.name}
                  </Badge>
                ))}
              </div>
            ) : (
              <span className="text-muted-foreground">None assigned</span>
            )}
          </Detail>
          <Detail label="Joined">{formatUnambiguousDate(profile.createdAt)}</Detail>
        </dl>

        <p className="text-xs text-muted-foreground">
          Email, role and languages are managed by an administrator. Ask one to change them.
        </p>
      </CardContent>
    </Card>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="flex items-center gap-2 text-sm">{children}</dd>
    </div>
  );
}

/**
 * Name, sizing and address in one form. The address is only ever used for
 * shipping, which the section says out loud so nobody wonders why it is asked
 * for.
 */
function ProfileDetailsForm({ profile }: { profile: UserProfile }) {
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState({
    name: profile.name,
    streetAddress: profile.streetAddress ?? '',
    city: profile.city ?? '',
    state: profile.state ?? '',
    zipCode: profile.zipCode ?? '',
    country: profile.country ?? '',
    tShirtSize: (profile.tShirtSize ?? '') as string,
    exodus90AppId: profile.exodus90AppId ?? '',
  });
  const [form, setForm] = useState(saved);

  const set = (field: keyof typeof form) => (value: string) => setForm((prev) => ({ ...prev, [field]: value }));
  const dirty = useMemo(
    () => (Object.keys(form) as Array<keyof typeof form>).some((key) => form[key] !== saved[key]),
    [form, saved],
  );

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.name.trim()) {
      toast.error('Full name is required');
      return;
    }

    setLoading(true);
    try {
      await updateUserProfileAction({
        name: form.name.trim(),
        streetAddress: form.streetAddress.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        zipCode: form.zipCode.trim() || null,
        country: form.country.trim() || null,
        tShirtSize: form.tShirtSize || null,
        exodus90AppId: form.exodus90AppId.trim() || null,
      });
      capture('profile_updated');
      setSaved(form);
      toast.success('Profile updated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Personal details</CardTitle>
          <CardDescription>How you appear to the rest of the team.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="gap-5">
            <Field>
              <FieldLabel htmlFor="profile-name">
                Full name <span className="text-destructive">*</span>
              </FieldLabel>
              <Input
                id="profile-name"
                value={form.name}
                onChange={(e) => set('name')(e.target.value)}
                autoComplete="name"
                required
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="profile-exodus90">Exodus 90 app ID</FieldLabel>
              <Input
                id="profile-exodus90"
                value={form.exodus90AppId}
                onChange={(e) => set('exodus90AppId')(e.target.value)}
                placeholder="Your Exodus 90 app ID"
              />
              <FieldDescription>Find it under My Account on the Me page in the Exodus 90 app.</FieldDescription>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Shipping</CardTitle>
          <CardDescription>Where to send anything we mail you, and what size to send.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="gap-5">
            <Field>
              <FieldLabel htmlFor="profile-street">Street address</FieldLabel>
              <Input
                id="profile-street"
                value={form.streetAddress}
                onChange={(e) => set('streetAddress')(e.target.value)}
                placeholder="Street and number"
                autoComplete="street-address"
              />
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="profile-city">City</FieldLabel>
                <Input
                  id="profile-city"
                  value={form.city}
                  onChange={(e) => set('city')(e.target.value)}
                  placeholder="City"
                  autoComplete="address-level2"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="profile-state">State / province</FieldLabel>
                <Input
                  id="profile-state"
                  value={form.state}
                  onChange={(e) => set('state')(e.target.value)}
                  placeholder="State or province"
                  autoComplete="address-level1"
                />
              </Field>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="profile-zip">Zip / postal code</FieldLabel>
                <Input
                  id="profile-zip"
                  value={form.zipCode}
                  onChange={(e) => set('zipCode')(e.target.value)}
                  placeholder="Postal code"
                  autoComplete="postal-code"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="profile-country">Country</FieldLabel>
                <Input
                  id="profile-country"
                  value={form.country}
                  onChange={(e) => set('country')(e.target.value)}
                  placeholder="Country"
                  autoComplete="country-name"
                />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="profile-tshirt">T-shirt size</FieldLabel>
              <Select
                value={form.tShirtSize || NONE_VALUE}
                onValueChange={(v) => set('tShirtSize')(v === NONE_VALUE ? '' : v)}
              >
                <SelectTrigger id="profile-tshirt" className="w-full sm:w-48">
                  <SelectValue placeholder="Select size" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>Not set</SelectItem>
                  {T_SHIRT_SIZES.map((size) => (
                    <SelectItem key={size} value={size}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        {dirty && <span className="text-sm text-muted-foreground">You have unsaved changes</span>}
        <Button type="submit" disabled={loading || !dirty}>
          {loading ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}

function ChangePasswordSection() {
  const [loading, setLoading] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [revokeOtherSessions, setRevokeOtherSessions] = useState(false);

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const result = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions,
      });

      if (result.error) {
        toast.error(result.error.message || 'Failed to change password');
        return;
      }

      capture('password_changed', { revoked_other_sessions: revokeOtherSessions });
      toast.success('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setRevokeOtherSessions(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>At least 8 characters. You will stay signed in on this device.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleChangePassword} className="space-y-6">
          <FieldGroup className="gap-5">
            <Field>
              <FieldLabel htmlFor="current-password">Current password</FieldLabel>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="new-password">New password</FieldLabel>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={8}
                />
              </Field>
              <Field data-invalid={mismatch || undefined}>
                <FieldLabel htmlFor="confirm-password">Confirm new password</FieldLabel>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  aria-invalid={mismatch || undefined}
                  required
                  minLength={8}
                />
                {mismatch && <FieldDescription className="text-destructive">Passwords do not match</FieldDescription>}
              </Field>
            </div>

            <Field orientation="horizontal">
              <Checkbox
                id="revoke-sessions"
                checked={revokeOtherSessions}
                onCheckedChange={(checked) => setRevokeOtherSessions(checked === true)}
              />
              <FieldLabel htmlFor="revoke-sessions" className="font-normal">
                Sign out of all other devices
              </FieldLabel>
            </Field>
          </FieldGroup>

          <div className="flex justify-end">
            <Button type="submit" disabled={loading}>
              {loading ? 'Changing…' : 'Change password'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
