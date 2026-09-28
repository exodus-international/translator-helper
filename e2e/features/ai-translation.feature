Feature: AI translation

  A draft from the model is the second most used editor action in production,
  after starting a translation. The model call is answered by a local stub, so
  a run costs nothing and never leaves the machine.

  @translator @high-usage @stubbed
  Scenario: AI translation fills an empty translation
    Given I open "Day 45 - Midpoint Reflection" in Czech
    And the translation has been started
    When I ask the AI to translate
    Then the translation should read "AI STUB"
