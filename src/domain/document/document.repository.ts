import prisma from '@/lib/db';
import { Prisma, SuggestionStatus } from '@prisma/client';

export async function listDocuments(filters?: {
  sourceProjectId?: string;
  folderId?: string; // Deprecated - kept for backward compatibility
  labels?: string[];
  search?: string;
}): Promise<
  Prisma.DocumentGetPayload<{
    include: {
      folder: true;
      sourceProject: true;
      versions: {
        include: {
          language: true;
          user: {
            select: {
              id: true;
              name: true;
              email: true;
              languages: {
                select: {
                  languageId: true;
                };
              };
            };
          };
        };
      };
    };
  }>[]
> {
  return prisma.document.findMany({
    where: {
      ...(filters?.sourceProjectId && { sourceProjectId: filters.sourceProjectId }),
      ...(filters?.folderId && { folderId: filters.folderId }), // Deprecated
      ...(filters?.labels &&
        filters.labels.length > 0 && {
          labels: {
            hasSome: filters.labels,
          },
        }),
      ...(filters?.search && {
        OR: [
          { title: { contains: filters.search, mode: 'insensitive' } },
          { slug: { contains: filters.search, mode: 'insensitive' } },
        ],
      }),
    },
    include: {
      folder: true, // Deprecated - kept for backward compatibility
      sourceProject: true,
      versions: {
        include: {
          language: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              languages: {
                select: {
                  languageId: true,
                },
              },
            },
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
      },
    },
    orderBy: {
      updatedAt: 'desc',
    },
  });
}

export async function getDocumentById(id: string): Promise<Prisma.DocumentGetPayload<{
  include: {
    folder: true;
    sourceProject: true;
    assignments: {
      include: {
        translationProject: {
          include: {
            language: true;
          };
        };
        user: {
          select: {
            id: true;
            name: true;
            email: true;
            languages: {
              select: {
                languageId: true;
              };
            };
          };
        };
      };
    };
    versions: {
      include: {
        language: true;
        user: {
          select: {
            id: true;
            name: true;
            email: true;
            languages: {
              select: {
                languageId: true;
              };
            };
          };
        };
      };
    };
  };
}> | null> {
  return prisma.document.findUnique({
    where: { id },
    include: {
      folder: true, // Deprecated - kept for backward compatibility
      sourceProject: true,
      assignments: {
        include: {
          translationProject: {
            include: {
              language: true,
            },
          },
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              languages: {
                select: {
                  languageId: true,
                },
              },
            },
          },
        },
      },
      versions: {
        include: {
          language: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              languages: {
                select: {
                  languageId: true,
                },
              },
            },
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
      },
    },
  });
}

export async function createDocument(data: {
  slug: string;
  title: string;
  sourceProjectId: string;
  folderId?: string; // Deprecated - kept for backward compatibility
  labels: string[];
  deadline?: Date;
  originalFilename?: string;
  type?: 'DAY' | 'FIELD_GUIDE' | 'DAILY_CONTENT';
}): Promise<
  Prisma.DocumentGetPayload<{
    include: {
      folder: true;
      sourceProject: true;
      versions: true;
    };
  }>
> {
  return prisma.document.create({
    data: {
      slug: data.slug,
      title: data.title,
      sourceProjectId: data.sourceProjectId,
      folderId: data.folderId, // Deprecated
      labels: data.labels,
      deadline: data.deadline,
      originalFilename: data.originalFilename,
      type: data.type,
    },
    include: {
      folder: true, // Deprecated
      sourceProject: true,
      versions: true,
    },
  });
}

export async function updateDocument(
  id: string,
  data: {
    title?: string;
    sourceProjectId?: string | null;
    folderId?: string | null; // Deprecated - kept for backward compatibility
    labels?: string[];
    deadline?: Date | null;
    type?: 'DAY' | 'FIELD_GUIDE' | 'DAILY_CONTENT' | null;
    originalFilename?: string | null;
  },
): Promise<
  Prisma.DocumentGetPayload<{
    include: {
      folder: true;
      sourceProject: true;
      versions: true;
    };
  }>
