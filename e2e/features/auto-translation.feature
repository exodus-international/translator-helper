Feature: Automatic AI translation

  A language's project manager can let the model draft every document nobody
  has started. Each draft goes straight to review, where reviewers edit it
  directly and can see what they changed from the model's text. The model call
  is answered by a local stub, and the worker that drafts runs inside the
  test server.

  French is used because no other scenario touches it: turning this on drafts
  every French document that has not been started.

  @admin2 @stubbed @auto-translate
  Scenario: A manager turns on AI translation and the draft is edited and approved in review
    Given I open the "exodus90" project in French
    When I turn on AI translation for 1 document
    Then AI translation should report 1 of 1 translated
    And "Day 1 - The Call" should be marked as AI-translated on the board
    When I open "Day 1 - The Call" in French
    Then its status should be "PENDING_REVIEW"
    And the translation should be marked as AI-translated
    And the translation should read "AI STUB"
    When I edit the translation in review to read "Traduction relue par l'equipe."
    Then the translation should read "Traduction relue par l'equipe."
    And the changes from the AI draft should show "AI STUB" replaced by "Traduction relue par l'equipe."
    When I approve the translation
    Then its status should be "APPROVED"
