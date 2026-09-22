Feature: Access and guards

  Revoking access has to actually revoke it, and an administrative screen has
  to refuse the people it is not for rather than merely hide itself.

  @business-critical
  Scenario: A banned person cannot sign in
    Given I am signed out
    When I sign in as "banned@example.org"
    Then I should be refused with a message
    And I should still be on the login page

  @translator @business-critical
  Scenario Outline: An ordinary user is turned away from admin screens
    When I visit "<page>"
    Then I should not be on "<page>"

    Examples:
      | page                            |
      | /admin/users                    |
      | /admin/projects                 |
      | /admin/languages                |
      | /settings/language-instructions |

  # Untagged on purpose: signing out ends the session it is holding, and a
  # tagged scenario holds the one every other scenario of that role reuses.
  @high-usage
  Scenario: Signing out ends the session
    Given I am signed in fresh as "translator@example.org"
    When I sign out
    Then I should be on the login page
    When I visit "/dashboard"
    Then I should be sent to the login page