> {
  return prisma.document.update({
    where: { id },
    data,
    include: {
      folder: true, // Deprecated
      sourceProject: true,
      versions: true,
    },
  });
}

export async function deleteDocument(id: string): Promise<Prisma.DocumentGetPayload<{}>> {
  return prisma.document.delete({
    where: { id },
  });
}

// Get all versions of documents for overview (showing translation status per language)
export async function getDocumentsWithAllVersions(): Promise<
  Prisma.DocumentGetPayload<{
    include: {
      folder: true;
      sourceProject: true;
      versions: {
        include: {
          language: true;
          user: {
            select: {
              id: true;
              name: true;
              email: true;
              languages: {
                select: {
                  languageId: true;
                };
              };
            };
          };
        };
      };
    };
  }>[]
> {
  return prisma.document.findMany({
    include: {
      folder: true, // Deprecated
      sourceProject: true,
      versions: {
        include: {
          language: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              languages: {
                select: {
                  languageId: true,
                },
              },
            },
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
      },
    },
    orderBy: {
      updatedAt: 'desc',
    },
  });
}

export async function getDashboardDocuments(
  languageId: string,
  sourceProjectId?: string,
): Promise<
  Prisma.DocumentGetPayload<{
    include: {
      sourceProject: true;
      assignments: {
        include: {
          translationProject: {
            include: {
              language: true;
            };
          };
          user: {
            select: {
              id: true;
              name: true;
              email: true;
              languages: {
                select: {
                  languageId: true;
                };
              };
            };
          };
        };
      };
      versions: {
        include: {
          language: true;
          user: {
            select: {
              id: true;
              name: true;
              email: true;
              languages: {
                select: {
                  languageId: true;
                };
              };
            };
          };
        };
      };
    };
  }>[]
> {
  // If sourceProjectId is provided, find the translation project for that source project and language
  let translationProjectId: string | undefined;
  if (sourceProjectId) {
    const translationProject = await prisma.translationProject.findUnique({
      where: {
        sourceProjectId_languageId: {
          sourceProjectId,
          languageId,
        },
      },
      select: {
        id: true,
      },
    });
    translationProjectId = translationProject?.id;
  }

  const documents = await prisma.document.findMany({
    where: {
      ...(sourceProjectId && {
        sourceProjectId,
      }),
    },
    include: {
      sourceProject: true,
      assignments: {
        where: translationProjectId
          ? {
              translationProjectId,
            }
          : undefined,
        include: {
          translationProject: {
            include: {
              language: true,
            },
          },
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              languages: {
                select: {
                  languageId: true,
                },
              },
            },
          },
        },
      },
      versions: {
        where: {
          languageId,
        },
        include: {
          language: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              languages: {
                select: {
                  languageId: true,
                },
              },
            },
          },
          reviewer: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          activityLogs: {
            orderBy: {
              createdAt: 'desc',
            },
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
      },
    },
    orderBy: {
      updatedAt: 'desc',
    },
  });

  const versionIds = documents.flatMap((doc) => doc.versions.map((v) => v.id));
  if (versionIds.length === 0) {
    return documents;
  }

  const grouped = await prisma.suggestion.groupBy({
    by: ['documentVersionId'],
    where: {
      documentVersionId: {
        in: versionIds,
      },
      status: SuggestionStatus.OPEN,
    },
    _count: {
      _all: true,
    },
  });

  const countByVersionId = new Map(grouped.map((g) => [g.documentVersionId, g._count._all]));

  return documents.map((doc) => ({
    ...doc,
    versions: doc.versions.map((v) => ({
      ...v,
      openSuggestionsCount: countByVersionId.get(v.id) ?? 0,
    })),
  }));
}
