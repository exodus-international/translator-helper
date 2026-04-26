import { PrismaClient, Role } from '@prisma/client';

// Coerce any unrecognized role value to USER before it reaches the DB
function ensureValidRole(args: { data?: { role?: unknown } }) {
  if (args.data?.role && !Object.values(Role).includes(args.data.role as Role)) {
    args.data.role = Role.USER;
  }
}

const prismaClient = new PrismaClient().$extends({
  query: {
    user: {
      async create({ args, query }) {
        ensureValidRole(args);
        return query(args);
      },
      async update({ args, query }) {
        ensureValidRole(args);
        return query(args);
      },
      async updateMany({ args, query }) {
        ensureValidRole(args);
        return query(args);
      },
    },
  },
});

type ExtendedPrismaClient = typeof prismaClient;

declare global {
  var globalPrisma: ExtendedPrismaClient | undefined;
}

const prisma = global.globalPrisma || prismaClient;

if (process.env.NODE_ENV !== 'production') {
  global.globalPrisma = prisma;
}

export default prisma;
