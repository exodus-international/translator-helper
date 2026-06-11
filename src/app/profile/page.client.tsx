'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { updateUserProfileAction } from '@/domain/user/user.actions';
import { authClient } from '@/lib/auth-client';
import type { TShirtSize } from '@prisma/client';
import { useState } from 'react';
import { toast } from 'sonner';

const T_SHIRT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'] as const;
const NONE_VALUE = '__none__';

interface UserProfile {
  id: string;
  email: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
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
}

export default function ProfileClient({ profile }: ProfileClientProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b bg-white">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold">Profile</h1>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 max-w-2xl space-y-6">
        <ProfileInfoSection profile={profile} />
        <ChangePasswordSection />
      </div>
    </div>
  );
}

function ProfileInfoSection({ profile }: { profile: UserProfile }) {
  const [loading, setLoading] = useState(false);
  const [firstName, setFirstName] = useState(profile.firstName ?? profile.name.split(' ')[0] ?? '');
  const [lastName, setLastName] = useState(profile.lastName ?? profile.name.split(' ').slice(1).join(' ') ?? '');
  const [streetAddress, setStreetAddress] = useState(profile.streetAddress ?? '');
  const [city, setCity] = useState(profile.city ?? '');
  const [state, setState] = useState(profile.state ?? '');
  const [zipCode, setZipCode] = useState(profile.zipCode ?? '');
  const [country, setCountry] = useState(profile.country ?? '');
  const [tShirtSize, setTShirtSize] = useState<string>(profile.tShirtSize ?? '');
  const [exodus90AppId, setExodus90AppId] = useState(profile.exodus90AppId ?? '');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!firstName.trim() || !lastName.trim()) {
      toast.error('First and last name are required');
      return;
    }

    setLoading(true);
    try {
      await updateUserProfileAction({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        streetAddress: streetAddress.trim() || null,
        city: city.trim() || null,
        state: state.trim() || null,
        zipCode: zipCode.trim() || null,
        country: country.trim() || null,
        tShirtSize: tShirtSize || null,
        exodus90AppId: exodus90AppId.trim() || null,
      });
      toast.success('Profile updated');
    } catch (error: any) {
      toast.error(error.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile Information</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-4 space-y-2">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span className="font-medium">Email:</span>
            <span>{profile.email}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span className="font-medium">Role:</span>
            <Badge variant={profile.role === 'ADMIN' ? 'primary' : 'secondary'} size="sm">
              {profile.role}
            </Badge>
          </div>
          {profile.languages.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span className="font-medium">Languages:</span>
              <div className="flex flex-wrap gap-1">
                {profile.languages.map((ul) => (
                  <Badge key={ul.language.id} variant="outline" size="sm">
                    {ul.language.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span className="font-medium">Joined:</span>
            <span>{new Date(profile.createdAt).toLocaleDateString()}</span>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="profile-first-name">
                First Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="profile-first-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="profile-last-name">
                Last Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="profile-last-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="profile-street">Street Address</Label>
            <Input
              id="profile-street"
              value={streetAddress}
              onChange={(e) => setStreetAddress(e.target.value)}
              placeholder="Street address"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="profile-city">City</Label>
              <Input
                id="profile-city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="City"
              />
            </div>
            <div>
              <Label htmlFor="profile-state">State / Province</Label>
              <Input
                id="profile-state"
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="State or province"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="profile-zip">Zip / Postal Code</Label>
              <Input
                id="profile-zip"
                value={zipCode}
                onChange={(e) => setZipCode(e.target.value)}
                placeholder="Zip code"
              />
            </div>
            <div>
              <Label htmlFor="profile-country">Country</Label>
              <Input
                id="profile-country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="Country"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="profile-tshirt">T-Shirt Size</Label>
            <Select value={tShirtSize || NONE_VALUE} onValueChange={(v) => setTShirtSize(v === NONE_VALUE ? '' : v)}>
              <SelectTrigger id="profile-tshirt">
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
          </div>

          <div>
            <Label htmlFor="profile-exodus90">Exodus90 App ID</Label>
            <Input
              id="profile-exodus90"
              value={exodus90AppId}
              onChange={(e) => setExodus90AppId(e.target.value)}
              placeholder="Your Exodus90 app ID"
            />
            <p className="text-xs text-gray-500 mt-1">
              You can find this in the My Account section of the Me page in the Exodus90 app.
            </p>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function ChangePasswordSection() {
  const [loading, setLoading] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [revokeOtherSessions, setRevokeOtherSessions] = useState(false);

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

      toast.success('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setRevokeOtherSessions(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change Password</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <Label htmlFor="current-password">Current Password</Label>
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>

          <div>
            <Label htmlFor="new-password">New Password</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>

          <div>
            <Label htmlFor="confirm-password">Confirm New Password</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={revokeOtherSessions}
              onChange={(e) => setRevokeOtherSessions(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            Sign out all other sessions
          </label>

          <div className="flex justify-end">
            <Button type="submit" disabled={loading}>
              {loading ? 'Changing...' : 'Change Password'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
