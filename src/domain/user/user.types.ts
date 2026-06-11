import { z } from 'zod';

const tShirtSizeEnum = z.enum(['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL']);

const profileFields = {
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  streetAddress: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  zipCode: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  tShirtSize: tShirtSizeEnum.nullable().optional(),
  exodus90AppId: z.string().nullable().optional(),
};

export const updateUserProfileSchema = z.object({
  firstName: profileFields.firstName.optional(),
  lastName: profileFields.lastName.optional(),
  streetAddress: profileFields.streetAddress,
  city: profileFields.city,
  state: profileFields.state,
  zipCode: profileFields.zipCode,
  country: profileFields.country,
  tShirtSize: profileFields.tShirtSize,
  exodus90AppId: profileFields.exodus90AppId,
});

export const completeOnboardingSchema = z.object({
  firstName: profileFields.firstName,
  lastName: profileFields.lastName,
  streetAddress: profileFields.streetAddress,
  city: profileFields.city,
  state: profileFields.state,
  zipCode: profileFields.zipCode,
  country: profileFields.country,
  tShirtSize: profileFields.tShirtSize,
  exodus90AppId: profileFields.exodus90AppId,
});

export const adminUpdateUserProfileSchema = z.object({
  firstName: profileFields.firstName.optional(),
  lastName: profileFields.lastName.optional(),
  streetAddress: profileFields.streetAddress,
  city: profileFields.city,
  state: profileFields.state,
  zipCode: profileFields.zipCode,
  country: profileFields.country,
  tShirtSize: profileFields.tShirtSize,
  exodus90AppId: profileFields.exodus90AppId,
});

export type UpdateUserProfileInput = z.infer<typeof updateUserProfileSchema>;
export type CompleteOnboardingInput = z.infer<typeof completeOnboardingSchema>;
export type AdminUpdateUserProfileInput = z.infer<typeof adminUpdateUserProfileSchema>;
