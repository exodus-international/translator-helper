/**
 * The one-line detail an activity log entry shows after its label, from the
 * details the entry was logged with. Kept out of the component so it can be
 * tested without rendering it.
 */

/** Long error messages are cut to keep an entry on one line. */
function truncate(text: string, max = 60): string {
  return text.length > max ? text.slice(0, max) + '...' : text;
}

function getStatusLabel(status: string): string {
  const statusLabels: Record<string, string> = {
    PENDING_TRANSLATION: 'Pending Translation',
    IN_PROGRESS: 'In Progress',
    PENDING_REVIEW: 'Pending Review',
    APPROVED: 'Approved',
    DEPLOYED: 'Deployed',
  };
  return statusLabels[status] || status;
}

export function getDetailText(action: string, details: Record<string, any> | null): string | null {
  if (!details || Object.keys(details).length === 0) return null;

  switch (action) {
    case 'edited':
      return null;
    case 'status_updated':
      return details.status ? `\u2192 ${getStatusLabel(details.status)}` : null;
    case 'created':
      return details.title || null;
    case 'approved':
    case 'requested_changes':
      return details.hasComment ? 'with comment' : null;
    case 'started_translation':
    case 'created_translation':
    case 'assigned_translation':
      return details.language || null;
    case 'audio_generation_started':
    case 'audio_regeneration_requested':
      return details.voice || null;
    case 'audio_transcript_edited':
      return details.characters ? `${details.characters} characters` : null;
    case 'github_deployed':
      // Only deploys that merge record `merged`; one that leaves its pull
      // request open by design has no details and shows none.
      if (details.merged === true) return 'merged into main';
      if (details.merged === false) return details.mergeError ? `PR left open: ${truncate(details.mergeError)}` : 'PR left open';
      return null;
    case 'github_deploy_failed':
    case 'audio_generation_failed':
      return details.error ? truncate(details.error) : null;
    case 'created_suggestion':
    case 'deleted_suggestion':
    case 'dismissed_suggestion': {
      const type = details.type === 'CHANGE' ? 'Change' : 'Comment';
      const line = details.startLine
        ? details.startLine === details.endLine
          ? `L${details.startLine}`
          : `L${details.startLine}-${details.endLine}`
        : 'General';
      const comment = details.comment ? `'${details.comment}'` : null;
      return [type, line, comment].filter(Boolean).join(' · ');
    }
    case 'applied_suggestion': {
      const type = details.type === 'CHANGE' ? 'Change' : 'Comment';
      const range = details.range;
      const line = range?.startLine
        ? range.startLine === range.endLine
          ? `L${range.startLine}`
          : `L${range.startLine}-${range.endLine}`
        : null;
      return [type, line].filter(Boolean).join(' · ');
    }
    case 'reopened_suggestion': {
      const type = details.type === 'CHANGE' ? 'Change' : 'Comment';
      const reverted = details.reverted ? 'reverted' : null;
      return [type, reverted].filter(Boolean).join(' · ');
    }
    case 'edited_suggestion': {
      return details.comment ? `'${details.comment}'` : null;
    }
    default:
      return null;
  }
}
