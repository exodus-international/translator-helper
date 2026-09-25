Feature: Source project management

  An administrator sets up a new source project. Few people do this and it
  happens rarely, so it is here as a happy path rather than for its usage.

  @admin @happy-path
  Scenario: An administrator creates a source project
    Given I visit "/admin/projects"
    When I add a source project named "Autumn Retreat 2027" with the slug "autumn-retreat-2027"
    Then "Autumn Retreat 2027" should be listed
    And the project page for "autumn-retreat-2027" should open
