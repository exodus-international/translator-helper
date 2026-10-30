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
    And the comment field should have the caret
    When I move the suggestion window out of the way
    Then it should have moved with the pointer
    When I drag the suggestion window far off the screen
    Then it should stay on screen
    When I write "Better wording after moving the window" in the suggestion window
    Then the suggestion window should hold "Better wording after moving the window"
    When I save the suggestion
    Then the feedback should mention "Better wording after moving the window"
    When I dismiss the comment mentioning "Better wording after moving the window"
    Then the comment mentioning "Better wording after moving the window" should be resolved
