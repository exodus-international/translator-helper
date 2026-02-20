'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { setUserLanguagesAction } from '@/domain/user-language/user-language.actions';
import { Language } from '@prisma/client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface OnboardingLanguagesClientProps {
  languages: Language[];
}

export default function OnboardingLanguagesClient({ languages }: OnboardingLanguagesClientProps) {
  const router = useRouter();
  const [selectedLanguageIds, setSelectedLanguageIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleLanguage = (languageId: string) => {
    setSelectedLanguageIds((prev) =>
      prev.includes(languageId) ? prev.filter((id) => id !== languageId) : [...prev, languageId],
    );
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (selectedLanguageIds.length === 0) {
      setError('Please select at least one language');
      return;
    }

    setLoading(true);
    try {
      await setUserLanguagesAction({ languageIds: selectedLanguageIds });
      router.push('/dashboard');
    } catch (error: any) {
      console.error('Error setting languages:', error);
      setError(error.message || 'Failed to save language preferences');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl p-4">
        <div className="mb-4">
          <h1 className="text-2xl font-bold mb-2">Welcome! Select Your Languages</h1>
          <p className="text-gray-600">
            Please select the languages you work with. This helps us filter and show you relevant people and tasks in
            the kanban board.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <Label className="text-base font-medium mb-3 block">
              Select Languages <span className="text-red-500">*</span>
            </Label>
            <div className="space-y-2 border rounded-md p-4 max-h-96 overflow-y-auto">
              {languages.length === 0 ? (
                <p className="text-gray-500 text-sm">No languages available</p>
              ) : (
                languages.map((language) => {
                  const isSelected = selectedLanguageIds.includes(language.id);
                  return (
                    <label
                      key={language.id}
                      className="flex items-center space-x-3 cursor-pointer hover:bg-gray-50 p-2 rounded-md transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleLanguage(language.id)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium">{language.name}</span>
                      <span className="text-xs text-gray-500">({language.code})</span>
                    </label>
                  );
                })
              )}
            </div>
            {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
            <p className="text-xs text-gray-500 mt-2">
              You can select multiple languages. You can update these preferences later in settings.
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="submit" disabled={loading || selectedLanguageIds.length === 0}>
              {loading ? 'Saving...' : 'Continue to Dashboard'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
