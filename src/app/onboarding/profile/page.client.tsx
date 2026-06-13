'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { completeOnboardingAction } from '@/domain/user/user.actions';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

const T_SHIRT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'] as const;

interface OnboardingProfileClientProps {
  userName: string;
}

export default function OnboardingProfileClient({ userName }: OnboardingProfileClientProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(userName);
  const [streetAddress, setStreetAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [country, setCountry] = useState('');
  const [tShirtSize, setTShirtSize] = useState<string>('');
  const [exodus90AppId, setExodus90AppId] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error('Full name is required');
      return;
    }

    setLoading(true);
    try {
      await completeOnboardingAction({
        name: name.trim(),
        streetAddress: streetAddress.trim() || null,
        city: city.trim() || null,
        state: state.trim() || null,
        zipCode: zipCode.trim() || null,
        country: country.trim() || null,
        tShirtSize: tShirtSize || null,
        exodus90AppId: exodus90AppId.trim() || null,
      });
      router.push('/dashboard');
    } catch (error: any) {
      toast.error(error.message || 'Failed to save profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-2">Complete Your Profile</h1>
          <p className="text-gray-600">
            Please fill in your details to get started. You can update these later from your profile page.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="onboarding-name">
              Full Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="onboarding-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Full name"
            />
          </div>

          <div>
            <Label htmlFor="onboarding-street">Street Address</Label>
            <Input
              id="onboarding-street"
              value={streetAddress}
              onChange={(e) => setStreetAddress(e.target.value)}
              placeholder="Street address"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="onboarding-city">City</Label>
              <Input
                id="onboarding-city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="City"
              />
            </div>
            <div>
              <Label htmlFor="onboarding-state">State / Province</Label>
              <Input
                id="onboarding-state"
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="State or province"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="onboarding-zip">Zip / Postal Code</Label>
              <Input
                id="onboarding-zip"
                value={zipCode}
                onChange={(e) => setZipCode(e.target.value)}
                placeholder="Zip code"
              />
            </div>
            <div>
              <Label htmlFor="onboarding-country">Country</Label>
              <Input
                id="onboarding-country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="Country"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="onboarding-tshirt">T-Shirt Size</Label>
            <Select value={tShirtSize} onValueChange={setTShirtSize}>
              <SelectTrigger id="onboarding-tshirt">
                <SelectValue placeholder="Select size" />
              </SelectTrigger>
              <SelectContent>
                {T_SHIRT_SIZES.map((size) => (
                  <SelectItem key={size} value={size}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="onboarding-exodus90">Exodus90 App ID</Label>
            <Input
              id="onboarding-exodus90"
              value={exodus90AppId}
              onChange={(e) => setExodus90AppId(e.target.value)}
              placeholder="Your Exodus90 app ID"
            />
            <p className="text-xs text-gray-500 mt-1">
              You can find this in the My Account section of the Me page in the Exodus90 app.
            </p>
          </div>

          <div className="pt-2">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Saving...' : 'Continue to Dashboard'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
