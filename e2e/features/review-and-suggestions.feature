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
