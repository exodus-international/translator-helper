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

export async function userExistsById(id: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true },
  });
  return user !== null;
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

/** Sets or clears the profile picture URL. Kept apart from the profile form so a
 * failed upload can never blank out the rest of someone's profile. */
export async function updateUserImage(userId: string, image: string | null) {
  return prisma.user.update({
    where: { id: userId },
    data: { image },
    select: { id: true, image: true },
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
  const [users, lastSessions, lastDocumentEdits] = await Promise.all([
    prisma.user.findMany({
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
    }),
    // Sessions are refreshed while a user is active, so max(updatedAt) is the
    // closest thing to "last seen". Logout deletes the session row, so this
    // can under-report users who explicitly sign out.
    prisma.session.groupBy({
      by: ['userId'],
      _max: { updatedAt: true },
    }),
    prisma.activityLog.groupBy({
      by: ['userId'],
      where: { action: 'edited' },
      _max: { createdAt: true },
    }),
  ]);

  const lastSeenByUser = new Map(lastSessions.map((s) => [s.userId, s._max.updatedAt]));
  const lastEditByUser = new Map(lastDocumentEdits.map((a) => [a.userId, a._max.createdAt]));

  return users.map((user) => ({
    ...user,
    lastSeenAt: lastSeenByUser.get(user.id) ?? null,
    lastDocumentEditAt: lastEditByUser.get(user.id) ?? null,
  }));
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
