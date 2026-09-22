Feature: Registration by invitation

  An invited person creates their own account and starts work. The seed carries
  an open invitation so this does not depend on an admin making one first.

  @business-critical
  Scenario: An invited person registers and reaches the dashboard
    Given I am signed out
    When I open the seeded invitation
    And I register as "newcomer@example.org" with the name "Nova Prekladatelka"
    Then I should be asked to complete my profile
    When I continue to the dashboard
    Then I should be on the dashboard
