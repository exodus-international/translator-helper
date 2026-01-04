import prisma from '@/lib/db';
import { Prisma } from '@prisma/client';

export async function listDocumentAssignments(filters?: {
  translationProjectId?: string;
  userId?: string;
  documentId?: string;
}): Promise<
  Prisma.DocumentAssignmentGetPayload<{
    include: {
      document: {
        include: {
          sourceProject: true;
          versions: {
            include: {
              language: true;
            };
          };
        };
      };
      translationProject: {
        include: {
          sourceProject: true;
          language: true;
        };
      };
      user: {
        select: {
          id: true;
          name: true;
          email: true;
        };
      };
      assignedBy: {
        select: {
          id: true;
          name: true;
          email: true;
        };
      };
    };
  }>[]
> {
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
      assignedAt: 'desc',
    },
  });
}

export async function getDocumentAssignmentById(id: string): Promise<Prisma.DocumentAssignmentGetPayload<{
  include: {
    document: {
      include: {
        sourceProject: true;
        versions: {
          include: {
            language: true;
          };
        };
      };
    };
    translationProject: {
      include: {
        sourceProject: true;
        language: true;
      };
    };
    user: {
      select: {
        id: true;
        name: true;
        email: true;
      };
    };
    assignedBy: {
      select: {
        id: true;
        name: true;
        email: true;
      };
    };
  };
}> | null> {
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
  translationProjectId: string,
): Promise<Prisma.DocumentAssignmentGetPayload<{
  include: {
    document: {
      include: {
        sourceProject: true;
      };
    };
    translationProject: {
      include: {
        sourceProject: true;
        language: true;
      };
    };
    user: {
      select: {
        id: true;
        name: true;
        email: true;
      };
    };
    assignedBy: {
      select: {
        id: true;
        name: true;
        email: true;
      };
    };
  };
}> | null> {
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
}): Promise<
  Prisma.DocumentAssignmentGetPayload<{
    include: {
      document: {
        include: {
          sourceProject: true;
        };
      };
      translationProject: {
        include: {
          sourceProject: true;
          language: true;
        };
      };
      user: {
        select: {
          id: true;
          name: true;
          email: true;
        };
      };
      assignedBy: {
        select: {
          id: true;
          name: true;
          email: true;
        };
      };
    };
  }>
> {
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
  },
): Promise<
  Prisma.DocumentAssignmentGetPayload<{
    include: {
      document: {
        include: {
          sourceProject: true;
        };
      };
      translationProject: {
        include: {
          sourceProject: true;
          language: true;
        };
      };
      user: {
        select: {
          id: true;
          name: true;
          email: true;
        };
      };
      assignedBy: {
        select: {
          id: true;
          name: true;
          email: true;
        };
      };
    };
  }>
> {
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

export async function deleteDocumentAssignment(id: string): Promise<Prisma.DocumentAssignmentGetPayload<{}>> {
  return prisma.documentAssignment.delete({
    where: { id },
  });
}

export async function getUnassignedDocuments(translationProjectId: string): Promise<
  Prisma.DocumentGetPayload<{
    include: {
      sourceProject: true;
      versions: {
        include: {
          language: true;
        };
      };
    };
  }>[]
> {
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
  translationProjectId?: string,
): Promise<
  Prisma.DocumentAssignmentGetPayload<{
    include: {
      document: {
        include: {
          sourceProject: true;
          versions: {
            include: {
              language: true;
            };
          };
        };
      };
      translationProject: {
        include: {
          sourceProject: true;
          language: true;
        };
      };
      assignedBy: {
        select: {
          id: true;
          name: true;
          email: true;
        };
      };
    };
  }>[]
> {
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
        sort: 'asc',
        nulls: 'last',
      },
    },
  });
}
