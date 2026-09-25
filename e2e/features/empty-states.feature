Feature: Empty states

  A project with no documents and a language with no team are the states a
  person meets on their first day, and the easiest ones to break without
  noticing, because the seed is otherwise full of content.

  @admin @happy-path
  Scenario: A project with no documents says so
    Given I visit "/projects/fallow2027"
    Then the page should not be an error
    And I should see an empty state

  @admin @happy-path
  Scenario: A language with no team says so
    Given I visit "/languages/pt"
    Then the page should not be an error
    And I should see an empty state
