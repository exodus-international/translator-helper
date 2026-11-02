Feature: AI workflow

  A language in the AI workflow gets its first draft from the AI, with a
  comment wherever the AI is unsure. Two people from the team approve the
  text, and the document then deploys and merges on its own. It replaces the
  manual workflow for most of the Czech team's work, so a break here stops
  documents moving at all.

  The model and GitHub are answered by local stand-ins. The test environment
  has no speech provider, so the audio steps are skipped, as they are for a
  document that gets no audio.

  @admin @business-critical @stubbed @slow
  Scenario: The AI drafts, two people approve, and the document deploys on its own
    Given Croatian uses the AI workflow, deploying to "translations/hr"
    And I open "Day 3 - Fasting and Freedom" in Croatian
    When I hand the document to the AI workflow
    Then its status should become "PENDING_REVIEW"
    And the feedback should mention "AI STUB: not sure about this word."
    And approving the text should wait for the open comments
    When I dismiss the comment mentioning "AI STUB"
    And I approve the text
    Then the text should have 1 of 2 approvals
    When "reviewer@example.org" takes over
    And I open "Day 3 - Fasting and Freedom" in Croatian
    And I approve the text
    Then its status should become "DEPLOYED"
    And the document should come to link to pull request 42
    And no AI step should have failed
    When "admin@example.org" takes over
    Then Croatian can go back to the manual workflow
