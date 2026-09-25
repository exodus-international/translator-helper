Feature: Authentication and onboarding

  Getting in is the one thing every person does. Sign-in is the most used event
  in production, and onboarding is completed by almost everyone who signs in,
  so both are tagged for usage as well as for risk.

  @high-usage @business-critical
  Scenario: A returning user signs in and reaches their dashboard
    Given I am signed out
    When I sign in as "translator@example.org"
    Then I should be on the dashboard

  @high-usage
  Scenario: Signing in with the wrong password is refused
    Given I am signed out
    When I sign in as "translator@example.org" with the password "wrong-password"
    Then I should be told the sign in failed
    And I should still be on the login page

  @business-critical
  Scenario Outline: A signed out visitor cannot reach a protected page
    Given I am signed out
    When I visit "<page>"
    Then I should be sent to the login page

    Examples:
      | page       |
      | /dashboard |
      | /documents |
      | /profile   |
