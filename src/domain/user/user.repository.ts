import prisma from '@/lib/db';
import { Role, TShirtSize } from '@prisma/client';

interface ProfileData {
  firstName?: string;
  lastName?: string;
  shippingAddress?: string | null;
  shippingCountry?: string | null;
  tShirtSize?: TShirtSize | null;
  exodus90AppId?: string | null;
}

function withDerivedName(data: ProfileData) {
  const result: ProfileData & { name?: string } = { ...data };
  if (data.firstName !== undefined || data.lastName !== undefined) {
    const first = data.firstName ?? '';
    const last = data.lastName ?? '';
    result.name = `${first} ${last}`.trim();
  }
  return result;
}

export async function getUserById(id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      firstName: true,
      lastName: true,
      role: true,
      image: true,
      archivedAt: true,
      shippingAddress: true,
      shippingCountry: true,
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
      firstName: true,
      lastName: true,
      role: true,
      image: true,
      shippingAddress: true,
      shippingCountry: true,
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
    data: withDerivedName(data),
    select: {
      id: true,
      firstName: true,
      lastName: true,
      name: true,
      shippingAddress: true,
      shippingCountry: true,
      tShirtSize: true,
      exodus90AppId: true,
      onboarded: true,
    },
  });
}

export async function completeOnboarding(userId: string, data: ProfileData) {
  return prisma.user.update({
    where: { id: userId },
    data: { ...withDerivedName(data), onboarded: true },
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

export async function archiveUser(userId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { archivedAt: new Date() },
    select: { id: true, archivedAt: true },
  });
}

export async function unarchiveUser(userId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { archivedAt: null },
    select: { id: true, archivedAt: true },
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
