Feature: Standard translations

  Each language team keeps the prayers and phrases it always translates the
  same way, and AI translation uses them as written. Every member of the team
  writes the dictionary; people outside the team don't see it.

  @translator
  Scenario: A translator adds a standard translation for their language and edits it
    Given I open the standard translations for Czech
    When I add the standard translation "Glory Be" of "Glory be to the Father." as "Sláva Otci."
    Then the standard translation "Glory Be" should read "Sláva Otci."
    When I change the standard translation "Glory Be" to "Sláva Otci i Synu."
    Then the standard translation "Glory Be" should read "Sláva Otci i Synu."

  @reviewer @business-critical
  Scenario: A team member doesn't see another language's standard translations
    When I open the standard translations
    Then there should be a "Slovak" tab
    And there should be no "Czech" tab

  @translator @stubbed
  Scenario: AI translation writes a standard translation as the team keeps it
    Given I open the standard translations for Czech
    And I add the standard translation "Morning heading" of "Morning Reflection" as "Ranní zamyšlení"
    And I open "Day 45 - Midpoint Reflection" in Czech
    And the translation has been started
    When I ask the AI to translate
    Then the translation should read "## Ranní zamyšlení"
