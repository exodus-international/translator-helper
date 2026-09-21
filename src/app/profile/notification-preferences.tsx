'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field';
import { NOTIFICATION_CATALOG } from '@/domain/notification/notification.catalog';
import { setEmailPreferenceAction } from '@/domain/notification/notification.actions';
import type { NotificationType } from '@/generated/prisma/enums';
import { capture } from '@/lib/analytics';
import { useState } from 'react';
import { toast } from 'sonner';

interface NotificationPreferencesProps {
  emailConfigured: boolean;
  preferences: { type: NotificationType; email: boolean }[];
}

/**
 * Which notifications also arrive by email. Everything always shows in the
 * app, so this is the only choice there is to make. Each box saves on its own.
 */
export function NotificationPreferences({ emailConfigured, preferences }: NotificationPreferencesProps) {
  const [emailByType, setEmailByType] = useState(() => new Map(preferences.map((p) => [p.type, p.email])));

  const toggle = async (type: NotificationType, email: boolean) => {
    setEmailByType((current) => new Map(current).set(type, email));
    try {
      await setEmailPreferenceAction(type, email);
      capture('notification_preference_changed', { type, email });
    } catch {
      setEmailByType((current) => new Map(current).set(type, !email));
      toast.error('Could not save that preference');
    }
  };

  return (
    <Card id="notifications" className="scroll-mt-16">
      <CardHeader>
        <CardTitle>Email notifications</CardTitle>
        <CardDescription>
          Everything shows under the bell in the app straight away. Choose what also comes by email: one summary a day,
          at noon Central European Time.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!emailConfigured && (
          <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
            Email is not set up on this server yet, so for now notifications only appear in the app.
          </p>
        )}
        {preferences.map(({ type }) => {
          const info = NOTIFICATION_CATALOG[type];
          const id = `notify-email-${type}`;
          return (
            <Field key={type} orientation="horizontal">
              <Checkbox
                id={id}
                checked={emailByType.get(type) ?? false}
                onCheckedChange={(checked) => toggle(type, checked === true)}
              />
              <FieldContent>
                <FieldLabel htmlFor={id}>{info.label}</FieldLabel>
                <FieldDescription>{info.description}</FieldDescription>
              </FieldContent>
            </Field>
          );
        })}
      </CardContent>
    </Card>
  );
}
