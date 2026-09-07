/**
 * The columns every "who is this" query needs: enough to draw a name and a
 * face. `image` matters as much as `name` now that avatars appear wherever a
 * person is shown, and leaving it out of one query is how a picture silently
 * turns back into initials on a single screen.
 */
export const userBriefColumns = { id: true, name: true, email: true, image: true } as const;

/** The same columns as a relation select: `user: userBrief`. */
export const userBrief = { select: userBriefColumns } as const;
