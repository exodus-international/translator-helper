import { PrismaClient, Role } from '@prisma/client';

const prismaClient = new PrismaClient().$extends({
  query: {
    user: {
      async create({ args, query }) {
        // Ensure role is a valid Role enum value
        if (args.data?.role && !Object.values(Role).includes(args.data.role as Role)) {
          args.data.role = Role.USER;
        }
        return query(args);
      },
      async update({ args, query }) {
        // Ensure role is a valid Role enum value on updates too
        if (args.data?.role && !Object.values(Role).includes(args.data.role as Role)) {
          args.data.role = Role.USER;
        }
        return query(args);
      },
      async updateMany({ args, query }) {
        // Ensure role is a valid Role enum value on updateMany too
        if (args.data?.role && !Object.values(Role).includes(args.data.role as Role)) {
          args.data.role = Role.USER;
        }
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
