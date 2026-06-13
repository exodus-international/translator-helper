import prisma from '@/lib/db';
import { Role, TShirtSize } from '@prisma/client';

interface ProfileData {
  name?: string;
  streetAddress?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  country?: string | null;
  tShirtSize?: TShirtSize | null;
  exodus90AppId?: string | null;
}

export async function getUserById(id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      image: true,
      streetAddress: true,
      city: true,
      state: true,
      zipCode: true,
      country: true,
      tShirtSize: true,
      exodus90AppId: true,
      onboarded: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function getUserProfile(id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      image: true,
      streetAddress: true,
      city: true,
      state: true,
      zipCode: true,
      country: true,
      tShirtSize: true,
      exodus90AppId: true,
      onboarded: true,
      createdAt: true,
      languages: {
        include: { language: true },
        orderBy: { language: { name: 'asc' } },
      },
    },
  });
}

export async function updateUserProfile(userId: string, data: ProfileData) {
  return prisma.user.update({
    where: { id: userId },
    data,
    select: {
      id: true,
      name: true,
      streetAddress: true,
      city: true,
      state: true,
      zipCode: true,
      country: true,
      tShirtSize: true,
      exodus90AppId: true,
      onboarded: true,
    },
  });
}

export async function completeOnboarding(userId: string, data: ProfileData) {
  return prisma.user.update({
    where: { id: userId },
    data: { ...data, onboarded: true },
    select: { id: true, onboarded: true },
  });
}

export async function isUserOnboarded(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { onboarded: true },
  });
  return user?.onboarded ?? false;
}

export async function listUsers() {
  return prisma.user.findMany({
    include: {
      languages: {
        include: {
          language: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
}

export async function updateUserRole(userId: string, role: Role) {
  return prisma.user.update({
    where: { id: userId },
    data: { role },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
    },
  });
}
