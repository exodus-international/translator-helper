import { z } from 'zod';

/**
 * Parses input against a schema, turning a rejection into a sentence.
 *
 * A ZodError is an Error whose `message` is the serialised issue array, so a
 * `catch (error) { toast.error(error.message) }` — which is what every client
 * in this app does — puts raw JSON in front of the user:
 *
 *   [ { "code": "custom", "path": [], "message": "A voice is required…" } ]
 *
 * The messages in the schemas are already written for people. This unwraps
 * them so they arrive that way.
 */
export function parseInput<Schema extends z.ZodType>(schema: Schema, input: unknown): z.output<Schema> {
  const result = schema.safeParse(input);

  if (!result.success) {
    throw new Error(formatIssues(result.error));
  }

  return result.data;
}

/**
 * One line per problem. A field's name is worth showing when the schema knows
 * it and useless when the rule spans the whole object, which is what an empty
 * path means — those messages name their own subject.
 */
export function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => (issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message))
    .join('\n');
}
