Feature: Review and suggestions

  Review is the busier half of the product. In production the review page has
  more users than the translate page, and suggestion events outnumber manual
  saves more than two to one.

  The rule worth protecting is that unresolved feedback cannot be skipped: a
  document with open comments must not be approvable.

  @reviewer @business-critical
  Scenario: Approval is refused while feedback is still open
    Given I open "Day 1 - The Call" in Croatian
    Then there should be open feedback
    When I look at the status actions
    Then approving should be offered but not allowed

  @reviewer @high-usage
  Scenario: Every piece of feedback can be reached on a short screen
    Given I open "Day 3 - Fasting and Freedom" in Czech
    And there should be open feedback
    When my window is too short to show all the feedback
    And I show the resolved feedback
    Then I should be able to scroll to the last piece of feedback

  @reviewer @high-usage @business-critical
  Scenario: Applying a suggestion changes the translation
    Given I open "Day 1 - The Call" in Croatian
    And there should be open feedback
    When I apply the suggestion proposing "poziv"
    Then the translation should read "poziv"

  @reviewer @business-critical
  Scenario: A translation with no open feedback can be approved
    Given I open "Day 2 - Discipline of Prayer" in Slovak
    Then its status should be "PENDING_REVIEW"
    And there should be no open feedback
    When I approve the translation
    Then its status should be "APPROVED"

  @reviewer @high-usage
  Scenario: A dismissed comment can be brought back
    Given I open "Day 1 - The Call" in Croatian
    And there should be open feedback
    When I dismiss the comment mentioning "Check if this paragraph"
    Then the comment mentioning "Check if this paragraph" should be resolved
    When I reopen the comment mentioning "Check if this paragraph"
    Then the comment mentioning "Check if this paragraph" should be open again

  @reviewer @high-usage
  Scenario: The window for writing feedback can be moved off the text it is about
    Given I open "Day 1 - The Call" in Croatian
    When I select a line and suggest an edit
    Then the suggestion window should be open
    And the replacement field should have the caret
    When I move the suggestion window out of the way
    Then it should have moved with the pointer
    When I drag the suggestion window far off the screen
    Then it should stay on screen
    When I write "Better wording after moving the window" in the suggestion window
    Then the suggestion window should hold "Better wording after moving the window"
    When I propose "> Dodite za mnom." as the replacement
    And I save the suggestion
    Then the feedback should mention "Better wording after moving the window"
    When I dismiss the comment mentioning "Better wording after moving the window"
    Then the comment mentioning "Better wording after moving the window" should be resolved

  # A reviewer selects text, the window opens, and they type the new wording
  # straight away. That wording has to be what applying writes: when the caret
  # started in the comment, the replacement stayed equal to the selected text
  # and applying put the old text back over itself.
  @reviewer @high-usage @business-critical
  Scenario: The wording typed into a new suggestion is what applying writes
    Given I open "Day 1 - The Call" in Croatian
    When I select the row reading "Tri stupa za danas" and suggest an edit
    Then the replacement field should have the caret
    And saving the suggestion should not be allowed yet
    When I type "### Tri stupa dana" over the replacement
    And I save the suggestion
    Then the feedback should mention "### Tri stupa dana"
    When I apply the suggestion proposing "### Tri stupa dana"
    Then the translation should read "### Tri stupa dana"
    And the translation should not read "Tri stupa za danas"

  # A suggestion points at its text by line and column. Applying another one
  # above it adds a line, and the first must still change its own words. The
  # added line repeats those words, so they cannot be found again by looking
  # for them: only a range that moved with the edit lands on the right copy.
  @reviewer @business-critical
  Scenario: A suggestion still changes its own words after the text above it grew
    Given I open "Day 1 - The Call" in Croatian
    When I select the row reading "Zapocnite svoj post" and suggest an edit
    And I type "2. **Askeza**: Odreknite se " over the replacement
    And I save the suggestion
    Then the feedback should mention "Odreknite se"
    When I select the row reading "Jutarnje razmatranje" and suggest an edit
    And I type the lines "## Jutarnje razmatranje dana" and "2. **Askeza**: Zapocnite svoj post od alkohola i slatkisa." over the replacement
    And I save the suggestion
    Then the feedback should mention "razmatranje dana"
    When I apply the suggestion proposing "razmatranje dana"
    Then the translation should read "## Jutarnje razmatranje dana"
    When I apply the suggestion proposing "Odreknite se"
    Then the translation should read "2. **Askeza**: Odreknite se"
    And the translation should read "1. **Molitva**: Provedite 20 minuta u tihoj molitvi."
    And in the translation "Zapocnite svoj post" should come before "Tri stupa" and "Odreknite se" after it
