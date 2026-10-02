Feature: Translation lifecycle

  A translator takes a document from waiting to in review. Starting a
  translation and submitting one for review are among the most used actions in
  production, and losing saved work would be unrecoverable, so the save
  scenario is critical as well as merely common.

  Each scenario works on its own document, because they share one database and
  run in order.

  @translator @high-usage
  Scenario: Starting a translation moves it out of the waiting list
    Given I open "Day 14 - The Desert" in Slovak
    Then its status should be "PENDING_TRANSLATION"
    When I start the translation
    Then its status should be "IN_PROGRESS"

  @translator @high-usage @business-critical
  Scenario: A saved translation survives a reload
    Given I open "Friday of the First Week" in Slovak
    And the translation has been started
    When I write "Toto je slovensky preklad." as the translation
    And I save the translation
    Then I should see that my work is saved
    When I reload the page
    Then the translation should read "Toto je slovensky preklad."

  @translator @high-usage
  Scenario: Find and replace changes every match in the translation
    Given I open "Friday of the First Week" in Slovak
    And the translation has been started
    When I write "Boh je dobry. Boh je verny." as the translation
    And I replace every "Boh" with "Pan" in the translation
    Then the translation should read "Pan je dobry. Pan je verny."

  @translator
  Scenario: The find key shows find alone and the replace key adds replace
    Given I open "Friday of the First Week" in Slovak
    And the translation has been started
    When I press the find shortcut in the translation
    Then I should be offered find without replace
    When I press the replace shortcut in the translation
    Then the replace field should have the cursor

  @translator
  Scenario: The replace key says why a read-only pane has no replace
    Given I open "Friday of the First Week" in Slovak
    And the translation has been started
    When I press the replace shortcut in the source text
    Then I should be told that replace is not available there

  @translator @high-usage @business-critical
  Scenario: Submitting a translation sends it to review
    Given I open "Palm Sunday Meditation" in Czech
    And the translation has been started
    When I write "Hotovy preklad na kontrolu." as the translation
    And I save the translation
    And I submit the translation for review
    Then its status should be "PENDING_REVIEW"
