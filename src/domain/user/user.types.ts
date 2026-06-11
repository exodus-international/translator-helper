import { z } from 'zod';

const tShirtSizeEnum = z.enum(['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL']);

const profileFields = {
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  shippingAddress: z.string().nullable().optional(),
  shippingCountry: z.string().nullable().optional(),
  tShirtSize: tShirtSizeEnum.nullable().optional(),
  exodus90AppId: z.string().nullable().optional(),
};

export const updateUserProfileSchema = z.object({
  firstName: profileFields.firstName.optional(),
  lastName: profileFields.lastName.optional(),
  shippingAddress: profileFields.shippingAddress,
  shippingCountry: profileFields.shippingCountry,
  tShirtSize: profileFields.tShirtSize,
  exodus90AppId: profileFields.exodus90AppId,
});

export const completeOnboardingSchema = z.object({
  firstName: profileFields.firstName,
  lastName: profileFields.lastName,
  shippingAddress: profileFields.shippingAddress,
  shippingCountry: profileFields.shippingCountry,
  tShirtSize: profileFields.tShirtSize,
  exodus90AppId: profileFields.exodus90AppId,
});

export const adminUpdateUserProfileSchema = z.object({
  firstName: profileFields.firstName.optional(),
  lastName: profileFields.lastName.optional(),
  shippingAddress: profileFields.shippingAddress,
  shippingCountry: profileFields.shippingCountry,
  tShirtSize: profileFields.tShirtSize,
  exodus90AppId: profileFields.exodus90AppId,
});

export type UpdateUserProfileInput = z.infer<typeof updateUserProfileSchema>;
export type CompleteOnboardingInput = z.infer<typeof completeOnboardingSchema>;
export type AdminUpdateUserProfileInput = z.infer<typeof adminUpdateUserProfileSchema>;
