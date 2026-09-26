Feature: Deploy

  Deploying is how a finished translation leaves the app: it is committed to
  the content repository and a pull request is opened. About a third of users
  ever do it, which ranks it low on usage, yet it is the one step that
  delivers the product's output, so a break here stops everything shipping.

  The GitHub calls are answered by a local stand-in. No pull request is ever
  opened and nothing leaves the machine.

  @admin @business-critical @stubbed
  Scenario: Deploying an approved translation opens a pull request
    Given I open "Day 2 - Discipline of Prayer" in Czech
    Then its status should be "APPROVED"
    When I deploy the translation
    Then I should see that the pull request was created
    And its status should be "DEPLOYED"
    When I reload the page
    Then the document should link to pull request 42

  @translator @business-critical
  Scenario: A translator is not offered deploy
    Given I open "Day 1 - The Call" in Slovak
    Then its status should be "APPROVED"
    When I look at the status actions
    Then deploying should not be offered
