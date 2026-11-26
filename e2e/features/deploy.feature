Feature: Deploy

  Deploying is how a finished translation leaves the app: the app commits it
  to the content repository's deploy branch itself, in one commit, with no
  pull request to merge on GitHub. Anyone on the language's team can deploy
  it, and every deploy is recorded with who sent it, what went out, how it
  went and the commit. About a third of users ever do it, which ranks it low
  on usage, yet it is the one step that delivers the product's output, so a
  break here stops everything shipping.

  The GitHub calls are answered by a local stand-in that keeps the commits in
  memory. Nothing leaves the machine.

  Background:
    Given the content repository is empty

  @admin @business-critical @stubbed
  Scenario: Deploying an approved translation commits it to the deploy branch
    Given I open "Day 2 - Discipline of Prayer" in Czech
    Then its status should be "APPROVED"
    When I choose Deploy from the status menu
    Then I should be asked to deploy "Day 2 - Discipline of Prayer" to the content repository
    When I confirm the deploy
    Then I should be told that "Day 2 - Discipline of Prayer" was deployed
    And its status should be "DEPLOYED"
    And the deploy branch should have 1 commit
    When I reload the page
    Then the deploy history should show a deploy that succeeded with its commit

  @admin @business-critical @stubbed
  Scenario: Redeploying content that has not changed makes no new commit
    Given I open "Day 2 - Discipline of Prayer" in Czech
    And it has been deployed once
    When I redeploy it from its Deploy section
    Then I should be told that "Day 2 - Discipline of Prayer" was already up to date
    And the deploy branch should have 1 commit
    And its status should be "DEPLOYED"

  @admin @business-critical @stubbed
  Scenario: A deploy GitHub refuses can be retried from the message
    Given I open "Ash Wednesday Reflection" in Czech
    And GitHub will refuse the next push
    When I choose Deploy from the status menu
    And I confirm the deploy
    Then I should be told that "Ash Wednesday Reflection" could not be deployed
    And its status should be "APPROVED"
    And the deploy branch should have 0 commits
    When I retry the deploy from the message
    Then I should be told that "Ash Wednesday Reflection" was deployed
    And the deploy branch should have 1 commit
    When I reload the page
    Then its status should be "DEPLOYED"
    And the deploy history should show the failed deploy and its retry

  @translator @business-critical
  Scenario: Anyone on the language's team is offered deploy
    Given I open "Day 1 - The Call" in Slovak
    Then its status should be "APPROVED"
    When I look at the status actions
    Then deploying should be offered
