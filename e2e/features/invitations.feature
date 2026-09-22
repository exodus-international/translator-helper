Feature: Invitations

  An administrator invites someone, and that person uses the link to join. The
  two halves are one journey, so they are one scenario: an invitation nobody
  can register with is not an invitation.

  @admin @happy-path
  Scenario: An administrator creates an invitation and someone registers with it
    Given I visit "/admin/users"
    When I create an invitation
    Then I should be given an invitation link
    When I open the invitation link signed out
    And I register as "invited@example.org" with the name "Pozvana Prekladatelka"
    Then I should be asked to complete my profile
    When I continue to the dashboard
    Then I should be on the dashboard
