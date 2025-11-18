import prisma from "@/lib/db";

export async function listDocumentAssignments(filters?: {
  translationProjectId?: string;
  userId?: string;
  documentId?: string;
}) {
  return prisma.documentAssignment.findMany({
    where: {
      ...(filters?.translationProjectId && {
        translationProjectId: filters.translationProjectId,
      }),
      ...(filters?.userId && { userId: filters.userId }),
      ...(filters?.documentId && { documentId: filters.documentId }),
    },
    include: {
      document: {
        include: {
          sourceProject: true,
          versions: {
            include: {
              language: true,
            },
          },
        },
      },
      translationProject: {
        include: {
          sourceProject: true,
          language: true,
        },
      },
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      assignedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: {
      assignedAt: "desc",
    },
  });
}

export async function getDocumentAssignmentById(id: string) {
  return prisma.documentAssignment.findUnique({
    where: { id },
    include: {
      document: {
        include: {
          sourceProject: true,
          versions: {
            include: {
              language: true,
            },
          },
        },
      },
      translationProject: {
        include: {
          sourceProject: true,
          language: true,
        },
      },
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      assignedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });
}

export async function getDocumentAssignmentByDocumentAndProject(
  documentId: string,
  translationProjectId: string
) {
  return prisma.documentAssignment.findUnique({
    where: {
      documentId_translationProjectId: {
        documentId,
        translationProjectId,
      },
    },
    include: {
      document: {
        include: {
          sourceProject: true,
        },
      },
      translationProject: {
        include: {
          sourceProject: true,
          language: true,
        },
      },
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      assignedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });
}

export async function createDocumentAssignment(data: {
  documentId: string;
  translationProjectId: string;
  userId: string | null;
  deadline: Date | null;
  assignedById: string;
}) {
  return prisma.documentAssignment.create({
    data,
    include: {
      document: {
        include: {
          sourceProject: true,
        },
      },
      translationProject: {
        include: {
          sourceProject: true,
          language: true,
        },
      },
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      assignedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });
}

export async function updateDocumentAssignment(
  id: string,
  data: {
    userId?: string | null;
    deadline?: Date | null;
  }
) {
  return prisma.documentAssignment.update({
    where: { id },
    data,
    include: {
      document: {
        include: {
          sourceProject: true,
        },
      },
      translationProject: {
        include: {
          sourceProject: true,
          language: true,
        },
      },
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      assignedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });
}

export async function deleteDocumentAssignment(id: string) {
  return prisma.documentAssignment.delete({
    where: { id },
  });
}

export async function getUnassignedDocuments(translationProjectId: string) {
  const assignments = await prisma.documentAssignment.findMany({
    where: {
      translationProjectId,
      userId: null,
    },
    include: {
      document: {
        include: {
          sourceProject: true,
          versions: {
            include: {
              language: true,
            },
          },
        },
      },
    },
  });

  return assignments.map((a) => a.document);
}

export async function getAssignedDocumentsForUser(
  userId: string,
  translationProjectId?: string
) {
  return prisma.documentAssignment.findMany({
    where: {
      userId,
      ...(translationProjectId && { translationProjectId }),
    },
    include: {
      document: {
        include: {
          sourceProject: true,
          versions: {
            include: {
              language: true,
            },
          },
        },
      },
      translationProject: {
        include: {
          sourceProject: true,
          language: true,
        },
      },
      assignedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: {
      deadline: {
        sort: "asc",
        nulls: "last",
      },
    },
  });
}
